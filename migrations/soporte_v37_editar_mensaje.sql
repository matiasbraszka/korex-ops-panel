-- migrations/soporte_v37_editar_mensaje.sql
--
-- Punto 1: poder EDITAR un mensaje ya enviado desde la bandeja de soporte.
--
-- WhatsApp permite editar los mensajes propios hasta ~15 minutos después de
-- enviarlos. Hasta ahora la única salida era borrar y volver a escribir, que en el
-- teléfono del cliente deja el cartel "se eliminó este mensaje" y queda peor que
-- la errata.
--
-- Se guardan dos cosas: cuándo se editó (para el rótulo "editado", igual que
-- WhatsApp) y el texto original. Lo segundo no es capricho: si alguien discute qué
-- se le dijo a un cliente, `body` ya no lo tiene.
--
-- ADITIVA e INERTE.

alter table public.wa_messages
  add column if not exists edited_at     timestamptz,
  add column if not exists body_original text;

comment on column public.wa_messages.edited_at is
  'Cuándo se editó el mensaje (nulo si nunca se editó). La bandeja muestra "editado".';
comment on column public.wa_messages.body_original is
  'El texto con el que se envió originalmente, antes de la primera edición. Se guarda '
  'una sola vez: las ediciones siguientes no lo pisan.';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) filter (where edited_at is not null) as editados from public.wa_messages;
--
-- ROLLBACK:
--   alter table public.wa_messages drop column if exists edited_at, drop column if exists body_original;
