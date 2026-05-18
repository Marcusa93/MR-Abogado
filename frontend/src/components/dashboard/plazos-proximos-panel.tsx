import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlazosProximos, type PlazoProximo } from '@/hooks/use-sae-dashboard'
import { Clock, Sparkles, ArrowRight, AlertTriangle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'

const PRIORIDAD_STYLES: Record<PlazoProximo['prioridad'], { dot: string; text: string; pill: string }> = {
  URGENTE: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300', pill: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
  ALTA: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  MEDIA: { dot: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', pill: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' },
  BAJA: { dot: 'bg-zinc-500', text: 'text-zinc-700 dark:text-zinc-300', pill: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30' },
}

function PlazoRow({ plazo, onCreateTarea }: { plazo: PlazoProximo; onCreateTarea: (p: PlazoProximo) => void }) {
  const style = PRIORIDAD_STYLES[plazo.prioridad]
  const restantes = plazo.diasRestantes
  const restantesLabel = restantes === 0 ? 'hoy' : restantes === 1 ? 'mañana' : `en ${restantes} días`

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-[rgb(87_124_142_/_10%)] bg-white/65 px-3.5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:border-white/6 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
      <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', style.dot)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', style.pill)}>
            <Clock className="h-2.5 w-2.5" />
            Vence {restantesLabel}
          </span>
          <span className="text-[10px] text-zinc-500">{formatDate(plazo.plazo.vence_aprox)}</span>
        </div>
        <p className="mt-1 text-xs leading-snug text-zinc-800 dark:text-zinc-100 line-clamp-2 dark:text-zinc-100">
          {plazo.plazo.descripcion}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500 truncate">
          {plazo.expediente_numero ? `${plazo.expediente_numero} · ` : ''}
          {plazo.expediente_caratula ?? 'Sin carátula'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={(e) => { e.preventDefault(); onCreateTarea(plazo) }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:brightness-125',
              style.pill,
            )}
            title="Crear una tarea con esta fecha de vencimiento"
          >
            <Plus className="h-2.5 w-2.5" />
            Crear tarea
          </button>
          <Link
            to={`/expedientes/${plazo.expediente_id}`}
            className="dashboard-link inline-flex items-center gap-1 text-[10px] font-semibold"
          >
            Ver expediente
            <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function PlazosProximosPanelView({
  plazos,
  isLoading,
}: {
  plazos: PlazoProximo[]
  isLoading: boolean
}) {
  const [tareaPrefill, setTareaPrefill] = useState<{
    open: boolean
    expedienteId?: string
    values?: { titulo: string; descripcion: string; fechaVencimiento: string; prioridad: PlazoProximo['prioridad'] }
  }>({ open: false })

  const handleCreateTarea = (p: PlazoProximo) => {
    setTareaPrefill({
      open: true,
      expedienteId: p.expediente_id,
      values: {
        titulo: `Plazo: ${p.plazo.descripcion.slice(0, 80)}`,
        descripcion: `Plazo extraído por IA de la actuación "${p.movimiento_titulo}".\n\nDescripción: ${p.plazo.descripcion}\nDías: ${p.plazo.dias} ${p.plazo.habiles ? 'hábiles' : 'corridos'}\nVence: ${p.plazo.vence_aprox}`,
        fechaVencimiento: p.plazo.vence_aprox,
        prioridad: p.prioridad,
      },
    })
  }

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">sae intelligence</p>
          <div className="mt-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Plazos por vencer</h3>
            {plazos.length > 0 && (
              <span className="dashboard-chip dashboard-chip-accent">
                {plazos.length}
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">7 días</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-14 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : plazos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="dashboard-stat-orb mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="text-xs text-zinc-500">No hay plazos detectados por IA en los próximos 7 días.</p>
          <p className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-1">Analizá actuaciones desde el tab SAE de un expediente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {plazos.map((p) => (
            <PlazoRow key={`${p.movement_id}-${p.plazo.vence_aprox}`} plazo={p} onCreateTarea={handleCreateTarea} />
          ))}
        </div>
      )}

      {tareaPrefill.expedienteId && (
        <CrearTareaDialog
          open={tareaPrefill.open}
          onClose={() => setTareaPrefill({ open: false })}
          expedienteId={tareaPrefill.expedienteId}
          initialValues={tareaPrefill.values}
        />
      )}
    </div>
  )
}

export function PlazosProximosPanel({ previewData }: { previewData?: PlazoProximo[] }) {
  if (previewData) {
    return <PlazosProximosPanelView plazos={previewData} isLoading={false} />
  }

  const { data: plazos = [], isLoading } = usePlazosProximos()
  return <PlazosProximosPanelView plazos={plazos} isLoading={isLoading} />
}
