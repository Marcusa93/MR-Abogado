import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

export interface SidebarBadges {
  tareasVencidas: number
  alertasPendientes: number
  turnosHoy: number
  saeNotifUnread: number
}

export function useSidebarBadges(): SidebarBadges {
  const supabase = createClient()
  const userId = useAuthStore((s) => s.user?.id)

  const { data: tareasVencidas = 0 } = useQuery({
    queryKey: ['sidebar-badges', 'tareas-vencidas', userId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { count, error } = await supabase
        .from('tareas')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['PENDIENTE', 'pendiente'])
        .lt('fecha_vencimiento', today)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const { data: alertasPendientes = 0 } = useQuery({
    queryKey: ['sidebar-badges', 'alertas', userId],
    queryFn: async () => {
      if (!userId) return 0
      const { count, error } = await supabase
        .from('alertas')
        .select('*', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .is('resuelta_at', null)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Audiencias confirmadas/pendientes de hoy
  const { data: turnosHoy = 0 } = useQuery({
    queryKey: ['sidebar-badges', 'audiencias-hoy'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { count, error } = await supabase
        .from('audiencias')
        .select('*', { count: 'exact', head: true })
        .eq('fecha', today)
        .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      if (error) throw error
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  const { data: saeNotifUnread = 0 } = useQuery({
    queryKey: ['sidebar-badges', 'sae-notif-unread', userId],
    queryFn: async () => {
      if (!userId) return 0
      const { count, error } = await supabase
        .from('sae_notificaciones' as never)
        .select('id', { count: 'exact', head: true })
        .eq('leida', false)
      if (error) return 0
      return count ?? 0
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return { tareasVencidas, alertasPendientes, turnosHoy, saeNotifUnread }
}
