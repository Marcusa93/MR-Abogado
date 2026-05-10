import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { parseMentions } from '@/lib/utils/mentions'
import { useAuthStore } from '@/stores/auth-store'
import type { Tables } from '@/types/database.types'

export type NotaWithAuthor = Tables<'expediente_notas'> & {
  author: Pick<Tables<'profiles'>, 'id' | 'nombre' | 'apellido' | 'rol'> | null
}

export const notasKeys = {
  all: ['notas'] as const,
  list: (expedienteId: string) => ['notas', expedienteId] as const,
}

export function useNotas(expedienteId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: notasKeys.list(expedienteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expediente_notas')
        .select('*, author:profiles!expediente_notas_created_by_fkey(id, nombre, apellido, rol)')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as NotaWithAuthor[]
    },
    staleTime: 30_000,
    enabled: !!expedienteId,
  })
}

export function useDeleteNota() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ notaId, expedienteId }: { notaId: string; expedienteId: string }) => {
      const { error } = await supabase
        .from('expediente_notas')
        .update({ eliminada: true, eliminada_at: new Date().toISOString() })
        .eq('id', notaId)

      if (error) throw error
      return { expedienteId }
    },
    onSuccess: ({ expedienteId }) => {
      queryClient.invalidateQueries({ queryKey: notasKeys.list(expedienteId) })
      queryClient.invalidateQueries({
        queryKey: ['expedientes', 'detail', expedienteId],
      })
    },
  })
}

interface CreateNotaInput {
  expediente_id: string
  contenido: string
  es_privada?: boolean
}

export function useCreateNota() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profile = useAuthStore((s) => s.profile)

  return useMutation({
    mutationFn: async (input: CreateNotaInput) => {
      const { data, error } = await supabase
        .from('expediente_notas')
        .insert({
          expediente_id: input.expediente_id,
          contenido: input.contenido,
          es_privada: input.es_privada ?? false,
          created_by: profile?.id ?? '',
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async (data) => {
      const expedienteId = data.expediente_id

      queryClient.invalidateQueries({ queryKey: notasKeys.list(expedienteId) })
      queryClient.invalidateQueries({
        queryKey: ['expedientes', 'detail', expedienteId],
      })

      // Create MENCION alerts for mentioned users
      const mentions = parseMentions(data.contenido)
      const currentUserId = profile?.id
      const authorName = profile ? `${profile.nombre} ${profile.apellido}` : 'Alguien'

      const mentionsToNotify = mentions.filter((m) => m.userId !== currentUserId)

      if (mentionsToNotify.length > 0) {
        const alertas = mentionsToNotify.map((m) => ({
          tipo: 'MENCION' as const,
          titulo: `${authorName} te mencionó en una nota`,
          mensaje: data.contenido.substring(0, 200),
          expediente_id: expedienteId,
          usuario_id: m.userId,
          link: `/expedientes/${expedienteId}`,
        }))

        await supabase.from('alertas').insert(alertas)
        queryClient.invalidateQueries({ queryKey: ['alertas'] })
      }
    },
  })
}
