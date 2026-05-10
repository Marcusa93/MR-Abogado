import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { User } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'

type Profile = Tables<'profiles'>

interface UseAuthReturn {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  signOut: () => Promise<void>
}

/**
 * Hook principal de autenticación.
 *
 * FIX: Zustand es la ÚNICA fuente de verdad para el profile.
 * Antes había una query de TanStack Query duplicada que:
 * 1. Creaba una doble fuente de verdad (Zustand vs TanStack cache)
 * 2. Causaba re-fetches innecesarios
 * 3. Hacía confuso cuál era el profile "actual"
 *
 * El profile se carga en AuthGuard y se guarda en Zustand.
 * Si se necesita refrescar, se hace explícitamente via refreshProfile().
 */
export function useAuth(): UseAuthReturn {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const supabase = createClient()

  // Selectores individuales para evitar re-renders innecesarios
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error.message)
    }
    // Clear all cached queries
    queryClient.clear()
    // Reset Zustand auth store
    useAuthStore.getState().reset()
    navigate('/login')
  }, [supabase, queryClient, navigate])

  return {
    user,
    profile,
    isLoading: loading,
    signOut,
  }
}
