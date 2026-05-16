import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface NormativaDocumento {
  id: string
  user_id: string
  titulo: string
  tipo: string
  numero: string | null
  fecha: string | null
  jurisdiccion: string | null
  fuente: string | null
  source_file_path: string
  source_file_name: string
  source_mime_type: string
  estado: 'pendiente' | 'procesando' | 'indexado' | 'error'
  error_message: string | null
  chunk_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface NormativaChunk {
  id: number
  documento_id: string
  chunk_uid: string
  orden: number
  contenido: string
  metadata: Record<string, unknown>
}

// ── Lista de documentos del usuario ─────────────────────────────

export function useNormativaList() {
  return useQuery<NormativaDocumento[]>({
    queryKey: ['normativa-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('normativa_documentos' as never)
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as NormativaDocumento[]
    },
    refetchInterval: (query) => {
      // Refresca cada 3s si hay algún doc en procesamiento
      const docs = query.state.data ?? []
      return docs.some(d => d.estado === 'pendiente' || d.estado === 'procesando') ? 3000 : false
    },
  })
}

// ── Detalle + chunks ────────────────────────────────────────────

export function useNormativaDocumento(documentoId: string | undefined) {
  return useQuery<NormativaDocumento | null>({
    queryKey: ['normativa-documento', documentoId],
    queryFn: async () => {
      if (!documentoId) return null
      const { data, error } = await supabase
        .from('normativa_documentos' as never)
        .select('*')
        .eq('id', documentoId)
        .single()
      if (error) throw error
      return data as unknown as NormativaDocumento
    },
    enabled: !!documentoId,
    refetchInterval: (query) => {
      const doc = query.state.data
      return doc && (doc.estado === 'pendiente' || doc.estado === 'procesando') ? 3000 : false
    },
  })
}

export function useNormativaChunks(documentoId: string | undefined) {
  return useQuery<NormativaChunk[]>({
    queryKey: ['normativa-chunks', documentoId],
    queryFn: async () => {
      if (!documentoId) return []
      const { data, error } = await supabase
        .from('normativa_chunks' as never)
        .select('id, documento_id, chunk_uid, orden, contenido, metadata')
        .eq('documento_id', documentoId)
        .order('orden', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as NormativaChunk[]
    },
    enabled: !!documentoId,
  })
}

// ── Upload + ingesta ────────────────────────────────────────────

export interface UploadInput {
  file: File
  titulo: string
  tipo: string
  numero?: string
  jurisdiccion?: string
  fuente?: string
  fecha?: string // YYYY-MM-DD
}

async function fileSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useUploadNormativa() {
  const qc = useQueryClient()
  return useMutation<{ documento_id: string }, Error, UploadInput>({
    mutationFn: async (input) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const checksum = await fileSha256(input.file)

      // Path: <user_id>/<random>.<ext>
      const ext = input.file.name.split('.').pop()?.toLowerCase() || 'bin'
      const docId = crypto.randomUUID()
      const path = `${user.id}/${docId}.${ext}`

      // 1) Subir el archivo
      const { error: upErr } = await supabase
        .storage.from('normativa-originales')
        .upload(path, input.file, { contentType: input.file.type, upsert: false })
      if (upErr) throw upErr

      // 2) Crear el documento con estado pendiente
      const { data: doc, error: docErr } = await supabase
        .from('normativa_documentos' as never)
        .insert({
          id: docId,
          user_id: user.id,
          titulo: input.titulo.trim(),
          tipo: input.tipo.trim(),
          numero: input.numero?.trim() || null,
          jurisdiccion: input.jurisdiccion?.trim() || null,
          fuente: input.fuente?.trim() || null,
          fecha: input.fecha || null,
          source_file_path: path,
          source_file_name: input.file.name,
          source_mime_type: input.file.type,
          checksum,
          estado: 'pendiente',
        } as never)
        .select()
        .single()

      if (docErr) {
        // Limpiar archivo huérfano
        await supabase.storage.from('normativa-originales').remove([path]).catch(() => {})
        if (docErr.code === '23505') throw new Error('Ya tenés un documento con el mismo contenido')
        throw docErr
      }

      // 3) Disparar la edge function (async: la fn responde 202 y procesa en background)
      const { error: fnErr } = await supabase.functions.invoke('normativa-ingest', {
        body: { documento_id: docId },
      })
      if (fnErr) {
        // El documento queda en pendiente — desde la UI se puede reintentar
        console.error('normativa-ingest invoke error', fnErr)
      }

      return { documento_id: (doc as { id: string }).id }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['normativa-list'] }),
  })
}

