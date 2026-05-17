import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface DispatchSnapshot {
  status: 'success' | 'failed' | 'skipped'
  reason: string | null
  attempted_at: string
}

/**
 * Último intento de dispatch para un canal dado (push|email).
 * Útil para mostrar en /configuracion → "Último push: OK hace 2h".
 */
export function useLastDispatch(channel: 'push' | 'email') {
  return useQuery<DispatchSnapshot | null>({
    queryKey: ['notif-dispatch-last', channel],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('last_notif_dispatch', {
        p_channel: channel,
      })
      if (error) return null
      const row = Array.isArray(data) ? data[0] : data
      return row ?? null
    },
  })
}

/**
 * Historial reciente de dispatches del usuario (todos los canales).
 * Limitado a los últimos 20 para no inflar.
 */
export function useRecentDispatches() {
  return useQuery({
    queryKey: ['notif-dispatches-recent'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data, error } = await supabase
        .from('notif_dispatches' as never)
        .select('id, alerta_id, channel, status, reason, attempted_at, metadata')
        .eq('usuario_id', user.id)
        .order('attempted_at', { ascending: false })
        .limit(20)
      if (error) return []
      return (data ?? []) as Array<{
        id: string
        alerta_id: string | null
        channel: 'push' | 'email'
        status: 'success' | 'failed' | 'skipped'
        reason: string | null
        attempted_at: string
        metadata: Record<string, unknown>
      }>
    },
  })
}
