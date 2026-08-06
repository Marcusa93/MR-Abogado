import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

export interface ChatMensaje {
  id: string
  profile_id: string
  contenido: string
  created_at: string
  perfil?: { nombre: string | null; apellido: string | null }
}

const PAGE = 50

export function useChat() {
  const profile = useAuthStore((s) => s.profile)
  const supabase = createClient()
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Carga inicial
  useEffect(() => {
    if (!profile?.id) return
    setLoading(true)
    ;(supabase as any)
      .from('chat_mensajes')
      .select('id, profile_id, contenido, created_at, perfil:profiles!chat_mensajes_profile_id_fkey(nombre, apellido)')
      .order('created_at', { ascending: false })
      .limit(PAGE)
      .then(({ data, error }: any) => {
        if (!error) setMensajes(((data ?? []) as ChatMensaje[]).reverse())
        setLoading(false)
      })
  }, [profile?.id])

  // Realtime subscription
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel('chat-equipo')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        async (payload: any) => {
          const row = payload.new as ChatMensaje
          // Fetch the profile data
          const { data } = await (supabase as any)
            .from('profiles')
            .select('nombre, apellido')
            .eq('id', row.profile_id)
            .single()
          setMensajes((prev) => [...prev, { ...row, perfil: data }])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  const enviar = useCallback(
    async (texto: string) => {
      if (!profile?.id || !texto.trim()) return
      setSending(true)
      try {
        await (supabase as any).from('chat_mensajes').insert({
          profile_id: profile.id,
          contenido: texto.trim(),
        })
      } finally {
        setSending(false)
      }
    },
    [profile?.id],
  )

  return { mensajes, loading, sending, enviar, profileId: profile?.id }
}
