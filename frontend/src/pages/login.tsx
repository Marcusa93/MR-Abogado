import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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

      navigate('/panel', { replace: true })
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

      {/* Background effects */}
      <div className="absolute inset-0 login-bg-pattern" />
      <div className="absolute inset-0 dot-pattern opacity-30 dark:opacity-40" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-[var(--brand-navy)]/8 dark:bg-[var(--brand-accent)]/10 blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-[var(--brand-accent)]/5 blur-3xl animate-pulse-subtle [animation-delay:1.5s]" />

      {/* Login card */}
      <div
        className={[
          'relative z-10 w-full max-w-md px-4 transition-all duration-500',
          showIntro ? 'translate-y-6 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div className="glass-card-glow rounded-2xl p-8">
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
              <h1 className="text-2xl font-bold tracking-[0.08em] text-[var(--brand-navy)] dark:text-[var(--brand-ice)]">
                Estudio Jurídico
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Sistema de gestión de expedientes
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
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[var(--brand-accent)] dark:focus:border-[var(--brand-accent)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 dark:focus:ring-[var(--brand-accent)]/15 disabled:opacity-50 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[var(--brand-accent)] dark:focus:border-[var(--brand-accent)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 dark:focus:ring-[var(--brand-accent)]/15 disabled:opacity-50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-[var(--brand-navy)] hover:bg-[var(--brand-medium)] text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[var(--brand-navy)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-[var(--brand-accent)] dark:hover:text-[var(--brand-ice)] transition-colors disabled:opacity-50"
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
