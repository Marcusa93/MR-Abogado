import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import type { EstadoInterno, Prioridad } from '@/types/enums'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { sanitizeForPostgrest } from '@/lib/utils/sanitize-search'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortField = 'caratula' | 'estado_interno' | 'prioridad' | 'fecha_alta' | 'updated_at'

export interface ExpedientesFilters {
  estado_interno?: EstadoInterno | null
  tipo_tramite_id?: string | null
  prioridad?: Prioridad | null
  search?: string | null
  page?: number
  pageSize?: number
  sortBy?: SortField
  sortOrder?: 'asc' | 'desc'
}

export type ExpedienteWithRelations = Tables<'expedientes'> & {
  clientes: Tables<'clientes'> | null
  tipos_tramite: Tables<'tipos_tramite'> | null
  miembros: { rol: string; perfil: { nombre: string; apellido: string } | null }[]
  // Minimal data for semáforo computation
  audiencias: Pick<Tables<'audiencias'>, 'id' | 'estado' | 'fecha'>[]
  tareas: Pick<Tables<'tareas'>, 'id' | 'estado'>[]
}

export type ExpedienteDetail = Tables<'expedientes'> & {
  clientes: Tables<'clientes'> | null
  tipos_tramite: Tables<'tipos_tramite'> | null
  miembros: { rol: string; perfil: { nombre: string; apellido: string } | null }[]
  audiencias: Tables<'audiencias'>[]
  seguimientos: Tables<'seguimientos'>[]
  tareas: (Tables<'tareas'> & {
    asignado: Tables<'profiles'> | null
  })[]
  expediente_notas: (Tables<'expediente_notas'> & {
    author: Tables<'profiles'> | null
  })[]
}

interface PaginatedResult<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const expedientesKeys = {
  all: ['expedientes'] as const,
  lists: () => [...expedientesKeys.all, 'list'] as const,
  list: (filters: ExpedientesFilters) =>
    [...expedientesKeys.lists(), filters] as const,
  details: () => [...expedientesKeys.all, 'detail'] as const,
  detail: (id: string) => [...expedientesKeys.details(), id] as const,
}

// ---------------------------------------------------------------------------
// useExpedientes - Paginated list with filters
// ---------------------------------------------------------------------------

export function useExpedientes(filters: ExpedientesFilters = {}) {
  const supabase = createClient()
  const {
    estado_interno,
    tipo_tramite_id,
    prioridad,
    search,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    sortBy = 'caratula',
    sortOrder = 'asc',
  } = filters

  return useQuery<PaginatedResult<ExpedienteWithRelations>>({
    queryKey: expedientesKeys.list(filters),
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('expedientes')
        .select(
          `
          *,
          clientes (id, nombre, apellido, telefono),
          tipos_tramite (id, nombre),
          miembros:expediente_miembros(rol, perfil:profiles!expediente_miembros_profile_id_fkey(nombre, apellido)),
          audiencias (id, estado, fecha),
          tareas (id, estado)
        `,
          { count: 'exact' }
        )
        .is('deleted_at', null)
        .order(sortBy, { ascending: sortOrder === 'asc' })

      // Apply filters
      if (estado_interno) {
        query = query.eq('estado_interno', estado_interno)
      }

      if (tipo_tramite_id) {
        query = query.eq('tipo_tramite_id', tipo_tramite_id)
      }

      if (prioridad) {
        query = query.eq('prioridad', prioridad)
      }

      if (search && search.trim().length > 0) {
        const sanitized = sanitizeForPostgrest(search.trim())
        if (sanitized.length > 0) {
          // Step 1: Find client IDs matching the search term
          const clientTerm = `%${sanitized}%`
          const { data: matchingClients } = await supabase
            .from('clientes')
            .select('id')
            .or(`apellido.ilike.${clientTerm},nombre.ilike.${clientTerm}`)
            .limit(100)

          const clientIds = (matchingClients ?? []).map((c: any) => c.id)

          // Step 2: Search expedientes by local columns OR by matching client IDs
          const term = `%${sanitized}%`
          if (clientIds.length > 0) {
            query = query.or(
              `numero.ilike.${term},caratula.ilike.${term},observaciones.ilike.${term},cliente_id.in.(${clientIds.join(',')})`
            )
          } else {
            query = query.or(
              `numero.ilike.${term},caratula.ilike.${term},observaciones.ilike.${term}`
            )
          }
        }
      }

      // Pagination
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      const totalCount = count ?? 0

      return {
        data: (data ?? []) as ExpedienteWithRelations[],
        count: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      }
    },
    placeholderData: keepPreviousData,
  })
}

