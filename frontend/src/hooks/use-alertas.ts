import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { Tables } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertaWithExpediente = Tables<'alertas'> & {
  expediente: Pick<
    Tables<'expedientes'>,
    'id' | 'numero' | 'caratula'
  > | null
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const alertasKeys = {
  all: ['alertas'] as const,
  list: (userId: string) => [...alertasKeys.all, 'list', userId] as const,
}

// ---------------------------------------------------------------------------
// useAlertas - List active alerts for the current user
// ---------------------------------------------------------------------------

export function useAlertas() {
  const supabase = createClient()
  const userId = useAuthStore((state) => state.user?.id)

  return useQuery<AlertaWithExpediente[]>({
    queryKey: alertasKeys.list(userId ?? ''),
    queryFn: async () => {
      if (!userId) return []

      const { data, error } = await supabase
        .from('alertas')
        .select(
          `
          *,
          expediente:expedientes!alertas_expediente_id_fkey (
            id,
            numero,
            caratula
          )
        `
        )
        .eq('destinatario_id', userId)
        .is('resuelta_at', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      return (data ?? []) as AlertaWithExpediente[]
    },
    enabled: !!userId,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  })
}

// ---------------------------------------------------------------------------
// useResolverAlerta - Mark alert as read via RPC
// ---------------------------------------------------------------------------

export function useResolverAlerta() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertaId: string) => {
      const { data, error } = await supabase.rpc('resolver_alerta', {
        alerta_id: alertaId,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    },
  })
}

// ---------------------------------------------------------------------------
// usePosponerAlerta - Postpone an alert
// ---------------------------------------------------------------------------

interface PosponerAlertaInput {
  alerta_id: string
  nueva_fecha: string // ISO date string for when to show the alert again
}

// ---------------------------------------------------------------------------
// useMarcarLeida - Mark single alert as resolved
// ---------------------------------------------------------------------------

export function useMarcarLeida() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (alertaId: string) => {
      const { error } = await supabase
        .from('alertas')
        .update({ estado: 'resuelta', resuelta_at: new Date().toISOString() })
        .eq('id', alertaId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertasKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// useMarcarTodasLeidas - Mark all alerts as resolved
// ---------------------------------------------------------------------------

export function useMarcarTodasLeidas() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)

  return useMutation({
    mutationFn: async () => {
      if (!userId) return
      const { error } = await supabase
        .from('alertas')
        .update({ estado: 'resuelta', resuelta_at: new Date().toISOString() })
        .eq('destinatario_id', userId)
        .is('resuelta_at', null)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertasKeys.all })
    },
  })
}

export function usePosponerAlerta() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ alerta_id, nueva_fecha }: PosponerAlertaInput) => {
      const { data, error } = await (supabase.rpc as any)('posponer_alerta', {
        p_alerta_id: alerta_id,
        p_hasta: nueva_fecha,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Notification sound (Web Audio API — no external file needed)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null

function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    // Two-tone chime: C5 → E5
    const g1 = ctx.createGain()
    g1.connect(ctx.destination)
    g1.gain.setValueAtTime(0.15, now)
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.setValueAtTime(523, now)
    o1.connect(g1)
    o1.start(now)
    o1.stop(now + 0.3)

    const g2 = ctx.createGain()
    g2.connect(ctx.destination)
    g2.gain.setValueAtTime(0.12, now + 0.15)
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.setValueAtTime(659, now + 0.15)
    o2.connect(g2)
    o2.start(now + 0.15)
    o2.stop(now + 0.5)
  } catch {
    // Audio not available — silent fallback
  }
}

// ---------------------------------------------------------------------------
// Browser notification
// ---------------------------------------------------------------------------

function showBrowserNotification(titulo: string, mensaje?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(titulo, {
      body: mensaje ?? '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'mr-alerta-' + Date.now(),
    })
  } catch {
    // Not available
  }
}

/** Call once on app load to prompt for notification permission */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

// ---------------------------------------------------------------------------
// useAlertasRealtime — Subscribe to INSERT/UPDATE on alertas table
// Plays sound + shows browser notification on new alerts
// ---------------------------------------------------------------------------

type RealtimeStatus = 'connected' | 'connecting' | 'disconnected'

export function useAlertasRealtime() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)
  const [status, setStatus] = useState<RealtimeStatus>('connecting')

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('alertas-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alertas',
          filter: `destinatario_id=eq.${userId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: alertasKeys.all })
          playNotificationSound()
          const row = payload.new as any
          showBrowserNotification(
            row?.titulo ?? 'Nueva alerta',
            row?.mensaje ?? undefined
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alertas',
          filter: `destinatario_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: alertasKeys.all })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'alertas',
          filter: `destinatario_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: alertasKeys.all })
        }
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') setStatus('connected')
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setStatus('disconnected')
        else setStatus('connecting')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase, queryClient])

  return status
}
