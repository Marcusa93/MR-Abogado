import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TablesInsert } from '@/types/database.types'
import { expedientesKeys } from '@/hooks/use-expedientes'
import { useAuthStore } from '@/stores/auth-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSeguimientoInput {
  expediente_id: string
  canal: 'WEB' | 'TELEFONO' | 'PRESENCIAL' | 'EMAIL'
  estado_organismo_reportado?: string | null
  observacion?: string | null
  proxima_fecha_control?: string | null
}

// ---------------------------------------------------------------------------
// useCreateSeguimiento
// ---------------------------------------------------------------------------

export function useCreateSeguimiento() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (input: CreateSeguimientoInput) => {
      const insertData: TablesInsert<'seguimientos'> = {
        expediente_id: input.expediente_id,
        canal: input.canal,
        estado_organismo_reportado: input.estado_organismo_reportado ?? 'Sin cambios',
        observacion: input.observacion ?? null,
        proxima_fecha_control: input.proxima_fecha_control ?? null,
        fecha_control: new Date().toISOString().split('T')[0],
        created_by: userId ?? '',
      }

      const { data, error } = await supabase
        .from('seguimientos')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: expedientesKeys.all })
      queryClient.invalidateQueries({
        queryKey: expedientesKeys.detail(variables.expediente_id),
      })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    },
  })
}
