-- Bibliografía en formato APA 7 de cada artículo editorial (lista de entradas,
-- se imprime siempre al final del documento descargado).
alter table public.editorial_articulos
  add column if not exists bibliografia jsonb not null default '[]'::jsonb;
