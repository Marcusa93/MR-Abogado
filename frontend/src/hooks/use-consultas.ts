import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ConsultaEstado = 'pendiente' | 'en_proceso' | 'presupuestada' | 'con_claudio' | 'requiere_info' | 'redactando' | 'convertida' | 'resuelta' | 'descartada'
export type ConsultaCanal = 'presencial' | 'telefono' | 'turno' | 'web' | 'referido'
export type ConsultaTipoAsunto =
  | 'laboral_trabajador' | 'laboral_empleador'
  | 'civil' | 'familia' | 'previsional' | 'penal' | 'otro'

export type TipoHonorario = 'cuota_litis' | 'arancel_verbal' | 'arancel_escrito' | 'honorario_fijo'

export interface DiagnosticoModulo {
  area: string
  fuero: string
  pretension: string
  chances_estimadas: 'alta' | 'media' | 'baja' | 'sin_datos'
  acciones_recomendadas: string[]
  riesgos: string[]
  observaciones: string
  checklist_cliente?: string[]
  tipo_honorario_sugerido: TipoHonorario
  descripcion_honorarios: string
}

export interface DiagnosticoIA {
  // Nueva estructura multi-fuero (nuevos diagnósticos)
  modulos?: DiagnosticoModulo[]
  // Campos legacy (diagnósticos anteriores al refactor)
  fuero?: string
  pretension?: string
  chances_estimadas?: 'alta' | 'media' | 'baja' | 'sin_datos'
  acciones_recomendadas?: string[]
  riesgos?: string[]
  observaciones?: string
  checklist_cliente?: string[]
  tipo_honorario_sugerido?: TipoHonorario
  descripcion_honorarios?: string
}

export interface IntimacionDoc {
  tipo: 'carta_documento' | 'telegrama_ley'
  destinatario_nombre: string
  destinatario_domicilio: string
  remitente_nombre: string
  remitente_domicilio: string
  remitente_dni?: string
  cuerpo: string
  generado_at?: string
}

export interface Consulta {
  id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  email: string | null
  canal: ConsultaCanal
  tipo_asunto: ConsultaTipoAsunto
  notas_libres: string | null
  notas_abogado: string | null
  diagnostico_ia: DiagnosticoIA | null
  diagnostico_at: string | null
  intimacion: IntimacionDoc | null
  areas_derecho: string[]
  estado: ConsultaEstado
  estado_notas: string | null
  convertida_expediente_id: string | null
  assigned_to: string | null
  hechos_ordenados: string | null
  preguntas_sugeridas: string[]
  hechos_ordenados_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  assigned_profile?: { nombre: string | null; apellido: string | null } | null
  created_profile?: { nombre: string | null; apellido: string | null } | null
}

export interface SolicitudDoc {
  id: string
  consulta_id: string
  descripcion: string
  responsable_id: string | null
  estado: 'pendiente' | 'recibido' | 'cancelado'
  notas: string | null
  fecha_limite: string | null
  created_by: string
  created_at: string
  updated_at: string
  responsable_profile?: { nombre: string | null; apellido: string | null } | null
}

export interface Presupuesto {
  id: string
  consulta_id: string | null
  expediente_id: string | null
  tipo_honorario: TipoHonorario
  monto_base: number | null
  multiplicador: number
  honorarios_calculados: number
  descripcion_ia: string | null
  estado: 'borrador' | 'presentado' | 'aceptado' | 'rechazado'
  notas: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ConsultaActividad {
  id: string
  consulta_id: string
  tipo: 'nota' | 'llamada' | 'email' | 'reunion' | 'cambio_estado'
  descripcion: string
  created_by: string
  created_at: string
  created_profile?: { nombre: string | null; apellido: string | null } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const TIPO_ASUNTO_LABEL: Record<ConsultaTipoAsunto, string> = {
  laboral_trabajador: 'Laboral (trabajador)',
  laboral_empleador: 'Laboral (empleador)',
  civil: 'Civil',
  familia: 'Familia',
  previsional: 'Previsional',
  penal: 'Penal',
  otro: 'Otro',
}

export const CANAL_LABEL: Record<ConsultaCanal, string> = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  turno: 'Turno',
  web: 'Web',
  referido: 'Referido',
}

export const ESTADO_LABEL: Record<ConsultaEstado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  presupuestada: 'Presupuestada',
  con_claudio: 'Con Claudio',
  requiere_info: 'Requiere info',
  redactando: 'Redactando',
  convertida: 'Expediente',
  resuelta: 'Resuelta',
  descartada: 'Descartada',
}

