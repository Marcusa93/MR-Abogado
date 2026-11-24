import { useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  isPending?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = '¿Estas seguro?',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isPending = false,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => confirmRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleConfirm = useCallback(async () => {
    await onConfirm()
    onClose()
  }, [onConfirm, onClose])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl animate-scale-in dark:border-white/10 dark:bg-[var(--popover)]">
          {/* Icon */}
          <div
            className={cn(
              'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full',
              isDanger ? 'bg-rose-500/10' : 'bg-amber-500/10'
            )}
          >
            <AlertTriangle
              className={cn(
                'h-6 w-6',
                isDanger ? 'text-rose-400' : 'text-amber-400'
              )}
            />
          </div>

          {/* Content */}
          <h3 className="mb-2 text-center text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {title}
          </h3>
          <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-300">
            {description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn btn-ghost flex-1"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className={cn(
                'btn flex-1',
                isDanger
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'btn-primary'
              )}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
