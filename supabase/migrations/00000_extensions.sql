-- ============================================================
-- Alba Guerra CRM Previsional - Extensiones PostgreSQL
-- ============================================================

-- Búsqueda fuzzy (similarity, trigrams)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- Cifrado de datos sensibles (clave ANSES, CVSS)
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- UUIDs (ya viene habilitado en Supabase, pero por seguridad)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
