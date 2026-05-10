import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'

type Profile = Tables<'profiles'>

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  initialized: boolean

  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  reset: () => void
}

const initialState = {
  user: null,
  profile: null,
  loading: true,
  initialized: false,
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...initialState,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),
  reset: () => set(initialState),
}))

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

/** Current user's role, or null if not loaded */
export const useUserRole = () =>
  useAuthStore((state) => state.profile?.rol ?? null)

/** True when the session is still being resolved */
export const useAuthLoading = () => useAuthStore((state) => state.loading)

/** True when the user is authenticated */
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.user !== null)

/** Full display name from the profile */
export const useDisplayName = () =>
  useAuthStore((state) =>
    state.profile
      ? `${state.profile.nombre} ${state.profile.apellido}`
      : null
  )
