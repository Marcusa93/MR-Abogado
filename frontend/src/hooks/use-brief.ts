import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ─── Tipos locales (database.types.ts aún no incluye las tablas nuevas) ───

export type BriefSeccion =
  | 'hechos' | 'partes' | 'estrategia' | 'riesgos'
  | 'decisiones' | 'normativa' | 'jurisprudencia' | 'hitos' | 'observaciones'

export type BriefTipo =
  | 'hecho' | 'hipotesis' | 'decision_estrategica' | 'riesgo'
  | 'parte' | 'referencia_norma' | 'referencia_jurisprudencia'
  | 'hito' | 'observacion'

export type BriefSource =
  | 'pregunta_predef' | 'input_libre' | 'importado_actuacion'
  | 'generado_por_ia' | 'manual'

export type BriefConfidence = 'baja' | 'media' | 'alta' | 'confirmada_humana'

export interface BriefEntry {
  entry_id: string
  chain_id: string
  expediente_id: string
  seccion: BriefSeccion
  tipo: BriefTipo
  contenido: string
  contenido_estructurado: Record<string, unknown> | null
  source: BriefSource
  confidence: BriefConfidence
  evidence_refs: Array<Record<string, unknown>>
  version: number
  created_at: string
  created_by: string | null
}

export interface BriefPregunta {
  id: string
  expediente_id: string
  pregunta: string
  origen: 'rulebook' | 'ia_brief_gen' | 'ia_input_libre' | 'manual'
  contexto: Record<string, unknown>
  prioridad: 'baja' | 'normal' | 'alta'
  estado: 'pendiente' | 'respondida' | 'descartada'
  respuesta_entry_id: string | null
  created_at: string
  answered_at: string | null
}

export interface BriefContradiccion {
  id: string
  expediente_id: string
  entry_a_id: string
  entry_b_id: string | null
  external_ref: Record<string, unknown> | null
  descripcion: string
  detectada_por: 'ia' | 'humano'
  estado: 'pendiente' | 'resuelta' | 'descartada'
  resolucion: 'a_vale' | 'b_vale' | 'ambas_validas' | 'reescribir' | 'ninguna' | null
  created_at: string
}

// ─── Queries ──────────────────────────────────────────────────────────────

export function useBrief(expedienteId: string) {
  return useQuery<BriefEntry[]>({
    queryKey: ['brief', expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expediente_brief_actual' as never)
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('seccion')
      if (error) throw error
      return (data ?? []) as unknown as BriefEntry[]
    },
    enabled: !!expedienteId,
  })
}

export function useBriefPreguntas(expedienteId: string) {
  return useQuery<BriefPregunta[]>({
    queryKey: ['brief-preguntas', expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expediente_brief_preguntas' as never)
        .select('*')
        .eq('expediente_id', expedienteId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as BriefPregunta[]
    },
    enabled: !!expedienteId,
  })
}

export function useBriefContradicciones(expedienteId: string) {
  return useQuery<BriefContradiccion[]>({
    queryKey: ['brief-contradicciones', expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expediente_brief_contradicciones' as never)
        .select('*')
        .eq('expediente_id', expedienteId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as BriefContradiccion[]
    },
    enabled: !!expedienteId,
  })
}

// ─── Mutations: edge functions ────────────────────────────────────────────

export interface GenerateBriefResponse {
  ok: boolean
  resumen_corto: string
  entries_propuestas: Array<{
    seccion: BriefSeccion
    tipo: BriefTipo
    contenido: string
    contenido_estructurado?: Record<string, unknown>
    confidence: BriefConfidence
    evidence_refs?: Array<Record<string, unknown>>
    source_inferida: BriefSource
  }>
  preguntas_abiertas: Array<{
    pregunta: string
    origen: 'ia_brief_gen'
    contexto?: Record<string, unknown>
    prioridad: 'baja' | 'normal' | 'alta'
    rationale?: string
  }>
  proximos_hitos_calculados: Array<{
    descripcion: string
    fuente: 'rulebook' | 'inferido_de_actuaciones'
    plazo_dias_restantes: number | null
  }>
  modelo: string
  contexto_usado: Record<string, unknown>
}

export function useGenerateBrief() {
  return useMutation<GenerateBriefResponse, Error, { expediente_id: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<GenerateBriefResponse>(
        'expediente-brief-generate',
        { body: input },
      )
      if (error) throw new Error(error.message || 'Error generando brief')
      if (!data?.ok) {
        const d = data as any
        throw new Error(d?.error || 'Respuesta inválida del servidor')
      }
      return data
    },
  })
}

export interface ParseInputResponse {
  ok: boolean
  cambios_propuestos: Array<{
    seccion: BriefSeccion
    tipo: BriefTipo
    contenido: string
    contenido_estructurado?: Record<string, unknown>
    operacion: 'crear_nueva' | 'versionar_entry'
    versionar_entry_id: string | null
    confidence: BriefConfidence
    rationale?: string
  }>
  contradicciones_detectadas: Array<{
    con_entry_id: string | null
    con_aprendizaje_id: string | null
    con_rulebook_plazo: string | null
    descripcion: string
    severidad: 'baja' | 'media' | 'alta'
  }>
  generalizable_sugerido: Array<{
    target_kind: 'juez' | 'organismo' | 'tipo_proceso' | 'etapa_proceso' | 'fuero' | 'general'
    target_ref_text: string
    contenido: string
    scope_sugerido: 'personal' | 'compartido'
    rationale?: string
  }>
  preguntas_clarificacion: string[]
  modelo: string
}

