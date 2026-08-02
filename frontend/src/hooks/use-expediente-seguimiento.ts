import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

export function useToggleSeguimientoActivo() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ expedienteId, activo }: { expedienteId: string; activo: boolean }) => {
      const { error } = await (supabase as any)
        .from('expedientes')
        .update({ seguimiento_activo: activo })
        .eq('id', expedienteId)

      if (error) throw error
    },
    onSuccess: (_data, { expedienteId, activo }) => {
      queryClient.invalidateQueries({ queryKey: ['expedientes', expedienteId] })
      toast.success(
        activo
          ? 'Seguimiento activo. Recibirás alertas si no hay actividad en 48 horas.'
          : 'Seguimiento desactivado.',
      )
    },
    onError: () => {
      toast.error('No se pudo actualizar el seguimiento.')
    },
  })
}
