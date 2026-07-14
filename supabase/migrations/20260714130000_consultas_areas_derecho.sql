ALTER TABLE consultas ADD COLUMN IF NOT EXISTS areas_derecho text[] DEFAULT '{}';

-- Pre-poblar desde tipo_asunto para consultas existentes
UPDATE consultas
SET areas_derecho = ARRAY[tipo_asunto::text]
WHERE areas_derecho = '{}' AND tipo_asunto IS NOT NULL;
