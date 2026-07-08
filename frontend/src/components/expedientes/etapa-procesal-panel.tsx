import { useState } from 'react'
import { Check, Plus, X, Loader2, Sparkles } from 'lucide-react'
import { Card } from './detail-helpers'
import { useUpdateExpediente } from '@/hooks/use-expedientes'
import { createClient } from '@/lib/supabase/client'
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
  const [sugiriendo, setSugiriendo] = useState(false)
  const [sugerencia, setSugerencia] = useState<{ etapa: string; razon: string } | null>(null)

  const sugerir = async () => {
    setSugiriendo(true); setSugerencia(null)
    try {
      const { data, error } = await createClient().functions.invoke('sugerir-etapa', { body: { expediente_id: expedienteId } })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      setSugerencia(data as { etapa: string; razon: string })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sugerir la etapa')
    } finally {
      setSugiriendo(false)
    }
  }

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
    <Card
      title="Etapa procesal"
      headerRight={
        <button
          onClick={sugerir}
          disabled={sugiriendo || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/25 disabled:opacity-50"
          title="Inferir la etapa a partir de las actuaciones"
        >
          {sugiriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Sugerir (IA)
        </button>
      }
    >
      {sugerencia && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.07] px-3 py-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-100">
              La IA sugiere: <span className="font-semibold text-violet-200">{sugerencia.etapa}</span>
            </p>
            {sugerencia.razon && <p className="mt-0.5 text-[11px] text-zinc-400">{sugerencia.razon}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => { setEtapa(sugerencia.etapa); setSugerencia(null) }}
              disabled={update.isPending}
              className="rounded-md bg-violet-500/20 px-2 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/30 disabled:opacity-50"
            >
              Aplicar
            </button>
            <button onClick={() => setSugerencia(null)} className="rounded-md p-1 text-zinc-500 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

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
