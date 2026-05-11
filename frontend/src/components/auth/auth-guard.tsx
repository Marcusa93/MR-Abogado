import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { AppSplash } from '@/components/shared/app-splash'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

const SAE_AUTO_IMPORT_PREFIX = 'sae-auto-import'

async function extractFnErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json()
        if (typeof body?.error === 'string' && body.error.trim()) return body.error
      } catch {
        // Ignore malformed error body and fall through to generic message.
      }
    }
  }

  return error instanceof Error ? error.message : 'Error desconocido'
}

async function runSaeImportOnLogin(
  userId: string,
  loginFingerprint: string,
  onImported?: () => void
) {
  if (typeof window === 'undefined') return

  const sessionKey = `${SAE_AUTO_IMPORT_PREFIX}:${userId}:${loginFingerprint}`
  const status = window.sessionStorage.getItem(sessionKey)
  if (status === 'running' || status === 'done') return

  window.sessionStorage.setItem(sessionKey, 'running')
  const supabase = createClient()

  try {
    const { data: listData, error: listError } = await supabase.functions.invoke('sae-list', {
      body: {},
    })
    if (listError) {
      const message = await extractFnErrorMessage(listError)
      const silentErrors = [
        'No tenés credenciales SAE',
        'Las credenciales SAE están desactivadas',
      ]
      if (silentErrors.some(prefix => message.startsWith(prefix))) {
        window.sessionStorage.setItem(sessionKey, 'done')
        return
      }
      throw new Error(message)
    }

    const cases = Array.isArray(listData?.cases) ? (listData.cases as Array<Record<string, unknown>>) : []
    const pendingCases = cases
      .filter(item => item.ya_importado !== true)
      .map(item => ({
        procid: String(item.procid ?? ''),
        jurisdictionId: Number(item.jurisdictionId ?? 0),
        numero_sae: String(item.numero_sae ?? ''),
        caratula: String(item.caratula ?? ''),
      }))
      .filter(item => item.procid && item.numero_sae && item.caratula)

    if (pendingCases.length === 0) {
      window.sessionStorage.setItem(sessionKey, 'done')
      return
    }

    const { data: importData, error: importError } = await supabase.functions.invoke('sae-import', {
      body: { cases: pendingCases },
    })
    if (importError) throw new Error(await extractFnErrorMessage(importError))

    const exitosos = Number(importData?.exitosos ?? 0)
    const errores = Number(importData?.errores ?? 0)

    if (exitosos > 0) {
      toast.success(
        `${exitosos} expediente${exitosos !== 1 ? 's' : ''} SAE importado${exitosos !== 1 ? 's' : ''}`,
        errores > 0 ? `${errores} expediente${errores !== 1 ? 's' : ''} no se pudieron importar.` : 'La migración se ejecutó al iniciar sesión.'
      )
    } else if (errores > 0) {
      toast.warning('No se pudo completar la migración SAE', 'Revisá la importación manual desde Expedientes > Importar SAE.')
    }

    if (exitosos > 0) onImported?.()
    window.sessionStorage.setItem(sessionKey, 'done')
  } catch (error) {
    window.sessionStorage.removeItem(sessionKey)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    toast.warning('Falló la migración automática de SAE', message)
  }
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
          void runSaeImportOnLogin(
            session.user.id,
            session.user.last_sign_in_at ?? 'unknown-login',
            () => { void queryClient.invalidateQueries() }
          )
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
  }, [navigate, queryClient])

  if (loading || !initialized) {
    return <AppSplash message="Iniciando sistema" />
  }

  return <>{children}</>
}
