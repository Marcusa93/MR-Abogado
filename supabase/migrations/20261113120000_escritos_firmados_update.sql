-- Permite reemplazar el PDF firmado (upload con upsert) dentro de la carpeta propia.
drop policy if exists escritos_firmados_owner_update on storage.objects;
create policy escritos_firmados_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'escritos-firmados' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'escritos-firmados' and (storage.foldername(name))[1] = auth.uid()::text);
