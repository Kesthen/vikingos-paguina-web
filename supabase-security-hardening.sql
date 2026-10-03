-- Vikingos Classic: endurecimiento de RLS y Storage.
-- Ejecutar en Supabase > SQL Editor después de revisar los nombres de columnas.
-- La página pública solo registra atletas; la gestión queda para jueces autenticados.

begin;

alter table public.competidores enable row level security;

-- Retirar las políticas públicas permisivas que aparecen en el panel de Supabase.
drop policy if exists "lectura_publica" on public.competidores;
drop policy if exists "actualización_jueces" on public.competidores;
drop policy if exists "eliminación_admin" on public.competidores;
drop policy if exists "inscripción_publica" on public.competidores;

revoke all on table public.competidores from public, anon, authenticated;
grant insert on table public.competidores to anon;
grant select, insert, update, delete on table public.competidores to authenticated;

-- Si id usa una secuencia SERIAL, anon necesita permiso para generar su valor.
do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('public.competidores', 'id');
  if seq_name is not null then
    execute format('grant usage, select on sequence %s to anon', seq_name);
    execute format('grant usage, select on sequence %s to authenticated', seq_name);
  end if;
end
$$;

create policy "inscripcion_publica_validada"
on public.competidores
for insert
to anon
with check (
  nullif(btrim(nombre), '') is not null
  and nullif(btrim(cedula), '') is not null
  and nullif(btrim(correo), '') is not null
  and nullif(btrim(celular), '') is not null
  and nullif(btrim(ciudad), '') is not null
  and categoria in (
    'fit_model', 'bikini', 'wellness', 'figure', 'womans_physique',
    'classic_physique', 'mens_physique', 'bodybuilding'
  )
  and division in ('Prejuvenil', 'Juvenil', 'Semi-novatos', 'Novato', 'Avanzado', 'Master')
  and pago = 'Pendiente'
  and asistencia = 'Pendiente'
  and numero is null
  and peso is null
  and estatura is null
  and subdivision = 'Pendiente de pesaje'
  and "comprobanteUrl" like 'sb://inscripciones/%'
  and nullif(btrim("comprobanteNombre"), '') is not null
);

create policy "jueces_lectura_competidores"
on public.competidores for select to authenticated
using (public.es_juez());

create policy "jueces_inscripcion_competidores"
on public.competidores for insert to authenticated
with check (public.es_juez());

create policy "jueces_actualizacion_competidores"
on public.competidores for update to authenticated
using (public.es_juez())
with check (public.es_juez());

create policy "jueces_eliminacion_competidores"
on public.competidores for delete to authenticated
using (public.es_juez());

-- Los comprobantes/música dejan de ser públicos. Los jueces podrán generar URLs firmadas.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg']::text[]
where id = 'inscripciones';

-- Conservar la política existente de INSERT para inscripciones; cambiar el bucket a privado
-- no impide subir por API cuando esa política y el permiso INSERT siguen activos.
drop policy if exists "jueces_lectura_archivos_inscripcion" on storage.objects;
create policy "jueces_lectura_archivos_inscripcion"
on storage.objects for select to authenticated
using (bucket_id = 'inscripciones' and public.es_juez());

commit;
