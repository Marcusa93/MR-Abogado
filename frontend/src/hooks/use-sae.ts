import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database.types'

export type SaeCredential = Omit<Tables<'sae_credentials'>, 'encrypted_secret'>

// Extends the generated row with the AI columns added in migration 00028.
// Once database.types.ts is regenerated this can revert to a plain alias.
export type SaeMovement = Tables<'sae_movements'> & {
  ai_summary?: string | null
  ai_extracted?: {
    partes?: string[]
    fechas?: { tipo: string; fecha_iso: string; descripcion: string }[]
    plazos?: { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }[]
  } | null
  ai_suggested_action?: {
    tipo: 'tarea' | 'turno'
    titulo: string
    fecha: string | null
    prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
    descripcion: string
  } | null
  ai_analyzed_at?: string | null
  ai_model?: string | null
  ai_error?: string | null
  is_key?: boolean | null
  is_audiencia?: boolean | null
}

// When an edge function returns non-2xx, supabase-js sets data=null and puts the
// Response in error.context. We must read it to get the specific error message.
async function extractFnError(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json()
        if (body?.error) return new Error(body.error)
      } catch { /* body is not JSON, fall through */ }
    }
  }
  return error instanceof Error ? error : new Error('Error desconocido')
}

// ─── Credential hooks ────────────────────────────────────────────────────────

export function useSaeCredential() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sae-credential'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sae_credentials')
        .select('id, profile_id, username, provider, status, last_login_at, last_sync_at, last_error, config, created_at, updated_at')
        .eq('provider', 'justucuman')
        .maybeSingle()
      if (error) throw error
      return data as SaeCredential | null
    },
  })
}

export function useSaveSaeCredential() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const { data, error } = await supabase.rpc('store_sae_credential' as any, {
        p_username: username,
        p_password: password,
      })
      if (error) throw error
      return data as SaeCredential
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sae-credential'] })
    },
  })
}

export function useSaeVerify() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sae-verify', { body: {} })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sae-credential'] })
    },
  })
}

export function useDeleteSaeCredential() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_sae_credential' as any)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sae-credential'] })
    },
  })
}

// ─── Movements hooks ─────────────────────────────────────────────────────────

export function useSaeMovements(expedienteId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sae-movements', expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sae_movements')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []) as SaeMovement[]
    },
    enabled: !!expedienteId,
  })
}

// ─── Sync hook ───────────────────────────────────────────────────────────────

export function useTriggerSaeSync() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ expedienteId }: { expedienteId: string }) => {
      const { data, error } = await supabase.functions.invoke('sae-sync', {
        body: { expediente_id: expedienteId },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; log_id: string; nuevas?: number; message?: string }
    },
    onSuccess: (_data, { expedienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['sae-movements', expedienteId] })
      queryClient.invalidateQueries({ queryKey: ['expediente', expedienteId] })
    },
  })
}

// ─── Analyze movement hook (on-demand AI) ────────────────────────────────────

export interface SaeAnalyzeResult {
  results: { id: string; success: boolean; summary?: string; error?: string; skipped?: boolean }[]
  analyzed: number
  failed: number
  skipped: number
}

export function useAnalyzeMovements() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      movement_ids: string[]
      expediente_id?: string
      document_text?: string
      document_file_names?: string[]
    }) => {
      const payload: Record<string, unknown> = { movement_ids: input.movement_ids }
      if (input.document_text) payload.document_text = input.document_text
      if (input.document_file_names) payload.document_file_names = input.document_file_names
      const { data, error } = await supabase.functions.invoke('sae-analyze-movement', {
        body: payload,
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as SaeAnalyzeResult
    },
    onSuccess: (_data, vars) => {
      if (vars.expediente_id) {
        queryClient.invalidateQueries({ queryKey: ['sae-movements', vars.expediente_id] })
      }
    },
  })
}

// ─── Marcado manual de actuación clave ──────────────────────────────────────

export function useSetMovementKey() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { movementId: string; isKey: boolean | null; expedienteId: string }) => {
      const { error } = await supabase.rpc('set_sae_movement_key' as any, {
        p_movement_id: input.movementId,
        p_is_key: input.isKey,
      })
      if (error) throw error
    },
    onMutate: async ({ movementId, isKey, expedienteId }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['sae-movements', expedienteId] })
      const prev = queryClient.getQueryData<SaeMovement[]>(['sae-movements', expedienteId])
      if (prev) {
        queryClient.setQueryData<SaeMovement[]>(['sae-movements', expedienteId],
          prev.map(m => m.id === movementId ? { ...m, is_key: isKey } : m))
      }
      return { prev }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['sae-movements', vars.expedienteId], ctx.prev)
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sae-movements', vars.expedienteId] })
    },
  })
}

