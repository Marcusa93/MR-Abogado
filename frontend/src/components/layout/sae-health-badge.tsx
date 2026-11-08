import { useNavigate } from 'react-router-dom'
import { useSaeCredential } from '@/hooks/use-sae'
import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/date-helpers'

type Status = 'pendiente' | 'activo' | 'error' | 'desactivado'

const statusMeta: Record<Status, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  activo: {
    label: 'SAE conectado',
    tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15',
    icon: CheckCircle2,
  },
  pendiente: {
    label: 'SAE sin verificar',
    tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15',
    icon: CircleDashed,
  },
  error: {
    label: 'SAE con error',
    tone: 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/15',
    icon: AlertTriangle,
  },
  desactivado: {
    label: 'SAE desactivado',
    tone: 'text-zinc-500 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/15',
    icon: MinusCircle,
  },
}

export function SaeHealthBadge() {
  const navigate = useNavigate()
  const { data: cred, isLoading } = useSaeCredential()

  // Hide entirely if no credential exists yet (don't nag the user)
  if (isLoading || !cred) return null

  const status = (cred.status as Status) ?? 'pendiente'
  const meta = statusMeta[status] ?? statusMeta.pendiente
  const Icon = meta.icon

  const tooltipParts: string[] = [meta.label]
  if (cred.last_login_at) tooltipParts.push(`Último login: ${formatDateTime(cred.last_login_at)}`)
  if (cred.last_sync_at) tooltipParts.push(`Última sync: ${formatDateTime(cred.last_sync_at)}`)
  if (cred.last_error) tooltipParts.push(`Error: ${cred.last_error}`)

  return (
    <button
      type="button"
      onClick={() => navigate('/configuracion?section=sae')}
      title={tooltipParts.join('\n')}
      className={cn(
        'hidden md:inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        meta.tone,
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono text-[11px] tracking-wide">SAE</span>
      {cred.last_sync_at && (
        <span className="hidden font-mono text-[11px] opacity-70 lg:inline">
          {new Date(cred.last_sync_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </button>
  )
}
