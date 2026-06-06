import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface InformesTotales {
  total: number
  activos: number
  finalizados: number
  pausados: number
  alta_prioridad: number
}

export interface InformesPorEstado { estado: string; count: number }
export interface InformesPorFuero { fuero: string; count: number }
export interface InformesPorOrganismo {
  organismo_id: string
  nombre: string
  tipo: string | null
  count: number
  ultima_actividad: string | null
  estancados_30d: number
}
export interface InformesPorTipo { tipo_id: string; nombre: string; count: number }

export interface InformesPulsoIA {
  adjuntos_analizados: number
  adjuntos_pendientes: number
  movements_analizados: number
  audiencias_transcriptas: number
  aprendizajes_total: number
  aprendizajes_auto: number
  chunks_adjuntos: number
  chunks_audiencias: number
  chunks_normativa: number
  chunks_jurisprudencia: number
}

export interface InformesTendencia {
  mes: string
  expedientes_nuevos: number
  movements_nuevos: number
  sentencias_analizadas: number
}

export interface InformesJuez { nombre: string; apariciones: number }
export interface InformesNorma { norma: string; apariciones: number }
export interface InformesJuris { cita: string; apariciones: number }
export interface InformesPersona { nombre: string; apariciones: number }

export interface InformesDashboard {
  generado_at: string
  totales: InformesTotales
  por_estado: InformesPorEstado[]
  por_fuero: InformesPorFuero[]
  por_organismo: InformesPorOrganismo[]
  por_tipo_tramite: InformesPorTipo[]
  pulso_ia: InformesPulsoIA
  tendencia_mensual: InformesTendencia[]
  jueces_recurrentes: InformesJuez[]
  normativa_top: InformesNorma[]
  jurisprudencia_top: InformesJuris[]
  personas_recurrentes: InformesPersona[]
}

export function useInformesDashboard() {
  const supabase = createClient()

  return useQuery<InformesDashboard>({
    queryKey: ['informes-dashboard'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('informes_dashboard')
      if (error) throw error
      return data as InformesDashboard
    },
  })
}
