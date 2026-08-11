import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables, TablesInsert } from '@/types/database.types'
import type { EstadoTarea, Prioridad } from '@/types/enums'
import { parseMentions } from '@/lib/utils/mentions'
import { useAuthStore } from '@/stores/auth-store'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TareaSortField = 'fecha_vencimiento' | 'prioridad' | 'titulo' | 'created_at'

export interface TareasFilters {
  expediente_id?: string | null
  asignado_a?: string | null
  estado?: EstadoTarea | null
  prioridad?: Prioridad | null
  vencidas?: boolean
  includeArchivadas?: boolean
  search?: string
  sortBy?: TareaSortField
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /** ISO date string (YYYY-MM-DD). Filter tasks with fecha_vencimiento >= dateFrom */
  dateFrom?: string | null
  /** ISO date string (YYYY-MM-DD). Filter tasks with fecha_vencimiento <= dateTo */
  dateTo?: string | null
  /** 'libre' = sin expediente, 'expediente' = con expediente */
  tipoFiltro?: 'libre' | 'expediente' | null
}

export type TareaClienteInfo = Pick<
  Tables<'clientes'>,
  'id' | 'nombre' | 'apellido' | 'dni' | 'cuil'
> & {
  clave_arca?: string | null
}

export type TareaWithRelations = Tables<'tareas'> & {
  expediente:
    | (Pick<Tables<'expedientes'>, 'id' | 'numero' | 'caratula'> & {
        numero_expediente?: string | null
        clientes: TareaClienteInfo | null
      })
    | null
  asignado: Tables<'profiles'> | null
  /** Columna agregada en migración 20260715000000 — no figura aún en database.types.ts */
  etiquetas?: string[] | null
  /** Columna agregada en migración 20260715010000 — no figura aún en database.types.ts */
  asignados?: string[] | null
  /** Columna agregada en migración 20260811 — vincula la tarea a una consulta */
  consulta_id?: string | null
  consulta?: { id: string; nombre: string; apellido: string | null } | null
}

/**
 * Build a human-readable label for the expediente.
 * Fallback order: caratula → numero_expediente → "numero — Cliente Apellido" → numero → '—'
 */
