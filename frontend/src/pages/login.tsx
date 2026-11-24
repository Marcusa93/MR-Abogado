import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { destinoTrasLogin } from '@/lib/utils/volver-login'
import { AppSplash } from '@/components/shared/app-splash'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [introLeaving, setIntroLeaving] = useState(false)

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setIntroLeaving(true), 720)
    const hideTimer = window.setTimeout(() => setShowIntro(false), 980)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  useEffect(() => {
    if (!showIntro) {
      emailInputRef.current?.focus()
    }
  }, [showIntro])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        if (authError.message === 'Invalid login credentials') {
          setError('Credenciales incorrectas. Verificá tu email y contraseña.')
        } else {
          setError(authError.message)
        }
        return
      }

      supabase.rpc('log_login' as any).then(undefined, () => {})

      navigate(destinoTrasLogin('/panel'), { replace: true })
    } catch {
      setError('Error inesperado. Intentá nuevamente.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setError('Ingresá tu email primero para recuperar la contraseña.')
      return
    }
    setResetLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      if (resetError) throw resetError
      setResetSent(true)
    } catch {
      setError('Error al enviar email de recuperación. Verificá el email.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {showIntro && (
        <div className="fixed inset-0 z-40">
          <AppSplash
            message="Marco Rossi — Estudio Jurídico"
            phase={introLeaving ? 'exit' : 'enter'}
          />
        </div>
      )}

      {/* Fondo: la grilla y el halo del hero del sitio */}
      <div className="absolute inset-0 login-bg-pattern" />

      {/* Login card */}
      <div
        className={[
          'relative z-10 w-full max-w-md px-4 transition-all duration-500',
          showIntro ? 'translate-y-6 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div className="app-card rounded-3xl p-8 sm:p-10">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-5">
            {/* Light mode: blue logotype */}
            <img
              src="/logo/mr-logo-azul.svg"
              alt="Dr. Marco Rossi"
              className="block dark:hidden h-32 w-auto object-contain md:h-36"
            />
            {/* Dark mode: white logotype */}
            <img
              src="/logo/mr-logo-blanco.svg"
              alt="Dr. Marco Rossi"
              className="hidden dark:block h-32 w-auto object-contain md:h-36"
            />
            <div className="text-center">
              <span className="dashboard-kicker">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Sistema del estudio
              </span>
              <h1 className="mt-4 text-[1.65rem] font-extrabold tracking-tight text-[var(--brand-navy)] dark:text-white">
                Estudio Jurídico
              </h1>
              <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Gestión de expedientes, consultas y agenda
              </p>
            </div>
          </div>

          {/* Reset sent success */}
          {resetSent && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-300 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 animate-scale-in">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Te enviamos un email para restablecer tu contraseña. Revisá tu bandeja de entrada.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-300 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 animate-scale-in">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Email
              </label>
              <input
                ref={emailInputRef}
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
                className="field h-11 disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
                className="field h-11 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary h-11 w-full text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetLoading}
            className="mt-4 w-full text-center text-xs text-zinc-500 dark:text-zinc-400 hover:text-[var(--brand-accent)] dark:hover:text-[var(--brand-ice)] transition-colors disabled:opacity-50"
          >
            {resetLoading ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
          </button>

          <p className="mt-4 text-center text-xs text-zinc-400 italic">
            "Confianza que se transforma en resultados"
          </p>
        </div>
      </div>
    </div>
  )
}
