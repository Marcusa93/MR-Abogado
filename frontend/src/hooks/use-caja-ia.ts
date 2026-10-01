import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CajaIaObservacion {
  id: string
  tipo: 'gasto' | 'ingreso'
  registro_id: string
  nivel: 'alerta' | 'error'
  observacion: string
  sugerencia: string | null
  campo_afectado: string | null
  valor_sugerido: string | null
  analizado_at: string
  aplicado_at: string | null
  descartado_at: string | null
  created_at: string
}

export interface AnalisisResult {
  ok: boolean
  gastos_analizados: number
  ingresos_analizados: number
  observaciones: number
  errores: number
  alertas: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (supabase: ReturnType<typeof createClient>) => (supabase.from as any)

export function useCajaIaObservaciones() {
  const supabase = createClient()
  return useQuery<CajaIaObservacion[]>({
    queryKey: ['caja-ia-observaciones'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await anyFrom(supabase)('caja_ia_observaciones')
        .select('*')
        .is('aplicado_at', null)
        .is('descartado_at', null)
        .order('nivel', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CajaIaObservacion[]
    },
  })
}

export function useDescartarObservacion() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom(supabase)('caja_ia_observaciones')
        .update({ descartado_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-ia-observaciones'] })
    },
  })
}

export function useAplicarRecuperable() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ observacionId, gastoId, valor }: { observacionId: string; gastoId: string; valor: boolean }) => {
      const { error: gastoErr } = await (supabase.from as any)('gastos')
        .update({ recuperable: valor })
        .eq('id', gastoId)
      if (gastoErr) throw gastoErr

      const { error: obsErr } = await anyFrom(supabase)('caja_ia_observaciones')
        .update({ aplicado_at: new Date().toISOString() })
        .eq('id', observacionId)
      if (obsErr) throw obsErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-ia-observaciones'] })
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-recuperables-pendientes'] })
    },
  })
}

export function useEjecutarAnalisisIa() {
  const qc = useQueryClient()
  return useMutation<AnalisisResult>({
    mutationFn: async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/caja-analisis-ia`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<AnalisisResult>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-ia-observaciones'] })
    },
  })
}