// ─── Marcado manual de actuación como audiencia ─────────────────────────────

export function useSetMovementAudiencia() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { movementId: string; isAudiencia: boolean | null; expedienteId: string }) => {
      const { error } = await supabase.rpc('set_sae_movement_audiencia' as any, {
        p_movement_id: input.movementId,
        p_is_audiencia: input.isAudiencia,
      })
      if (error) throw error
    },
    onMutate: async ({ movementId, isAudiencia, expedienteId }) => {
      await queryClient.cancelQueries({ queryKey: ['sae-movements', expedienteId] })
      const prev = queryClient.getQueryData<SaeMovement[]>(['sae-movements', expedienteId])
      if (prev) {
        queryClient.setQueryData<SaeMovement[]>(['sae-movements', expedienteId],
          prev.map(m => m.id === movementId ? { ...m, is_audiencia: isAudiencia } : m))
      }
      return { prev }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['sae-movements', vars.expedienteId], ctx.prev)
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sae-movements', vars.expedienteId] })
    },
  })
}

// ─── Helpers de detección de adjuntos de audio/video ────────────────────────
// Whisper acepta tanto audio como video (extrae el audio del contenedor).
// Formatos soportados oficialmente: mp3, mp4, mpeg, mpga, m4a, wav, webm.
// Aceptamos también extensiones comunes que el browser puede enviar al server.

const TRANSCRIBABLE_EXTENSIONS = [
  // audio
  '.mp3', '.m4a', '.wav', '.ogg', '.opus', '.flac', '.aac', '.wma',
  // video / contenedores con audio (Whisper soporta)
  '.mp4', '.mpeg', '.mpga', '.webm', '.mov', '.avi', '.mkv', '.flv', '.3gp',
]

export function hasAudioAttachment(movement: SaeMovement): boolean {
  const rp = movement.raw_payload as { archivos?: Array<Record<string, unknown>>; vinculos?: Array<Record<string, unknown>> } | null
  if (!rp) return false
  const items = [...(Array.isArray(rp.archivos) ? rp.archivos : []), ...(Array.isArray(rp.vinculos) ? rp.vinculos : [])]
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const candidates = [item.nombre, item.name, item.filename, item.fileName, item.label]
    for (const c of candidates) {
      if (typeof c !== 'string') continue
      const lower = c.toLowerCase()
      if (TRANSCRIBABLE_EXTENSIONS.some(ext => lower.endsWith(ext))) return true
    }
  }
  return false
}

/**
 * Devuelve true si la actuación debe verse como audiencia:
 *   - is_audiencia === true (manual), o
 *   - is_audiencia IS NULL Y (tipo_movimiento es 'audiencia' o tiene adjunto de audio)
 */
export function passesAudienciaFilter(m: SaeMovement): boolean {
  if (m.is_audiencia === true) return true
  if (m.is_audiencia === false) return false
  return m.tipo_movimiento === 'audiencia' || hasAudioAttachment(m)
}

// ─── Transcripción de audiencias ─────────────────────────────────────────────

export interface AiTranscriptAnalysis {
  resumen: string
  partes_presentes: string[]
  decisiones: string[]
  proximos_pasos: string[]
  puntos_clave: string[]
}

export interface AudienciaTranscript {
  id: string
  movement_id: string | null
  audiencia_id: string | null
  expediente_id: string
  status: 'pending' | 'transcribing' | 'completed' | 'error'
  audio_source: 'sae_attachment' | 'upload'
  audio_filename: string | null
  audio_duration_seconds: number | null
  transcript: string | null
  transcript_model: string | null
  transcript_at: string | null
  ai_analysis: AiTranscriptAnalysis | null
  ai_analyzed_at: string | null
  error_message: string | null
  created_at: string
}

export function useAudienciaTranscripts(input: { movement_id?: string; audiencia_id?: string }) {
  const supabase = createClient()
  const enabled = !!(input.movement_id || input.audiencia_id)
  return useQuery({
    queryKey: ['audiencia-transcripts', input.movement_id ?? input.audiencia_id],
    queryFn: async () => {
      let q = (supabase.from as any)('audiencia_transcripts')
        .select('*')
        .order('created_at', { ascending: false })
      if (input.movement_id) q = q.eq('movement_id', input.movement_id)
      else if (input.audiencia_id) q = q.eq('audiencia_id', input.audiencia_id)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as AudienciaTranscript[]
    },
    enabled,
    // Polling automático cuando hay transcripciones en proceso
    refetchInterval: (query) => {
      const data = query.state.data as AudienciaTranscript[] | undefined
      return data?.some(t => t.status === 'transcribing' || t.status === 'pending') ? 4000 : false
    },
  })
}

