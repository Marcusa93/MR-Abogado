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
  sentencia: 'bg-rose-500/15 text-rose-400',
  traslado: 'bg-violet-500/15 text-violet-400',
  audiencia: 'bg-amber-500/15 text-amber-400',
  prueba: 'bg-blue-500/15 text-blue-400',
  embargo: 'bg-orange-500/15 text-orange-400',
  cedula: 'bg-sky-500/15 text-sky-400',
  oficio: 'bg-teal-500/15 text-teal-400',
  intimacion: 'bg-red-500/15 text-red-400',
  planilla: 'bg-indigo-500/15 text-indigo-400',
  informe: 'bg-cyan-500/15 text-cyan-400',
  decreto: 'bg-purple-500/15 text-purple-400',
  escrito_parte: 'bg-emerald-500/15 text-emerald-400',
  otro: 'bg-zinc-500/15 text-zinc-400',
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
      className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/5 hover:border-white/10"
    >
      <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5', TIPO_COLORS[act.tipo_movimiento] ?? TIPO_COLORS.otro)}>
        <TipoIcon tipo={act.tipo_movimiento} className="h-3 w-3" />
        {TIPO_LABELS[act.tipo_movimiento] ?? act.tipo_movimiento}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-200 line-clamp-1 leading-snug font-medium">
          {act.titulo}
        </p>
        {act.ai_summary && (
          <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2 leading-snug flex items-start gap-1">
            <Sparkles className="h-2.5 w-2.5 shrink-0 mt-[3px] text-violet-400" />
            <span>{act.ai_summary}</span>
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-500 truncate">
          {act.expediente_numero ? `${act.expediente_numero} · ` : ''}
          {act.expediente_caratula ?? 'Sin carátula'}
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5">
          Llegó {timeAgo(act.created_at)}
        </p>
      </div>

      <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-1 text-zinc-600 transition-colors group-hover:text-cyan-400" />
    </Link>
  )
}

export function ActuacionesRecientesPanel() {
  const { data: actuaciones = [], isLoading } = useActuacionesRecientes()

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Actuaciones SAE recientes</h3>
          {actuaciones.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] px-1.5 py-0 min-w-[1.25rem] h-5 font-medium">
              {actuaciones.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-500">últimas 48h</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 rounded-lg bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : actuaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Database className="h-7 w-7 text-zinc-700 mb-2" />
          <p className="text-xs text-zinc-500">Sin actuaciones nuevas en las últimas 48h.</p>
          <p className="text-[10px] text-zinc-600 mt-1">Sincronizá tus expedientes desde el tab SAE.</p>
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