export function useReindexNormativa() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (documentoId) => {
      await supabase.from('normativa_documentos' as never).update({
        estado: 'pendiente', error_message: null,
      } as never).eq('id', documentoId)
      const { error } = await supabase.functions.invoke('normativa-ingest', {
        body: { documento_id: documentoId },
      })
      if (error) throw error
    },
    onSuccess: (_, documentoId) => {
      qc.invalidateQueries({ queryKey: ['normativa-list'] })
      qc.invalidateQueries({ queryKey: ['normativa-documento', documentoId] })
    },
  })
}

export function useDeleteNormativa() {
  const qc = useQueryClient()
  return useMutation<void, Error, NormativaDocumento>({
    mutationFn: async (doc) => {
      // Storage cleanup primero (no se cascadea desde el row)
      await supabase.storage.from('normativa-originales').remove([doc.source_file_path]).catch(() => {})
      const { error } = await supabase.from('normativa_documentos' as never).delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['normativa-list'] }),
  })
}

// ── Fijación a expediente ───────────────────────────────────────

export interface ExpedienteNormativaRow {
  expediente_id: string
  documento_id: string
  fijado_por: string
  nota: string | null
  created_at: string
  documento: NormativaDocumento
}

export function useExpedienteNormativa(expedienteId: string | undefined) {
  return useQuery<ExpedienteNormativaRow[]>({
    queryKey: ['expediente-normativa', expedienteId],
    queryFn: async () => {
      if (!expedienteId) return []
      const { data, error } = await supabase
        .from('expediente_normativa' as never)
        .select(`
          expediente_id, documento_id, fijado_por, nota, created_at,
          documento:normativa_documentos(*)
        `)
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => {
        const row = r as { expediente_id: string; documento_id: string; fijado_por: string; nota: string | null; created_at: string; documento: NormativaDocumento | NormativaDocumento[] }
        return {
          ...row,
          documento: Array.isArray(row.documento) ? row.documento[0] : row.documento,
        }
      }) as ExpedienteNormativaRow[]
    },
    enabled: !!expedienteId,
  })
}

export function useFijarNormativa() {
  const qc = useQueryClient()
  return useMutation<void, Error, { expedienteId: string; documentoId: string; nota?: string }>({
    mutationFn: async ({ expedienteId, documentoId, nota }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('expediente_normativa' as never).insert({
        expediente_id: expedienteId,
        documento_id: documentoId,
        fijado_por: user.id,
        nota: nota?.trim() || null,
      } as never)
      if (error) {
        if (error.code === '23505') throw new Error('Esta norma ya está fijada a este expediente')
        throw error
      }
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['expediente-normativa', vars.expedienteId] }),
  })
}

export function useDesfijarNormativa() {
  const qc = useQueryClient()
  return useMutation<void, Error, { expedienteId: string; documentoId: string }>({
    mutationFn: async ({ expedienteId, documentoId }) => {
      const { error } = await supabase
        .from('expediente_normativa' as never)
        .delete()
        .eq('expediente_id', expedienteId)
        .eq('documento_id', documentoId)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['expediente-normativa', vars.expedienteId] }),
  })
}

// ── Citas de un escrito (trazabilidad) ──────────────────────────

export interface EscritoCita {
  id: number
  escrito_id: string
  chunk_id: number | null
  documento_id: string | null
  cita_texto: string | null
  score: number | null
  was_pinned: boolean
  orden: number
  documento?: { titulo: string; tipo: string; numero: string | null } | null
}

export function useEscritoCitas(escritoId: string | undefined) {
  return useQuery<EscritoCita[]>({
    queryKey: ['escrito-citas', escritoId],
    queryFn: async () => {
      if (!escritoId) return []
      const { data, error } = await supabase
        .from('escrito_citas' as never)
        .select(`
          id, escrito_id, chunk_id, documento_id, cita_texto, score, was_pinned, orden,
          documento:normativa_documentos(titulo, tipo, numero)
        `)
        .eq('escrito_id', escritoId)
        .order('orden')
      if (error) throw error
      return (data ?? []).map(r => {
        const row = r as Omit<EscritoCita, 'documento'> & { documento: EscritoCita['documento'] | EscritoCita['documento'][] }
        return { ...row, documento: Array.isArray(row.documento) ? row.documento[0] : row.documento }
      }) as EscritoCita[]
    },
    enabled: !!escritoId,
  })
}
