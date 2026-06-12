-- soporte_v8: dirección del último mensaje (para el ✓✓ azul en la lista).
-- (Aplicada el 2026-06-12, con backfill desde wa_messages)
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text;

UPDATE public.wa_conversations c
SET last_message_direction = sub.direction
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, direction
  FROM public.wa_messages
  ORDER BY conversation_id, created_at DESC
) sub
WHERE sub.conversation_id = c.id;
