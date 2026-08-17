-- Trazabilidad de confirmación explícita de vista en portal SAE.
-- Distinción entre "leída en la app" (leida=true) y "el abogado fue al portal
-- y verificó la notificación allí" (confirmado_visto_en_sae_at no nulo).
ALTER TABLE public.sae_notificaciones
  ADD COLUMN IF NOT EXISTS confirmado_visto_en_sae_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_visto_por uuid REFERENCES public.profiles(id);
