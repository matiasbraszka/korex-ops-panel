-- migrations/share_v2_thumbnails.sql
--
-- La página pública de link compartido (/compartir/<token>) mostraba todos los videos como
-- recuadros negros: share_get devolvía id/title/public_url/kind/provider/created_by/created_at
-- pero NO storage_path, que es justo donde vive la miniatura de Bunny
-- (https://<host>/<videoId>/thumbnail.jpg, la escribe subirVideo → bunny-commit).
-- Sin ese campo la página no tenía con qué dibujar la miniatura.
--
-- De paso habilita la descarga del original en el visor: ResourceLightbox arma la URL de
-- descarga como storage_path.replace('/thumbnail.jpg', '/original').
--
-- Edito la función VIVA con pg_get_functiondef + replace en vez de re-escribirla entera:
-- share_get tiene tres ramas (folder / del / guia) y transcribirla a mano es la forma
-- segura de romper las otras dos.

do $mig$
declare
  v_def text;
  v_old text := $x$'provider', r.provider, 'created_by', r.created_by, 'created_at', r.created_at$x$;
  v_new text := $x$'provider', r.provider, 'created_by', r.created_by, 'created_at', r.created_at,
          'storage_path', r.storage_path$x$;
begin
  v_def := pg_get_functiondef('public.share_get(text)'::regprocedure);

  if position(v_old in v_def) = 0 then
    raise exception 'share_get cambió: no encontré el bloque a parchear. Revisar a mano.';
  end if;
  if position('storage_path' in v_def) > 0 then
    raise notice 'share_get ya devuelve storage_path, no hago nada.';
    return;
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
  raise notice 'share_get actualizado.';
end $mig$;

notify pgrst, 'reload schema';

-- Verificación:
--   select pg_get_functiondef('public.share_get(text)'::regprocedure) ilike '%storage_path%';  -- true
--   select jsonb_pretty(public.share_get('<token de una carpeta>'));  -- los files traen storage_path
