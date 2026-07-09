import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TipoProceso {
  id: string
  codigo: string
  nombre: string
  fuero: string | null
  jurisdiccion: string | null
  descripcion: string | null
  norma_base: string | null
  orden: number
}

export interface EtapaProceso {
  id: string
  tipo_proceso_id: string
  codigo: string
  nombre: string
  orden: number
  descripcion: string | null
  plazo_dias: number | null
  plazo_es_perentorio: boolean
  decisiones_posibles: { codigo: string; nombre: string; descripcion: string }[]
  escritos_tipicos: { tipo: string; descripcion: string }[]
  es_terminal: boolean
}

export interface Sentencia {
  id: string
  expediente_id: string
  tipo: 'FAVORABLE' | 'DESFAVORABLE' | 'PARCIAL' | 'HOMOLOGACION' | 'RECHAZO'
  instancia: 'PRIMERA' | 'SEGUNDA' | 'CASACION' | 'CORTE' | 'ADMINISTRATIVA'
  fecha: string
  resumen: string | null
  apelada: boolean
  apelante: 'ACTORA' | 'DEMANDADA' | 'AMBAS' | null
  resultado_apelacion: string | null
  created_by: string
  created_at: string
}

export interface PruebaInformativa {
  id: string
  expediente_id: string
  institucion: string
  descripcion: string
  fecha_enviado: string | null
  fecha_plazo: string | null
  fecha_contestado: string | null
  estado: 'PENDIENTE' | 'ENVIADO' | 'RECIBIDO' | 'VENCIDO' | 'DESISTIDO'
  observaciones: string | null
  created_by: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Tipos de proceso
// ---------------------------------------------------------------------------

export function useTiposProceso() {
  const supabase = createClient()
  return useQuery<TipoProceso[]>({
    queryKey: ['tipos_proceso'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tipos_proceso_judicial')
        .select('*')
        .order('orden', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Etapas de un tipo de proceso
// ---------------------------------------------------------------------------

export function useEtapasProceso(tipoProcesoid: string | null | undefined) {
  const supabase = createClient()
  return useQuery<EtapaProceso[]>({
    queryKey: ['etapas_proceso', tipoProcesoid],
    enabled: !!tipoProcesoid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('etapas_proceso')
        .select('*')
        .eq('tipo_proceso_id', tipoProcesoid)
        .order('orden', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Sentencias
// ---------------------------------------------------------------------------

export function useSentencias(expedienteId: string) {
  const supabase = createClient()
  return useQuery<Sentencia[]>({
    queryKey: ['sentencias', expedienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sentencias')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('fecha', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

export function useCreateSentencia() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Sentencia, 'id' | 'created_by' | 'created_at'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data, error } = await (supabase as any)
        .from('sentencias')
        .insert({ ...payload, created_by: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data: unknown, vars: Omit<Sentencia, 'id' | 'created_by' | 'created_at'>) => {
      qc.invalidateQueries({ queryKey: ['sentencias', vars.expediente_id] })
      toast.success('Sentencia registrada')
    },
    onError: () => toast.error('Error al registrar la sentencia'),
  })
}

export function useDeleteSentencia(expedienteId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('sentencias')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sentencias', expedienteId] })
      toast.success('Sentencia eliminada')
    },
    onError: () => toast.error('Error al eliminar la sentencia'),
  })
}

// ---------------------------------------------------------------------------
// Prueba informativa (oficios)
// ---------------------------------------------------------------------------

export function usePruebaInformativa(expedienteId: string) {
  const supabase = createClient()
  return useQuery<PruebaInformativa[]>({
    queryKey: ['prueba_informativa', expedienteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('prueba_informativa')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

export function useCreateOficio() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<PruebaInformativa, 'id' | 'created_by' | 'created_at'>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data, error } = await (supabase as any)
        .from('prueba_informativa')
        .insert({ ...payload, created_by: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data: unknown, vars: Omit<PruebaInformativa, 'id' | 'created_by' | 'created_at'>) => {
      qc.invalidateQueries({ queryKey: ['prueba_informativa', vars.expediente_id] })
      toast.success('Oficio agregado')
    },
    onError: () => toast.error('Error al agregar oficio'),
  })
}

export function useUpdateOficio(expedienteId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PruebaInformativa> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('prueba_informativa')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prueba_informativa', expedienteId] })
      toast.success('Oficio actualizado')
    },
    onError: () => toast.error('Error al actualizar oficio'),
  })
}

export function useDeleteOficio(expedienteId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('prueba_informativa')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prueba_informativa', expedienteId] })
      toast.success('Oficio eliminado')
    },
    onError: () => toast.error('Error al eliminar oficio'),
  })
}
