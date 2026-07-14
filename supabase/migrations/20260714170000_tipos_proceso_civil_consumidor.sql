-- Agrega tipos de proceso frecuentes en fuero civil y comercial:
-- consumidor, daños y perjuicios, e incumplimiento contractual.

INSERT INTO public.tipos_proceso_judicial (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
VALUES
  (
    'consumidor_tucuman',
    'Defensa del Consumidor',
    'civil',
    'tucuman',
    'Reclamo por relación de consumo: vicios redhibitorios, garantías, prácticas abusivas, daño directo o moral derivado del vínculo proveedor-consumidor.',
    'Ley 24.240 — CCyC arts. 1092 y ss.',
    30
  ),
  (
    'danos_perjuicios_tucuman',
    'Daños y Perjuicios',
    'civil',
    'tucuman',
    'Pretensión resarcitoria por responsabilidad civil extracontractual o contractual. Incluye daño material, moral, psíquico y punitivo según el caso.',
    'CCyC arts. 1708 y ss.',
    40
  ),
  (
    'incumplimiento_contractual_tucuman',
    'Incumplimiento Contractual',
    'civil',
    'tucuman',
    'Acción por cumplimiento forzado, resolución o rescisión de contrato por incumplimiento de la contraparte. Puede acumularse con daños.',
    'CCyC arts. 730, 1078, 1083 y ss.',
    50
  )
ON CONFLICT (codigo) DO NOTHING;
