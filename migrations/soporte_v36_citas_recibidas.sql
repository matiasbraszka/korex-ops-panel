-- migrations/soporte_v36_citas_recibidas.sql
--
-- Punto 2: «cuando una persona reenvía un mensaje para responderlo, en WhatsApp se ve
-- la cita arriba; en el WhatsApp de soporte no».
--
-- Media feature ya estaba: responder citando FUNCIONA al enviar (whatsapp-send arma el
-- `quoted` real para Evolution y guarda wa_messages.reply_to), y la bandeja ya sabe
-- dibujar la burbuja citada (MessageBubble.jsx:129-134). Lo que faltaba era al
-- RECIBIR: el webhook nunca sacaba contextInfo.stanzaId del evento, así que la
-- respuesta de un cliente llegaba suelta y había que adivinar a qué contestaba.
--
-- El arreglo en el webhook ya está (whatsapp-webhook, quotedIdDe). Esto recupera lo
-- que ya pasó: el dato SIEMPRE estuvo guardado en payload, solo que nadie lo leía.
--
-- Números de la base antes de correr esto:
--   · 2.342 mensajes con payload->contextInfo->>stanzaId
--   · 2.323 de esos (99,2%) tienen el mensaje citado presente en wa_messages
--   · 181 filas con reply_to (solo las enviadas desde el panel)
--
-- Solo se rellenan las que están vacías: no se pisa nada de lo que ya escribió
-- whatsapp-send.

update public.wa_messages m
   set reply_to = q.stanza
  from (
    select id, payload->'contextInfo'->>'stanzaId' as stanza
      from public.wa_messages
     where reply_to is null
       and payload->'contextInfo'->>'stanzaId' is not null
  ) q
 where m.id = q.id
   and m.reply_to is null
   -- Solo si el citado existe: un id colgado no dibuja nada y ensucia la columna.
   and exists (select 1 from public.wa_messages o where o.wa_message_id = q.stanza);

-- Índice para resolver la cita cuando el mensaje citado quedó fuera de la página
-- cargada (la bandeja trae de a 50): se busca por wa_message_id, que ya es UNIQUE,
-- así que no hace falta nada nuevo. Se deja anotado para que no se agregue de más.

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) filter (where reply_to is not null) as con_cita,
--          count(*) filter (where reply_to is null
--                             and payload->'contextInfo'->>'stanzaId' is not null) as sin_resolver
--     from public.wa_messages;
--   -- con_cita debería pasar de 181 a ~2.500; sin_resolver son los que citan a un
--   -- mensaje que nunca llegó a la base (anteriores a la conexión).
--
-- ROLLBACK: no hace falta. Si molestara:
--   update public.wa_messages set reply_to = null
--    where reply_to is not null and direction = 'in';
