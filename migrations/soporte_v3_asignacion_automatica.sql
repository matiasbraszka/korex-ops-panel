-- migrations/soporte_v3_asignacion_automatica.sql
--
-- Pedido de Matías: los chats nuevos de Soporte se asignan solos a Juan, y los que
-- entraron hoy también.
--
-- Se hace con un trigger en la base y NO en el webhook de WhatsApp por dos razones:
--   1. Una conversación se puede crear por varios caminos (whatsapp-webhook, wa-names,
--      alta manual). El trigger los cubre todos sin repetir lógica.
--   2. El destinatario queda en app_settings, no en el código: cambiar de persona,
--      o apagar la asignación automática, es editar una fila.
--
-- Clave nueva y propia (`soporte_asignacion_auto`) en vez de meterlo en `soporte_config`:
-- esa la escribe la pantalla de ajustes de Soporte y un guardado la pisaría entera.
--
-- Ojo con quién es "Juan": hay dos en el equipo. juan-ramon es Conector Pro; el de la
-- sección de Soporte es juan-cordoba (rol Soporte). Es ese.

insert into public.app_settings (key, value)
values ('soporte_asignacion_auto',
        jsonb_build_object('enabled', true, 'member_id', 'juan-cordoba'))
on conflict (key) do update set value = excluded.value;

-- Asigna el responsable por defecto a cada conversación nueva.
-- Suma, no reemplaza: si el chat ya tuviera otro asignado, quedan los dos.
create or replace function public.wa_asignar_automatico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cfg    jsonb;
  v_member text;
begin
  select value into v_cfg from public.app_settings where key = 'soporte_asignacion_auto';
  if coalesce((v_cfg->>'enabled')::boolean, false) is not true then return new; end if;

  v_member := nullif(btrim(coalesce(v_cfg->>'member_id', '')), '');
  if v_member is null then return new; end if;

  -- Si la persona se dio de baja, no se rompe el alta del chat: se avisa y sigue.
  if not exists (select 1 from public.team_members tm where tm.id = v_member) then
    raise warning 'wa_asignar_automatico: el miembro % no existe; no se asigna', v_member;
    return new;
  end if;

  insert into public.wa_conversation_assignees (conversation_id, member_id, assigned_by)
  values (new.id, v_member, null)
  on conflict (conversation_id, member_id) do nothing;

  -- `assigned_to` es la columna vieja (dueño principal). Solo se completa si está vacía:
  -- una asignación automática no le saca el chat a nadie.
  update public.wa_conversations c
     set assigned_to = v_member, updated_at = now()
   where c.id = new.id and c.assigned_to is null;

  return new;
end
$function$;

drop trigger if exists wa_conversations_asignar_auto on public.wa_conversations;
create trigger wa_conversations_asignar_auto
  after insert on public.wa_conversations
  for each row execute function public.wa_asignar_automatico();

-- ── Los que ya entraron hoy ──────────────────────────────────────────────────
-- "Hoy" = desde las 00:00 de Buenos Aires. Suma a Juan sin tocar otros asignados.
with hoy as (
  select c.id
    from public.wa_conversations c
   where c.created_at >= (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
                          at time zone 'America/Argentina/Buenos_Aires')
)
insert into public.wa_conversation_assignees (conversation_id, member_id, assigned_by)
select h.id, 'juan-cordoba', null from hoy h
on conflict (conversation_id, member_id) do nothing;

update public.wa_conversations c
   set assigned_to = 'juan-cordoba', updated_at = now()
 where c.assigned_to is null
   and c.created_at >= (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
                        at time zone 'America/Argentina/Buenos_Aires');

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) from wa_conversation_assignees a
--     join wa_conversations c on c.id = a.conversation_id
--    where a.member_id='juan-cordoba'
--      and c.created_at >= date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
--                          at time zone 'America/Argentina/Buenos_Aires';
--
-- Cambiar de persona:  update app_settings set value = jsonb_set(value,'{member_id}','"otro-id"')
--                       where key='soporte_asignacion_auto';
-- Apagarlo:            update app_settings set value = jsonb_set(value,'{enabled}','false')
--                       where key='soporte_asignacion_auto';
--
-- ROLLBACK:
--   drop trigger if exists wa_conversations_asignar_auto on public.wa_conversations;
--   drop function if exists public.wa_asignar_automatico();
--   delete from app_settings where key='soporte_asignacion_auto';
