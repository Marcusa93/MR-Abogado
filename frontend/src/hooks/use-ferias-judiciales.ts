import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { FeriaPeriod } from '@/lib/utils/judicial-calendar'

export function useFeriasJudiciales() {
  return useQuery({
    queryKey: ['ferias-judiciales'],
    queryFn: async (): Promise<FeriaPeriod[]> => {
      const supabase = createClient()
      // feria_judicial no está en database.types.ts generadas (tabla nueva)
      const { data, error } = await (supabase as any)
        .from('feria_judicial')
        .select('inicio, fin')
        .order('inicio')
      if (error) throw error
      return ((data ?? []) as unknown as FeriaPeriod[])
    },
    staleTime: 1000 * 60 * 60 * 6, // 6 horas — las ferias no cambian seguido
  })
}