export function useParseBriefInput() {
  return useMutation<ParseInputResponse, Error, { expediente_id: string; texto: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<ParseInputResponse>(
        'expediente-brief-parse',
        { body: input },
      )
      if (error) throw new Error(error.message || 'Error procesando input')
      if (!data?.ok) {
        const d = data as any
        throw new Error(d?.error || 'Respuesta inválida del servidor')
      }
      return data
    },
  })
}

// ─── Mutations: commits ───────────────────────────────────────────────────

export interface CommitEntryInput {
  expediente_id: string
  seccion: BriefSeccion
  tipo: BriefTipo
  contenido: string
  contenido_estructurado?: Record<string, unknown> | null
  source: BriefSource
  confidence?: BriefConfidence
  evidence_refs?: Array<Record<string, unknown>>
  /** Si está, versiona esa entrada; sino crea nueva chain. */
  versionar_entry_id?: string | null
}

/** Confirma una entrada del brief. Crea nueva o versiona según `versionar_entry_id`. */
export function useCommitBriefEntry() {
  const qc = useQueryClient()
  return useMutation<{ id: string; chain_id: string }, Error, CommitEntryInput>({
    mutationFn: async (input) => {
      if (input.versionar_entry_id) {
        const { data, error } = await supabase.rpc('expediente_brief_versionar' as never, {
          p_entry_padre_id: input.versionar_entry_id,
          p_nuevo_contenido: input.contenido,
          p_nuevo_estructurado: input.contenido_estructurado ?? null,
          p_nueva_source: input.source,
          p_nueva_confidence: input.confidence ?? 'confirmada_humana',
          p_nuevos_evidence: input.evidence_refs ?? null,
        } as never)
        if (error) throw error
        const row = data as unknown as { id: string; chain_id: string }
        return { id: row.id, chain_id: row.chain_id }
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')
        const { data, error } = await supabase
          .from('expediente_brief_entries' as never)
          .insert({
            expediente_id: input.expediente_id,
            seccion: input.seccion,
            tipo: input.tipo,
            contenido: input.contenido,
            contenido_estructurado: input.contenido_estructurado ?? null,
            source: input.source,
            confidence: input.confidence ?? 'confirmada_humana',
            evidence_refs: input.evidence_refs ?? [],
            created_by: user.id,
          } as never)
          .select('id, chain_id')
          .single()
        if (error) throw error
        return data as unknown as { id: string; chain_id: string }
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.expediente_id] })
    },
  })
}

/** Crea pregunta abierta nueva (origen = manual o ia_brief_gen tras generate). */
export function useCreateBriefPregunta() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    expediente_id: string
    pregunta: string
    origen: 'rulebook' | 'ia_brief_gen' | 'ia_input_libre' | 'manual'
    contexto?: Record<string, unknown>
    prioridad?: 'baja' | 'normal' | 'alta'
  }>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('expediente_brief_preguntas' as never).insert({
        expediente_id: input.expediente_id,
        pregunta: input.pregunta,
        origen: input.origen,
        contexto: input.contexto ?? {},
        prioridad: input.prioridad ?? 'normal',
        created_by: user?.id ?? null,
      } as never)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-preguntas', vars.expediente_id] })
    },
  })
}

/** Marca una pregunta como respondida o descartada. */
export function useAnswerPregunta() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    pregunta_id: string
    expediente_id: string
    estado: 'respondida' | 'descartada'
    respuesta_entry_id?: string | null
  }>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('expediente_brief_preguntas' as never)
        .update({
          estado: input.estado,
          respuesta_entry_id: input.respuesta_entry_id ?? null,
          answered_at: new Date().toISOString(),
          answered_by: user?.id ?? null,
        } as never)
        .eq('id', input.pregunta_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-preguntas', vars.expediente_id] })
    },
  })
}

/** Resuelve una contradicción aplicando una decisión. */
export function useResolverContradiccion() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    contradiccion_id: string
    expediente_id: string
    resolucion: 'a_vale' | 'b_vale' | 'ambas_validas' | 'reescribir' | 'ninguna'
    estado?: 'resuelta' | 'descartada'
  }>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('expediente_brief_contradicciones' as never)
        .update({
          estado: input.estado ?? 'resuelta',
          resolucion: input.resolucion,
          resuelta_at: new Date().toISOString(),
          resuelta_por: user?.id ?? null,
        } as never)
        .eq('id', input.contradiccion_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-contradicciones', vars.expediente_id] })
    },
  })
}

/** Crea contradicción manual (cuando la IA no la detectó pero el usuario sí). */
export function useCreateContradiccionManual() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    expediente_id: string
    entry_a_id: string
    entry_b_id?: string
    external_ref?: Record<string, unknown>
    descripcion: string
  }>({
    mutationFn: async (input) => {
      const { error } = await supabase.from('expediente_brief_contradicciones' as never).insert({
        expediente_id: input.expediente_id,
        entry_a_id: input.entry_a_id,
        entry_b_id: input.entry_b_id ?? null,
        external_ref: input.external_ref ?? null,
        descripcion: input.descripcion,
        detectada_por: 'humano',
      } as never)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-contradicciones', vars.expediente_id] })
    },
  })
}
