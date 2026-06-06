import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ExpedienteHit {
  id: string
  numero: string | null
  caratula: string | null
  cliente_label: string | null
  estado: string | null
}

export interface ClienteHit {
  id: string
  nombre: string
  apellido: string
  dni: string | null
  cuil: string | null
}

export interface ChunkHit {
  chunk_id: number | string
  score: number
  snippet: string
  meta: Record<string, unknown>
}

export interface GlobalSearchResponse {
  query: string
  semantic_used: boolean
  expedientes: ExpedienteHit[]
  clientes: ClienteHit[]
  normativa: ChunkHit[]
  jurisprudencia: ChunkHit[]
  audiencias: ChunkHit[]
  adjuntos: ChunkHit[]
}

export function useGlobalSearch(query: string) {
  const supabase = createClient()
  const trimmed = query.trim()
  const enabled = trimmed.length >= 2

  return useQuery<GlobalSearchResponse>({
    queryKey: ['global-search', trimmed.toLowerCase()],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('global-search', {
        body: { query: trimmed, limit_per_group: 5 },
      })
      if (error) throw new Error(error.message || 'Error al buscar')
      if (data?.error) throw new Error(data.error)
      return data as GlobalSearchResponse
    },
  })
}
