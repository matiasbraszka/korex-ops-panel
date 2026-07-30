-- soporte_v35: la vista del kanban, sin la subconsulta por fila.
--
-- soporte_v34 contaba los tickets abiertos con una subconsulta correlacionada: una
-- consulta a wa_pending_items POR CADA una de las 713 conversaciones. Medido en el
-- test de velocidad del 30/07: 47 ms, la consulta mas lenta del panel una vez
-- arreglados los permisos (perf_v5).
--
-- Se reemplaza por una agregacion previa unida con LEFT JOIN: una sola pasada por
-- wa_pending_items en vez de 713. Medido despues: 1,8 ms.
--
-- Nota sobre el limite que queda: wa_pending_items tiene politicas
-- soporte_conv_access(conversation_id, ...), que SI dependen de la fila y por eso
-- no se pueden envolver como hizo perf_v5. Para un admin es barato porque
-- soporte_conv_access corta en is_admin(); para alguien de soporte sin permisos de
-- admin cuesta un join por fila. Si algun dia el tablero se siente lento para el
-- equipo de soporte, ese es el lugar donde mirar.

create or replace view public.wa_conversations_seguimiento
with (security_invoker = on) as
with tickets as (
  select conversation_id, count(*)::int as abiertos
  from public.wa_pending_items
  where resolved_at is null
  group by conversation_id
)
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

  -- Deuda viva vs. cliente muerto: de las 369 sin responder, solo ~130 son deuda
  -- real. El resto son chats de clientes cerrados hace meses.
  coalesce(c.last_message_at > now() - interval '30 days', false) as vivo,

  -- Nunca se abrio (nivel N2 del analisis)
  (coalesce(c.unread_count, 0) > 0) as nunca_abierta,

  -- coalesce obligatorio: tipo_conversacion esta en NULL en 710 de 715 (R0 nunca
  -- corrio de verdad). Sin el, "not interno" daria NULL y se comeria el tablero.
  coalesce(c.tipo_conversacion in ('equipo_interno', 'proveedor'), false) as interno,

  coalesce(t.abiertos, 0) as tickets_abiertos

from public.wa_conversations c
left join public.clients cl on cl.id = c.client_id
left join tickets t on t.conversation_id = c.id
where coalesce(c.archived, false) = false;

-- ---------------------------------------------------------------------------
-- ROLLBACK: recrear la vista de soporte_v34_vista_seguimiento.sql.
-- No toca datos: es una vista.
-- ---------------------------------------------------------------------------
