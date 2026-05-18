import { Link } from 'react-router-dom'
import { useActuacionesRecientes, type ActuacionReciente } from '@/hooks/use-sae-dashboard'
import { Database, ArrowRight, Sparkles, Gavel, Calendar, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/date-helpers'

const TIPO_LABELS: Record<string, string> = {
  sentencia: 'Sentencia',
  traslado: 'Traslado',
  audiencia: 'Audiencia',
  prueba: 'Prueba',
  embargo: 'Embargo',
  cedula: 'Cédula',
  oficio: 'Oficio',
  intimacion: 'Intimación',
  planilla: 'Planilla',
  informe: 'Informe',
  decreto: 'Decreto',
  escrito_parte: 'Escrito',
  otro: 'Otro',
}

const TIPO_COLORS: Record<string, string> = {
  sentencia: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  traslado: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  audiencia: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  prueba: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  embargo: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  cedula: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  oficio: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  intimacion: 'bg-red-500/15 text-red-700 dark:text-red-300',
  planilla: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  informe: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  decreto: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  escrito_parte: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  otro: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
}

function TipoIcon({ tipo, className }: { tipo: string; className?: string }) {
  if (tipo === 'sentencia' || tipo === 'decreto') return <Gavel className={className} />
  if (tipo === 'audiencia') return <Calendar className={className} />
  return <FileText className={className} />
}

function ActuacionRow({ act }: { act: ActuacionReciente }) {
  return (
    <Link
      to={`/expedientes/${act.expediente_id}`}
      className="group flex items-start gap-3 rounded-xl border border-[rgb(87_124_142_/_10%)] bg-white/65 px-3.5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:border-white/6 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
    >
      <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5', TIPO_COLORS[act.tipo_movimiento] ?? TIPO_COLORS.otro)}>
        <TipoIcon tipo={act.tipo_movimiento} className="h-3 w-3" />
        {TIPO_LABELS[act.tipo_movimiento] ?? act.tipo_movimiento}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-100 line-clamp-1 dark:text-zinc-100">
          {act.titulo}
        </p>
        {act.ai_summary && (
          <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-zinc-500 line-clamp-2 dark:text-zinc-400">
            <Sparkles className="mt-[3px] h-2.5 w-2.5 shrink-0 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <span>{act.ai_summary}</span>
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-500 truncate">
          {act.expediente_numero ? `${act.expediente_numero} · ` : ''}
          {act.expediente_caratula ?? 'Sin carátula'}
        </p>
        <p className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5">
          Llegó {timeAgo(act.created_at)}
        </p>
      </div>

      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-[var(--brand-accent)] dark:group-hover:text-[var(--brand-ice)]" />
    </Link>
  )
}

function ActuacionesRecientesPanelView({
  actuaciones,
  isLoading,
}: {
  actuaciones: ActuacionReciente[]
  isLoading: boolean
}) {
  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">movimiento judicial</p>
          <div className="mt-1 flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Actuaciones SAE recientes</h3>
            {actuaciones.length > 0 && (
              <span className="dashboard-chip dashboard-chip-accent">
                {actuaciones.length}
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">48h</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : actuaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="dashboard-stat-orb mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Database className="h-6 w-6" />
          </div>
          <p className="text-xs text-zinc-500">Sin actuaciones nuevas en las últimas 48h.</p>
          <p className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-1">Sincronizá tus expedientes desde el tab SAE.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {actuaciones.map((a) => (
            <ActuacionRow key={a.id} act={a} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ActuacionesRecientesPanel({ previewData }: { previewData?: ActuacionReciente[] }) {
  if (previewData) {
    return <ActuacionesRecientesPanelView actuaciones={previewData} isLoading={false} />
  }

  const { data: actuaciones = [], isLoading } = useActuacionesRecientes()
  return <ActuacionesRecientesPanelView actuaciones={actuaciones} isLoading={isLoading} />
}
