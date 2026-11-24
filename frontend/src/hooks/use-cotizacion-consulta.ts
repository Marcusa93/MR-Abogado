import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { COTIZACION_VACIA, type Cotizacion } from '@/lib/consultas/cotizacion'

// Presentación de los honorarios de una consulta (tabla `cotizaciones`, oculta a
// secretaría por RLS como `presupuestos`). Si todavía no hay fila, devuelve los
// valores por defecto: por separado, sin financiación, validez de 15 días.
// (No confundir con use-cotizacion.ts, que es la cotización del dólar.)

export function useCotizacionConsulta(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['cotizacion-consulta', consultaId],
    queryFn: async (): Promise<Cotizacion> => {
      if (!consultaId) throw new Error('Falta la consulta')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cotizaciones')
        .select('consulta_id, modo, precio_conjunto, financiacion, condiciones, validez_dias')
        .eq('consulta_id', consultaId)
        .maybeSingle()
      if (error) throw error
      if (!data) return COTIZACION_VACIA(consultaId)
      return {
        ...(data as Cotizacion),
        precio_conjunto: data.precio_conjunto != null ? Number(data.precio_conjunto) : null,
        financiacion: Array.isArray(data.financiacion) ? data.financiacion : [],
      }
    },
    enabled: !!consultaId,
  })
}

export function useGuardarCotizacionConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore((s) => s.profile)
  return useMutation({
    mutationFn: async (c: Cotizacion) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cotizaciones').upsert({
        consulta_id: c.consulta_id,
        modo: c.modo,
        precio_conjunto: c.precio_conjunto,
        financiacion: c.financiacion,
        condiciones: c.condiciones?.trim() || null,
        validez_dias: c.validez_dias,
        updated_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'consulta_id' })
      if (error) throw error
    },
    onSuccess: (_d, c) => {
      qc.invalidateQueries({ queryKey: ['cotizacion-consulta', c.consulta_id] })
    },
  })
}
