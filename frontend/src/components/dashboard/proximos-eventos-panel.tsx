import { Link } from 'react-router-dom'
import { CalendarClock, Gavel, Users, Clock } from 'lucide-react'
import { useProximosEventos, type ProximoEvento } from '@/hooks/use-proximos-eventos'
import { cn } from '@/lib/utils'

function labelFecha(fechaISO: string): string {
  const hoy = new Date().toISOString().slice(0, 10)
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (fechaISO === hoy) return 'Hoy'
  if (fechaISO === manana) return 'Mañana'
  // Formato local: "lun. 14 ene."
  const d = new Date(fechaISO + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function EventoRow({ ev }: { ev: ProximoEvento }) {
  const esAudiencia = ev.tipo === 'audiencia'
  const inner = (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
      esAudiencia
        ? 'border-cyan-500/20 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]'
        : 'border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]',
    )}>
      <div className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
        esAudiencia ? 'bg-cyan-500/15' : 'bg-amber-500/15',
      )}>
        {esAudiencia
          ? <Gavel className="h-3.5 w-3.5 text-cyan-400" />
          : <Users className="h-3.5 w-3.5 text-amber-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 line-clamp-1">{ev.titulo}</p>
        {ev.subtitulo && (
          <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">{ev.subtitulo}</p>
        )}
      </div>
      {ev.hora && (
        <span className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
          esAudiencia ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300',
        )}>
          <Clock className="h-2.5 w-2.5" />
          {ev.hora}
        </span>
      )}
    </div>
  )

  if (esAudiencia && ev.expediente_id) {
    return <Link key={ev.id} to={`/expedientes/${ev.expediente_id}`}>{inner}</Link>
  }
  if (!esAudiencia) {
    return <Link key={ev.id} to={`/consultas/${ev.id}`}>{inner}</Link>
  }
  return <div key={ev.id}>{inner}</div>
}

export function ProximosEventosPanel({ days = 30 }: { days?: number }) {
  const { data: eventos = [], isLoading } = useProximosEventos(days)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Próximos {days} días</h3>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // Agrupar por fecha
  const grupos = new Map<string, ProximoEvento[]>()
  for (const ev of eventos) {
    const arr = grupos.get(ev.fecha) ?? []
    arr.push(ev)
    grupos.set(ev.fecha, arr)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Próximos {days} días</h3>
          {eventos.length > 0 && (
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
              {eventos.length}
            </span>
          )}
        </div>
        <Link to="/agenda" className="text-[11px] text-cyan-400 hover:text-cyan-300">
          Ver agenda →
        </Link>
      </div>

      {grupos.size === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">
          Sin audiencias ni reuniones en los próximos {days} días.
        </p>
      ) : (
        <div className="space-y-4">
          {[...grupos.entries()].map(([fecha, evs]) => (
            <div key={fecha}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {labelFecha(fecha)}
              </p>
              <div className="space-y-1.5">
                {evs.map(ev => <EventoRow key={ev.id} ev={ev} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