export const HONORARIO_LABEL: Record<TipoHonorario, string> = {
  cuota_litis: 'Cuota litis',
  arancel_verbal: 'Consulta verbal Colegio',
  arancel_escrito: 'Consulta escrita Colegio',
  honorario_fijo: 'Honorario fijo',
}

export const ARANCEL_VERBAL = 335500
export const ARANCEL_ESCRITO = 675000

export function calcularHonorarios(
  tipo: TipoHonorario,
  montoBase: number,
  multiplicador: number,
): number {
  switch (tipo) {
    case 'cuota_litis': return montoBase * (multiplicador / 100)
    case 'arancel_verbal': return ARANCEL_VERBAL * multiplicador
    case 'arancel_escrito': return ARANCEL_ESCRITO * multiplicador
    case 'honorario_fijo': return montoBase
    default: return 0
  }
}

// ---------------------------------------------------------------------------
// Lista de consultas
// ---------------------------------------------------------------------------

export interface ConsultasFilters {
  estado?: ConsultaEstado | ''
  search?: string
}

export function useConsultas(filters: ConsultasFilters = {}) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['consultas', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      let q = db
        .from('consultas')
        .select(`
          id, nombre, apellido, telefono, email, canal, tipo_asunto,
          estado, diagnostico_at, created_at, assigned_to,
          assigned_profile:profiles!consultas_assigned_to_fkey(nombre, apellido)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filters.estado) q = q.eq('estado', filters.estado)
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim().replace(/[%_\\]/g, '')}%`
        q = q.or(`nombre.ilike.${term},apellido.ilike.${term},telefono.ilike.${term}`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Consulta[]
    },
  })
}

// ---------------------------------------------------------------------------
// Detalle de consulta
// ---------------------------------------------------------------------------

