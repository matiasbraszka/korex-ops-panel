-- soporte_v4: media de WhatsApp (imagenes, audios, documentos).
--
-- Flujo: la edge function whatsapp-media pide el archivo desencriptado al
-- puente Evolution UNA vez, lo sube al bucket privado wa-media y guarda la
-- ruta en wa_messages. La UI consume signed URLs (1h) generadas por la
-- function — los usuarios nunca tocan Storage directo, por eso el bucket no
-- necesita policies.

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_filename text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-media', 'wa-media', false)
ON CONFLICT (id) DO NOTHING;
