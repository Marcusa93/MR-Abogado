import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { CalculoDanosInput, ResultadoDanos } from '@/lib/danos/types'

// dano_calculos no está en database.types.ts generadas (tabla nueva)
export interface DanoCalculo {
  id: string
  titulo: string
  tipo_caso: string | null
  fuero: string | null
  consulta_id: string | null
  expediente_id: string | null
  input: CalculoDanosInput
  resultado: ResultadoDanos
  valores_snapshot: unknown
  monto_razonable_total: number | null
  nivel_confianza: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface DanosFilters {
  consultaId?: string
  expedienteId?: string
}

export const danosKeys = {
  all: ['danos'] as const,
  lists: () => [...danosKeys.all, 'list'] as const,
  list: (f: DanosFilters) => [...danosKeys.lists(), f] as const,
  detail: (id: string) => [...danosKeys.all, 'detail', id] as const,
}

export function useDanos(filters: DanosFilters = {}) {
  return useQuery({
    queryKey: danosKeys.list(filters),
    queryFn: async (): Promise<DanoCalculo[]> => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('dano_calculos')
        .select('*')
        .order('created_at', { ascending: false })
      if (filters.consultaId) q = q.eq('consulta_id', filters.consultaId)
      if (filters.expedienteId) q = q.eq('expediente_id', filters.expedienteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as DanoCalculo[]
    },
    staleTime: 30_000,
  })
}

export function useDanoCalculo(id: string | null) {
  return useQuery({
    queryKey: danosKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<DanoCalculo | null> => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('dano_calculos').select('*').eq('id', id).single()
      if (error) throw error
      return data as DanoCalculo
    },
  })
}

export interface CreateDanoInput {
  titulo: string
  tipoCaso?: string
  fuero?: string
  consultaId?: string | null
  expedienteId?: string | null
  input: CalculoDanosInput
  resultado: ResultadoDanos
}

export function useCreateDano() {
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async (i: CreateDanoInput): Promise<DanoCalculo> => {
      const supabase = createClient()
      const montoRazonable = i.resultado.escenarios.razonable?.total ?? null
      const payload = {
        titulo: i.titulo,
        tipo_caso: i.tipoCaso ?? null,
        fuero: i.fuero ?? null,
        consulta_id: i.consultaId ?? null,
        expediente_id: i.expedienteId ?? null,
        input: i.input,
        resultado: i.resultado,
        valores_snapshot: i.resultado.auditoria.valoresReferencia,
        monto_razonable_total: montoRazonable,
        nivel_confianza: i.resultado.auditoria.nivelConfianza,
        created_by: profile?.id,
      }
      const { data, error } = await (supabase as any)
        .from('dano_calculos')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      return data as DanoCalculo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: danosKeys.all })
    },
  })
}

export function useUpdateDano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: CreateDanoInput & { id: string }): Promise<void> => {
      const supabase = createClient()
      const montoRazonable = i.resultado.escenarios.razonable?.total ?? null
      const { error } = await (supabase as any)
        .from('dano_calculos')
        .update({
          titulo: i.titulo,
          tipo_caso: i.tipoCaso ?? null,
          input: i.input,
          resultado: i.resultado,
          valores_snapshot: i.resultado.auditoria.valoresReferencia,
          monto_razonable_total: montoRazonable,
          nivel_confianza: i.resultado.auditoria.nivelConfianza,
          updated_at: new Date().toISOString(),
        })
        .eq('id', i.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: danosKeys.all }),
  })
}

export function useDeleteDano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('dano_calculos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: danosKeys.all })
    },
  })
}
