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
