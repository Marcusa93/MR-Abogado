import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkloadTarea {
  id: string
  titulo: string
  descripcion: string | null
  prioridad: string
  estado: string
  fecha_vencimiento: string | null
  asignado_a: string
  expediente: { id: string; numero: string | null; caratula: string | null } | null
  consulta: { id: string; nombre: string; apellido: string | null } | null
}

export interface WorkloadConsulta {
  id: string
  nombre: string
  apellido: string | null
  tipo_asunto: string
  estado: string
  created_at: string
  assigned_to: string | null
}

export interface WorkloadMiembro {
  id: string
  rol: string
  expediente: {
    id: string
    numero: string | null
    caratula: string | null
    fuero: string | null
    estado_interno: string | null
  } | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useWorkloadTareas(profileId: string | undefined) {
  const supabase = createClient()
  return useQuery<WorkloadTarea[]>({
    queryKey: ['workload-tareas', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!profileId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('tareas')
        .select('id, titulo, descripcion, prioridad, estado, fecha_vencimiento, asignado_a, expediente:expedientes(id, numero, caratula), consulta:consultas(id, nombre, apellido)')
        .eq('asignado_a', profileId)
        .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
        .order('fecha_vencimiento', { ascending: true, nullsLast: true })
      if (error) throw error
      return (data ?? []) as WorkloadTarea[]
    },
  })
}

export function useWorkloadConsultas(profileId: string | undefined) {
  const supabase = createClient()
  return useQuery<WorkloadConsulta[]>({
    queryKey: ['workload-consultas', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!profileId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('consultas')
        .select('id, nombre, apellido, tipo_asunto, estado, created_at, assigned_to')
        .eq('assigned_to', profileId)
        .not('estado', 'in', '("convertida","descartada")')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkloadConsulta[]
    },
  })
}

export function useWorkloadMiembros(profileId: string | undefined) {
  const supabase = createClient()
  return useQuery<WorkloadMiembro[]>({
    queryKey: ['workload-miembros', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!profileId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('expediente_miembros')
        .select('id, rol, expediente:expedientes(id, numero, caratula, fuero, estado_interno, deleted_at)')
        .eq('profile_id', profileId)
        .eq('activo', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Filtrar expedientes con deleted_at
      const rows = (data ?? []) as (WorkloadMiembro & { expediente: { deleted_at?: string | null } | null })[]
      return rows.filter(r => !r.expediente?.deleted_at) as WorkloadMiembro[]
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useReasignarTarea() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tareaId, newProfileId }: { tareaId: string; newProfileId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('tareas')
        .update({ asignado_a: newProfileId, updated_at: new Date().toISOString() })
        .eq('id', tareaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workload-tareas'] })
      qc.invalidateQueries({ queryKey: ['tareas'] })
      toast.success('Tarea reasignada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo reasignar'),
  })
}

export function useReasignarConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ consultaId, newProfileId }: { consultaId: string; newProfileId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('consultas')
        .update({ assigned_to: newProfileId, updated_at: new Date().toISOString() })
        .eq('id', consultaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workload-consultas'] })
      toast.success('Consulta reasignada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo reasignar'),
  })
}

export function useReasignarExpedienteMiembro() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      miembroId,
      expedienteId,
      newProfileId,
      rol,
    }: {
      miembroId: string
      expedienteId: string
      newProfileId: string
      rol: string
    }) => {
      // Desactivar miembro actual
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e1 } = await (supabase as any)
        .from('expediente_miembros')
        .update({ activo: false })
        .eq('id', miembroId)
      if (e1) throw e1

      // Upsert nuevo miembro con mismo rol
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase as any)
        .from('expediente_miembros')
        .upsert(
          { expediente_id: expedienteId, profile_id: newProfileId, rol, activo: true },
          { onConflict: 'expediente_id,profile_id' }
        )
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workload-miembros'] })
      toast.success('Expediente reasignado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo reasignar'),
  })
}
