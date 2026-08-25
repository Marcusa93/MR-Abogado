import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
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

export interface MemberSummary {
  tareas: number
  tareasVencidas: number
  consultas: number
  miembros: number
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

export function useTeamWorkloadSummary(profileIds: string[]) {
  const supabase = createClient()
  const key = [...profileIds].sort().join(',')
  return useQuery<Record<string, MemberSummary>>({
    queryKey: ['team-workload-summary', key],
    enabled: profileIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const init: MemberSummary = { tareas: 0, tareasVencidas: 0, consultas: 0, miembros: 0 }
      const summary: Record<string, MemberSummary> = {}
      profileIds.forEach(id => { summary[id] = { ...init } })

      const results = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('tareas')
          .select('asignado_a, fecha_vencimiento')
          .in('asignado_a', profileIds)
          .in('estado', ['PENDIENTE', 'EN_PROGRESO']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('consultas')
          .select('assigned_to')
          .in('assigned_to', profileIds)
          .not('estado', 'in', '("convertida","descartada")'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('expediente_miembros')
          .select('profile_id, expediente:expedientes(deleted_at)')
          .in('profile_id', profileIds)
          .eq('activo', true),
      ])

      const tareasData: { asignado_a: string; fecha_vencimiento: string | null }[] = results[0].data ?? []
      const consultasData: { assigned_to: string | null }[] = results[1].data ?? []
      const miembrosData: { profile_id: string; expediente: { deleted_at: string | null } | null }[] = results[2].data ?? []

      const now = Date.now()
      tareasData.forEach(t => {
        if (!summary[t.asignado_a]) return
        summary[t.asignado_a].tareas++
        if (t.fecha_vencimiento && new Date(t.fecha_vencimiento).getTime() < now) {
          summary[t.asignado_a].tareasVencidas++
        }
      })
      consultasData.forEach(c => {
        if (c.assigned_to && summary[c.assigned_to]) summary[c.assigned_to].consultas++
      })
      miembrosData.forEach(m => {
        if (!m.expediente?.deleted_at && summary[m.profile_id]) summary[m.profile_id].miembros++
      })

      return summary
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useActualizarEstadoTarea() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async ({ tareaId, estado }: { tareaId: string; estado: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('tareas')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', tareaId)
        .select('id, titulo, expediente_id, asignados, asignado_a, created_by')
        .single()
      if (error) throw error
      return { tarea: data, estado }
    },
    onSuccess: async ({ tarea, estado }) => {
      qc.invalidateQueries({ queryKey: ['workload-tareas'] })
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['team-workload-summary'] })
      toast.success('Estado actualizado')

      if (estado === 'COMPLETADA' && tarea) {
        const completadorId = profile?.id ?? ''
        const completadorNombre = profile ? `${profile.nombre} ${profile.apellido ?? ''}`.trim() : 'Alguien'
        const asignadosIds: string[] = (tarea.asignados as string[] | undefined) ?? (tarea.asignado_a ? [tarea.asignado_a] : [])
        const link = tarea.expediente_id ? `/expedientes/${tarea.expediente_id}` : '/tareas'

        const yaNotificados = new Set([completadorId, ...asignadosIds])
        const toNotify: string[] = []
        if (tarea.created_by && !yaNotificados.has(tarea.created_by)) {
          toNotify.push(tarea.created_by); yaNotificados.add(tarea.created_by)
        }

        // Socios
        const { data: sociosData } = await (supabase as any)
          .from('profiles')
          .select('id')
          .in('rol', ['DIRECTOR', 'SOCIO', 'ADMIN'])
          .eq('activo', true)
        if (sociosData) {
          (sociosData as { id: string }[]).forEach(p => {
            if (!yaNotificados.has(p.id) && !toNotify.includes(p.id)) toNotify.push(p.id)
          })
        }

        if (toNotify.length > 0) {
          ;(supabase as any).from('alertas').insert(
            toNotify.map((userId: string) => ({
              tipo: 'TAREA_COMPLETADA',
              titulo: `Tarea completada: ${tarea.titulo}`,
              mensaje: `${completadorNombre} marcó como completada: "${tarea.titulo}".`,
              expediente_id: tarea.expediente_id ?? null,
              destinatario_id: userId,
              payload: { tarea_id: tarea.id, link },
            }))
          ).then(() => {}, () => {})
        }
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  })
}

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
