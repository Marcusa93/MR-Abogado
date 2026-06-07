-- LLM call log para rate limiting y observabilidad de costos.
-- Cada función que llama a OpenRouter (u otro LLM provider) inserta una fila.
-- El rate limit se calcula como count(*) en los últimos N segundos para
-- (user_id, function_name).

create table if not exists public.llm_call_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  input_bytes integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists llm_call_log_user_fn_created_idx
  on public.llm_call_log (user_id, function_name, created_at desc);

create index if not exists llm_call_log_created_idx
  on public.llm_call_log (created_at desc);

alter table public.llm_call_log enable row level security;

-- Solo el dueño puede leer sus filas. Las edge functions usan service role
-- para insertar y leer global.
drop policy if exists "llm_call_log_self_select" on public.llm_call_log;
create policy "llm_call_log_self_select" on public.llm_call_log
  for select using (auth.uid() = user_id);

-- RPC: cuenta llamadas en una ventana móvil. Llamada con security definer
-- para evitar dependencia de RLS (las edge functions ya autenticaron al user).
create or replace function public.llm_recent_count(
  p_user_id       uuid,
  p_function_name text,
  p_window_seconds integer default 60
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.llm_call_log
  where user_id = p_user_id
    and function_name = p_function_name
    and created_at >= now() - make_interval(secs => p_window_seconds);
$$;

revoke all on function public.llm_recent_count(uuid, text, integer) from public;
grant execute on function public.llm_recent_count(uuid, text, integer) to authenticated, service_role;

-- GC: borrar logs > 7 días (la decisión la cubrimos con pg_cron en otro PR).
comment on table public.llm_call_log is
  'Log de llamadas LLM por usuario. Usado por _shared/llm-guard.ts para rate limit. Limpiar entradas > 7 días con cron.';
