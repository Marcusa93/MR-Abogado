import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { useCreateManualActuacion } from '@/hooks/use-sae'
import { toast } from '@/stores/toast-store'

type MovementType = Tables<'sae_movements'>['tipo_movimiento']

const TIPO_OPTIONS: Array<{ value: MovementType; label: string }> = [
  { value: 'sentencia', label: 'Sentencia' },
  { value: 'traslado', label: 'Traslado' },
  { value: 'audiencia', label: 'Audiencia' },
  { value: 'prueba', label: 'Prueba' },
  { value: 'embargo', label: 'Embargo' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'oficio', label: 'Oficio' },
  { value: 'intimacion', label: 'Intimación' },
  { value: 'planilla', label: 'Planilla' },
  { value: 'informe', label: 'Informe' },
  { value: 'decreto', label: 'Decreto' },
  { value: 'escrito_parte', label: 'Escrito de parte' },
  { value: 'otro', label: 'Otro' },
]

interface Props {
  open: boolean
  onClose: () => void
  expedienteId: string
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ModalNuevaActuacion({ open, onClose, expedienteId }: Props) {
  const [fecha, setFecha] = useState(todayIso)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<MovementType>('otro')
  const [cuerpo, setCuerpo] = useState('')
  const create = useCreateManualActuacion()

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return
    create.mutate(
      { expedienteId, fecha, titulo: titulo.trim(), tipoMovimiento: tipo, cuerpo: cuerpo.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Actuación registrada.')
          setTitulo('')
          setCuerpo('')
          setTipo('otro')
          onClose()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Nueva actuación manual</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Fecha</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as MovementType)}
                className="w-full h-9 rounded-lg border border-white/10 bg-zinc-800 px-3 text-sm text-zinc-100 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              >
                {TIPO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Título</label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Descripción breve de la actuación"
              className="w-full h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Cuerpo <span className="normal-case text-zinc-600">(opcional)</span>
            </label>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Detalle de la actuación..."
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!titulo.trim() || create.isPending}
              className="flex items-center gap-2 rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
