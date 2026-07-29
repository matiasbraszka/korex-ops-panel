-- soporte_v32: primera version de la vista del kanban.
--
-- NOTA DE RECONCILIACION (29-jul-2026)
-- Esta migracion se aplico directo en produccion y nunca llego al repo: quedo
-- registrada en supabase_migrations.schema_migrations como 20260729130323 pero
-- el .sql no existia en ningun lado. Se sube tal cual se aplico, para que repo
-- y base cuenten la misma historia.
--
-- YA NO ES LA VERSION VIGENTE: soporte_v34_vista_seguimiento.sql la reemplaza
-- (le agrega los campos que la tarjeta necesita y corrige tres problemas:
-- security_invoker, "where not archived" con NULL, y la falta de un campo de
-- actividad). Se conserva solo como registro historico.

create or replace view wa_conversations_seguimiento as
select
  c.id,
  c.wa_jid,
  c.wa_phone,
  c.is_group,
  c.wa_profile_name,
  c.custom_name,
  c.contact_id,
  c.client_id,
  c.assigned_to,
  c.last_message_at,
  c.last_message_direction,
  c.estado,
  c.seguimiento_fecha,
  c.tags,
  c.notes,
  c.archived,
  c.tipo_conversacion,
  c.bloqueado_manual,
  c.created_at,
  case
    when c.tipo_conversacion = 'equipo_interno' or c.archived then null
    when c.estado = 'cerrado' then 'CERRADO'
    when c.estado = 'responder_hoy' then 'A RESPONDER HOY'
    when c.estado = 'seguimiento' and c.seguimiento_fecha <= current_date then 'A RESPONDER HOY'
    when c.estado = 'seguimiento' and c.seguimiento_fecha > current_date then 'SEGUIMIENTO'
    when c.last_message_direction = 'out' then
      case
        when (now() - c.last_message_at) >= interval '7 days' then 'CERRADO'
        else 'ESPERANDO AL CONTACTO'
      end
    else 'SIN RESPONDER'
  end as columna_kanban,
  (now() - c.last_message_at) as antigedad
from public.wa_conversations c
where not c.archived;
