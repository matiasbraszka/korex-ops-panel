-- Responder citando un mensaje (estilo WhatsApp). Guarda el wa_message_id del
-- mensaje citado; el panel resuelve el snippet contra los mensajes cargados.
alter table wa_messages add column if not exists reply_to text;