// ---------------------------------------------------------------------------
// useExpediente - Single expediente with all related data
// ---------------------------------------------------------------------------

export function useExpediente(id: string | undefined) {
  const supabase = createClient()

  return useQuery<ExpedienteDetail | null>({
    queryKey: expedientesKeys.detail(id!),
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabase
        .from('expedientes')
        .select(
          `
          *,
          clientes (*),
          tipos_tramite (*),
          miembros:expediente_miembros(rol, perfil:profiles!expediente_miembros_profile_id_fkey(nombre, apellido)),
          audiencias (*),
          seguimientos (*),
          tareas (
            *,
            asignado:profiles!tareas_asignado_a_fkey (*)
          ),
          expediente_notas (
            *,
            author:profiles!expediente_notas_created_by_fkey (*)
          )
        `
        )
        .eq('id', id)
        .single()

      if (error) throw error

      return data as ExpedienteDetail
    },
    enabled: !!id,
  })
}

// ---------------------------------------------------------------------------
// useCreateExpediente - Creates via RPC (auto-generates numero EXP-YYYY-NNNN)
// ---------------------------------------------------------------------------

interface CreateExpedienteInput {
  cliente_id: string
  tipo_tramite_id: string
  contador_id?: string | null
  secretaria_id?: string | null
  organismo_id?: string | null
  prioridad?: Prioridad
  estado_interno?: string | null
  es_propio?: boolean
  observaciones?: string | null
  pacto_honorarios?: string | null
  pacto_honorarios_valor?: number | null
}

