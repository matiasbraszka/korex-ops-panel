-- soporte_v34: rehace wa_conversations_seguimiento para que sirva de kanban
--
-- La vista original (soporte_v32, aplicada suelta en prod) tenia la logica bien
-- pero le faltaba todo lo que la tarjeta necesita y arrastraba tres problemas:
--   a) "where not c.archived" descarta la fila si archived llegara a ser NULL;
--   b) columna_kanban devolvia NULL para el equipo interno -> una fila fantasma;
--   c) sin campo de actividad, las 130 conversaciones sin responder reales
--      quedaban mezcladas con 239 de clientes cerrados hace meses.
--
-- PRINCIPIO (P1 del analisis): esta vista NO interpreta contenido. Las 3 columnas
-- automaticas salen de last_message_direction + last_message_at. Las 2 manuales
-- (A RESPONDER HOY y SEGUIMIENTO) salen de wa_conversations.estado, que solo
-- escribe una persona. Cero IA, cero margen de error.

drop view if exists public.wa_conversations_seguimiento;

create view public.wa_conversations_seguimiento
with (security_invoker = on) as
select
  c.id,
  c.wa_jid,
  c.is_group,
  c.wa_profile_name,
  c.custom_name,
  c.contact_id,
  c.client_id,
  cl.name                                   as cliente_nombre,
  c.assigned_to,
  c.unread_count,
  c.last_message_at,
  c.last_message_preview,
  c.last_message_direction,
  c.estado,
  c.seguimiento_fecha,
  c.tags,
  c.tipo_conversacion,
  c.bloqueado_manual,
  c.created_at,

  -- Columna del tablero. Claves, no etiquetas: el texto lo pone la interfaz.
  case
    -- Marcas manuales (ganan siempre sobre lo mecanico)
    when c.estado = 'cerrado'       then 'CERRADO'
    when c.estado = 'responder_hoy' then 'A_RESPONDER_HOY'
    -- Un seguimiento cuya fecha ya llego vuelve solo a la cola del dia
    when c.estado = 'seguimiento'
     and coalesce(c.seguimiento_fecha, current_date) <= current_date then 'A_RESPONDER_HOY'
    when c.estado = 'seguimiento'   then 'SEGUIMIENTO'
    -- Sin direccion no se puede deducir nada (26 conversaciones viejas, todas
    -- inactivas y leidas): fuera de la cola, no inventamos que estan sin responder.
    when c.last_message_direction is null or c.last_message_at is null then 'CERRADO'
    -- Mecanico
    when c.last_message_direction = 'out'
     and now() - c.last_message_at >= interval '7 days' then 'CERRADO'
    when c.last_message_direction = 'out' then 'ESPERANDO_CONTACTO'
    else 'SIN_RESPONDER'
  end as columna_kanban,

  -- Hace cuanto espera. En SIN RESPONDER es EL dato: el mas viejo va arriba.
  case when c.last_message_at is null then null
       else round(extract(epoch from (now() - c.last_message_at)) / 3600)::int
  end as horas_esperando,

  -- Deuda viva vs. cliente muerto. La interfaz filtra por esto por defecto.
  -- De las 369 sin responder, solo 130 son deuda real: el resto son chats de
  -- clientes cerrados hace meses, sin una sola actividad en 30 dias.
  coalesce(c.last_message_at > now() - interval '30 days', false) as vivo,

  -- Nunca se abrio (nivel N2 del analisis: 45 conversaciones hoy)
  (coalesce(c.unread_count, 0) > 0) as nunca_abierta,

  -- Equipo interno y proveedores no son soporte: la interfaz los esconde por
  -- defecto (§8.3). Se marcan en vez de excluirse para poder verlos si hace falta.
  -- coalesce obligatorio: tipo_conversacion esta en NULL en 710 de 715 (R0 nunca
  -- corrio de verdad, faltan los telefonos del equipo). Sin el, "not interno"
  -- daria NULL y se comeria el tablero entero.
  coalesce(c.tipo_conversacion in ('equipo_interno', 'proveedor'), false) as interno,

  -- Tickets abiertos del hilo (wa_pending_items), para el chip de la tarjeta
  (select count(*) from public.wa_pending_items p
    where p.conversation_id = c.id and p.resolved_at is null)::int as tickets_abiertos

from public.wa_conversations c
left join public.clients cl on cl.id = c.client_id
where coalesce(c.archived, false) = false;

comment on view public.wa_conversations_seguimiento is
  'Kanban de seguimiento de contactos. Derivada, de solo lectura: para mover una '
  'conversacion se escribe wa_conversations.estado / seguimiento_fecha. Respeta RLS '
  '(security_invoker), asi que cada usuario ve lo mismo que en el inbox.';

-- ---------------------------------------------------------------------------
-- ROLLBACK: drop view public.wa_conversations_seguimiento;  y recrear la de v32.
-- (No toca datos: es una vista.)
-- ---------------------------------------------------------------------------
