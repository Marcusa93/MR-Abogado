import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { Loader2, KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff, Scale } from 'lucide-react'

/**
 * Auth callback page — handles recovery (password reset) links from Supabase.
 *
 * Supabase sends links like:
 *   /auth/callback?code=XXXXXX&type=recovery
 *
 * This page:
 * 1. Exchanges the code for a session via PKCE flow
 * 2. Shows a "set new password" form
 * 3. Updates the password and redirects to dashboard
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [phase, setPhase] = useState<'verifying' | 'form' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  // Step 1: Exchange the token/code for a session
  useEffect(() => {
    async function verifyToken() {
      const supabase = createClient()

      try {
        // Supabase v2 PKCE: the code is in the URL search params
        // The onAuthStateChange listener will pick up PASSWORD_RECOVERY events
        // But we also need to handle the hash-based tokens (older flow)

        // Check for hash fragment tokens (e.g., #access_token=...&type=recovery or type=magiclink)
        const hash = window.location.hash
        if (hash) {
          const hashParams = new URLSearchParams(hash.slice(1))
          const hashType = hashParams.get('type')
          if (hashType === 'magiclink') {
            // Magic link — exchange then redirect to dashboard
            const { data: { session }, error } = await supabase.auth.getSession()
            if (error || !session) {
              setErrorMsg('El enlace de acceso es inválido o expiró.')
              setPhase('error')
              return
            }
            navigate('/dashboard', { replace: true })
            return
          }
          if (hashType === 'recovery') {
            // Password reset — show the new password form
            const { data: { session }, error } = await supabase.auth.getSession()
            if (error || !session) {
              setErrorMsg('El enlace de recuperación es inválido o expiró.')
              setPhase('error')
              return
            }
            setPhase('form')
            return
          }
        }

        // PKCE flow: check the type param to distinguish magic link vs recovery
        const code = searchParams.get('code')
        const urlType = searchParams.get('type')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setErrorMsg('El enlace es inválido o expiró. Solicitá uno nuevo desde el login.')
            setPhase('error')
            return
          }
          // Magic link: redirect to dashboard; recovery: show password form
          if (urlType === 'magiclink') {
            navigate('/dashboard', { replace: true })
            return
          }
          setPhase('form')
          return
        }

        // Check if we already have a session (e.g., recovery via redirect)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setPhase('form')
          return
        }

        // No code, no hash, no session — invalid access
        setErrorMsg('Enlace inválido. Solicitá un nuevo enlace de recuperación desde el login.')
        setPhase('error')
      } catch {
        setErrorMsg('Error al verificar el enlace. Intentá nuevamente.')
        setPhase('error')
      }
    }

    verifyToken()
  }, [searchParams])

  // Step 2: Set new password
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPwd.length < 6 || newPwd !== confirmPwd) return

    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPwd })

      if (error) {
        setErrorMsg(error.message)
        setSaving(false)
        return
      }

      setPhase('success')
      setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
    } catch {
      setErrorMsg('Error al actualizar la contraseña.')
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 login-bg-pattern" />
      <div className="absolute inset-0 dot-pattern opacity-40" />
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-violet-500/8 blur-3xl animate-pulse-subtle [animation-delay:1.5s]" />

      <div className="relative z-10 w-full max-w-md px-4 animate-fade-in-up">
        <div className="glass-card rounded-2xl p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white overflow-hidden glow-cyan">
              <img src="/logo/mr-logo-azul.svg" alt="Dr. Marco Rossi" className="h-12 w-12 object-contain" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-gradient-cyan">Marco Rossi Estudio Jurídico</h1>
              <p className="mt-1 text-sm font-medium text-zinc-400">Restablecer contraseña</p>
            </div>
          </div>

          {/* Verifying */}
          {phase === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-zinc-400">Verificando enlace...</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-sm text-rose-300">{errorMsg}</p>
              </div>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-gradient-cyan text-sm font-semibold text-zinc-950 transition-all hover:opacity-90"
              >
                Volver al login
              </button>
            </div>
          )}

          {/* Set new password form */}
          {phase === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-zinc-400 text-center">
                Ingresá tu nueva contraseña.
              </p>

              {errorMsg && (
                <div className="flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 animate-scale-in">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <p className="text-sm text-rose-300">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="new-password" className="block text-sm font-medium text-zinc-300">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPwd ? 'text' : 'password'}
                    value={newPwd}
                    onChange={(e) => { setNewPwd(e.target.value); setErrorMsg('') }}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                    autoFocus
                    disabled={saving}
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-10 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-sm font-medium text-zinc-300">
                  Confirmar contraseña
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                  minLength={6}
                  disabled={saving}
                  className={`h-10 w-full rounded-lg border bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50 transition-all ${
                    confirmPwd && confirmPwd !== newPwd
                      ? 'border-rose-500/50 focus:border-rose-500/50'
                      : 'border-white/10 focus:border-amber-500/40'
                  }`}
                />
                {confirmPwd && confirmPwd !== newPwd && (
                  <p className="text-xs text-rose-400">Las contraseñas no coinciden</p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || newPwd.length < 6 || newPwd !== confirmPwd}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-cyan text-sm font-semibold text-zinc-950 transition-all hover:opacity-90 hover:shadow-lg hover:shadow-amber-500/15 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Establecer contraseña
                  </>
                )}
              </button>
            </form>
          )}

          {/* Success */}
          {phase === 'success' && (
            <div className="flex flex-col items-center gap-4 py-6 animate-scale-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Contraseña actualizada</p>
                <p className="mt-1 text-sm text-zinc-400">Redirigiendo al panel...</p>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-zinc-500">
            Dr. Marco Rossi &middot; Estudio Jurídico
          </p>
        </div>
      </div>
    </div>
  )
}
