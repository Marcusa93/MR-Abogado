import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Database, Gavel, User, Building2, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FichaCaso } from './ficha-caso'
import { ExpedienteSimilaresPanel } from './expediente-similares-panel'
import { LineaProceso } from './linea-proceso'
import { SALUD_STYLE } from './salud-indicador'
import { useExpedienteSalud } from '@/hooks/use-expediente-salud'
import { useSaeMovements } from '@/hooks/use-sae'
import { FUERO_LABELS } from '@/types/enums'

/* eslint-disable @typescript-eslint/no-explicit-any */

type IrA = (tab: string, sub?: string) => void

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const fmtCorta = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtFecha = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

function enDias(f: string) {
  const d = Math.round((new Date(f.slice(0, 10) + 'T12:00:00').getTime() - new Date(hoyISO() + 'T12:00:00').getTime()) / 86_400_000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d === -1) return 'ayer'
  return d > 0 ? `en ${d} días` : `hace ${-d} días`
}

function Bloque({ titulo, icon: Icon, accion, onAccion, children }: {
  titulo: string; icon: typeof User; accion?: string; onAccion?: () => void; children: React.ReactNode
}) {
  return (
    <section className="app-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 dashboard-eyebrow"><Icon className="h-3.5 w-3.5" />{titulo}</h3>
        {accion && onAccion && (
          <button onClick={onAccion} className="flex items-center gap-0.5 text-xs font-medium text-[var(--brand-navy)] hover:underline dark:text-cyan-300">
            {accion}<ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export function ResumenExpediente({ expediente, onIrA }: { expediente: any; onIrA: IrA }) {
  const id: string = expediente.id
  const tieneSae = !!expediente.numero_sae
  const { data: salud } = useExpedienteSalud(id)
  const { data: movimientos } = useSaeMovements(id)

  const hoy = hoyISO()
  const audiencias = ((expediente.audiencias ?? []) as any[])
    .filter((a) => a.estado !== 'CANCELADA' && a.fecha >= hoy)
    .sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')))
  const tareas = ((expediente.tareas ?? []) as any[])
    .filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')
    .sort((a, b) => (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999'))

  const proximos = [
    ...audiencias.slice(0, 3).map((a) => ({
      key: 'a' + a.id, fecha: a.fecha as string, tipo: 'audiencia' as const,
      texto: `Audiencia${a.hora ? ' · ' + String(a.hora).slice(0, 5) : ''}`,
      alerta: !a.profesional_asistente_id ? 'sin abogado asignado' : null,
    })),
    ...tareas.slice(0, 4).map((t) => ({
      key: 't' + t.id, fecha: (t.fecha_vencimiento ?? null) as string | null, tipo: (t.es_plazo_judicial ? 'plazo' : 'tarea') as 'plazo' | 'tarea',
      texto: t.titulo as string,
      alerta: t.asignado ? null : (t.asignado_a ? null : 'sin asignar'),
    })),
  ].sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')).slice(0, 5)

  const ultimos = (movimientos ?? []).slice(0, 3)
  const resp = expediente.abogado_responsable ?? ((expediente.miembros ?? []) as any[]).find((m) => m.rol === 'abogado')?.perfil ?? null
  const cliente = expediente.clientes
  const estilo = salud ? SALUD_STYLE[salud.semaforo] : null

  return (
    <div className="space-y-4">
      {/* Qué hay que mirar */}
      {salud && salud.motivos.length > 0 && estilo && (
        <div className={cn('app-card border-l-4 px-4 py-3', estilo.borde)}>
          <p className={cn('mb-1 flex items-center gap-1.5 text-sm font-semibold', estilo.texto)}>
            <AlertTriangle className="h-4 w-4" />{salud.semaforo === 'rojo' ? 'Urgente' : 'Para atender'}
          </p>
          <ul className="space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
            {salud.motivos.map((m) => <li key={m}>· {m}</li>)}
          </ul>
        </div>
      )}
      {salud && salud.motivos.length === 0 && salud.semaforo === 'verde' && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />En orden: sin plazos vencidos ni alertas.
        </p>
      )}

      <LineaProceso expedienteId={id} tieneSae={tieneSae} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <FichaCaso expedienteId={id} etapa={expediente.etapa_procesal ?? null} tieneSae={tieneSae} />
        </div>

        <div className="min-w-0 space-y-4">
          <Bloque titulo="Lo próximo" icon={CalendarClock} accion="Agenda" onAccion={() => onIrA('agenda')}>
            {proximos.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin audiencias ni tareas pendientes.</p>
            ) : (
              <ul className="space-y-2">
                {proximos.map((p) => {
                  const vencida = p.fecha != null && p.fecha < hoy
                  return (
                    <li key={p.key} className="flex items-start gap-2 text-sm">
                      {p.tipo === 'audiencia'
                        ? <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                        : <CheckSquare className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', p.tipo === 'plazo' ? 'text-rose-500' : 'text-emerald-500')} />}
                      <div className="min-w-0">
                        <p className="truncate text-zinc-800 dark:text-zinc-200">{p.tipo === 'plazo' ? 'Plazo: ' : ''}{p.texto}</p>
                        <p className={cn('text-xs', vencida ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400')}>
                          {p.fecha ? `${fmtCorta(p.fecha)} · ${vencida ? 'venció ' : ''}${enDias(p.fecha)}` : 'Sin fecha'}
                          {p.alerta && <span className="text-amber-600 dark:text-amber-400"> · {p.alerta}</span>}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Bloque>

          {tieneSae && (
            <Bloque titulo="Últimos movimientos" icon={Database} accion="Ver todos" onAccion={() => onIrA('expediente', 'actuaciones')}>
              {ultimos.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin movimientos sincronizados.</p>
              ) : (
                <ul className="space-y-2">
                  {ultimos.map((m) => (
                    <li key={m.id} className="text-sm">
                      <p className="line-clamp-2 text-zinc-800 dark:text-zinc-200">{(m as any).ai_summary || m.titulo}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.fecha ? fmtFecha(m.fecha) : ''}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          )}

          <Bloque titulo="Datos" icon={Building2} accion="Completos" onAccion={() => onIrA('expediente', 'datos')}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">Cliente</dt>
                <dd className="min-w-0 truncate">
                  {cliente
                    ? <Link to={`/clientes/${cliente.id}`} className="text-[var(--brand-navy)] hover:underline dark:text-cyan-300">{`${cliente.apellido ?? ''}, ${cliente.nombre ?? ''}`.replace(/^, |, $/, '')}</Link>
                    : <span className="text-zinc-400">—</span>}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">Responsable</dt>
                <dd className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                  {resp ? `${resp.nombre ?? ''} ${resp.apellido ?? ''}`.trim() : <span className="text-amber-600 dark:text-amber-400">Sin asignar</span>}
                </dd>
              </div>
              {expediente.organismo?.nombre && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">Juzgado</dt>
                  <dd className="min-w-0 text-zinc-800 dark:text-zinc-200">{expediente.organismo.nombre}</dd>
                </div>
              )}
              {expediente.fuero && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">Fuero</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{(FUERO_LABELS as Record<string, string>)[expediente.fuero] ?? expediente.fuero}</dd>
                </div>
              )}
              {expediente.fecha_alta && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">Alta</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{fmtFecha(expediente.fecha_alta)}</dd>
                </div>
              )}
            </dl>
          </Bloque>
        </div>
      </div>

      <ExpedienteSimilaresPanel expedienteId={id} />
    </div>
  )
}
