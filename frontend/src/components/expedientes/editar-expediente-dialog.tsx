import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUpdateExpediente } from '@/hooks/use-expedientes'
import type { ExpedienteDetail } from '@/hooks/use-expedientes'
import { useCliente } from '@/hooks/use-clientes'
import { ClienteCombobox } from '@/components/clientes/cliente-combobox'
import { toast } from '@/stores/toast-store'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import type { Prioridad } from '@/types/enums'
import { X, Loader2, Save, AlertCircle } from 'lucide-react'

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300'

interface Props {
  open: boolean
  onClose: () => void
  expediente: ExpedienteDetail
}

export function EditarExpedienteDialog({ open, onClose, expediente }: Props) {
  const update = useUpdateExpediente()

  const [prioridad, setPrioridad] = useState<Prioridad>(expediente.prioridad as Prioridad)
  const [caratula, setCaratula] = useState(expediente.caratula ?? '')
  const [observaciones, setObservaciones] = useState(expediente.observaciones ?? '')
  const [numeroSae, setNumeroSae] = useState((expediente as any).numero_sae ?? '')
  const [clienteId, setClienteId] = useState(expediente.cliente_id ?? '')

  // Trae el cliente actual para detectar si es placeholder
  const { data: clienteActual } = useCliente(expediente.cliente_id ?? undefined)
  const esPlaceholder = clienteActual?.apellido === 'Importado SAE'
  const clienteCambio = clienteId !== (expediente.cliente_id ?? '')

  // Reset state when expediente changes
  useEffect(() => {
    if (open) {
      setPrioridad(expediente.prioridad as Prioridad)
      setCaratula(expediente.caratula ?? '')
      setObservaciones(expediente.observaciones ?? '')
      setNumeroSae((expediente as any).numero_sae ?? '')
      setClienteId(expediente.cliente_id ?? '')
    }
  }, [open, expediente])

  const handleSubmit = async () => {
    if (!clienteId) {
      toast.error('Seleccioná un cliente')
      return
    }
    try {
      await update.mutateAsync({
        id: expediente.id,
        cliente_id: clienteId,
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
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-zinc-900/80 border border-white/10 p-6 shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Editar expediente</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-mono">{(expediente as any).numero ?? (expediente as any).numero_expediente}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Cliente */}
          <div>
            <label className={labelClass}>
              Cliente
              {esPlaceholder && !clienteCambio && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 normal-case">
                  <AlertCircle className="h-3 w-3" /> Cliente actual es placeholder SAE
                </span>
              )}
            </label>
            <ClienteCombobox
              value={clienteId}
              onChange={setClienteId}
              currentId={expediente.cliente_id ?? undefined}
            />
            {esPlaceholder && (
              <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
                Este expediente apunta a un placeholder importado de SAE. Cambialo al cliente real
                (buscalo arriba) o consolidalo desde{' '}
                <Link to="/clientes/resolver" onClick={onClose} className="underline hover:text-amber-700 dark:hover:text-amber-300">
                  Resolver duplicados
                </Link>.
              </p>
            )}
            {clienteCambio && (
              <p className="mt-1 text-xs text-violet-600 dark:text-violet-400">
                ⚠️ Vas a mover este expediente a otro cliente al guardar.
              </p>
            )}
          </div>

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
            <label className={labelClass}>Número SAE <span className="text-zinc-500 dark:text-zinc-400">(Poder Judicial Tucumán)</span></label>
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