export function useConsulta(id: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['consulta', id],
    queryFn: async () => {
      if (!id) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('consultas')
        .select(`
          *,
          assigned_profile:profiles!consultas_assigned_to_fkey(nombre, apellido),
          created_profile:profiles!consultas_created_by_fkey(nombre, apellido)
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Consulta
    },
    enabled: !!id,
  })
}

// ---------------------------------------------------------------------------
// CRUD consultas
// ---------------------------------------------------------------------------

export function useCreateConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async (payload: Partial<Consulta> & { nombre: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('consultas')
        .insert({ ...payload, created_by: profile?.id ?? '' })
        .select('id')
        .single()
      if (error) throw error
      return data as { id: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultas'] }),
  })
}

export function useUpdateConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Consulta> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('consultas')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta', vars.id] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

export function useDeleteConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('consultas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------------------

export function usePresupuesto(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['presupuesto', consultaId],
    queryFn: async () => {
      if (!consultaId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('presupuestos')
        .select('*')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Presupuesto | null
    },
    enabled: !!consultaId,
  })
}

export function usePresupuestos(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['presupuestos', consultaId],
    queryFn: async () => {
      if (!consultaId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('presupuestos')
        .select('*')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Presupuesto[]
    },
    enabled: !!consultaId,
  })
}

export function useDeletePresupuesto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, consulta_id }: { id: string; consulta_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('presupuestos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['presupuesto', vars.consulta_id] })
      qc.invalidateQueries({ queryKey: ['presupuestos', vars.consulta_id] })
    },
  })
}

export function useUpsertPresupuesto() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async (payload: Omit<Presupuesto, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const now = new Date().toISOString()
      if (payload.id) {
        const { error } = await db.from('presupuestos').update({ ...payload, updated_at: now }).eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await db.from('presupuestos').insert({ ...payload, created_by: profile?.id ?? '', created_at: now, updated_at: now })
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['presupuesto', vars.consulta_id] })
      qc.invalidateQueries({ queryKey: ['presupuestos', vars.consulta_id] })
      qc.invalidateQueries({ queryKey: ['consulta', vars.consulta_id] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------------

export function useConsultaActividad(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['consulta-actividad', consultaId],
    queryFn: async () => {
      if (!consultaId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('consulta_actividad')
        .select('*, created_profile:profiles!consulta_actividad_created_by_fkey(nombre, apellido)')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ConsultaActividad[]
    },
    enabled: !!consultaId,
  })
}

export function useAddConsultaActividad() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async (payload: { consulta_id: string; tipo: ConsultaActividad['tipo']; descripcion: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('consulta_actividad')
        .insert({ ...payload, created_by: profile?.id ?? '' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-actividad', vars.consulta_id] })
    },
  })
}

// ---------------------------------------------------------------------------
// Ordenar hechos con IA
// ---------------------------------------------------------------------------

export function useOrdenarHechos() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (consulta_id: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/consulta-ordenar-hechos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ consulta_id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al ordenar hechos')
      return data as { ok: boolean; hechos_ordenados: string; preguntas_sugeridas: string[]; assigned_to: string | null }
    },
    onSuccess: (_d, consulta_id) => {
      qc.invalidateQueries({ queryKey: ['consulta', consulta_id] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Solicitudes de documentación
// ---------------------------------------------------------------------------

export function useSolicitudesDocs(consultaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['consulta-solicitud-docs', consultaId],
    queryFn: async () => {
      if (!consultaId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('consulta_solicitud_docs')
        .select('*, responsable_profile:profiles!consulta_solicitud_docs_responsable_id_fkey(nombre, apellido)')
        .eq('consulta_id', consultaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as SolicitudDoc[]
    },
    enabled: !!consultaId,
  })
}

export function useCreateSolicitudDoc() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async (payload: {
      consulta_id: string
      descripcion: string
      responsable_id?: string | null
      notas?: string | null
      fecha_limite?: string | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('consulta_solicitud_docs')
        .insert({ ...payload, created_by: profile?.id ?? '', updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-solicitud-docs', vars.consulta_id] })
    },
  })
}

export function useUpdateSolicitudDoc() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<SolicitudDoc> & { id: string; consulta_id: string }) => {
      const { id, consulta_id: _cid, ...rest } = payload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('consulta_solicitud_docs')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-solicitud-docs', vars.consulta_id] })
    },
  })
}

export function useDeleteSolicitudDoc() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; consulta_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('consulta_solicitud_docs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta-solicitud-docs', vars.consulta_id] })
    },
  })
}

// ---------------------------------------------------------------------------
// Perfil CRITERIO
// ---------------------------------------------------------------------------

export function useCriterioProfile() {
  const supabase = createClient()
  return useQuery<{ id: string; nombre: string | null; apellido: string | null } | null>({
    queryKey: ['criterio-profile'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido')
        .eq('rol', 'CRITERIO')
        .eq('activo', true)
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Cambiar estado (pipeline)
// ---------------------------------------------------------------------------

interface CambiarEstadoInput {
  consultaId: string
  estado: ConsultaEstado
  estadoNotas?: string
  assignedTo?: string | null
  alertaDestinatarioId?: string
  alertaTitulo?: string
  alertaMensaje?: string
  nombreCliente?: string
}

export function useCambiarEstadoConsulta() {
  const supabase = createClient()
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async ({
      consultaId, estado, estadoNotas, assignedTo,
      alertaDestinatarioId, alertaTitulo, alertaMensaje,
    }: CambiarEstadoInput) => {
      const updatePayload: Record<string, unknown> = {
        estado,
        updated_at: new Date().toISOString(),
      }
      if (estadoNotas !== undefined) updatePayload.estado_notas = estadoNotas
      if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo

      const { error: upErr } = await (supabase as any)
        .from('consultas').update(updatePayload).eq('id', consultaId)
      if (upErr) throw upErr

      await (supabase as any).from('consulta_actividad').insert({
        consulta_id: consultaId,
        tipo: 'cambio_estado',
        descripcion: `Estado: ${ESTADO_LABEL[estado]}${estadoNotas ? ` — ${estadoNotas}` : ''}`,
        created_by: userId,
      })

      if (alertaDestinatarioId && alertaTitulo) {
        await (supabase as any).from('alertas').insert({
          tipo: 'TAREA_ASIGNADA',
          titulo: alertaTitulo,
          mensaje: alertaMensaje ?? '',
          destinatario_id: alertaDestinatarioId,
          prioridad: 'ALTA',
          payload: { consulta_id: consultaId },
        })

        const { data: { session } } = await supabase.auth.getSession()
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-alert-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            tipo: 'TAREA_ASIGNADA',
            usuario_id: alertaDestinatarioId,
            titulo: alertaTitulo,
            mensaje: alertaMensaje ?? '',
            url: `/consultas/${consultaId}`,
          }),
        }).catch(e => console.error('[cambiarEstado] dispatch error', e))
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consulta', vars.consultaId] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Conteo por estado (dashboard widget)
// ---------------------------------------------------------------------------

export function useConsultasConteo() {
  const supabase = createClient()
  return useQuery<Record<ConsultaEstado, number>>({
    queryKey: ['consultas-conteo'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('consultas')
        .select('estado')
        .not('estado', 'in', '(convertida,resuelta,descartada)')
      const conteo: Record<string, number> = {}
      for (const row of (data ?? [])) {
        conteo[row.estado] = (conteo[row.estado] ?? 0) + 1
      }
      return conteo as Record<ConsultaEstado, number>
    },
    staleTime: 60_000,
  })
}
