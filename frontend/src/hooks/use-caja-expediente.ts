import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { MonedaCaja } from './use-caja'

export interface CajaPorExpedienteTotales {
  gastos_ars: number
  gastos_usd: number
  ingresos_ars: number
  ingresos_usd: number
  recuperable_ars: number
  recuperado_ars: number
}

export interface CajaPorExpedienteGasto {
  id: string
  fecha: string
  monto: number
  moneda: MonedaCaja
  categoria: string
  descripcion: string | null
  recuperable: boolean
  recuperado_at: string | null
}

export interface CajaPorExpedienteIngreso {
  id: string
  fecha: string
  monto: number
  moneda: MonedaCaja
  tipo: string
  descripcion: string | null
}

export interface CajaPorExpedienteData {
  totales: CajaPorExpedienteTotales
  gastos: CajaPorExpedienteGasto[]
  ingresos: CajaPorExpedienteIngreso[]
}

export function useCajaPorExpediente(expedienteId: string | undefined, enabled = true) {
  const supabase = createClient()
  return useQuery<CajaPorExpedienteData>({
    queryKey: ['caja-por-expediente', expedienteId],
    enabled: Boolean(expedienteId) && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('caja_por_expediente', {
        p_expediente_id: expedienteId,
      })
      if (error) throw error
      return data as CajaPorExpedienteData
    },
  })
}
