import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useTeamMembers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nombre, apellido, rol')
        .eq('activo', true)
        .neq('email', 'admin@alba.com')
        .order('apellido')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
