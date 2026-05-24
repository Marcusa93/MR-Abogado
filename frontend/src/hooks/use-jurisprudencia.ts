import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface JurisprudenciaDocumento {
  id: string
  user_id: string
  caratula: string
  tribunal: string | null
  jurisdiccion: string | null
  fecha: string | null
  tipo: 'sentencia' | 'auto' | 'fallo_plenario' | 'sumario' | 'dictamen' | 'otro'
  numero: string | null
  sumario: string | null
  source: 'manual_upload' | 'manual_paste' | 'infoleg' | 'saij' | 'csjn' | 'otro'
  source_doc_id: string | null
  source_url: string | null
  source_file_path: string | null
  source_file_name: string | null
  source_mime_type: string | null
  estado: 'pendiente' | 'procesando' | 'indexado' | 'error'
  error_message: string | null
  chunk_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface JurisprudenciaChunk {
  id: number
  documento_id: string
  chunk_uid: string
  orden: number
  contenido: string
  metadata: { seccion?: string; caratula?: string; tribunal?: string; fecha?: string } & Record<string, unknown>
}

// ── Lista ───────────────────────────────────────────────────────
export function useJurisprudenciaList() {
  return useQuery<JurisprudenciaDocumento[]>({
    queryKey: ['jurisprudencia-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jurisprudencia_documentos' as never)
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as JurisprudenciaDocumento[]
    },
    refetchInterval: (query) => {
      const docs = query.state.data ?? []
      return docs.some(d => d.estado === 'pendiente' || d.estado === 'procesando') ? 3000 : false
    },
  })
}

// ── Detalle + chunks ────────────────────────────────────────────
export function useJurisprudenciaDocumento(documentoId: string | undefined) {
  return useQuery<JurisprudenciaDocumento | null>({
    queryKey: ['jurisprudencia-documento', documentoId],
    queryFn: async () => {
      if (!documentoId) return null
      const { data, error } = await supabase
        .from('jurisprudencia_documentos' as never)
        .select('*')
        .eq('id', documentoId)
        .single()
      if (error) throw error
      return data as unknown as JurisprudenciaDocumento
    },
    enabled: !!documentoId,
    refetchInterval: (query) => {
      const doc = query.state.data
      return doc && (doc.estado === 'pendiente' || doc.estado === 'procesando') ? 3000 : false
    },
  })
}

export function useJurisprudenciaChunks(documentoId: string | undefined) {
  return useQuery<JurisprudenciaChunk[]>({
    queryKey: ['jurisprudencia-chunks', documentoId],
    queryFn: async () => {
      if (!documentoId) return []
      const { data, error } = await supabase
        .from('jurisprudencia_chunks' as never)
        .select('id, documento_id, chunk_uid, orden, contenido, metadata')
        .eq('documento_id', documentoId)
        .order('orden', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as JurisprudenciaChunk[]
    },
    enabled: !!documentoId,
  })
}

// ── Ingesta (3 modos) ───────────────────────────────────────────
export type IngestaInput =
  | { mode: 'url'; url: string; caratula?: string; tribunal?: string; fecha?: string; jurisdiccion?: string; tipo?: string; sumario?: string }
  | { mode: 'paste'; texto: string; caratula: string; tribunal?: string; fecha?: string; jurisdiccion?: string; tipo?: string; sumario?: string }
  | { mode: 'upload'; file: File; caratula: string; tribunal?: string; fecha?: string; jurisdiccion?: string; tipo?: string; sumario?: string }

export interface IngestaResult {
  documento_id: string
  caratula: string
  chunk_count: number
  source: string
  already_exists?: boolean
}

export function useIngestaJurisprudencia() {
  const qc = useQueryClient()
  return useMutation<IngestaResult, Error, IngestaInput>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const body: Record<string, unknown> = { mode: input.mode }
      // Metadata común
      if ('caratula' in input && input.caratula) body.caratula = input.caratula
      if (input.tribunal) body.tribunal = input.tribunal
      if (input.fecha) body.fecha = input.fecha
      if (input.jurisdiccion) body.jurisdiccion = input.jurisdiccion
      if (input.tipo) body.tipo = input.tipo
      if (input.sumario) body.sumario = input.sumario

      if (input.mode === 'url') {
        body.url = input.url.trim()
      } else if (input.mode === 'paste') {
        body.texto = input.texto.trim()
      } else if (input.mode === 'upload') {
        const ext = input.file.name.split('.').pop()?.toLowerCase() || 'bin'
        const inferredType =
          input.file.type
          || (ext === 'txt' ? 'text/plain'
            : ext === 'pdf' ? 'application/pdf'
            : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/octet-stream')
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase
          .storage.from('jurisprudencia-originales')
          .upload(path, input.file, { contentType: inferredType, upsert: false })
        if (upErr) throw upErr
        body.file_path = path
        body.file_name = input.file.name
        body.mime_type = inferredType
      }

      const { data, error } = await supabase.functions.invoke<IngestaResult & { ok: boolean; error?: string }>(
        'jurisprudencia-ingest', { body }
      )
      if (error) throw error
      if (!data || (data as { ok?: boolean }).ok === false) {
        throw new Error((data as { error?: string })?.error ?? 'ingesta falló')
      }
      return data as IngestaResult
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jurisprudencia-list'] }),
  })
}

