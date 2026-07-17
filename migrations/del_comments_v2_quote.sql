-- migrations/del_comments_v2_quote.sql
--
-- Comentarios anclados al TEXTO (estilo Google Docs): además de la sección, el
-- comentario guarda la FRASE que marcaste (quote). El panel resalta esa frase y muestra
-- el comentario al costado. ADITIVA.
alter table public.del_comments add column if not exists quote text;
notify pgrst, 'reload schema';
-- Rollback: alter table public.del_comments drop column if exists quote;
