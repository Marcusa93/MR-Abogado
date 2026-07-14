-- Columna JSONB para guardar el borrador de CD / Telegrama ley de una consulta.
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS intimacion jsonb DEFAULT NULL;
