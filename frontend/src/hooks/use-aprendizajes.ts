import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export type TargetKind = 'juez' | 'organismo' | 'tipo_proceso' | 'etapa_proceso' | 'fuero' | 'general' | 'estilo'
export type Confidence = 'baja' | 'media' | 'alta'
export type Scope = 'personal' | 'compartido' | 'universal'

export interface Aprendizaje {
  id: string
  scope: Scope
  owner_id: string | null
  target_kind: TargetKind
  target_ref_text: string | null
  target_organismo_id: string | null
  tipo_proceso_id: string | null
  etapa_proceso_id: string | null
  contenido: string
  contenido_estructurado: Record<string, unknown> | null
  confidence: Confidence
  observed_in_cases: number
  is_active: boolean
  proposed: boolean
  source_escrito_id: string | null
  source_diff: Record<string, unknown> | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ── Lista por filtro ─────────────────────────────────────────────
export interface AprendizajeFilter {
  proposed?: boolean
  is_active?: boolean
  target_kind?: TargetKind
  scope?: Scope
}

export function useAprendizajes(filter: AprendizajeFilter = {}) {
  return useQuery<Aprendizaje[]>({
    queryKey: ['aprendizajes', filter],
    queryFn: async () => {
      let q = supabase.from('aprendizajes_rulebook' as never).select('*')
      if (filter.proposed !== undefined) q = q.eq('proposed', filter.proposed)
      if (filter.is_active !== undefined) q = q.eq('is_active', filter.is_active)
      if (filter.target_kind) q = q.eq('target_kind', filter.target_kind)
      if (filter.scope) q = q.eq('scope', filter.scope)
      q = q.order('created_at', { ascending: false }) as never
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Aprendizaje[]
    },
    // refetch cada 30s si hay propuestos (puede llegar uno nuevo del trigger)
    refetchInterval: filter.proposed ? 30_000 : false,
  })
}

// Contador rápido para badges
export function useAprendizajesPropuestosCount() {
  return useQuery<number>({
    queryKey: ['aprendizajes-count-propuestos'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('aprendizajes_rulebook' as never)
        .select('id', { count: 'exact', head: true })
        .eq('proposed', true)
        .eq('is_active', true)
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 30_000,
  })
}

// ── Aprobar (deja de ser propuesto, queda activo) ────────────────
export function useAprobarAprendizaje() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; confidence?: Confidence; scope?: Scope }>({
    mutationFn: async ({ id, confidence, scope }) => {
      const patch: Record<string, unknown> = {
        proposed: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      if (confidence) patch.confidence = confidence
      if (scope) patch.scope = scope
      const { error } = await supabase
        .from('aprendizajes_rulebook' as never)
        .update(patch as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprendizajes'] })
      qc.invalidateQueries({ queryKey: ['aprendizajes-count-propuestos'] })
    },
  })
}

// ── Descartar (soft-delete) ──────────────────────────────────────
export function useDescartarAprendizaje() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('aprendizajes_rulebook' as never)
        .update({ is_active: false, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprendizajes'] })
      qc.invalidateQueries({ queryKey: ['aprendizajes-count-propuestos'] })
    },
  })
}

// ── Editar contenido / target ─────────────────────────────────────
export function useEditarAprendizaje() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; patch: Partial<Pick<Aprendizaje, 'contenido' | 'target_kind' | 'target_ref_text' | 'confidence' | 'scope'>> }>({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase
        .from('aprendizajes_rulebook' as never)
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aprendizajes'] }),
  })
}
