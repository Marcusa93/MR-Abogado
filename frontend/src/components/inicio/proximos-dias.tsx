import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { usePlazosProximos } from '@/hooks/use-sae-dashboard'
import { useProximosEventos } from '@/hooks/use-proximos-eventos'
import { useTareas, useCompletarTarea, expedienteLabel } from '@/hooks/use-tareas'
import { VerTareaDialog } from '@/components/expedientes/ver-tarea-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const DIAS = 14
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

type Tipo = 'audiencia' | 'reunion' | 'plazo' | 'tarea'

interface Fila {
  key: string
  tipo: Tipo
  fecha: string
  hora: string | null
  titulo: string
  detalle: string | null
  href: string | null
  tareaId?: string
  urgente?: boolean
}

const ETIQUETA: Record<Tipo, string> = { audiencia: 'AUD', reunion: 'REU', plazo: 'PLAZO', tarea: 'TAREA' }
const COLOR: Record<Tipo, string> = {
  audiencia: 'text-violet-600 dark:text-violet-300',
  reunion: 'text-sky-600 dark:text-sky-300',
  plazo: 'text-rose-600 dark:text-rose-300',
  tarea: 'text-zinc-500 dark:text-zinc-400',
}

function etiquetaDia(f: string, hoy: string) {
  if (f < hoy) return 'Vencido'
  if (f === hoy) return 'Hoy'
  if (f === sumarDias(hoy, 1)) return 'Mañana'
  const d = new Date(f + 'T12:00:00')
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ProximosDias({ profileId }: { profileId: string }) {
  const hoy = hoyISO()
  const hasta = sumarDias(hoy, DIAS)
  const { data: plazos = [], isLoading: l1 } = usePlazosProximos()
  const { data: eventos = [], isLoading: l2 } = useProximosEventos(DIAS)
  const { data: tareasData, isLoading: l3 } = useTareas({
    asignado_a: profileId, pageSize: 100, sortBy: 'fecha_vencimiento', sortOrder: 'asc',
  })
  const completar = useCompletarTarea()
  const [verTarea, setVerTarea] = useState<unknown>(null)

  const tareas = useMemo(
    () => (tareasData?.data ?? []).filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO'),
    [tareasData],
  )

  const { grupos, sinFecha } = useMemo(() => {
    const filas: Fila[] = []
    for (const e of eventos) {
      filas.push({
        key: 'e' + e.id, tipo: e.tipo, fecha: e.fecha, hora: e.hora, titulo: e.titulo,
        detalle: e.subtitulo, href: e.expediente_id ? `/expedientes/${e.expediente_id}` : '/agenda',
      })
    }
    for (const p of plazos) {
      filas.push({
        key: 'p' + p.movement_id, tipo: 'plazo', fecha: p.plazo.vence_aprox, hora: null,
        titulo: p.plazo.descripcion || p.movimiento_titulo,
        detalle: p.expediente_caratula ?? p.expediente_numero, href: `/expedientes/${p.expediente_id}`,
        urgente: p.diasRestantes <= 2,
      })
    }
    let sinFecha = 0
    for (const t of tareas) {
      if (!t.fecha_vencimiento) { sinFecha++; continue }
      const f = t.fecha_vencimiento.slice(0, 10)
      if (f > hasta) continue
      filas.push({
        key: 't' + t.id, tipo: (t as { es_plazo_judicial?: boolean }).es_plazo_judicial ? 'plazo' : 'tarea',
        fecha: f, hora: null, titulo: t.titulo, detalle: expedienteLabel(t.expediente) || null,
        href: null, tareaId: t.id, urgente: t.prioridad === 'URGENTE' || t.prioridad === 'ALTA',
      })
    }
    filas.sort((a, b) => (a.fecha + (a.hora ?? '99')).localeCompare(b.fecha + (b.hora ?? '99')))

    const grupos: { dia: string; filas: Fila[] }[] = []
    for (const f of filas) {
      const dia = etiquetaDia(f.fecha, hoy)
      const ult = grupos[grupos.length - 1]
      if (ult && ult.dia === dia) ult.filas.push(f)
      else grupos.push({ dia, filas: [f] })
    }
    return { grupos, sinFecha }
  }, [eventos, plazos, tareas, hoy, hasta])

  const cargando = l1 || l2 || l3

  const hecha = async (id: string) => {
    try {
      await completar.mutateAsync(id)
      toast.success('Tarea completada')
    } catch (e) {
      toast.error('No se pudo completar la tarea', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <section className="app-card">
      <header className="flex items-center gap-2 border-b border-zinc-200/80 px-4 py-3.5 dark:border-white/[0.06]">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Próximos días</h2>
        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{DIAS}d</span>
        <Link to="/agenda" className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300">
          Agenda <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      {cargando ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-zinc-100 dark:bg-white/[0.04]" />)}</div>
      ) : grupos.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-zinc-500 dark:text-zinc-400">Sin audiencias, plazos ni tareas en los próximos {DIAS} días.</p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto py-1">
          {grupos.map((g) => (
            <div key={g.dia} className="px-4 py-2">
              <p className={cn(
                'mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em]',
                g.dia === 'Vencido' ? 'text-rose-600 dark:text-rose-400' : g.dia === 'Hoy' ? 'text-cyan-700 dark:text-cyan-300' : 'text-zinc-400 dark:text-zinc-500',
              )}>
                {g.dia}{g.dia === 'Vencido' && ` · ${g.filas.length}`}
              </p>
              <ul className="space-y-0.5">
                {g.filas.map((f) => {
                  const cuerpo = (
                    <>
                      <span className={cn('w-[46px] shrink-0 pt-px font-mono text-[10.5px]', f.hora ? 'text-zinc-700 dark:text-zinc-200' : COLOR[f.tipo])}>
                        {f.hora ? f.hora.slice(0, 5) : ETIQUETA[f.tipo]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[13px] text-zinc-800 dark:text-zinc-200', f.urgente && 'font-medium')}>
                          {f.hora && <span className={cn('mr-1.5 font-mono text-[10px]', COLOR[f.tipo])}>{ETIQUETA[f.tipo]}</span>}
                          {f.titulo}
                        </span>
                        {f.detalle && <span className="block truncate text-[11.5px] text-zinc-500">{f.detalle}</span>}
                      </span>
                    </>
                  )
                  return (
                    <li key={f.key} className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                      {f.tareaId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setVerTarea(tareas.find((t) => t.id === f.tareaId) ?? null)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            {cuerpo}
                          </button>
                          <button
                            type="button"
                            onClick={() => hecha(f.tareaId!)}
                            disabled={completar.isPending}
                            title="Marcar hecha"
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-300 text-transparent transition-colors hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-50 dark:border-white/15"
                          >
                            {completar.isPending && completar.variables === f.tareaId ? <Loader2 className="h-3 w-3 animate-spin text-zinc-400" /> : <Check className="h-3 w-3" />}
                          </button>
                        </>
                      ) : (
                        <Link to={f.href ?? '/agenda'} className="flex min-w-0 flex-1 items-start gap-2">{cuerpo}</Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {sinFecha > 0 && (
        <Link to={`/tareas?asignado_a=${profileId}`} className="block border-t border-zinc-200/80 px-4 py-2.5 text-[12px] text-zinc-500 hover:text-zinc-800 dark:border-white/[0.06] dark:hover:text-zinc-200">
          {sinFecha} tarea{sinFecha > 1 ? 's' : ''} sin fecha →
        </Link>
      )}

      <VerTareaDialog open={verTarea !== null} onClose={() => setVerTarea(null)} tarea={verTarea as never} />
    </section>
  )
}
