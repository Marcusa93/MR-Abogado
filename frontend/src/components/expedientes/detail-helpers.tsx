import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Globe,
  PhoneCall,
  UserCheck,
  Mail,
  MessageSquare,
  Copy,
  Check,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// InfoItem — label + value row with icon + optional copy button
// ---------------------------------------------------------------------------

export function InfoItem({
  icon: Icon,
  label,
  value,
  className,
  copyable = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  className?: string
  /** Show a copy button next to the value */
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
    if (!text || text === '-') return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  const showCopy = copyable && value && value !== '-'

  return (
    <div className={cn('group flex items-start gap-2.5', className)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="text-sm text-zinc-800 dark:text-zinc-100 break-words">
            {value ?? '-'}
          </p>
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-amber-500 transition-all"
              title={`Copiar ${label}`}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card — generic bordered section
// ---------------------------------------------------------------------------

export function Card({
  title,
  children,
  className,
  headerRight,
}: {
  title: string
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-slate-900',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        {headerRight}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CanalIcon — icon per seguimiento channel
// ---------------------------------------------------------------------------

export function CanalIcon({ canal }: { canal: string }) {
  switch (canal) {
    case 'WEB':
      return <Globe className="h-3.5 w-3.5 text-blue-500" />
    case 'TELEFONO':
      return <PhoneCall className="h-3.5 w-3.5 text-green-500" />
    case 'PRESENCIAL':
      return <UserCheck className="h-3.5 w-3.5 text-amber-500" />
    case 'EMAIL':
      return <Mail className="h-3.5 w-3.5 text-violet-500" />
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
  }
}

// ---------------------------------------------------------------------------
// StatusBadge — colored pill
// ---------------------------------------------------------------------------

export function StatusBadge({
  label,
  color,
}: {
  label: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    yellow: 'bg-yellow-950/40 text-yellow-400',
    blue: 'bg-blue-950/40 text-blue-400',
    green: 'bg-green-950/40 text-green-400',
    red: 'bg-red-950/40 text-red-400',
    purple: 'bg-purple-950/40 text-purple-400',
    gray: 'bg-white/5 text-zinc-600 dark:text-zinc-400',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
        colorMap[color] ?? colorMap.gray
      )}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Color helpers for turno / tarea estado
// ---------------------------------------------------------------------------

export function getTurnoColor(estado: string) {
  switch (estado) {
    case 'PENDIENTE': return 'yellow'
    case 'CONFIRMADO': return 'blue'
    case 'REALIZADO': return 'green'
    case 'CANCELADO': return 'red'
    case 'REPROGRAMADO': return 'purple'
    default: return 'gray'
  }
}

export function getTareaColor(estado: string) {
  switch (estado) {
    case 'PENDIENTE': return 'yellow'
    case 'EN_PROGRESO': return 'blue'
    case 'COMPLETADA': return 'green'
    case 'CANCELADA': return 'gray'
    default: return 'gray'
  }
}
