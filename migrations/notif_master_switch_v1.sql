-- notif_master_switch_v1.sql
-- Interruptor maestro de notificaciones/alertas + DM de Slack al asignar un chat de soporte.
-- NOTA: ya aplicado en vivo en Supabase (MCP). Este archivo queda como registro.
--
-- Piezas:
--  1) Config: app_settings.key='global' → value->'notifications_config'->'types'
--     Un tipo está PRENDIDO salvo que types[tipo] === false.
--  2) korex_notif_enabled(tipo): lee esa config.
--  3) Gate central: BEFORE INSERT en notifications descarta cualquier fila de un
--     tipo apagado (cubre campana Y el lado panel de todas las alertas, presentes
--     y futuras, sin importar quién las inserte).
--  4) Al asignar un chat (fila nueva en wa_conversation_assignees): deja aviso en
--     la campana y dispara un DM de Slack vía edge fn soporte-notify-dm.
--     Salta la asignación por defecto (Zil) y la auto-asignación.

-- 1) Semilla de la config dentro de la fila global
update public.app_settings
set value = jsonb_set(value, '{notifications_config}', jsonb_build_object('types', '{}'::jsonb), true)
where key = 'global' and not (value ? 'notifications_config');

-- 2) ¿Está habilitado este tipo?
create or replace function public.korex_notif_enabled(p_type text)
returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select coalesce(
    (select value->'notifications_config'->'types'->>p_type from public.app_settings where key = 'global'),
    'true'
  ) is distinct from 'false';
$$;

-- 3) Gate central sobre notifications
create or replace function public.korex_notif_gate()
returns trigger
language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if not public.korex_notif_enabled(NEW.type) then
    return null; -- descarta la fila silenciosamente
  end if;
  return NEW;
end;
$$;

drop trigger if exists ztrg_notif_gate on public.notifications;
create trigger ztrg_notif_gate
  before insert on public.notifications
  for each row execute function public.korex_notif_gate();

-- Secreto interno para que el trigger llame al edge fn del DM
update public.app_settings
set value = jsonb_set(coalesce(value, '{}'::jsonb), '{dm_notify_secret}',
                      to_jsonb(replace(gen_random_uuid()::text, '-', '')), true)
where key = 'soporte_config'
  and coalesce(value->>'dm_notify_secret', '') = '';

-- 4) Aviso + DM al asignar un chat de soporte
create or replace function public.soporte_notify_on_assignee()
returns trigger
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_cfg     jsonb;
  v_default text;
  v_secret  text;
  v_chat    text;
  v_actor   text;
  v_url     text := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/soporte-notify-dm';
begin
  if not public.korex_notif_enabled('soporte_chat_assigned') then
    return NEW;
  end if;

  select value into v_cfg from public.app_settings where key = 'soporte_config';
  v_default := coalesce(v_cfg->>'default_assignee', 'zil');
  v_secret  := coalesce(v_cfg->>'dm_notify_secret', '');

  -- La asignación por defecto (Zil) NO avisa. Tampoco te avisás a vos mismo.
  if NEW.member_id = v_default then return NEW; end if;
  if NEW.member_id = NEW.assigned_by then return NEW; end if;

  select coalesce(nullif(custom_name, ''), nullif(wa_profile_name, ''), nullif(wa_phone, ''), 'un contacto')
    into v_chat from public.wa_conversations where id = NEW.conversation_id;
  select name into v_actor from public.team_members where id = NEW.assigned_by;

  perform public.korex_notify(
    NEW.member_id, NEW.assigned_by, 'soporte_chat_assigned', null, null,
    'Nuevo chat de soporte asignado',
    coalesce(v_actor, 'Alguien') || ' te asignó el chat de ' || coalesce(v_chat, 'un contacto') || '.',
    false
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-korex-secret', v_secret),
      body    := jsonb_build_object(
                   'conversation_id', NEW.conversation_id,
                   'member_id', NEW.member_id,
                   'actor_id', NEW.assigned_by
                 )
    );
  exception when others then
    null; -- nunca romper la asignación por un fallo de red
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_soporte_notify_assignee on public.wa_conversation_assignees;
create trigger trg_soporte_notify_assignee
  after insert on public.wa_conversation_assignees
  for each row execute function public.soporte_notify_on_assignee();
