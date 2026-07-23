-- migrations/client_drive_nodes_size_v1.sql
--
-- El PESO de cada archivo del Drive (Etapa C — Recursos con video propio).
--
-- Hoy client_drive_nodes NO guarda el tamaño de los archivos (verificado). Sin eso
-- NO se puede planificar la subida a hosting propio: cuánto pesa el cliente, cuánto
-- va a costar el video, cuánto tarda el rclone. Hoy el ~0,7 TB total es una estimación.
--
-- Esta migración agrega la columna. Es ADITIVA e INERTE: queda nula hasta que la
-- ingesta la empiece a llenar.
--
-- ── LO QUE FALTA PARA LLENARLA (no es SQL) ───────────────────────────────────
-- El árbol lo trae el Apps Script `crear-carpetas-cliente.gs` (función listFolderTree)
-- y lo escribe la edge function `drive-sync`. Para poblar size_bytes:
--   1) En el Apps Script: por cada archivo, agregar  file.getSize()  al objeto que
--      devuelve (las CARPETAS no tienen tamaño; van en null).
--   2) En drive-sync/index.ts: mapear ese campo a size_bytes en el upsert.
-- Mientras eso no se haga, la columna queda en null y no molesta a nadie.

alter table public.client_drive_nodes
  add column if not exists size_bytes bigint;

comment on column public.client_drive_nodes.size_bytes is
  'Tamaño del archivo en bytes (null en carpetas). Lo llena drive-sync desde file.getSize() del Apps Script.';

notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.client_drive_nodes drop column if exists size_bytes;
