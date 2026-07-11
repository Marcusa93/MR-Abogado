import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

export interface NormativaDoc {
  id: string
  titulo: string
  tipo: string
  numero: string | null
  jurisdiccion: string | null
  nota?: string | null
}

export interface JurisprudenciaDoc {
  id: string
  caratula: string
  tribunal: string | null
  fecha: string | null
  tipo: string
  sumario: string | null
  nota?: string | null
}

// ── Búsqueda de normativa por texto ─────────────────────────────────────────

export function useBuscarNormativaConsulta(query: string) {
  const supabase = createClient()
  return useQuery<NormativaDoc[]>({
    queryKey: ['normativa_buscar_consulta', query],
    enabled: query.trim().length > 1,
    queryFn: async () => {
      const q = `%${query.trim()}%`
      const { data, error } = await supabase
        .from('normativa_documentos')
        .select('id, titulo, tipo, numero, jurisdiccion')
        .eq('estado', 'indexado')
        .or(`titulo.ilike.${q},numero.ilike.${q}`)
        .order('titulo', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as NormativaDoc[]
    },
    staleTime: 60_000,
  })
}

export function useBuscarJurisprudenciaConsulta(query: string) {
  const supabase = createClient()
  return useQuery<JurisprudenciaDoc[]>({
    queryKey: ['jurisprudencia_buscar_consulta', query],
    enabled: query.trim().length > 1,
    queryFn: async () => {
      const q = `%${query.trim()}%`
      const { data, error } = await supabase
        .from('jurisprudencia_documentos')
        .select('id, caratula, tribunal, fecha, tipo, sumario')
        .eq('estado', 'indexado')
        .or(`caratula.ilike.${q},tribunal.ilike.${q}`)
        .order('caratula', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as JurisprudenciaDoc[]
    },
    staleTime: 60_000,
  })
}

// ── Normativa anclada a la consulta ─────────────────────────────────────────

export function useConsultaNormativa(consultaId: string) {
  const supabase = createClient()
  return useQuery<NormativaDoc[]>({
    queryKey: ['consulta_normativa', consultaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('consulta_normativa')
        .select('nota, normativa_documentos(id, titulo, tipo, numero, jurisdiccion)')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as any[]).map((r: any) => ({
        ...(r.normativa_documentos as NormativaDoc),
        nota: r.nota as string | null,
      }))
    },
    staleTime: 30_000,
  })
}

export function usePinNormativaConsulta(consultaId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await (supabase as any)
        .from('consulta_normativa')
        .insert({ consulta_id: consultaId, documento_id: documentoId, fijado_por: user.id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consulta_normativa', consultaId] })
      toast.success('Normativa anclada')
    },
    onError: () => toast.error('No se pudo anclar'),
  })
}

export function useUnpinNormativaConsulta(consultaId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { error } = await (supabase as any)
        .from('consulta_normativa')
        .delete()
        .eq('consulta_id', consultaId)
        .eq('documento_id', documentoId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consulta_normativa', consultaId] })
    },
  })
}

// ── Jurisprudencia anclada a la consulta ────────────────────────────────────

export function useConsultaJurisprudencia(consultaId: string) {
  const supabase = createClient()
  return useQuery<JurisprudenciaDoc[]>({
    queryKey: ['consulta_jurisprudencia', consultaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('consulta_jurisprudencia')
        .select('nota, jurisprudencia_documentos(id, caratula, tribunal, fecha, tipo, sumario)')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as any[]).map((r: any) => ({
        ...(r.jurisprudencia_documentos as JurisprudenciaDoc),
        nota: r.nota as string | null,
      }))
    },
    staleTime: 30_000,
  })
}

export function usePinJurisprudenciaConsulta(consultaId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await (supabase as any)
        .from('consulta_jurisprudencia')
        .insert({ consulta_id: consultaId, documento_id: documentoId, fijado_por: user.id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consulta_jurisprudencia', consultaId] })
      toast.success('Jurisprudencia anclada')
    },
    onError: () => toast.error('No se pudo anclar'),
  })
}

export function useUnpinJurisprudenciaConsulta(consultaId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentoId: string) => {
      const { error } = await (supabase as any)
        .from('consulta_jurisprudencia')
        .delete()
        .eq('consulta_id', consultaId)
        .eq('documento_id', documentoId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consulta_jurisprudencia', consultaId] })
    },
  })
}

// ── Hook helper para debounce de búsqueda ───────────────────────────────────

export function useDebouncedQuery(delay = 350) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  const handleChange = (v: string) => {
    setQuery(v)
    clearTimeout((handleChange as any)._t)
    ;(handleChange as any)._t = setTimeout(() => setDebounced(v), delay)
  }

  return { query, debounced, handleChange }
}
