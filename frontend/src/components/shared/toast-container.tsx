import { useToastStore, type ToastType } from '@/stores/toast-store'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const STYLES: Record<ToastType, string> = {
  success:
    'border-emerald-500/30 bg-emerald-950/80 text-emerald-200',
  error:
    'border-rose-500/30 bg-rose-950/80 text-rose-200',
  info:
    'border-amber-500/30 bg-amber-950/80 text-amber-200',
  warning:
    'border-amber-500/30 bg-amber-950/80 text-amber-200',
}

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-amber-400',
  warning: 'text-amber-400',
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-label="Notificaciones"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex w-80 items-start gap-3 rounded-lg border p-3 shadow-lg animate-slide-in backdrop-blur-sm ${STYLES[t.type]}`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_STYLES[t.type]}`} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs opacity-80">{t.description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Cerrar notificacion"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
