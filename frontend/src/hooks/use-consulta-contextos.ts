import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type TipoContexto = 'grabacion' | 'documento' | 'apunte'

export interface ConsultaContexto {
  id: string
  consulta_id: string
  tipo: TipoContexto
  titulo: string
  contenido: string
  created_at: string
}

export function useConsultaContextos(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['consulta-contextos', consultaId],
    enabled: !!consultaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('consulta_contextos')
        .select('*')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ConsultaContexto[]
    },
  })
}

export function useAddConsultaContexto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { consulta_id: string; tipo: TipoContexto; titulo: string; contenido: string }) => {
      const { error } = await (supabase as any)
        .from('consulta_contextos')
        .insert(payload)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-contextos', vars.consulta_id] })
    },
  })
}

export function useDeleteConsultaContexto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, consulta_id }: { id: string; consulta_id: string }) => {
      const { error } = await (supabase as any)
        .from('consulta_contextos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-contextos', vars.consulta_id] })
    },
  })
}
