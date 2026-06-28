-- Informes › Accountability: capturas (screenshots) como prueba de lo cargado.
-- Bucket público (URLs no adivinables, contenido interno) para mostrar las
-- capturas en el panel, en el historial del cliente y enviarlas a Slack (unfurl).
-- Aplicado en vivo en Supabase 2026-06-28.

insert into storage.buckets (id, name, public, file_size_limit)
values ('informe-capturas', 'informe-capturas', true, 10485760)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Subir: cualquier miembro autenticado (los informes se cargan logueado).
create policy "informe_capturas_insert_auth" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'informe-capturas');

-- Actualizar/borrar: autenticado (para quitar una captura cargada por error).
create policy "informe_capturas_update_auth" on storage.objects
  for update to authenticated
  using (bucket_id = 'informe-capturas')
  with check (bucket_id = 'informe-capturas');

create policy "informe_capturas_delete_auth" on storage.objects
  for delete to authenticated
  using (bucket_id = 'informe-capturas');
