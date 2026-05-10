import { useState } from 'react'
import { EstadoBadge } from '@/components/shared/estado-badge'
import {
  ESTADO_INTERNO_LABELS,
  VALID_ESTADO_TRANSITIONS,
  type EstadoInterno,
} from '@/types/enums'
import { useCambiarEstado } from '@/hooks/use-expedientes'
import { X, Loader2 } from 'lucide-react'

interface CambiarEstadoDialogProps {
  expedienteId: string
  estadoActual: string
  open: boolean
  onClose: () => void
}

export function CambiarEstadoDialog({
  expedienteId,
  estadoActual,
  open,
  onClose,
}: CambiarEstadoDialogProps) {
  const cambiarEstado = useCambiarEstado()
  const [nuevoEstado, setNuevoEstado] = useState('')
  const [motivo, setMotivo] = useState('')

  if (!open) return null

  const handleConfirm = async () => {
    if (!nuevoEstado) return
    try {
      await cambiarEstado.mutateAsync({
        expediente_id: expedienteId,
        nuevo_estado: nuevoEstado as EstadoInterno,
        motivo: motivo || null,
      })
      setNuevoEstado('')
      setMotivo('')
      onClose()
    } catch {
      // Error handled by mutation state + global toast
    }
  }

  const handleClose = () => {
    setNuevoEstado('')
    setMotivo('')
    cambiarEstado.reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Cambiar estado del expediente
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Selecciona el nuevo estado y opcionalmente agrega un motivo.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Estado actual
            </label>
            <div>
              <EstadoBadge estado={estadoActual} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Nuevo estado
            </label>
            <select
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            >
              <option value="">Seleccionar estado...</option>
              {(VALID_ESTADO_TRANSITIONS[estadoActual as EstadoInterno] ?? []).map((estado) => (
                <option key={estado} value={estado}>
                  {ESTADO_INTERNO_LABELS[estado]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Motivo (opcional)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ingresa el motivo del cambio..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>

          {cambiarEstado.isError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3">
              <p className="text-xs text-rose-400">
                {cambiarEstado.error?.message ?? 'Error al cambiar estado.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={handleClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!nuevoEstado || cambiarEstado.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cambiarEstado.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Confirmar cambio
          </button>
        </div>
      </div>
    </div>
  )
}
