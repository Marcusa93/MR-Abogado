import { useState } from 'react'
import { useSaeCredential, useSaveSaeCredential, useDeleteSaeCredential, useSaeVerify } from '@/hooks/use-sae'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { Database, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2, Check, Eye, EyeOff, X } from 'lucide-react'

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente verificación', color: 'text-zinc-400', bg: 'bg-zinc-500/15', icon: Clock },
  activo:    { label: 'Activo', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  error:     { label: 'Error de conexión', color: 'text-rose-400', bg: 'bg-rose-500/15', icon: AlertCircle },
  desactivado: { label: 'Desactivado', color: 'text-zinc-500 dark:text-zinc-400', bg: 'bg-zinc-700/20', icon: X },
} as const

export function SaeCredentialsSection() {
  const { data: credential, isLoading } = useSaeCredential()
  const save = useSaveSaeCredential()
  const verify = useSaeVerify()
  const remove = useDeleteSaeCredential()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isValid = username.trim().length > 0 && password.length > 0
  const isBusy = save.isPending || verify.isPending

  const handleSave = () => {
    if (!isValid) return
    save.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          setShowForm(false)
          setUsername('')
          setPassword('')
          // Auto-verify immediately after saving so status shows activo/error
          verify.mutate(undefined, {
            onSuccess: () => toast.success('Credenciales SAE verificadas y activas'),
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Credenciales guardadas pero no se pudo verificar con SAE'),
          })
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al guardar')
        },
      }
    )
  }

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Credenciales SAE eliminadas')
        setConfirmDelete(false)
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Error al eliminar')
      },
    })
  }

  const status = credential?.status as keyof typeof STATUS_CONFIG | null ?? null
  const statusCfg = status ? STATUS_CONFIG[status] : null
  const StatusIcon = statusCfg?.icon ?? Database

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Integración SAE
          </h2>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">justucuman.gov.ar</span>
        </div>
        {credential && !showForm && (
          <div className="flex items-center gap-2">
            {credential.status !== 'activo' && (
              <button
                onClick={() => verify.mutate(undefined, {
                  onSuccess: () => toast.success('Conexión SAE verificada'),
                  onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo verificar'),
                })}
                disabled={verify.isPending}
                className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
              >
                {verify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Verificar
              </button>
            )}
            <button
              onClick={() => { setShowForm(true); setUsername(credential.username) }}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Actualizar
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-300" />
        </div>
      ) : credential && !showForm ? (
        /* Credential exists — show info */
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <div className={cn('flex items-center justify-center rounded-full p-1.5', statusCfg?.bg)}>
              <StatusIcon className={cn('h-3.5 w-3.5', statusCfg?.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{credential.username}</p>
              <p className={cn('text-xs', statusCfg?.color ?? 'text-zinc-500 dark:text-zinc-400')}>
                {statusCfg?.label ?? credential.status}
              </p>
            </div>
          </div>

          {credential.last_error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {credential.last_error}
            </p>
          )}

          <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            {credential.last_sync_at && (
              <span>Última sync: {new Date(credential.last_sync_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-rose-400 transition-colors"
            >
              Eliminar credenciales
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400">¿Eliminar credenciales SAE?</span>
              <button
                onClick={handleDelete}
                disabled={remove.isPending}
                className="flex items-center gap-1 rounded bg-rose-600/20 px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-600/30"
              >
                {remove.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : (
        /* No credential or editing — show form */
        <div className="space-y-3 max-w-sm">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ingresá tus credenciales del SAE (Sistema de Actuación Electrónica) para sincronizar actuaciones automáticamente.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Usuario SAE
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu.usuario@pjtu.gob.ar"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Contraseña SAE
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Tu contraseña del SAE"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              La contraseña se cifra en el servidor y nunca se expone al cliente.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={!isValid || isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
            >
              <Loader2 className={cn('h-4 w-4', isBusy ? 'animate-spin' : 'hidden')} />
              {!isBusy && <Check className="h-4 w-4" />}
              {save.isPending ? 'Guardando...' : verify.isPending ? 'Verificando con SAE...' : 'Guardar credenciales'}
            </button>
            {showForm && (
              <button
                onClick={() => { setShowForm(false); setUsername(''); setPassword('') }}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
