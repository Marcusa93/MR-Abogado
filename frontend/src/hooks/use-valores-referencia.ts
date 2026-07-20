import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ValoresReferencia } from '@/lib/danos/types'

interface ValorRow {
  indicador: string
  vigencia_desde: string
  valor: string | number
}

/**
 * Valores económicos de referencia vigentes (CBT Hogar 3, SMVM, ...).
 * Toma el valor más reciente por indicador. Alimenta el estimador de daños.
 */
export function useValoresReferencia() {
  return useQuery({
    queryKey: ['valores-referencia'],
    queryFn: async (): Promise<ValoresReferencia> => {
      const supabase = createClient()
      // valores_referencia no está en database.types.ts generadas (tabla nueva)
      const { data, error } = await (supabase as any)
        .from('valores_referencia')
        .select('indicador, vigencia_desde, valor')
        .order('vigencia_desde', { ascending: false })
      if (error) throw error

      const rows = (data ?? []) as ValorRow[]
      const latest: Record<string, number> = {}
      let vigencia: string | undefined
      for (const r of rows) {
        if (latest[r.indicador] === undefined) {
          latest[r.indicador] = Number(r.valor)
          if (r.indicador === 'CBT_HOGAR3') vigencia = r.vigencia_desde
        }
      }
      return {
        cbtHogar3: latest['CBT_HOGAR3'] ?? 0,
        smvm: latest['SMVM'],
        vigenciaDesde: vigencia,
      }
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}
