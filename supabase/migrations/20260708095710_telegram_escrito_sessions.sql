-- Sesiones conversacionales del bot de Telegram para escritos.
-- Guarda el último expediente/escrito generado y confirmaciones pendientes,
-- permitiendo "reintentá" y preguntar el tipo cuando no se detecta.

create table if not exists telegram_escrito_sessions (
  chat_id         bigint  primary key,
  expediente_id   uuid    references expedientes(id) on delete set null,
  last_escrito_id uuid    references escritos(id) on delete set null,
  last_tipo       text,
  pending         jsonb,
  updated_at      timestamptz not null default now()
);

-- Solo accedida por service_role (webhook). RLS habilitado sin políticas
-- para bloquear acceso anónimo/authenticated directo.
alter table telegram_escrito_sessions enable row level security;
