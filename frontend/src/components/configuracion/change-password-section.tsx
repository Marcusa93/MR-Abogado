import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { KeyRound, Loader2, Check, Eye, EyeOff } from 'lucide-react'

export function ChangePasswordSection() {
  const supabase = createClient()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const isValid = currentPwd.length >= 4 && newPwd.length >= 6 && newPwd === confirmPwd

  async function handleChange() {
    if (!isValid) return
    setStatus('loading')
    setErrorMsg('')

    try {
      // Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('No se pudo obtener el email')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      })
      if (signInError) {
        setErrorMsg('La contraseña actual es incorrecta')
        setStatus('error')
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPwd,
      })
      if (updateError) throw updateError

      setStatus('success')
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cambiar contraseña')
      setStatus('error')
    }
  }

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="h-5 w-5 text-amber-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Cambiar contraseña
        </h2>
      </div>

      <div className="space-y-3 max-w-sm">
        {/* Current password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Contraseña actual
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className={cn(
              'h-9 w-full rounded-lg border bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/15',
              confirmPwd && confirmPwd !== newPwd
                ? 'border-rose-500/50 focus:border-rose-500/50'
                : 'border-white/10 focus:border-amber-500/40'
            )}
          />
          {confirmPwd && confirmPwd !== newPwd && (
            <p className="mt-1 text-[10px] text-rose-400">Las contraseñas no coinciden</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleChange}
            disabled={!isValid || status === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {status === 'success' ? 'Contraseña cambiada' : 'Cambiar contraseña'}
          </button>
          {status === 'error' && (
            <span className="text-xs text-rose-400">{errorMsg}</span>
          )}
        </div>
      </div>
    </div>
  )
}
