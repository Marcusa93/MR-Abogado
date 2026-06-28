import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useLinkedInStatus() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['linkedin-status'],
    staleTime: 60_000,
    queryFn: async () => {
      // Sólo columnas no sensibles (nunca el token).
      const { data } = await (supabase.from as any)('social_connections')
        .select('account_name, expires_at')
        .eq('provider', 'linkedin')
        .maybeSingle()
      const row = data as { account_name: string | null; expires_at: string | null } | null
      const expired = row?.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false
      return { connected: !!row && !expired, accountName: row?.account_name ?? null, expired }
    },
  })
}

// Inicia el OAuth: pide la URL al server y redirige.
export async function connectLinkedIn(): Promise<void> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('No hay sesión activa')
  const { data, error } = await supabase.functions.invoke('linkedin-oauth-callback', { body: {} })
  if (error) throw new Error(error.message || 'No se pudo iniciar la conexión con LinkedIn')
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  const url = (data as { url?: string }).url
  if (!url) throw new Error('No se obtuvo la URL de autorización de LinkedIn')
  window.location.href = url
}

export function useLinkedInPublish() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { cuerpo: string; hashtags?: string; contenido_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('linkedin-publish', { body: input })
      if (error) {
        const ctx = (error as { context?: Response }).context
        if (ctx instanceof Response) {
          const b = await ctx.json().catch(() => null)
          if (b?.error) throw new Error(b.error)
        }
        throw new Error(error.message || 'No se pudo publicar en LinkedIn')
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { ok: boolean; url: string | null }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contenidos'] }),
  })
}
