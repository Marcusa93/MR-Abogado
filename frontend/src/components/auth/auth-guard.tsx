import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { AppSplash } from '@/components/shared/app-splash'
import { useAuthStore } from '@/stores/auth-store'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  // FIX: Selectores granulares en vez de destructuring completo.
  // Antes: const { setUser, setProfile, setLoading, ... } = useAuthStore()
  // → cualquier cambio en el store causaba re-render del AuthGuard completo.
  // Ahora: solo re-render cuando loading o initialized cambian.
  const loading = useAuthStore((s) => s.loading)
  const initialized = useAuthStore((s) => s.initialized)

  useEffect(() => {
    const supabase = createClient()
    const store = useAuthStore.getState()

    async function checkAuthAndLoadProfile() {
      try {
        store.setLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          navigate('/login', { replace: true })
          return
        }

        store.setUser(session.user)

        // FIX: Verificar error del profile fetch
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (error) {
          console.error('Error cargando perfil:', error.message)
        }

        if (profile) {
          // Block inactive users
          if (profile.activo === false) {
            await supabase.auth.signOut()
            navigate('/login', { replace: true })
            return
          }

          // Force password change on first login
          if (profile.must_change_password) {
            navigate('/cambiar-contrasena', { replace: true })
            return
          }

          store.setProfile(profile)
        }

        store.setInitialized(true)
      } catch {
        navigate('/login', { replace: true })
      } finally {
        store.setLoading(false)
      }
    }

    checkAuthAndLoadProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        useAuthStore.getState().reset()
        navigate('/login', { replace: true })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // navigate es estable (de react-router), no se necesitan los setters
    // porque se acceden via getState()
  }, [navigate])

  if (loading || !initialized) {
    return <AppSplash message="Iniciando sistema" />
  }

  return <>{children}</>
}
