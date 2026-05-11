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
