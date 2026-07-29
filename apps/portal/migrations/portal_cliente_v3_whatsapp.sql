-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v3 · Notificaciones WhatsApp
--
-- Usa pg_net (ya habilitado) para llamar a las edge functions de WhatsApp:
--   · soporte-notify-dm  → avisa al EQUIPO que el cliente subió algo.
--   · whatsapp-send      → avisa al CLIENTE (a clients.phone) cuando el equipo
--                          marca una edición como visible para él.
--
-- ⚠️  BORRADOR PARA REVISAR — NO aplicado a producción.
--     CONFIRMAR: payloads exactos de soporte-notify-dm / whatsapp-send, y de dónde
--     sale el secret/token de invocación (app_settings.soporte_config.cron_secret o
--     vault). No dispara nada real hasta aplicarse.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Base de las edge functions del proyecto.
create or replace function public._portal_fn_base() returns text
language sql immutable as $$ select 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/' $$;

-- Header de auth para invocar edge functions desde la DB.
-- CONFIRMAR: preferible leerlo de vault. Placeholder: app_settings.soporte_config.cron_secret.
create or replace function public._portal_fn_secret() returns text
language sql stable security definer set search_path = public
as $$ select coalesce((value->'soporte_config'->>'cron_secret'), '')
      from public.app_settings where key = 'soporte_config' limit 1; $$;
-- (Ajustar el select al shape real de app_settings.)

-- ── Aviso al equipo cuando el cliente sube un recurso ────────────────────────
create or replace function public.portal_cliente_notify_subida(p_client text, p_folder text, p_title text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_name text; v_body jsonb;
begin
  select name into v_name from public.clients where id = p_client;
  v_body := jsonb_build_object(
    'event', 'portal_upload',
    'client_id', p_client,
    'text', format('📤 %s subió un archivo en "%s": %s', coalesce(v_name,'Cliente'), p_folder, coalesce(p_title,'archivo'))
  );
  perform net.http_post(
    url := public._portal_fn_base() || 'soporte-notify-dm',   -- CONFIRMAR nombre/payload
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public._portal_fn_secret()),
    body := v_body
  );
end $$;

-- ── Aviso al cliente cuando el equipo publica una edición para él ─────────────
-- Trigger: cuando funnel_resources.visible_cliente pasa a true.
create or replace function public.portal_cliente_notify_edicion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_phone text; v_name text;
begin
  if new.visible_cliente and coalesce(old.visible_cliente, false) = false and new.client_id is not null then
    select phone, name into v_phone, v_name from public.clients where id = new.client_id;
    if v_phone is not null then
      perform net.http_post(
        url := public._portal_fn_base() || 'whatsapp-send',    -- CONFIRMAR nombre/payload
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public._portal_fn_secret()),
        body := jsonb_build_object(
          'to', v_phone,
          'message', format('Hola %s 👋 Te dejamos material nuevo en tu plataforma de Korex. Entrá a verlo en Carpetas → Ediciones.', coalesce(v_name,''))
        )
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_portal_notify_edicion on public.funnel_resources;
create trigger trg_portal_notify_edicion
  after update of visible_cliente on public.funnel_resources
  for each row execute function public.portal_cliente_notify_edicion();

commit;

-- Nota: para avisos por FECHA de pipeline (ej. "mañana entregamos X"), agregar un
-- cron (pg_cron) que recorra clients.custom_phases y llame whatsapp-send, igual que
-- los crons existentes citas_recordatorios / pago-reminders.
