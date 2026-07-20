import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Precedente } from '@/lib/danos/precedentes'

const KEY = ['dano-precedentes'] as const

export function useDanoPrecedentes() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Precedente[]> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('dano_precedentes')
        .select('*')
        .eq('activo', true)
        .order('fecha', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as Precedente[]
    },
    staleTime: 1000 * 60 * 30,
  })
}

export type PrecedenteInput = Partial<Omit<Precedente, 'id' | 'activo'>> & { id?: string }

export function useUpsertPrecedente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: PrecedenteInput) => {
      const supabase = createClient()
      const payload: Record<string, unknown> = {
        tribunal: p.tribunal, sala: p.sala ?? null, fecha: p.fecha || null,
        caratula: p.caratula, expediente: p.expediente ?? null,
        tipo_conflicto: p.tipo_conflicto ?? null, rubro: p.rubro ?? 'no_patrimonial',
        monto_nominal: p.monto_nominal ?? null, fecha_cuantificacion: p.fecha_cuantificacion || null,
        unidad_normalizada: p.unidad_normalizada ?? null, valor_en_unidad: p.valor_en_unidad ?? null,
        hechos_relevantes: p.hechos_relevantes ?? null, fundamento: p.fundamento ?? null,
        fuente_url: p.fuente_url ?? null,
        estado_verificacion: p.estado_verificacion ?? 'remision_oficial',
        jurisdiccion: p.jurisdiccion ?? 'Tucuman',
      }
      if (p.id) {
        const { error } = await (supabase as any).from('dano_precedentes').update(payload).eq('id', p.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('dano_precedentes').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeletePrecedente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // Baja lógica (activo=false) para preservar precedentes citados en cálculos.
      const { error } = await (supabase as any).from('dano_precedentes').update({ activo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
