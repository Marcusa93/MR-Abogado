import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { EstadoInterno, Prioridad } from '@/types/enums'
import { getEstadoConfig } from '@/components/shared/estado-badge'
import {
  type PipelineCategory,
  getExpCategory,
  COLOR_CONFIG,
  PIPELINE_CATEGORIES,
} from '@/hooks/use-panel-expedientes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KanbanFilters {
  // TODO: abogado_id removed from DB — filter via expediente_miembros
  // abogado_id?: string | null
  tipo_tramite_id?: string | null
  prioridad?: Prioridad | null
}

export interface KanbanCard {
  id: string
  numero: string
  /** @deprecated use numero */
  numero_expediente?: string
  caratula: string
  estado_interno: EstadoInterno
  prioridad: Prioridad
  cliente_nombre: string
  cliente_apellido: string
  abogado_nombre: string | null
  abogado_apellido: string | null
  tipo_tramite: string | null
  tipo_tramite_nombre?: string
  fecha_alta?: string
  /** @deprecated use fecha_alta */
  fecha_inicio?: string
  updated_at: string
  dias_en_estado: number | null
  tareas_pendientes: number
  proximo_turno: string | null
}

/** A pipeline column groups multiple estados into a single visual column */
export interface KanbanColumn {
  category: PipelineCategory
  label: string
  cards: KanbanCard[]
  count: number
}

// Legacy compat — keep estado for components that reference it
export type KanbanData = KanbanColumn[]

/** Map from pipeline category → default estado_interno for new cards dropped there */
export const PIPELINE_DEFAULT_ESTADO: Record<PipelineCategory, EstadoInterno> = {
  analisis: 'NUEVA_CONSULTA',
  iniciar: 'PARA_INICIAR',
  iniciados: 'INICIADO',
  favorable: 'FINALIZADO',
  desfavorable: 'NO_VIABLE_RECHAZADO',
}

/** Get the pipeline category for a given estado_interno (reuses semáforo logic) */
function cardToCategory(card: KanbanCard): PipelineCategory {
  // Build a minimal ExpedienteWithRelations-like shape
  return getExpCategory({
    estado_interno: card.estado_interno,
    audiencias: [],
    tareas: [],
  } as any)
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const kanbanKeys = {
  all: ['kanban'] as const,
  data: (filters: KanbanFilters) => [...kanbanKeys.all, filters] as const,
}

// ---------------------------------------------------------------------------
// useKanbanData — fetches cards and groups into 5 pipeline columns
// ---------------------------------------------------------------------------

export function useKanbanData(filters: KanbanFilters = {}) {
  const supabase = createClient()

  return useQuery<KanbanData>({
    queryKey: kanbanKeys.data(filters),
    queryFn: async () => {
      const { data: rawData, error } = await (supabase.rpc as any)('get_kanban_data', {
        p_tipo_tramite_id: filters.tipo_tramite_id ?? null,
        p_prioridad: filters.prioridad ?? null,
      })

      if (error) throw error

      const data = rawData as unknown
      if (!data) return buildEmptyColumns()

      // Flatten to cards regardless of RPC response shape
      let allCards: KanbanCard[] = []
      if (Array.isArray(data) && data.length > 0 && 'cards' in data[0]) {
        // Pre-grouped by the RPC — flatten
        for (const col of data as any[]) {
          allCards.push(...(col.cards ?? []))
        }
      } else {
        allCards = (Array.isArray(data) ? data : [data]) as KanbanCard[]
      }

      // Group into 5 pipeline columns
      return buildPipelineColumns(allCards)
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

function buildEmptyColumns(): KanbanData {
  return PIPELINE_CATEGORIES.map((cat) => ({
    category: cat,
    label: COLOR_CONFIG[cat].label,
    cards: [],
    count: 0,
  }))
}

function buildPipelineColumns(cards: KanbanCard[]): KanbanData {
  const groups = new Map<PipelineCategory, KanbanCard[]>()
  for (const cat of PIPELINE_CATEGORIES) {
    groups.set(cat, [])
  }

  for (const card of cards) {
    const cat = cardToCategory(card)
    groups.get(cat)!.push(card)
  }

  return PIPELINE_CATEGORIES.map((cat) => {
    const columnCards = groups.get(cat)!
    return {
      category: cat,
      label: COLOR_CONFIG[cat].label,
      cards: columnCards,
      count: columnCards.length,
    }
  })
}
