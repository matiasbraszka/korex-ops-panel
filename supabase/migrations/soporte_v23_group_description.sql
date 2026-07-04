-- soporte_v23_group_description.sql
-- Guarda la descripcion de los grupos de WhatsApp para mostrarla/editarla
-- desde el panel (edge function whatsapp-group). Aditivo, sin backfill.

alter table public.wa_conversations
  add column if not exists description text;
