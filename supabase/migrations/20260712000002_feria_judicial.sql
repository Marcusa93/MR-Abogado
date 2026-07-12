-- Tabla de períodos de feria judicial por año.
-- Se actualiza anualmente cuando el Poder Judicial de Tucumán publica el calendario.
-- Las edge functions leen esta tabla para calcular plazos procesales correctamente.

create table if not exists feria_judicial (
  id          serial primary key,
  anio        smallint not null,
  temporada   text     not null check (temporada in ('verano', 'invierno', 'especial')),
  inicio      date     not null,
  fin         date     not null,
  descripcion text,
  created_at  timestamptz default now(),
  unique (anio, temporada)
);

alter table feria_judicial enable row level security;

-- Lectura para cualquier usuario autenticado (se usa desde edge functions y UI)
create policy "autenticados pueden leer feria_judicial"
  on feria_judicial for select to authenticated using (true);

-- Escritura solo para administradores del estudio
create policy "admins pueden gestionar feria_judicial"
  on feria_judicial for all to authenticated
  using (
    exists (
      select 1 from perfiles
      where id = auth.uid() and rol in ('admin', 'abogado')
    )
  );

-- ── Datos conocidos ───────────────────────────────────────────────────────────

insert into feria_judicial (anio, temporada, inicio, fin, descripcion) values
  (2025, 'verano',   '2025-01-01', '2025-01-31', 'Feria judicial de verano 2025 — Tucumán'),
  (2025, 'invierno', '2025-07-01', '2025-07-15', 'Feria judicial de invierno 2025 — Tucumán'),
  (2026, 'verano',   '2026-01-01', '2026-01-31', 'Feria judicial de verano 2026 — Tucumán'),
  (2026, 'invierno', '2026-07-09', '2026-07-24', 'Feria judicial de invierno 2026 — Tucumán')
on conflict (anio, temporada) do update
  set inicio = excluded.inicio,
      fin    = excluded.fin,
      descripcion = excluded.descripcion;
