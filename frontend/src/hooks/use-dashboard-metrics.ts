import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  total_expedientes: number
  en_tramite: number
  turnos_semana: number
  tareas_vencidas: number
  alertas_activas: number
  tasa_exito: number
  honorarios_pendientes: number
  // Trend deltas (compared to last period)
  total_expedientes_delta: number | null
  en_tramite_delta: number | null
  turnos_semana_delta: number | null
  tareas_vencidas_delta: number | null
  alertas_activas_delta: number | null
  // Recent data for the dashboard panels
  expedientes_recientes: RecentExpediente[]
  turnos_proximos: ProximoTurno[]
}

export interface RecentExpediente {
  id: string
  numero: string
  caratula: string
  estado_interno: string
  prioridad: string
  cliente_nombre: string
  cliente_apellido: string
  updated_at: string
}

export interface ProximoTurno {
  id: string
  expediente_id: string
  numero: string
  cliente_nombre: string
  cliente_apellido: string
  tipo_turno: string
  fecha: string
  hora: string | null
  estado: string
}

// ---------------------------------------------------------------------------
// Default fallback metrics (used while loading or on error)
// ---------------------------------------------------------------------------

const DEFAULT_METRICS: DashboardMetrics = {
  total_expedientes: 0,
  en_tramite: 0,
  turnos_semana: 0,
  tareas_vencidas: 0,
  alertas_activas: 0,
  tasa_exito: 0,
  honorarios_pendientes: 0,
  total_expedientes_delta: null,
  en_tramite_delta: null,
  turnos_semana_delta: null,
  tareas_vencidas_delta: null,
  alertas_activas_delta: null,
  expedientes_recientes: [],
  turnos_proximos: [],
}

// ---------------------------------------------------------------------------
// useDashboardMetrics
// ---------------------------------------------------------------------------

export function useDashboardMetrics() {
  const supabase = createClient()

  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_metrics')

      if (error) throw error

      // The RPC might return a single object or an array with one element
      const raw = Array.isArray(data) ? data[0] : data

      if (!raw) return DEFAULT_METRICS

      // Cast to any to extract fields since RPC returns Json for complex fields
      const metrics = raw as Record<string, unknown>

      return {
        total_expedientes: (metrics.total_expedientes as number) ?? 0,
        en_tramite: (metrics.en_tramite as number) ?? 0,
        turnos_semana: (metrics.turnos_semana as number) ?? 0,
        tareas_vencidas: (metrics.tareas_vencidas as number) ?? 0,
        alertas_activas: (metrics.alertas_activas as number) ?? 0,
        tasa_exito: (metrics.tasa_exito as number) ?? 0,
        honorarios_pendientes: (metrics.honorarios_pendientes as number) ?? 0,
        total_expedientes_delta: (metrics.total_expedientes_delta as number | null) ?? null,
        en_tramite_delta: (metrics.en_tramite_delta as number | null) ?? null,
        turnos_semana_delta: (metrics.turnos_semana_delta as number | null) ?? null,
        tareas_vencidas_delta: (metrics.tareas_vencidas_delta as number | null) ?? null,
        alertas_activas_delta: (metrics.alertas_activas_delta as number | null) ?? null,
        expedientes_recientes: (metrics.expedientes_recientes as RecentExpediente[]) ?? [],
        turnos_proximos: (metrics.turnos_proximos as ProximoTurno[]) ?? [],
      } satisfies DashboardMetrics
    },
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  })
}
