import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface SaeNotificacion {
  id: string
  profile_id: string
  sae_notif_id: string
  expediente_id: string | null
  numero_expediente: string | null
  caratula: string | null
  oficina: string | null
  tipo: string | null
  titulo: string | null
  fecha_emision: string | null
  fecha_captura: string
  leida: boolean
  leida_at: string | null
  notified_push_at: string | null
  notified_email_at: string | null
  created_at: string
  raw_payload?: { fuero?: string; ver_url?: string; leido_portal?: boolean; destinatario?: string } | null
  // Clasificación IA de prioridad (migración 050)
  prioridad?: 'urgente' | 'normal' | 'info' | null
  plazo_estimado_dias?: number | null
  ia_resumen?: string | null
  ia_analyzed_at?: string | null
  // Join con expediente local (si está vinculado)
  expediente?: { id: string; caratula: string | null; numero: string | null } | null
}

export interface SaeNotifPreferences {
  sae_notif_enabled: boolean
  sae_notif_push: boolean
  sae_notif_email: boolean
  sae_notif_email_addresses: string[]
  sae_notif_push_quiet: boolean
  sae_notif_weekend: boolean
  sae_fueros_seleccionados: string[]
}

// ── Lista ──────────────────────────────────────────────────────

export function useSaeNotificaciones(opts: { unreadOnly?: boolean; limit?: number } = {}) {
  return useQuery<SaeNotificacion[]>({
    queryKey: ['sae-notificaciones', opts.unreadOnly ?? false, opts.limit ?? 50],
    queryFn: async () => {
      const nowIso = new Date().toISOString()
      let q = supabase
        .from('sae_notificaciones' as never)
        .select('*, raw_payload, expediente:expedientes(id, caratula, numero)')
        // Excluir items snoozed cuyo timeout aún no expiró
        .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
        // Más reciente primero: por fecha del portal, con fallback al created_at local
        .order('fecha_emision', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 50)
      if (opts.unreadOnly) q = q.eq('leida', false)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as (SaeNotificacion & { expediente: SaeNotificacion['expediente'] | SaeNotificacion['expediente'][] })[])
        .map(r => ({
          ...r,
          expediente: Array.isArray(r.expediente) ? r.expediente[0] ?? null : r.expediente,
        })) as SaeNotificacion[]
    },
    refetchInterval: 60_000, // refresca cada minuto por si el cron metió cosas nuevas
  })
}

export function useSaeNotifUnreadCount() {
  return useQuery<number>({
    queryKey: ['sae-notificaciones-unread-count'],
    queryFn: async () => {
      const nowIso = new Date().toISOString()
      const { count, error } = await supabase
        .from('sae_notificaciones' as never)
        .select('id', { count: 'exact', head: true })
        .eq('leida', false)
        .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 60_000,
  })
}

// ── Mark as read ──────────────────────────────────────────────

export function useMarkSaeNotifAsRead() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      // Vamos por la edge function para que capture IP/UA y registre la
      // constancia legal de visualización (migración 00049). Si falla,
      // hacemos fallback al update directo para no bloquear al usuario.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { error } = await supabase.functions.invoke('record-sae-notif-view', {
        body: { notif_id: id, timezone: tz },
      })
      if (error) {
        console.warn('record-sae-notif-view failed, fallback to direct update', error)
        const { error: fbErr } = await supabase
          .from('sae_notificaciones' as never)
          .update({ leida: true, leida_at: new Date().toISOString() } as never)
          .eq('id', id)
        if (fbErr) throw fbErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sae-notificaciones'] })
      qc.invalidateQueries({ queryKey: ['sae-notificaciones-unread-count'] })
    },
  })
}

export function useMarkAllSaeNotifAsRead() {
  const qc = useQueryClient()
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase
        .from('sae_notificaciones' as never)
        .update({ leida: true, leida_at: new Date().toISOString() } as never)
        .eq('leida', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sae-notificaciones'] })
      qc.invalidateQueries({ queryKey: ['sae-notificaciones-unread-count'] })
    },
  })
}

// ── Preferencias ───────────────────────────────────────────────

export function useSaeNotifPreferences() {
  return useQuery<SaeNotifPreferences | null>({
    queryKey: ['sae-notif-preferences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('sae_notif_enabled, sae_notif_push, sae_notif_email, sae_notif_email_addresses, sae_notif_push_quiet, sae_notif_weekend, sae_fueros_seleccionados' as never)
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data as unknown as SaeNotifPreferences
    },
  })
}

// ── Trigger manual del poll (usuario aprieta "Sincronizar ahora") ─────────

export interface PollResult {
  ok: boolean
  profiles_checked: number
  notifs_nuevas: number
  push_enviados: number
  push_diferidos: number
  emails_enviados: number
  fueros_iterados?: string[]
  fueros_con_novedades_detectadas?: string[] | null
  discovery_mode?: 'auto' | 'manual'
  errores: { profile_id: string; error: string }[]
  skip_reasons?: { profile_id: string; reason: string }[]
  profiles_skipped?: number
  debug?: {
    discovery?: {
      status: number
      finalUrl: string
      hops: number
      htmlLen: number
      anchorsFound: number
      log: string[]
    }
    fueros: { slug: string; pages: number; items: number; firstStatus: number; htmlLen: number; error?: string }[]
  } | null
}

export function useTriggerSaePoll() {
  return useMutation<PollResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sae-poll-notificaciones', {
        body: {},
      })
      if (error) {
        // intentar extraer mensaje del body si vino
        const ctx = (error as { context?: Response }).context
        if (ctx instanceof Response) {
          const errBody = await ctx.json().catch(() => null) as { error?: string } | null
          if (errBody?.error) throw new Error(errBody.error)
        }
        throw error
      }
      return data as PollResult
    },
  })
}

export function useUpdateSaeNotifPreferences() {
  const qc = useQueryClient()
  return useMutation<void, Error, Partial<SaeNotifPreferences>>({
    mutationFn: async (patch) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase
        .from('profiles')
        .update(patch as never)
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sae-notif-preferences'] }),
  })
}

// ── Constancia legal de visualización ──────────────────────────

export interface SaeNotifConstancia {
  view_id: string
  viewed_at: string
  ip: string | null
  user_agent: string | null
  timezone: string | null
  notif_snapshot: Record<string, unknown>
  total_views: number
}

export function useSaeNotifConstancia(notifId: string | null) {
  return useQuery<SaeNotifConstancia | null>({
    queryKey: ['sae-notif-constancia', notifId],
    enabled: !!notifId,
    queryFn: async () => {
      if (!notifId) return null
      const { data, error } = await (supabase.rpc as any)('get_sae_notif_constancia', {
        p_notif_id: notifId,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return row ?? null
    },
  })
}

// ── Snooze ─────────────────────────────────────────────────────

export function useSnoozeSaeNotif() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; until: Date }>({
    mutationFn: async ({ id, until }) => {
      const { error } = await (supabase.rpc as any)('snooze_sae_notif', {
        p_notif_id: id,
        p_until: until.toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sae-notificaciones'] })
      qc.invalidateQueries({ queryKey: ['sae-notificaciones-unread-count'] })
    },
  })
}
