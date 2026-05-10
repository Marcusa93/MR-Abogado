import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database.types'

export type SaeCredential = Omit<Tables<'sae_credentials'>, 'encrypted_secret'>
export type SaeMovement = Tables<'sae_movements'>

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
      if (error) throw new Error(error.message)
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
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; log_id: string; nuevas?: number; message?: string }
    },
    onSuccess: (_data, { expedienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['sae-movements', expedienteId] })
      queryClient.invalidateQueries({ queryKey: ['expediente', expedienteId] })
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
      // Check data.error first — edge functions return error details in the body even on 4xx/5xx
      if (data?.error) throw new Error(data.error)
      if (error) throw new Error(error.message)
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
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      return data as SaeImportResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expedientes'] })
    },
  })
}
