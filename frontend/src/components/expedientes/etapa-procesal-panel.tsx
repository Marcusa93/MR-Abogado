import { useState } from 'react'
import { Check, Plus, X, Loader2 } from 'lucide-react'
import { Card } from './detail-helpers'
import { useUpdateExpediente } from '@/hooks/use-expedientes'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Etapas procesales típicas (civil ordinario). El usuario puede sumar propias.
const ETAPAS_PREDEF = [
  'Demanda',
  'Contestación',
  'Apertura a prueba',
  'Etapa probatoria',
  'Alegatos',
  'Sentencia',
  'Apelación',
  'Ejecución',
  'Archivo',
]

interface Props {
  expedienteId: string
  etapaActual: string | null
}

export function EtapaProcesalPanel({ expedienteId, etapaActual }: Props) {
  const update = useUpdateExpediente()
  const [addingCustom, setAddingCustom] = useState(false)
  const [custom, setCustom] = useState('')

  // Si la etapa actual es una personalizada (no está en las predefinidas), la sumamos a la fila.
  const etapas = etapaActual && !ETAPAS_PREDEF.includes(etapaActual)
    ? [...ETAPAS_PREDEF, etapaActual]
    : ETAPAS_PREDEF

  const idxActual = etapaActual ? etapas.indexOf(etapaActual) : -1

  const setEtapa = (etapa: string | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update.mutate({ id: expedienteId, etapa_procesal: etapa } as any, {
      onSuccess: () => toast.success(etapa ? `Etapa: ${etapa}` : 'Etapa quitada'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo actualizar'),
    })
  }

  const guardarCustom = () => {
    const v = custom.trim()
    if (!v) return
    setEtapa(v)
    setCustom(''); setAddingCustom(false)
  }

  return (
    <Card title="Etapa procesal">
      <div className="flex flex-wrap items-center gap-1.5">
        {etapas.map((etapa, i) => {
          const isActual = etapa === etapaActual
          const isPasada = idxActual >= 0 && i < idxActual && ETAPAS_PREDEF.includes(etapa)
          return (
            <button
              key={etapa}
              onClick={() => setEtapa(isActual ? null : etapa)}
              disabled={update.isPending}
              title={isActual ? 'Etapa actual (click para quitar)' : `Marcar etapa: ${etapa}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                isActual
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                  : isPasada
                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300/80'
                    : 'border-white/10 bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-white/10',
              )}
            >
              {isPasada && <Check className="h-3 w-3" />}
              {etapa}
            </button>
          )
        })}

        {/* Agregar etapa personalizada */}
        {addingCustom ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarCustom(); if (e.key === 'Escape') { setAddingCustom(false); setCustom('') } }}
              placeholder="Etapa personalizada…"
              className="h-7 w-40 rounded-full border border-amber-500/30 bg-white/5 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            />
            <button onClick={guardarCustom} disabled={update.isPending} className="rounded-full p-1 text-emerald-400 hover:bg-white/10">
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => { setAddingCustom(false); setCustom('') }} className="rounded-full p-1 text-zinc-500 hover:bg-white/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setAddingCustom(true)}
            disabled={update.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-white/5 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Otra
          </button>
        )}
      </div>

      {!etapaActual && (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          Marcá en qué etapa está el expediente. Tocá una etapa pasada para saltar directo a ella.
        </p>
      )}
    </Card>
  )
}
