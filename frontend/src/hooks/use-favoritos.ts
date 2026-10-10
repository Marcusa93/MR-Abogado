import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { expedientesKeys } from '@/hooks/use-expedientes'

// Expedientes favoritos (estrella) del usuario logueado.
// Tabla expediente_favoritos (migración 20261010173703), aún no en database.types.ts.

export const favoritosKeys = {
  all: (profileId: string | undefined) => ['expediente-favoritos', profileId] as const,
}

export function useFavoritos() {
  const supabase = createClient()
  const profileId = useAuthStore((s) => s.profile?.id)
  return useQuery({
    queryKey: favoritosKeys.all(profileId),
    enabled: !!profileId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('expediente_favoritos')
        .select('expediente_id')
      if (error) throw error
      return new Set(((data ?? []) as { expediente_id: string }[]).map((r) => r.expediente_id))
    },
  })
}

export function useToggleFavorito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profileId = useAuthStore((s) => s.profile?.id)
  const key = favoritosKeys.all(profileId)

  return useMutation({
    mutationFn: async ({ expedienteId, favorito }: { expedienteId: string; favorito: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tabla = (supabase as any).from('expediente_favoritos')
      const { error } = favorito
        ? await tabla.insert({ expediente_id: expedienteId })
        : await tabla.delete().eq('expediente_id', expedienteId)
      if (error) throw error
    },
    // La estrella cambia al instante; si falla, se revierte.
    onMutate: async ({ expedienteId, favorito }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previo = queryClient.getQueryData<Set<string>>(key)
      const siguiente = new Set(previo ?? [])
      if (favorito) siguiente.add(expedienteId)
      else siguiente.delete(expedienteId)
      queryClient.setQueryData(key, siguiente)
      return { previo }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previo) queryClient.setQueryData(key, ctx.previo)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
      // La lista filtrada por favoritos depende de esto.
      queryClient.invalidateQueries({ queryKey: expedientesKeys.lists() })
    },
  })
}
