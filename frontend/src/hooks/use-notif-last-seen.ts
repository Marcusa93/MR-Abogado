import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const KEY = ['notif-last-seen'] as const

/**
 * Devuelve el timestamp ISO de la última vez que el usuario abrió el feed
 * de notificaciones. Sirve para separar "Nuevas" vs "Anteriores".
 */
export function useNotifLastSeen() {
  return useQuery<string | null>({
    queryKey: KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('notifications_last_seen_at' as never)
        .eq('id', user.id)
        .single()
      if (error) return null
      return (data as unknown as { notifications_last_seen_at: string | null })
        ?.notifications_last_seen_at ?? null
    },
  })
}

/**
 * Marca el feed como visto: actualiza profiles.notifications_last_seen_at = now().
 * Llamar al abrir el dropdown o entrar a /notificaciones, /alertas, /notificaciones-sae.
 */
export function useMarkNotifsAsSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase
        .from('profiles')
        .update({ notifications_last_seen_at: new Date().toISOString() } as never)
        .eq('id', user.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}
