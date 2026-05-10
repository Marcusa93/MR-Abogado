import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import {
  isEstadoTerminal,
} from '@/types/enums'

// ---------------------------------------------------------------------------
// Pipeline categories — 5 stages aligned with the real workflow
// ---------------------------------------------------------------------------

export type PipelineCategory = 'analisis' | 'iniciar' | 'iniciados' | 'favorable' | 'desfavorable'

const ESTADOS_ANALISIS = new Set([
  'NUEVA_CONSULTA',
  'PAUSADO',
])

const ESTADOS_INICIAR = new Set([
  'PARA_INICIAR',
])

const ESTADOS_INICIADOS = new Set([
  'INICIADO',
  'PRUEBA',
  'ALEGATOS',
  'SENTENCIA',
  'APELACION',
  'CORTE',
])

const TURNOS_ACTIVOS = new Set(['PENDIENTE', 'CONFIRMADA'])
const TAREAS_PENDIENTES = new Set(['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])

export function getExpCategory(exp: ExpedienteWithRelations): PipelineCategory {
  const estado = exp.estado_interno

  if (estado === 'NO_VIABLE_RECHAZADO') return 'desfavorable'
  if (estado === 'FINALIZADO' || isEstadoTerminal(estado)) return 'favorable'
  if (ESTADOS_INICIADOS.has(estado)) return 'iniciados'
  if (ESTADOS_INICIAR.has(estado)) return 'iniciar'
  return 'analisis'
}

// Keep backward compat alias
export type ExpColor = PipelineCategory
export const getExpColor = getExpCategory

export const COLOR_CONFIG: Record<
  PipelineCategory,
  {
    label: string
    borderClass: string
    bgClass: string
    dotClass: string
    counterBg: string
    counterText: string
    counterBorder: string
  }
> = {
  analisis: {
    label: 'En análisis',
    borderClass: 'border-l-slate-400',
    bgClass: 'bg-slate-500/[0.04]',
    dotClass: 'bg-slate-400',
    counterBg: 'bg-slate-500/10',
    counterText: 'text-zinc-600 dark:text-zinc-300',
    counterBorder: 'border-slate-500/20',
  },
  iniciar: {
    label: 'Para iniciar',
    borderClass: 'border-l-amber-400',
    bgClass: 'bg-amber-500/[0.04]',
    dotClass: 'bg-amber-400',
    counterBg: 'bg-amber-500/10',
    counterText: 'text-amber-600 dark:text-amber-400',
    counterBorder: 'border-amber-500/20',
  },
  iniciados: {
    label: 'Iniciados',
    borderClass: 'border-l-blue-500',
    bgClass: 'bg-blue-500/[0.04]',
    dotClass: 'bg-blue-500',
    counterBg: 'bg-blue-500/10',
    counterText: 'text-blue-600 dark:text-blue-400',
    counterBorder: 'border-blue-500/20',
  },
  favorable: {
    label: 'Favorable',
    borderClass: 'border-l-emerald-500',
    bgClass: 'bg-emerald-500/[0.04]',
    dotClass: 'bg-emerald-500',
    counterBg: 'bg-emerald-500/10',
    counterText: 'text-emerald-600 dark:text-emerald-400',
    counterBorder: 'border-emerald-500/20',
  },
  desfavorable: {
    label: 'No favorable',
    borderClass: 'border-l-rose-500',
    bgClass: 'bg-rose-500/[0.04]',
    dotClass: 'bg-rose-500',
    counterBg: 'bg-rose-500/10',
    counterText: 'text-rose-600 dark:text-rose-400',
    counterBorder: 'border-rose-500/20',
  },
}

/** All pipeline categories in display order */
export const PIPELINE_CATEGORIES: PipelineCategory[] = [
  'analisis',
  'iniciar',
  'iniciados',
  'favorable',
  'desfavorable',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getNextTurno(
  turnos: Pick<{ id: string; estado: string; fecha: string }, 'id' | 'estado' | 'fecha'>[]
): string | null {
  const today = new Date().toISOString().split('T')[0]
  const upcoming = turnos
    .filter((t) => t.fecha >= today && TURNOS_ACTIVOS.has(t.estado))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  return upcoming[0]?.fecha ?? null
}

export function getPendingTareas(
  tareas: Pick<{ id: string; estado: string }, 'id' | 'estado'>[]
): number {
  return tareas.filter((t) => TAREAS_PENDIENTES.has(t.estado)).length
}

// ---------------------------------------------------------------------------
// Hook — fetch active expedientes with optional abogado filter
// ---------------------------------------------------------------------------

export function usePanelExpedientes(abogadoId?: string | null) {
  const supabase = createClient()

  return useQuery<ExpedienteWithRelations[]>({
    queryKey: ['panel-estudio', abogadoId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('expedientes')
        .select(
          `
          *,
          clientes (id, nombre, apellido, telefono),
          tipos_tramite (id, nombre),
          miembros:expediente_miembros(rol, perfil:profiles!expediente_miembros_profile_id_fkey(nombre, apellido)),
          audiencias (id, estado, fecha),
          tareas (id, estado)
        `
        )
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(500)

      if (abogadoId) {
        // TODO: filter by expediente_miembros
        // query = query.eq('abogado_id', abogadoId)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ExpedienteWithRelations[]
    },
    staleTime: 30_000,
  })
}
