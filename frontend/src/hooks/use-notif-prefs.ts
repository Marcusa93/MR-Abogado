import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { NotifPrefs } from '@/lib/notif-events'

const supabase = createClient()

export function useNotifPrefs() {
  return useQuery<NotifPrefs>({
    queryKey: ['notif-prefs'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data, error } = await supabase
        .from('profiles')
        .select('notif_prefs' as never)
        .eq('id', user.id)
        .single()
      if (error) throw error
      return ((data as unknown as { notif_prefs: NotifPrefs | null })?.notif_prefs ?? {}) as NotifPrefs
    },
  })
}

export function useUpdateNotifPrefs() {
  const qc = useQueryClient()
  return useMutation<void, Error, NotifPrefs>({
    mutationFn: async (prefs) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase
        .from('profiles')
        .update({ notif_prefs: prefs } as never)
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-prefs'] }),
  })
}

/**
 * @deprecated Desde la migración 00045 el dispatch ocurre automáticamente vía
 * trigger AFTER INSERT en `alertas`. Esta función queda solo para casos
 * ad-hoc (ej. dispatch directo sin pasar por la tabla alertas).
 */
export async function dispatchAlertNotification(input: {
  alerta_id?: string
  tipo?: string
  usuario_id?: string
  titulo?: string
  mensaje?: string
  url?: string
}): Promise<void> {
  try {
    await supabase.functions.invoke('dispatch-alert-notification', { body: input })
  } catch (e) {
    // No queremos romper el flujo si esto falla — log y seguir.
    console.warn('dispatchAlertNotification failed', e)
  }
}
