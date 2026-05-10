import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { sanitizeForPostgrest } from '@/lib/utils/sanitize-search'

export function useExpedienteSearch(search: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['expediente-search', search],
    queryFn: async () => {
      let query = supabase
        .from('expedientes')
        .select('id, numero, caratula')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(20)

      if (search.trim().length > 0) {
        const term = `%${sanitizeForPostgrest(search.trim())}%`
        query = query.or(
          `numero.ilike.${term},caratula.ilike.${term}`
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}