export function useDeleteJurisprudencia() {
  const qc = useQueryClient()
  return useMutation<void, Error, JurisprudenciaDocumento>({
    mutationFn: async (doc) => {
      if (doc.source_file_path) {
        await supabase.storage.from('jurisprudencia-originales').remove([doc.source_file_path]).catch(() => {})
      }
      const { error } = await supabase.from('jurisprudencia_documentos' as never).delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jurisprudencia-list'] }),
  })
}

// ── Fijación a expediente ───────────────────────────────────────
export interface ExpedienteJurisprudenciaRow {
  expediente_id: string
  documento_id: string
  fijado_por: string
  nota: string | null
  created_at: string
  documento: JurisprudenciaDocumento
}

export function useExpedienteJurisprudencia(expedienteId: string | undefined) {
  return useQuery<ExpedienteJurisprudenciaRow[]>({
    queryKey: ['expediente-jurisprudencia', expedienteId],
    queryFn: async () => {
      if (!expedienteId) return []
      const { data, error } = await supabase
        .from('expediente_jurisprudencia' as never)
        .select(`
          expediente_id, documento_id, fijado_por, nota, created_at,
          documento:jurisprudencia_documentos(*)
        `)
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => {
        const row = r as { expediente_id: string; documento_id: string; fijado_por: string; nota: string | null; created_at: string; documento: JurisprudenciaDocumento | JurisprudenciaDocumento[] }
        return {
          ...row,
          documento: Array.isArray(row.documento) ? row.documento[0] : row.documento,
        }
      }) as ExpedienteJurisprudenciaRow[]
    },
    enabled: !!expedienteId,
  })
}

export function useFijarJurisprudencia() {
  const qc = useQueryClient()
  return useMutation<void, Error, { expedienteId: string; documentoId: string; nota?: string }>({
    mutationFn: async ({ expedienteId, documentoId, nota }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('expediente_jurisprudencia' as never).insert({
        expediente_id: expedienteId,
        documento_id: documentoId,
        fijado_por: user.id,
        nota: nota?.trim() || null,
      } as never)
      if (error) {
        if (error.code === '23505') throw new Error('Este fallo ya está fijado a este expediente')
        throw error
      }
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['expediente-jurisprudencia', vars.expedienteId] }),
  })
}

// ── Búsqueda RAG (jurisprudencia afín) ──────────────────────────
export interface MatchJurisprudenciaResult {
  chunk_id: number
  documento_id: string
  caratula: string | null
  tribunal: string | null
  fecha: string | null
  seccion: string
  score: number
  fragmento: string
}

export function useBuscarJurisprudenciaAfin() {
  return useMutation<MatchJurisprudenciaResult[], Error, { query: string; limit?: number; seccion?: string }>({
    mutationFn: async ({ query, limit, seccion }) => {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean; results?: MatchJurisprudenciaResult[]; error?: string
      }>('match-jurisprudencia', {
        body: { query, limit: limit ?? 5, seccion: seccion ?? 'cualquiera' },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error ?? 'búsqueda falló')
      return data.results ?? []
    },
  })
}

export function useDesfijarJurisprudencia() {
  const qc = useQueryClient()
  return useMutation<void, Error, { expedienteId: string; documentoId: string }>({
    mutationFn: async ({ expedienteId, documentoId }) => {
      const { error } = await supabase
        .from('expediente_jurisprudencia' as never)
        .delete()
        .eq('expediente_id', expedienteId)
        .eq('documento_id', documentoId)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['expediente-jurisprudencia', vars.expedienteId] }),
  })
}
