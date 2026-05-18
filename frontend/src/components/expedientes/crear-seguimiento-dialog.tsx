import { useState, useRef, type KeyboardEvent } from 'react'
import { useCreateSeguimiento } from '@/hooks/use-seguimientos'
import { useCreateTarea } from '@/hooks/use-tareas'
import { CANAL_SEGUIMIENTO_VALUES, CANAL_SEGUIMIENTO_LABELS } from '@/types/enums'
import { toast } from '@/stores/toast-store'
import { X, Loader2 } from 'lucide-react'
import { WhatsAppButtons } from '@/components/shared/whatsapp-button'

interface CrearSeguimientoDialogProps {
  open: boolean
  onClose: () => void
  expedienteId: string
  clienteTelefono?: string | null
  clienteTelefonoAlt?: string | null
  clienteNombre?: string | null
  caratula?: string | null
}

const today = () => new Date().toISOString().split('T')[0]

export function CrearSeguimientoDialog({
  open,
  onClose,
  expedienteId,
  clienteTelefono,
  clienteTelefonoAlt,
  clienteNombre,
  caratula,
}: CrearSeguimientoDialogProps) {
  const createSeguimiento = useCreateSeguimiento()
  const createTarea = useCreateTarea()

  const [canal, setCanal] = useState('WEB')
  const [resultado, setResultado] = useState('')
  const [notas, setNotas] = useState('')
  const [proximoSeguimiento, setProximoSeguimiento] = useState('')
  const [crearTareaChecked, setCrearTareaChecked] = useState(true)
  const dateRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleConfirm = async () => {
    try {
      await createSeguimiento.mutateAsync({
        expediente_id: expedienteId,
        canal: canal as 'WEB' | 'TELEFONO' | 'PRESENCIAL' | 'EMAIL',
        estado_organismo_reportado: resultado.trim() || null,
        observacion: notas.trim() || null,
        proxima_fecha_control: proximoSeguimiento || null,
      })

      // If próximo seguimiento is set and checkbox is on, create a follow-up tarea
      if (proximoSeguimiento && crearTareaChecked) {
        try {
          await createTarea.mutateAsync({
            expediente_id: expedienteId,
            asignado_a: '',
            titulo: `Seguimiento: ${caratula || 'Expediente'}`,
            descripcion: resultado.trim()
              ? `Último resultado: ${resultado.trim()}`
              : 'Realizar seguimiento programado',
            fecha_vencimiento: proximoSeguimiento,
            prioridad: 'MEDIA',
            estado: 'PENDIENTE',
            created_by: '',
          })
        } catch {
          // Non-blocking — seguimiento already saved
          toast.warning('Seguimiento guardado, pero no se pudo crear la tarea')
        }
      }

      toast.success('Seguimiento registrado')
      resetAndClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const resetAndClose = () => {
    setCanal('WEB')
    setResultado('')
    setNotas('')
    setProximoSeguimiento('')
    setCrearTareaChecked(true)
    createSeguimiento.reset()
    onClose()
  }

  const handleDateKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      setProximoSeguimiento(today())
    }
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={resetAndClose} />

      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Nuevo seguimiento
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Registra un seguimiento del estado del expediente.
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Canal + Proximo seguimiento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Canal *</label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className={inputClass}
              >
                {CANAL_SEGUIMIENTO_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {CANAL_SEGUIMIENTO_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Próximo seguimiento{' '}
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">(F = hoy)</span>
              </label>
              <input
                ref={dateRef}
                type="date"
                value={proximoSeguimiento}
                min={today()}
                onChange={(e) => setProximoSeguimiento(e.target.value)}
                onKeyDown={handleDateKeyDown}
                className={inputClass}
              />
            </div>
          </div>

          {/* Checkbox: crear tarea de seguimiento */}
          {proximoSeguimiento && (
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={crearTareaChecked}
                onChange={(e) => setCrearTareaChecked(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-amber-500/15"
              />
              Crear tarea de seguimiento para el {proximoSeguimiento}
            </label>
          )}

          {/* Resultado */}
          <div>
            <label className={labelClass}>Resultado</label>
            <input
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              placeholder="Estado reportado por el organismo..."
              className={inputClass}
            />
          </div>

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>

          {/* WhatsApp shortcuts */}
          <div>
            <label className={labelClass}>Contactar por WhatsApp</label>
            <WhatsAppButtons
              telefono={clienteTelefono}
              telefonoAlt={clienteTelefonoAlt}
              clienteNombre={clienteNombre}
              motivo={resultado.trim() || undefined}
              variant="badge"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={resetAndClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={createSeguimiento.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createSeguimiento.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}