export function expedienteLabel(
  expediente: TareaWithRelations['expediente'],
): string {
  if (!expediente) return ''
  if (expediente.caratula) return expediente.caratula
  if (expediente.numero_expediente) return expediente.numero_expediente
  const clienteName = expediente.clientes
    ? `${expediente.clientes.nombre ?? ''} ${expediente.clientes.apellido ?? ''}`.trim()
    : ''
  if (expediente.numero && clienteName) return `${expediente.numero} — ${clienteName}`
  return expediente.numero || clienteName || ''
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

export const tareasKeys = {
  all: ['tareas'] as const,
  lists: () => [...tareasKeys.all, 'list'] as const,
  list: (filters: TareasFilters) =>
    [...tareasKeys.lists(), filters] as const,
}

// ---------------------------------------------------------------------------
// useTareas - Filtered task list
// ---------------------------------------------------------------------------

export function useTareas(filters: TareasFilters = {}) {
  const supabase = createClient()
  const {
    expediente_id,
    asignado_a,
    estado,
    prioridad,
    vencidas,
    includeArchivadas,
    search,
    sortBy = 'fecha_vencimiento',
    sortOrder = 'asc',
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    dateFrom,
    dateTo,
    tipoFiltro,
  } = filters

  return useQuery<PaginatedResult<TareaWithRelations>>({
    queryKey: tareasKeys.list(filters),
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('tareas')
        .select(
          `
          *,
          expediente:expedientes!tareas_expediente_id_fkey (
            id,
            numero,
            caratula,
            clientes (id, nombre, apellido, dni, cuil)
          ),
          asignado:profiles!tareas_asignado_a_fkey (id, nombre, apellido),
          consulta:consultas!tareas_consulta_id_fkey (id, nombre, apellido)
        `,
          { count: 'exact' }
        )
        .order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: false })

      // Secondary sort for stability
      if (sortBy !== 'fecha_vencimiento') {
        query = query.order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      }

      // archivada column removed — filtering handled by estado below

      if (expediente_id) {
        query = query.eq('expediente_id', expediente_id)
      }

      if (asignado_a) {
        query = query.contains('asignados', [asignado_a])
      }

      if (estado) {
        query = query.eq('estado', estado)
      } else {
        // By default, exclude cancelled tasks
        query = query.neq('estado', 'CANCELADA')
      }

      if (prioridad) {
        query = query.eq('prioridad', prioridad)
      }

      if (vencidas) {
        query = query
          .lt('fecha_vencimiento', new Date().toISOString().split('T')[0])
          .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      }

      if (dateFrom) {
        query = query.gte('fecha_vencimiento', dateFrom)
      }

      if (dateTo) {
        query = query.lte('fecha_vencimiento', dateTo)
      }

      if (tipoFiltro === 'libre') {
        query = query.is('expediente_id', null)
      } else if (tipoFiltro === 'expediente') {
        query = query.not('expediente_id', 'is', null)
      }

      if (search && search.trim().length > 0) {
        const term = `%${search.trim().replace(/[%_\\]/g, '')}%`
        query = query.or(
          `titulo.ilike.${term},descripcion.ilike.${term}`
        )
      }

      // Pagination
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      const totalCount = count ?? 0

      return {
        data: (data ?? []) as unknown as TareaWithRelations[],
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
// useCompletarTarea - Mark task as completed
// ---------------------------------------------------------------------------

export function useCompletarTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profile = useAuthStore(s => s.profile)

  return useMutation({
    mutationFn: async (tareaId: string) => {
      const { data, error } = await supabase
        .from('tareas')
        .update({
          estado: 'COMPLETADA',
          completada_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tareaId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      // Notificar al creador si es distinto de quien completó
      if (data.created_by && data.created_by !== profile?.id) {
        supabase.from('alertas').insert({
          tipo: 'ESTADO_CAMBIO',
          titulo: `Tarea completada: ${data.titulo}`,
          mensaje: `${profile?.nombre ?? 'Alguien'} marcó como completada: "${data.titulo}".`,
          expediente_id: data.expediente_id ?? null,
          destinatario_id: data.created_by,
          payload: {
            tarea_id: data.id,
            link: data.expediente_id ? `/expedientes/${data.expediente_id}` : '/tareas',
          },
        } as never).then(() => {}, () => {})
      }
      // Also invalidate the parent expediente detail
      if (data.expediente_id) {
        queryClient.invalidateQueries({
          queryKey: ['expedientes', 'detail', data.expediente_id],
        })
      }
      toast.success('Tarea completada')
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteTarea - Hard delete (admin only)
// ---------------------------------------------------------------------------

export function useDeleteTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tareaId, expedienteId }: { tareaId: string; expedienteId?: string }) => {
      const { error } = await supabase
        .from('tareas')
        .delete()
        .eq('id', tareaId)

      if (error) throw error
      return { expedienteId }
    },
    onSuccess: ({ expedienteId }) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      if (expedienteId) {
        queryClient.invalidateQueries({
          queryKey: ['expedientes', 'detail', expedienteId],
        })
      }
      toast.success('Tarea eliminada')
    },
  })
}

// ---------------------------------------------------------------------------
// useArchivarTarea - Soft archive (completed tasks)
// ---------------------------------------------------------------------------

export function useArchivarTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tareaId: string) => {
      // archivada column removed — mark as COMPLETADA instead
      const { data, error } = await supabase
        .from('tareas')
        .update({
          estado: 'COMPLETADA',
          completada_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tareaId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      if (data.expediente_id) {
        queryClient.invalidateQueries({
          queryKey: ['expedientes', 'detail', data.expediente_id],
        })
      }
      toast.success('Tarea archivada')
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdateTarea - Edit an existing task
// ---------------------------------------------------------------------------

export interface UpdateTareaInput {
  id: string
  titulo?: string
  descripcion?: string | null
  prioridad?: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  estado?: EstadoTarea
  fecha_vencimiento?: string | null
  /** @deprecated Usar asignados[] para multi-asignación. Si solo se pasa este campo se sincroniza con asignados. */
  asignado_a?: string | null
  asignados?: string[]
  etiquetas?: string[]
  /** Valor anterior de asignado_a, para detectar reasignación y notificar. */
  prevAsignadoA?: string | null
  /** Valor anterior de asignados[], para detectar reasignaciones y notificar. */
  prevAsignados?: string[]
}

export function useUpdateTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateTareaInput) => {
      const { id, asignado_a, asignados, prevAsignadoA: _prev, prevAsignados: _prev2, ...rest } = input
      const payload: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      if (asignados !== undefined) {
        payload.asignados = asignados
        payload.asignado_a = asignados[0] ?? ''
      } else if (asignado_a !== undefined) {
        payload.asignado_a = asignado_a ?? ''
        payload.asignados = asignado_a ? [asignado_a] : []
      }
      const { data, error } = await supabase
        .from('tareas')
        .update(payload)
        .eq('id', id)
        .select(`
          *,
          expediente:expedientes!tareas_expediente_id_fkey (id, numero, caratula)
        `)
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async (data, input) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      if (data.expediente_id) {
        queryClient.invalidateQueries({
          queryKey: ['expedientes', 'detail', data.expediente_id],
        })
      }
      toast.success('Tarea actualizada')

      // Notificar a todos los asignados recién agregados
      const nuevosAsignados = input.asignados ?? (input.asignado_a ? [input.asignado_a] : [])
      const prevAsignados = input.prevAsignados ?? (input.prevAsignadoA ? [input.prevAsignadoA] : [])
      const recienAgregados = nuevosAsignados.filter(id => !prevAsignados.includes(id))

      if (recienAgregados.length > 0) {
        const exp = (data as unknown as { expediente?: { numero?: string | null; caratula?: string | null } | null }).expediente
        const expLabel = exp?.caratula ?? exp?.numero ?? null
        const titulo = expLabel
          ? `Tarea reasignada en ${expLabel}: ${data.titulo}`
          : `Tarea reasignada: ${data.titulo}`
        try {
          await supabase.from('alertas').insert(
            recienAgregados.map(userId => ({
              tipo: 'TAREA_ASIGNADA',
              titulo,
              mensaje: expLabel
                ? `Se te asignó una tarea en el expediente ${expLabel}.`
                : 'Se te asignó una tarea.',
              expediente_id: data.expediente_id ?? null,
              destinatario_id: userId,
              payload: { tarea_id: data.id, link: data.expediente_id ? `/expedientes/${data.expediente_id}` : null },
            })) as never
          )
        } catch (e) {
          console.error('[useUpdateTarea] insert alertas TAREA_ASIGNADA falló', e)
        }
      }
    },
    onError: (err) => {
      toast.error('Error al actualizar', err instanceof Error ? err.message : 'Error desconocido')
    },
  })
}

