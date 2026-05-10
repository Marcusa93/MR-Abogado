import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { sanitizeForPostgrest } from '@/lib/utils/sanitize-search'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientesFilters {
  search?: string | null
  activo?: boolean
  page?: number
  pageSize?: number
}

export type ClienteListItem = Tables<'clientes'> & {
  expedientes: { id: string; estado_interno: string }[]
  ultimo_contacto?: string | null
}

export type ClienteWithExpedientes = Tables<'clientes'> & {
  expedientes: Tables<'expedientes'>[]
}

interface PaginatedResult<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

interface SearchClienteResult {
  id: string
  dni: string
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const clientesKeys = {
  all: ['clientes'] as const,
  lists: () => [...clientesKeys.all, 'list'] as const,
  list: (filters: ClientesFilters) =>
    [...clientesKeys.lists(), filters] as const,
  details: () => [...clientesKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientesKeys.details(), id] as const,
  search: (term: string) =>
    [...clientesKeys.all, 'search', term] as const,
}

// ---------------------------------------------------------------------------
// useClientes - Paginated list with search
// ---------------------------------------------------------------------------

export function useClientes(filters: ClientesFilters = {}) {
  const supabase = createClient()
  const {
    search,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters

  return useQuery<PaginatedResult<ClienteListItem>>({
    queryKey: clientesKeys.list(filters),
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('clientes')
        .select('*, expedientes(id, estado_interno)', { count: 'exact' })
        .is('deleted_at', null)
        .order('apellido', { ascending: true })
        .order('nombre', { ascending: true })

      if (search && search.trim().length > 0) {
        // FIX: Sanitizar input para prevenir PostgREST filter injection
        const sanitized = sanitizeForPostgrest(search.trim())
        if (sanitized.length > 0) {
          const term = `%${sanitized}%`
          query = query.or(
            `nombre.ilike.${term},apellido.ilike.${term},dni.ilike.${term},cuil.ilike.${term},email.ilike.${term},telefono.ilike.${term}`
          )
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
        data: (data ?? []) as ClienteListItem[],
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
// useCliente - Single client with their expedientes
// ---------------------------------------------------------------------------

export function useCliente(id: string | undefined) {
  const supabase = createClient()

  return useQuery<ClienteWithExpedientes | null>({
    queryKey: clientesKeys.detail(id!),
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabase
        .from('clientes')
        .select(
          `
          *,
          expedientes (*)
        `
        )
        .eq('id', id)
        .single()

      if (error) throw error

      return data as ClienteWithExpedientes
    },
    enabled: !!id,
  })
}

// ---------------------------------------------------------------------------
// useSearchClientes - Autocomplete search via RPC
// ---------------------------------------------------------------------------

export function useSearchClientes(term: string) {
  const supabase = createClient()

  return useQuery<SearchClienteResult[]>({
    queryKey: clientesKeys.search(term),
    queryFn: async () => {
      if (!term || term.trim().length < 2) return []

      const { data, error } = await (supabase.rpc as any)('search_clientes', {
        p_search_term: term.trim(),
      })

      if (error) throw error

      return (data ?? []) as SearchClienteResult[]
    },
    enabled: term.trim().length >= 2,
    staleTime: 30 * 1000, // 30 seconds
  })
}

// ---------------------------------------------------------------------------
// useCreateCliente - Insert mutation
// ---------------------------------------------------------------------------

export function useCreateCliente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TablesInsert<'clientes'>) => {
      const { data, error } = await supabase
        .from('clientes')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientesKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdateCliente - Patch mutation
// ---------------------------------------------------------------------------

export function useUpdateCliente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: TablesUpdate<'clientes'> & { id: string }) => {
      const { data, error } = await supabase
        .from('clientes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: clientesKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: clientesKeys.detail(data.id),
      })
      queryClient.invalidateQueries({ queryKey: ['expedientes'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteCliente - Soft delete via RPC (admin only)
// ---------------------------------------------------------------------------

export function useDeleteCliente() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (clienteId: string) => {
      const { data, error } = await supabase.rpc('soft_delete_cliente', {
        cliente_id: clienteId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientesKeys.lists() })
    },
  })
}
