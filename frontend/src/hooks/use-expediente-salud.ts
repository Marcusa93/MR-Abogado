import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ColorSalud = 'rojo' | 'amarillo' | 'verde' | 'gris'

export interface SaludExpediente {
  expediente_id: string
  semaforo: ColorSalud
  motivos: string[]
  ultimo_movimiento: string | null
  dias_sin_movimiento: number | null
  proxima_audiencia: string | null
  proximo_plazo: string | null
  plazos_vencidos: number
  tareas_vencidas: number
  sin_responsable: boolean
  estado_desactualizado: boolean
  dormido: boolean
}

export interface HitoProceso { clave: string; label: string; fecha: string | null }
export interface HitosExpediente { inicio: string | null; ultimo: string | null; movimientos: number; hitos: HitoProceso[] }

export const saludKeys = {
  all: ['expedientes-salud'] as const,
  lista: (ids: string[] | null) => ['expedientes-salud', ids ? [...ids].sort().join(',') : 'todos'] as const,
  hitos: (id: string) => ['expediente-hitos', id] as const,
}

// La RPC todavía no está en database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (createClient().rpc as any)(fn, args)

/** Salud (semáforo y motivos) de los expedientes pedidos, o de todos los visibles si ids es null. */
export function useExpedientesSalud(ids: string[] | null, enabled = true) {
  return useQuery({
    queryKey: saludKeys.lista(ids),
    enabled: enabled && (ids === null || ids.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc('expedientes_salud', { p_ids: ids })
      if (error) throw error
      const map = new Map<string, SaludExpediente>()
      for (const r of (data ?? []) as SaludExpediente[]) map.set(r.expediente_id, r)
      return map
    },
  })
}

export function useExpedienteSalud(id: string) {
  const q = useExpedientesSalud(id ? [id] : [])
  return { ...q, data: q.data?.get(id) ?? null }
}

export function useExpedienteHitos(id: string) {
  return useQuery({
    queryKey: saludKeys.hitos(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await rpc('expediente_hitos', { p_id: id })
      if (error) throw error
      return data as HitosExpediente
    },
  })
}
