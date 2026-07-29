-- soporte_v32: Vista derivada para el kanban de seguimiento (Fase 3)
-- Las 5 columnas se calculan en lectura sin persistir estado, evitando crons.

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
  -- Derivar columna del kanban
  case
    when c.tipo_conversacion = 'equipo_interno' or c.archived then null -- excluir internos/archivados
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
  (now() - c.last_message_at) as antigedad,
  contact:contacts(id, full_name, phone, email),
  client:clients(id, name)
from public.wa_conversations c
where not c.archived;