export function useTranscribeSaeAttachment() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { movement_id: string; file_name: string }) => {
      const { data, error } = await supabase.functions.invoke('sae-transcribe-audio', {
        body: { source: 'sae_attachment', movement_id: input.movement_id, file_name: input.file_name },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { transcript_id: string; transcript: string; duration_seconds: number | null }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['audiencia-transcripts', vars.movement_id] })
    },
  })
}

export function useTranscribeUpload() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { audiencia_id?: string; movement_id?: string; storage_path: string; file_name: string }) => {
      const { data, error } = await supabase.functions.invoke('sae-transcribe-audio', {
        body: { source: 'upload', ...input },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { transcript_id: string; transcript: string; duration_seconds: number | null }
    },
    onSuccess: (_data, vars) => {
      const key = vars.movement_id ?? vars.audiencia_id
      if (key) queryClient.invalidateQueries({ queryKey: ['audiencia-transcripts', key] })
    },
  })
}

export function useAnalyzeTranscript() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { transcript_id: string; movement_id?: string; audiencia_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('sae-analyze-transcript', {
        body: { transcript_id: input.transcript_id },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { analysis: AiTranscriptAnalysis }
    },
    onSuccess: (_data, vars) => {
      const key = vars.movement_id ?? vars.audiencia_id
      if (key) queryClient.invalidateQueries({ queryKey: ['audiencia-transcripts', key] })
    },
  })
}

export function useUploadAudienciaAudio() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: { file: File; targetId: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autorizado')
      const safeName = input.file.name.replace(/[^a-z0-9._-]/gi, '_')
      const path = `${user.id}/${input.targetId}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('audiencias-audio')
        .upload(path, input.file, { contentType: input.file.type, upsert: false })
      if (error) throw error
      return { storage_path: path, file_name: input.file.name }
    },
  })
}

// ─── Brief del expediente ────────────────────────────────────────────────────

export interface ExpedienteBrief {
  brief: string
  model: string
  generated_at: string
}

export function useExpedienteBrief(expedienteId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['expediente-brief', expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedientes')
        .select('ai_brief, ai_brief_generated_at, ai_brief_model')
        .eq('id', expedienteId)
        .single()
      if (error) throw error
      const row = data as unknown as { ai_brief: string | null; ai_brief_generated_at: string | null; ai_brief_model: string | null }
      if (!row.ai_brief) return null
      return {
        brief: row.ai_brief,
        model: row.ai_brief_model ?? '',
        generated_at: row.ai_brief_generated_at ?? '',
      } as ExpedienteBrief
    },
    enabled: !!expedienteId,
  })
}

export function useGenerateBrief() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (expedienteId: string) => {
      const { data, error } = await supabase.functions.invoke('sae-generate-brief', {
        body: { expediente_id: expedienteId },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as ExpedienteBrief
    },
    onSuccess: (_data, expedienteId) => {
      queryClient.invalidateQueries({ queryKey: ['expediente-brief', expedienteId] })
    },
  })
}

// ─── Document download hook ──────────────────────────────────────────────────

export interface SaeDocumentRequest {
  procid: string
  jurisdictionId: number
  histid: string
  fileName: string
}

export function useSaeDocument() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: SaeDocumentRequest) => {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('No autorizado')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sae-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(input),
        },
      )
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `Error ${res.status}` }))
        throw new Error(errBody.error ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      return { objectUrl, mimeType: blob.type, fileName: input.fileName }
    },
  })
}

// ─── SAE List hook ────────────────────────────────────────────────────────────

export interface SaeCaseItem {
  procid: string
  jurisdictionId: number
  numero_sae: string
  caratula: string
  ya_importado: boolean
  expediente_id?: string
}

export function useSaeListProceedings() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sae-list', { body: {} })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as { cases: SaeCaseItem[] }
    },
  })
}

// ─── SAE Import hook ──────────────────────────────────────────────────────────

export interface SaeImportCase {
  procid: string
  jurisdictionId: number
  numero_sae: string
  caratula: string
  cliente_id?: string
}

export interface SaeImportResult {
  results: Array<{ numero_sae: string; expediente_id?: string; success: boolean; error?: string }>
  total: number
  exitosos: number
  errores: number
}

export function useSaeImport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cases: SaeImportCase[]) => {
      const { data, error } = await supabase.functions.invoke('sae-import', {
        body: { cases },
      })
      if (error) throw await extractFnError(error)
      if (data?.error) throw new Error(data.error)
      return data as SaeImportResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expedientes'] })
    },
  })
}
