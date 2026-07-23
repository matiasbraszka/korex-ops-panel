-- migrations/funnel_resources_v4_transcript.sql
--
-- Transcripción automática de los videos (Matías, 2026-07-18). Bunny Stream transcribe
-- cada video al subirlo (EnableTranscribing = true, idioma es). Guardamos el texto acá
-- para: (1) detectar a qué avatar apunta el guion, (2) que Claude analice/edite a futuro.
--
--   transcript       → el texto plano del guion (de las subtítulos VTT de Bunny)
--   transcript_lang  → idioma detectado (ej 'es-auto')
--   avatar_auto      → true si el avatar_id lo puso la detección automática (no una persona)

alter table public.funnel_resources add column if not exists transcript text;
alter table public.funnel_resources add column if not exists transcript_lang text;
alter table public.funnel_resources add column if not exists avatar_auto boolean not null default false;

notify pgrst, 'reload schema';
