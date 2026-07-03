import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import { expedientesKeys } from '@/hooks/use-expedientes'

const turnoInvalidationKeys = (expedienteId: string) =>
  [
    expedientesKeys.all,
    expedientesKeys.detail(expedienteId),
    ['agenda'] as const,
    ['dashboard-metrics'] as const,
  ] as const

export function useCreateTurno() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TablesInsert<'audiencias'>) => {
      // created_by es NOT NULL: lo seteamos con el usuario autenticado si no vino.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('audiencias')
        .insert({ ...input, created_by: input.created_by ?? user.id })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      for (const queryKey of turnoInvalidationKeys(variables.expediente_id)) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
      }
    },
  })
}

export function useUpdateTurno() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      expediente_id,
      ...updates
    }: TablesUpdate<'audiencias'> & { id: string; expediente_id: string }) => {
      const { data, error } = await supabase
        .from('audiencias')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      for (const queryKey of turnoInvalidationKeys(variables.expediente_id)) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
      }
    },
  })
}

export function useDeleteTurno() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      expediente_id,
    }: {
      id: string
      expediente_id: string
    }) => {
      const { error } = await supabase
        .from('audiencias')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      for (const queryKey of turnoInvalidationKeys(variables.expediente_id)) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
      }
    },
  })
}

// ── Asignados a audiencia ─────────────────────────────────────────────────────

export type AsignadoProfile = {
  profile_id: string
  profiles: { nombre_completo: string | null; nombre: string | null; apellido: string | null } | null
}

export function useAudienciaAsignados(audienciaId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['audiencia-asignados', audienciaId],
    enabled: !!audienciaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('audiencia_asignados')
        .select('profile_id, profiles(nombre_completo, nombre, apellido)')
        .eq('audiencia_id', audienciaId!)
      if (error) throw error
      return (data ?? []) as AsignadoProfile[]
    },
    staleTime: 2 * 60_000,
  })
}

export function useAssignAudienciaUsers() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      audienciaId,
      profileIds,
    }: {
      audienciaId: string
      profileIds: string[]
    }) => {
      if (profileIds.length === 0) return
      const rows = profileIds.map((profile_id) => ({ audiencia_id: audienciaId, profile_id }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('audiencia_asignados')
        .insert(rows)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['audiencia-asignados', variables.audienciaId] })
    },
  })
}