export function useCreateExpediente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateExpedienteInput) => {
      const { data, error } = await supabase.rpc('create_expediente', {
        p_cliente_id: input.cliente_id,
        p_tipo_tramite_id: input.tipo_tramite_id,
        p_organismo_id: input.organismo_id ?? undefined,
        p_prioridad: input.prioridad ?? 'MEDIA',
        p_es_propio: input.es_propio ?? true,
        p_observaciones: input.observaciones ?? undefined,
      })

      if (error) throw error

      // Update fields not supported by the RPC
      const expId = typeof data === 'object' && data !== null && 'id' in data ? (data as any).id : data
      if (expId) {
        const updates: Record<string, unknown> = {}
        if (input.pacto_honorarios) {
          updates.pacto_honorarios = input.pacto_honorarios
          updates.pacto_honorarios_valor = input.pacto_honorarios_valor ?? null
        }
        if (input.estado_interno && input.estado_interno !== 'NUEVA_CONSULTA') {
          updates.estado_interno = input.estado_interno
        }
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('expedientes')
            .update(updates)
            .eq('id', expId as string)
        }
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expedientesKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdateExpediente - PATCH update
// ---------------------------------------------------------------------------

export function useUpdateExpediente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: TablesUpdate<'expedientes'> & { id: string }) => {
      const { data, error } = await supabase
        .from('expedientes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: expedientesKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: expedientesKeys.detail(data.id),
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      queryClient.invalidateQueries({ queryKey: ['panel-estudio'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useCambiarEstado - Changes state via RPC
// ---------------------------------------------------------------------------

interface CambiarEstadoInput {
  expediente_id: string
  nuevo_estado: EstadoInterno
  motivo?: string | null
}

export function useCambiarEstado() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CambiarEstadoInput) => {
      const { data, error } = await supabase.rpc(
        'cambiar_estado_expediente',
        {
          p_expediente_id: input.expediente_id,
          p_nuevo_estado: input.nuevo_estado,
          p_motivo: input.motivo ?? '',
        }
      )

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: expedientesKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: expedientesKeys.detail(variables.expediente_id),
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteExpediente - Soft delete via RPC (admin only)
// ---------------------------------------------------------------------------

export function useDeleteExpediente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (expedienteId: string) => {
      const { data, error } = await (supabase.rpc as any)('soft_delete_expediente', {
        p_expediente_id: expedienteId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expedientesKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useTiposTramite - Reference data for tipo_tramite dropdowns
// ---------------------------------------------------------------------------

export function useTiposTramite() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tipos_tramite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_tramite')
        .select('*')
        .eq('activo', true)
        .order('nombre')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// useAbogados - Reference data for abogado/responsable dropdowns
// ---------------------------------------------------------------------------

export function useAbogados() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['abogados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, rol')
        .eq('activo', true)
        .in('rol', ['ADMIN', 'ABOGADO'])
        .order('apellido')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// useUltimoCambioEstado - Lightweight: only last state change date for metrics
// ---------------------------------------------------------------------------

export function useUltimoCambioEstado(expedienteId: string | undefined) {
  const supabase = createClient()

  return useQuery<string | null>({
    queryKey: [...expedientesKeys.detail(expedienteId!), 'ultimo-cambio-estado'],
    enabled: !!expedienteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('historial_estados_expediente')
        .select('created_at')
        .eq('expediente_id', expedienteId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.created_at ?? null
    },
  })
}

// ---------------------------------------------------------------------------
// useExpedienteTimeline - Build timeline from multiple tables
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  id: string
  tipo: 'estado' | 'seguimiento' | 'turno' | 'nota' | 'tarea' | 'documento'
  fecha: string
  titulo: string
  detalle: string | null
  usuario_nombre: string | null
  metadata?: Record<string, unknown>
}

export function useExpedienteTimeline(expedienteId: string | undefined, options?: { enabled?: boolean }) {
  const supabase = createClient()

  return useQuery<TimelineEvent[]>({
    queryKey: [...expedientesKeys.detail(expedienteId!), 'timeline'],
    enabled: !!expedienteId && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const [historial, seguimientos, audiencias, notas] = await Promise.all([
        supabase
          .from('historial_estados_expediente')
          .select('*, changed_by_profile:profiles!historial_estados_expediente_changed_by_fkey(nombre, apellido)')
          .eq('expediente_id', expedienteId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('seguimientos')
          .select('*, created_by_profile:profiles!seguimientos_created_by_fkey(nombre, apellido)')
          .eq('expediente_id', expedienteId!)
          .order('fecha_control', { ascending: false }),
        supabase
          .from('audiencias')
          .select('*, created_by_profile:profiles!audiencias_created_by_fkey(nombre, apellido)')
          .eq('expediente_id', expedienteId!)
          .order('fecha', { ascending: false }),
        supabase
          .from('expediente_notas')
          .select('*, created_by_profile:profiles!expediente_notas_created_by_fkey(nombre, apellido)')
          .eq('expediente_id', expedienteId!)
          .order('created_at', { ascending: false }),
      ])

      // FIX: Verificar errores de cada query (Supabase no lanza excepciones)
      const firstError =
        historial.error ?? seguimientos.error ?? audiencias.error ?? notas.error
      if (firstError) throw firstError

      const events: TimelineEvent[] = []

      for (const h of historial.data ?? []) {
        const p = h.changed_by_profile as { nombre: string; apellido: string } | null
        events.push({
          id: h.id,
          tipo: 'estado',
          fecha: h.created_at,
          titulo: `Estado cambiado a ${h.estado_nuevo}`,
          detalle: h.motivo,
          usuario_nombre: p ? `${p.nombre} ${p.apellido}` : null,
          metadata: { estado_anterior: h.estado_anterior, estado_nuevo: h.estado_nuevo },
        })
      }

      for (const s of seguimientos.data ?? []) {
        const p = s.created_by_profile as { nombre: string; apellido: string } | null
        events.push({
          id: s.id,
          tipo: 'seguimiento',
          fecha: s.fecha_control,
          titulo: `Seguimiento via ${s.canal}`,
          detalle: (s as any).estado_organismo_reportado ?? s.observacion,
          usuario_nombre: p ? `${p.nombre} ${p.apellido}` : null,
        })
      }

      for (const t of audiencias.data ?? []) {
        const p = t.created_by_profile as unknown as { nombre: string; apellido: string } | null
        events.push({
          id: t.id,
          tipo: 'turno',
          fecha: t.fecha,
          titulo: `Turno: ${(t as any).tipo_turno} (${t.estado})`,
          detalle: (t as any).notas,
          usuario_nombre: p ? `${p.nombre} ${p.apellido}` : null,
        })
      }

      for (const n of notas.data ?? []) {
        const p = n.created_by_profile as { nombre: string; apellido: string } | null
        events.push({
          id: n.id,
          tipo: 'nota',
          fecha: n.created_at,
          titulo: 'Nota agregada',
          detalle: n.contenido,
          usuario_nombre: p ? `${p.nombre} ${p.apellido}` : null,
        })
      }

      events.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      return events
    },
  })
}
