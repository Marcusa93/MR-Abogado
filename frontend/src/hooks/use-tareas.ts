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
          asignado:profiles!tareas_asignado_a_fkey (id, nombre, apellido)
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
        query = query.eq('asignado_a', asignado_a)
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
        data: (data ?? []) as TareaWithRelations[],
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

  return useMutation({
    mutationFn: async (tareaId: string) => {
      const { data, error } = await supabase
        .from('tareas')
        .update({
          estado: 'COMPLETADA',
          fecha_completada: new Date().toISOString(),
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
  asignado_a?: string | null
  tipo_tarea_id?: string | null
}

export function useUpdateTarea() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateTareaInput) => {
      const { id, asignado_a, ...rest } = input
      const payload: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      if (asignado_a !== undefined) {
        payload.asignado_a = asignado_a ?? ''
      }
      const { data, error } = await supabase
        .from('tareas')
        .update(payload)
        .eq('id', id)
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
      toast.success('Tarea actualizada')
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
    mutationFn: async (input: TablesInsert<'tareas'>) => {
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

      // Create notification for the assigned user
      if (data.asignado_a && data.expediente_id) {
        const exp = (data as any).expediente as
          | { numero?: string | null; numero_expediente?: string | null; caratula?: string | null }
          | null
        const expLabel = exp?.caratula
          || exp?.numero_expediente
          || exp?.numero
          || null
        const titulo = expLabel
          ? `Nueva tarea en ${expLabel}: ${data.titulo}`
          : `Nueva tarea asignada: ${data.titulo}`
        const mensaje = data.descripcion
          ? data.descripcion
          : expLabel
            ? `Se te asignó una tarea en el expediente ${expLabel}.`
            : 'Se te asignó una nueva tarea.'

        // El dispatch (push/email) lo dispara automáticamente el trigger
        // alertas_dispatch_notification (migración 00045) tras el INSERT.
        await supabase.from('alertas').insert({
          tipo: 'TAREA_ASIGNADA',
          titulo,
          mensaje,
          expediente_id: data.expediente_id,
          usuario_id: data.asignado_a,
          link: `/expedientes/${data.expediente_id}`,
          payload: { tarea_id: data.id },
        } as never)
      }

      // Create MENCION alerts for @mentioned users in description
      if (data.descripcion && data.expediente_id) {
        const mentions = parseMentions(data.descripcion)
        const currentUserId = profile?.id
        const authorName = profile ? `${profile.nombre} ${profile.apellido}` : 'Alguien'
        const toNotify = mentions.filter(
          (m) => m.userId !== currentUserId && m.userId !== data.asignado_a,
        )
        if (toNotify.length > 0) {
          await supabase.from('alertas').insert(
            toNotify.map((m) => ({
              tipo: 'MENCION' as const,
              titulo: `${authorName} te mencionó en una tarea`,
              mensaje: data.descripcion!.substring(0, 200),
              expediente_id: data.expediente_id,
              usuario_id: m.userId,
              link: `/expedientes/${data.expediente_id}`,
              payload: { tarea_id: data.id },
            })) as never,
          )
        }
      }

      queryClient.invalidateQueries({ queryKey: ['alertas'] })
    },
  })
}
