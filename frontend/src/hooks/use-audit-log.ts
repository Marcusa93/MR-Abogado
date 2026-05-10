import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface AuditEntry {
  id: number
  tabla: string
  registro_id: string
  accion: string
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  user_id: string
  ip_address: string | null
  created_at: string
  profiles: { nombre: string; apellido: string } | null
}

export interface AuditFilters {
  userId?: string
  accion?: string
  dateFrom?: string
  dateTo?: string
  tablas?: string[]
  limit?: number
  offset?: number
}

export function useAuditLog(filters: AuditFilters = {}) {
  const supabase = createClient()
  const { userId, accion, dateFrom, dateTo, tablas, limit = 50, offset = 0 } = filters

  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*, profiles!user_id(nombre, apellido)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (userId) query = query.eq('user_id', userId)
      if (accion) query = query.eq('accion', accion as any)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
      if (tablas && tablas.length > 0) query = query.in('tabla', tablas as any)

      const { data, error, count } = await query
      if (error) throw error
      return { entries: (data ?? []) as unknown as AuditEntry[], total: count ?? 0 }
    },
    staleTime: 30_000,
  })
}

export function useAuditStats(dateFrom?: string) {
  const supabase = createClient()
  const from = dateFrom ?? new Date().toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['audit-stats', from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('accion, user_id, profiles!user_id(nombre, apellido)')
        .gte('created_at', from)
        .order('created_at', { ascending: false })

      if (error) throw error

      const entries = (data ?? []) as unknown as { accion: string; user_id: string; profiles: { nombre: string; apellido: string } | null }[]

      // Count by action
      const byAction: Record<string, number> = {}
      entries.forEach((e) => {
        byAction[e.accion] = (byAction[e.accion] ?? 0) + 1
      })

      // Count by user
      const byUser: Record<string, { nombre: string; count: number }> = {}
      entries.forEach((e) => {
        if (!byUser[e.user_id]) {
          const name = e.profiles ? `${e.profiles.nombre} ${e.profiles.apellido}` : 'Desconocido'
          byUser[e.user_id] = { nombre: name, count: 0 }
        }
        byUser[e.user_id].count++
      })

      const topUsers = Object.entries(byUser)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([id, info]) => ({ id, ...info }))

      return {
        total: entries.length,
        byAction,
        topUsers,
      }
    },
    staleTime: 60_000,
  })
}
