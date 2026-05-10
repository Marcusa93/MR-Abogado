import { useState, useEffect } from 'react'
import { useUpdateExpediente, useTiposTramite } from '@/hooks/use-expedientes'
import type { ExpedienteDetail } from '@/hooks/use-expedientes'
import { toast } from '@/stores/toast-store'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import type { Prioridad } from '@/types/enums'
import { X, Loader2, Save } from 'lucide-react'

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'

interface Props {
  open: boolean
  onClose: () => void
  expediente: ExpedienteDetail
}

export function EditarExpedienteDialog({ open, onClose, expediente }: Props) {
  const update = useUpdateExpediente()
  const { data: tiposTramite } = useTiposTramite()

  const [tipoTramiteId, setTipoTramiteId] = useState(expediente.tipo_tramite_id ?? '')
  const [prioridad, setPrioridad] = useState<Prioridad>(expediente.prioridad as Prioridad)
  const [caratula, setCaratula] = useState(expediente.caratula ?? '')
  const [observaciones, setObservaciones] = useState(expediente.observaciones ?? '')
  const [numeroSae, setNumeroSae] = useState((expediente as any).numero_sae ?? '')

  // Reset state when expediente changes
  useEffect(() => {
    if (open) {
      setTipoTramiteId(expediente.tipo_tramite_id ?? '')
      setPrioridad(expediente.prioridad as Prioridad)
      setCaratula(expediente.caratula ?? '')
      setObservaciones(expediente.observaciones ?? '')
      setNumeroSae((expediente as any).numero_sae ?? '')
    }
  }, [open, expediente])

  const handleSubmit = async () => {
    try {
      await update.mutateAsync({
        id: expediente.id,
        tipo_tramite_id: tipoTramiteId || undefined,
        prioridad,
        caratula: caratula.trim() || null,
        observaciones: observaciones.trim() || null,
        numero_sae: numeroSae.trim() || null,
      } as any)
      toast.success('Expediente actualizado')
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-white/10 p-6 shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Editar expediente</h3>
            <p className="text-xs text-zinc-900 dark:text-zinc-500 font-mono">{(expediente as any).numero ?? (expediente as any).numero_expediente}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Caratula */}
          <div>
            <label className={labelClass}>Carátula</label>
            <input
              value={caratula}
              onChange={(e) => setCaratula(e.target.value)}
              className={inputClass}
              placeholder="Carátula del expediente"
            />
          </div>

          {/* Tipo tramite */}
          {/* TODO: Responsable (abogado_id) removed — use expediente_miembros instead */}
          <div>
            <label className={labelClass}>Tipo de trámite</label>
            <select
              value={tipoTramiteId}
              onChange={(e) => setTipoTramiteId(e.target.value)}
              className={inputClass}
            >
              <option value="">Sin tipo</option>
              {(tiposTramite ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* Prioridad */}
          <div>
            <label className={labelClass}>Prioridad</label>
            <select
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as Prioridad)}
              className={inputClass}
            >
              {PRIORIDAD_VALUES.map((p) => (
                <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
              ))}
            </select>
          </div>

          {/* Número SAE */}
          <div>
            <label className={labelClass}>Número SAE <span className="text-zinc-500">(Poder Judicial Tucumán)</span></label>
            <input
              value={numeroSae}
              onChange={(e) => setNumeroSae(e.target.value)}
              className={inputClass}
              placeholder="Ej: 123456/2024"
            />
          </div>

          {/* Observaciones */}
          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
              rows={3}
              placeholder="Notas sobre el expediente..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
