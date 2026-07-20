import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ValoresReferencia } from '@/lib/danos/types'

export type IndicadorReferencia = 'CBT_HOGAR3' | 'SMVM' | 'IPC' | 'UVA'

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

export interface UpsertValorInput {
  indicador: IndicadorReferencia
  vigenciaDesde: string
  valor: number
  fuente?: string
}

/**
 * Registra un nuevo valor de referencia (nueva fila por fecha de vigencia, así
 * los cálculos previos conservan el valor que usaron). Solo ADMIN/ABOGADO/DIRECTOR
 * por RLS.
 */
export function useUpsertValorReferencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: UpsertValorInput) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('valores_referencia')
        .upsert({
          indicador: i.indicador,
          vigencia_desde: i.vigenciaDesde,
          valor: i.valor,
          unidad: 'pesos',
          fuente: i.fuente ?? null,
        }, { onConflict: 'indicador,vigencia_desde' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['valores-referencia'] })
    },
  })
}
