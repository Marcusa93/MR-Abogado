import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { Loader2, KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff, Scale, ShieldAlert } from 'lucide-react'

/**
 * Force password change page — shown to users with must_change_password = true.
 * Cannot be skipped. After changing, sets the flag to false and redirects to dashboard.
 */
export default function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPwd.length < 6 || newPwd !== confirmPwd) return

    setSaving(true)
    setErrorMsg('')

    try {
      const supabase = createClient()

      // Update password
      const { error: pwdError } = await supabase.auth.updateUser({ password: newPwd })
      if (pwdError) {
        setErrorMsg(pwdError.message)
        setSaving(false)
        return
      }

      // Clear the flag — retry once on failure to avoid trapping the user in an infinite loop
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id)

        if (profileError) {
          // Retry once
          const { error: retryError } = await supabase
            .from('profiles')
            .update({ must_change_password: false })
            .eq('id', user.id)

          if (retryError) {
            // Password was changed but flag wasn't cleared — let the user know
            setErrorMsg('Contraseña actualizada, pero hubo un error al actualizar el perfil. Por favor recargá la página.')
            setSaving(false)
            return
          }
        }
      }

      setDone(true)
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
        window.location.reload() // Reload to refresh profile in store
      }, 1500)
    } catch {
      setErrorMsg('Error al actualizar la contraseña.')
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 overflow-hidden">
      <div className="absolute inset-0 login-bg-pattern" />
      <div className="absolute inset-0 dot-pattern opacity-40" />
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-amber-500/6 blur-3xl animate-pulse-subtle [animation-delay:1.5s]" />

      <div className="relative z-10 w-full max-w-md px-4 animate-fade-in-up">
        <div className="glass-card rounded-2xl p-8">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white overflow-hidden glow-cyan">
              <img src="/logo/mr-logo-azul.svg" alt="Dr. Marco Rossi" className="h-12 w-12 object-contain" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-gradient-cyan">Marco Rossi Estudio Jurídico</h1>
              <p className="mt-1 text-sm font-medium text-zinc-400">Cambiar contraseña</p>
            </div>
          </div>

          {!done ? (
            <>
              {/* Warning */}
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Cambio de contraseña requerido</p>
                  <p className="mt-1 text-xs text-amber-300/70">
                    Es tu primer inicio de sesión. Por seguridad, elegí una contraseña personal.
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 animate-scale-in">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <p className="text-sm text-rose-300">{errorMsg}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
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
                      className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50 transition-all"
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
                    className={`h-10 w-full rounded-lg border bg-white/5 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50 transition-all ${
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
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 animate-scale-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-100">Contraseña actualizada</p>
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
