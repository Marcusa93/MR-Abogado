import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const telegramKeys = {
  vinculo: (profileId: string | undefined) => ['telegram-vinculo', profileId] as const,
}

/**
 * ¿El usuario tiene Telegram vinculado? Mientras `esperando` es true (después
 * de abrir el enlace), consulta cada 3s para reflejar el /start en el bot.
 */
export function useTelegramVinculo(profileId: string | undefined) {
  const supabase = createClient()
  const [esperando, setEsperando] = useState(false)

  const query = useQuery({
    queryKey: telegramKeys.vinculo(profileId),
    enabled: !!profileId,
    queryFn: async () => {
      // telegram_chat_id: columna de 20261007231413_tareas_telegram, aún no en database.types.ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', profileId!)
        .maybeSingle()
      if (error) throw error
      const vinculado = !!(data as { telegram_chat_id: number | null } | null)?.telegram_chat_id
      if (vinculado) setEsperando(false)
      return vinculado
    },
    refetchInterval: esperando ? 3000 : false,
    staleTime: 5 * 60_000,
  })

  return { vinculado: query.data ?? false, isLoading: query.isLoading, esperando, setEsperando }
}

export function useVincularTelegram() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('telegram-vincular', { body: { accion: 'link' } })
      if (error) throw error
      const url = (data as { url?: string; error?: string } | null)?.url
      if (!url) throw new Error((data as { error?: string } | null)?.error ?? 'No se pudo generar el enlace')
      return url
    },
  })
}

/** DIRECTOR/ADMIN: genera el link de vinculación para otro usuario.
 *  Devuelve la URL lista para copiar o compartir. */
export function useVincularTelegramParaOtro() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (forProfileId: string) => {
      const { data, error } = await supabase.functions.invoke('telegram-vincular', {
        body: { accion: 'link', for_profile_id: forProfileId },
      })
      if (error) throw error
      const url = (data as { url?: string; error?: string } | null)?.url
      if (!url) throw new Error((data as { error?: string } | null)?.error ?? 'No se pudo generar el enlace')
      return url
    },
  })
}

export function useDesvincularTelegram(profileId: string | undefined) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('telegram-vincular', { body: { accion: 'desvincular' } })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: telegramKeys.vinculo(profileId) })
    },
  })
}