// ---------------------------------------------------------------------------
// useCreateTarea - Insert a new task
// ---------------------------------------------------------------------------

export function useCreateTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profile = useAuthStore((s) => s.profile)

  return useMutation({
    mutationFn: async (input: TablesInsert<'tareas'> & { asignados?: string[] }) => {
      const { data, error } = await supabase
        .from('tareas')
        .insert(input)
        .select(`
          *,
          expediente:expedientes!tareas_expediente_id_fkey (
            id,
            numero,
            caratula
          )
        `)
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      // Also invalidate the parent expediente detail
      if (data.expediente_id) {
        queryClient.invalidateQueries({
          queryKey: ['expedientes', 'detail', data.expediente_id],
        })
      }

      // Notificar a todos los asignados
      const asignadosIds: string[] = ((data as any).asignados as string[] | undefined)
        ?? (data.asignado_a ? [data.asignado_a] : [])
      const currentUserId = profile?.id
      const toNotifyAssigned = asignadosIds.filter(id => id && id !== currentUserId)

      if (toNotifyAssigned.length > 0) {
        const exp = (data as any).expediente as
          | { numero?: string | null; numero_expediente?: string | null; caratula?: string | null }
          | null
        const expLabel = exp?.caratula || exp?.numero_expediente || exp?.numero || null
        const titulo = expLabel
          ? `Nueva tarea en ${expLabel}: ${data.titulo}`
          : `Nueva tarea asignada: ${data.titulo}`
        const mensaje = data.descripcion
          ? data.descripcion
          : expLabel
            ? `Se te asignó una tarea en el expediente ${expLabel}.`
            : 'Se te asignó una nueva tarea.'

        try {
          await supabase.from('alertas').insert(
            toNotifyAssigned.map(userId => ({
              tipo: 'TAREA_ASIGNADA',
              titulo,
              mensaje,
              expediente_id: data.expediente_id ?? null,
              destinatario_id: userId,
              payload: {
                tarea_id: data.id,
                link: data.expediente_id ? `/expedientes/${data.expediente_id}` : '/tareas',
              },
            })) as never
          )
        } catch (e) {
          console.error('[useCreateTarea] insert alertas TAREA_ASIGNADA falló', e)
        }
      }

      // Create MENCION alerts for @mentioned users in description
      if (data.descripcion && data.expediente_id) {
        const mentions = parseMentions(data.descripcion)
        const authorName = profile ? `${profile.nombre} ${profile.apellido}` : 'Alguien'
        const toNotify = mentions.filter(
          (m) => m.userId !== currentUserId && !asignadosIds.includes(m.userId),
        )
        if (toNotify.length > 0) {
          try {
            await supabase.from('alertas').insert(
              toNotify.map((m) => ({
                tipo: 'MENCION' as const,
                titulo: `${authorName} te mencionó en una tarea`,
                mensaje: data.descripcion!.substring(0, 200),
                expediente_id: data.expediente_id,
                destinatario_id: m.userId,
                payload: { tarea_id: data.id, link: `/expedientes/${data.expediente_id}` },
              })) as never,
            )
          } catch (e) {
            console.error('[useCreateTarea] insert alertas MENCION falló', e)
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['alertas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useReopenTarea - Reabrir tarea completada
// ---------------------------------------------------------------------------

export function useReopenTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tareaId: string) => {
      const { data, error } = await supabase
        .from('tareas')
        .update({
          estado: 'PENDIENTE',
          completada_at: null,
          completada_por: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', tareaId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tareasKeys.all })
      if (data.expediente_id) {
        queryClient.invalidateQueries({ queryKey: ['expedientes', 'detail', data.expediente_id] })
      }
      toast.success('Tarea reabierta')
    },
  })
}

// ---------------------------------------------------------------------------
// Comentarios de tarea
// ---------------------------------------------------------------------------

export interface TareaComentario {
  id: string
  tarea_id: string
  contenido: string
  created_by: string
  created_at: string
  autor?: { nombre: string | null; apellido: string | null } | null
}

export function useTareaComentarios(tareaId: string | undefined) {
  const supabase = createClient()
  return useQuery<TareaComentario[]>({
    queryKey: ['tarea-comentarios', tareaId],
    queryFn: async () => {
      if (!tareaId) return []
      const { data, error } = await (supabase as any)
        .from('tarea_comentarios')
        .select('*, autor:profiles!tarea_comentarios_created_by_fkey(nombre, apellido)')
        .eq('tarea_id', tareaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TareaComentario[]
    },
    enabled: !!tareaId,
  })
}

export function useAddTareaComentario() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async ({ tareaId, contenido }: { tareaId: string; contenido: string }) => {
      const { error } = await (supabase as any)
        .from('tarea_comentarios')
        .insert({ tarea_id: tareaId, contenido, created_by: profile?.id ?? '' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tarea-comentarios', vars.tareaId] })
    },
  })
}
