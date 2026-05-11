import { Link } from 'react-router-dom'
import { usePlazosProximos, type PlazoProximo } from '@/hooks/use-sae-dashboard'
import { Clock, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'

const PRIORIDAD_STYLES: Record<PlazoProximo['prioridad'], { dot: string; text: string; pill: string }> = {
  URGENTE: { dot: 'bg-red-500', text: 'text-red-300', pill: 'bg-red-500/15 text-red-300 border-red-500/30' },
  ALTA: { dot: 'bg-amber-500', text: 'text-amber-300', pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  MEDIA: { dot: 'bg-cyan-500', text: 'text-cyan-300', pill: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  BAJA: { dot: 'bg-zinc-500', text: 'text-zinc-300', pill: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
}

function PlazoRow({ plazo }: { plazo: PlazoProximo }) {
  const style = PRIORIDAD_STYLES[plazo.prioridad]
  const restantes = plazo.diasRestantes
  const restantesLabel = restantes === 0 ? 'hoy' : restantes === 1 ? 'mañana' : `en ${restantes} días`

  return (
    <Link
      to={`/expedientes/${plazo.expediente_id}`}
      className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/5 hover:border-white/10"
    >
      <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', style.dot)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', style.pill)}>
            <Clock className="h-2.5 w-2.5" />
            Vence {restantesLabel}
          </span>
          <span className="text-[10px] text-zinc-500">{formatDate(plazo.plazo.vence_aprox)}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-200 line-clamp-2 leading-snug">
          {plazo.plazo.descripcion}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500 truncate">
          {plazo.expediente_numero ? `${plazo.expediente_numero} · ` : ''}
          {plazo.expediente_caratula ?? 'Sin carátula'}
        </p>
      </div>

      <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-1 text-zinc-600 transition-colors group-hover:text-cyan-400" />
    </Link>
  )
}

export function PlazosProximosPanel() {
  const { data: plazos = [], isLoading } = usePlazosProximos()

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Plazos por vencer</h3>
          {plazos.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-violet-500/15 text-violet-300 text-[10px] px-1.5 py-0 min-w-[1.25rem] h-5 font-medium">
              {plazos.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-500">próximos 7 días · IA</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : plazos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-7 w-7 text-zinc-700 mb-2" />
          <p className="text-xs text-zinc-500">No hay plazos detectados por IA en los próximos 7 días.</p>
          <p className="text-[10px] text-zinc-600 mt-1">Analizá actuaciones desde el tab SAE de un expediente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {plazos.map((p) => (
            <PlazoRow key={`${p.movement_id}-${p.plazo.vence_aprox}`} plazo={p} />
          ))}
        </div>
      )}
    </div>
  )
}
