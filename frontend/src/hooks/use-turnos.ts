import { useMutation, useQueryClient } from '@tanstack/react-query'
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
      const { data, error } = await supabase
        .from('audiencias')
        .insert(input)
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
