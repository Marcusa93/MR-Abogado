import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { expedientesKeys } from '@/hooks/use-expedientes'

// Procuración automática por expediente (migración 20261010184428).
// Las columnas y la tabla procuracion_eventos aún no están en database.types.ts.

export interface ProcuracionConfig {
  procuracion_auto: boolean
  procuracion_desde: string | null
  procuracion_responsable_id: string | null
  abogado_responsable_id: string | null
}

export interface ProcuracionEvento {
  id: string
  estado: 'procesado' | 'sin_accion' | 'error'
  tipo_acto: string | null
  resumen: string | null
  accion: string | null
  dias: number | null
  es_habiles: boolean | null
  base_legal: string | null
  vencimiento: string | null
  escrito_tipo: string | null
  /** Instrucciones del escrito propuesto (se redacta solo si se aprueba) */
  escrito_instrucciones: string | null
  etapa: string | null
  tarea_id: string | null
  escrito_id: string | null
  error: string | null
  created_at: string
  movimiento: { id: string; fecha: string; titulo: string } | null
}

export const procuracionKeys = {
  config: (expedienteId: string) => ['procuracion', 'config', expedienteId] as const,
  eventos: (expedienteId: string) => ['procuracion', 'eventos', expedienteId] as const,
}

export function useProcuracionConfig(expedienteId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: procuracionKeys.config(expedienteId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('expedientes')
        .select('procuracion_auto, procuracion_desde, procuracion_responsable_id, abogado_responsable_id')
        .eq('id', expedienteId)
        .single()
      if (error) throw error
      return data as ProcuracionConfig
    },
  })
}

export function useProcuracionEventos(expedienteId: string, enabled: boolean) {
  const supabase = createClient()
  return useQuery({
    queryKey: procuracionKeys.eventos(expedienteId),
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('procuracion_eventos')
        .select('*, movimiento:sae_movements(id, fecha, titulo)')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as ProcuracionEvento[]
    },
  })
}

export function useSetProcuracion(expedienteId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cambios: { procuracion_auto?: boolean; procuracion_responsable_id?: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('expedientes').update(cambios).eq('id', expedienteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: procuracionKeys.config(expedienteId) })
      queryClient.invalidateQueries({ queryKey: expedientesKeys.detail(expedienteId) })
    },
  })
}

export interface ProcesarResultado {
  procesadas: number
  con_accion: number
  /** Escritos propuestos (no redactados) */
  propuestas: number
  cortado_por_tope?: boolean
  mensaje?: string
}

/** Corre el procurador ya sobre este expediente (además del cron horario). */
export function useProcesarAhora(expedienteId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('procuracion-procesar', {
        body: { expediente_id: expedienteId },
      })
      if (error) throw error
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
      return data as ProcesarResultado
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: procuracionKeys.eventos(expedienteId) })
      queryClient.invalidateQueries({ queryKey: ['sae-movements', expedienteId] })
      queryClient.invalidateQueries({ queryKey: ['tareas'] })
      queryClient.invalidateQueries({ queryKey: expedientesKeys.detail(expedienteId) })
    },
  })
}

// ── Diligencias de prueba (migración 20261010193147) ─────────────────────────

export type EstadoDiligencia =
  | 'ordenado' | 'confeccionado' | 'enviado' | 'contestado' | 'notificado'
  | 'diligenciado' | 'fracasado' | 'reiterado' | 'desistido'

export interface Diligencia {
  id: string
  tipo: 'oficio' | 'testigo' | 'pericia' | 'cedula' | 'mandamiento' | 'otro'
  destinatario: string
  a_pedido: 'nuestra' | 'contraria' | 'juzgado'
  estado: EstadoDiligencia
  fecha_ordenado: string | null
  fecha_envio: string | null
  vence_respuesta: string | null
  plazo_es_control: boolean
  fecha_audiencia: string | null
  fecha_respuesta: string | null
  tarea_reiteracion_id: string | null
  reiteracion_escrito_id: string | null
}

export const diligenciasKeys = {
  list: (expedienteId: string) => ['procuracion', 'diligencias', expedienteId] as const,
}

export function useDiligencias(expedienteId: string, enabled: boolean) {
  const supabase = createClient()
  return useQuery({
    queryKey: diligenciasKeys.list(expedienteId),
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('procuracion_diligencias')
        .select('id, tipo, destinatario, a_pedido, estado, fecha_ordenado, fecha_envio, vence_respuesta, plazo_es_control, fecha_audiencia, fecha_respuesta, tarea_reiteracion_id, reiteracion_escrito_id')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Diligencia[]
    },
  })
}

/** Corrección manual del estado (ej. "ya contestó", "desistido"). */
export function useSetEstadoDiligencia(expedienteId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoDiligencia }) => {
      const cambios: Record<string, unknown> = { estado, updated_at: new Date().toISOString() }
      if (estado === 'contestado' || estado === 'diligenciado') cambios.fecha_respuesta = new Date().toISOString().slice(0, 10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('procuracion_diligencias').update(cambios).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: diligenciasKeys.list(expedienteId) })
    },
  })
}

/**
 * Aprobar una propuesta del procurador: recién acá se redacta el borrador
 * (a nombre de quien aprueba). El procurador nunca redacta solo.
 */
export function useRedactarPropuesta(expedienteId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (propuesta: { evento_id: string } | { diligencia_id: string }) => {
      const { data, error } = await supabase.functions.invoke('procuracion-procesar', {
        body: { accion: 'redactar', ...propuesta },
      })
      if (error) throw error
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
      return data as { escrito_id: string; titulo: string; ya_existia: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: procuracionKeys.eventos(expedienteId) })
      queryClient.invalidateQueries({ queryKey: diligenciasKeys.list(expedienteId) })
      queryClient.invalidateQueries({ queryKey: ['tareas'] })
    },
  })
}
