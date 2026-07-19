import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays, CheckSquare, Scale, Clock,
  ChevronLeft, ChevronRight, List, X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { AppSplash } from '@/components/shared/app-splash'
import { cn } from '@/lib/utils'

// Secretaria usa su vista específica (lazy)
const AgendaSecretaria = lazy(() => import('./agenda-secretaria'))

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface AgendaItem {
  id: string
  kind: 'audiencia' | 'tarea' | 'plazo'
  fecha: string  // YYYY-MM-DD
  hora?: string | null
  titulo: string
  subtitulo?: string | null
  expedienteId?: string | null
  expedienteCaratula?: string | null
  prioridad?: string | null
  estadoLabel?: string | null
}

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

function isoHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoShift(baseISO: string, days: number): string {
  const d = new Date(baseISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const DIAS_ES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_ES[date.getUTCDay()]} ${d} de ${MESES_ES[m - 1]}`
}

function labelFecha(iso: string, hoy: string): string {
  const man = isoShift(hoy, 1)
  if (iso === hoy) return `Hoy — ${formatFechaLarga(iso)}`
  if (iso === man)  return `Mañana — ${formatFechaLarga(iso)}`
  return formatFechaLarga(iso)
}

function isHoyLabel(iso: string, hoy: string) { return iso === hoy }
function isVencida(iso: string, hoy: string)  { return iso < hoy }

function prevMes(mes: { year: number; month: number }) {
  return mes.month === 1 ? { year: mes.year - 1, month: 12 } : { year: mes.year, month: mes.month - 1 }
}
function nextMes(mes: { year: number; month: number }) {
  return mes.month === 12 ? { year: mes.year + 1, month: 1 } : { year: mes.year, month: mes.month + 1 }
}

// Construye la grilla del mes: semanas comenzando en lunes, con null en celdas vacías
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay  = new Date(Date.UTC(year, month, 0))
  const firstDow = firstDay.getUTCDay()          // 0=dom…6=sáb
  const offset   = firstDow === 0 ? 6 : firstDow - 1  // lunes = índice 0

  const cells: (string | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getUTCDate(); d++) {
    cells.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

// ---------------------------------------------------------------------------
// Hook de datos — rango amplio para cubrir lista + navegación en calendario
// ---------------------------------------------------------------------------

function useAgendaUnificada() {
  const hoy  = isoHoy()
  const desde = isoShift(hoy, -30)  // un mes atrás (tareas vencidas en el calendario)
  const hasta = isoShift(hoy, 90)   // tres meses adelante

  const { data: audiencias = [], isLoading: aud_loading } = useQuery({
    queryKey: ['agenda-audiencias', hoy],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('audiencias')
        .select(`
          id, fecha, hora, estado,
          expedientes!inner(id, caratula, numero),
          catalogo_tipos_audiencia(nombre),
          organismos(nombre)
        `)
        .gte('fecha', hoy)
        .lte('fecha', hasta)
        .in('estado', ['PENDIENTE', 'CONFIRMADA'])
        .order('fecha')
        .limit(200)
      return data ?? []
    },
    staleTime: 60_000,
  })

  const { data: tareas = [], isLoading: tar_loading } = useQuery({
    queryKey: ['agenda-tareas', hoy],
    queryFn: async () => {
      const supabase = createClient()
      // es_plazo_judicial existe en DB pero no en tipos generados — cast a any
      const { data } = await (supabase as any)
        .from('tareas')
        .select(`
          id, titulo, fecha_vencimiento, prioridad, estado, es_plazo_judicial,
          expedientes(id, caratula, numero)
        `)
        .not('fecha_vencimiento', 'is', null)
        .gte('fecha_vencimiento', desde)
        .lte('fecha_vencimiento', hasta)
        .neq('estado', 'COMPLETADA')
        .neq('estado', 'CANCELADA')
        .order('fecha_vencimiento')
        .limit(300)
      return (data ?? []) as any[]
    },
    staleTime: 60_000,
  })

  const items: AgendaItem[] = useMemo(() => {
    const list: AgendaItem[] = []

    for (const a of audiencias) {
      const exp  = (a as any).expedientes
      const tipo = (a as any).catalogo_tipos_audiencia
      const org  = (a as any).organismos
      list.push({
        id: a.id,
        kind: 'audiencia',
        fecha: a.fecha,
        hora: a.hora,
        titulo: tipo?.nombre ?? 'Audiencia',
        subtitulo: org?.nombre ?? null,
        expedienteId: exp?.id ?? null,
        expedienteCaratula: exp?.caratula ?? exp?.numero ?? null,
      })
    }

    for (const t of tareas) {
      const exp = (t as any).expedientes
      list.push({
        id: t.id,
        kind: (t as any).es_plazo_judicial ? 'plazo' : 'tarea',
        fecha: t.fecha_vencimiento!,
        titulo: t.titulo,
        expedienteId: exp?.id ?? null,
        expedienteCaratula: exp?.caratula ?? exp?.numero ?? null,
        prioridad: t.prioridad,
        estadoLabel: t.estado,
      })
    }

    return list.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
      if (a.hora && !b.hora) return -1
      if (!a.hora && b.hora) return 1
      if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
      return 0
    })
  }, [audiencias, tareas])

  const grouped = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    for (const item of items) {
      if (!map[item.fecha]) map[item.fecha] = []
      map[item.fecha].push(item)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const groupedMap: Record<string, AgendaItem[]> = useMemo(
    () => Object.fromEntries(grouped),
    [grouped]
  )

  return {
    grouped,
    groupedMap,
    isLoading: aud_loading || tar_loading,
  }
}

// ---------------------------------------------------------------------------
// AgendaItemCard
// ---------------------------------------------------------------------------

function AgendaItemCard({ item, hoy }: { item: AgendaItem; hoy: string }) {
  const vencida  = isVencida(item.fecha, hoy)
  const iconColor = item.kind === 'audiencia' ? 'text-sky-500' : item.kind === 'plazo' ? 'text-rose-500' : 'text-amber-500'
  const Icon = item.kind === 'audiencia' ? Scale : item.kind === 'plazo' ? Clock : CheckSquare

  const inner = (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
      vencida && item.kind !== 'audiencia'
        ? 'border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10'
        : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-50 dark:hover:bg-white/8'
    )}>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-white/10">
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.titulo}</span>
          {item.hora && (
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 shrink-0">{item.hora.slice(0, 5)}</span>
          )}
          {vencida && item.kind !== 'audiencia' && (
            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">Vencida</span>
          )}
          {item.prioridad === 'URGENTE' && (
            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">Urgente</span>
          )}
        </div>
        {(item.expedienteCaratula || item.subtitulo) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {item.subtitulo && <span>{item.subtitulo}</span>}
            {item.subtitulo && item.expedienteCaratula && <span className="mx-1">·</span>}
            {item.expedienteCaratula && <span>{item.expedienteCaratula}</span>}
          </p>
        )}
      </div>
    </div>
  )

  if (item.expedienteId) {
    return <Link to={`/expedientes/${item.expedienteId}`} className="block">{inner}</Link>
  }
  return inner
}

// ---------------------------------------------------------------------------
// CalendarioMes
// ---------------------------------------------------------------------------

const CABECERA_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function CalendarioMes({
  mes,
  onPrev,
  onNext,
  onHoy,
  groupedMap,
  diaSeleccionado,
  onSelectDia,
  hoy,
}: {
  mes: { year: number; month: number }
  onPrev: () => void
  onNext: () => void
  onHoy: () => void
  groupedMap: Record<string, AgendaItem[]>
  diaSeleccionado: string | null
  onSelectDia: (dia: string | null) => void
  hoy: string
}) {
  const rows = buildMonthGrid(mes.year, mes.month)
  const nombreMes = MESES_ES[mes.month - 1]!
  const mesLabel = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1) + ' ' + mes.year

  const esMesActual = mes.year === Number(hoy.slice(0, 4)) && mes.month === Number(hoy.slice(5, 7))

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">

      {/* Cabecera del mes */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-white/5">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          title="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{mesLabel}</span>
          {!esMesActual && (
            <button
              type="button"
              onClick={onHoy}
              className="rounded-md border border-zinc-200 dark:border-white/10 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              Hoy
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNext}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          title="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-white/5">
        {CABECERA_SEMANA.map((d, i) => (
          <div
            key={i}
            className={cn(
              'py-2 text-center text-[11px] font-semibold',
              i >= 5 ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Celdas del mes */}
      <div>
        {rows.map((row, ri) => (
          <div
            key={ri}
            className="grid grid-cols-7 divide-x divide-zinc-100 dark:divide-white/5 border-b border-zinc-100 dark:divide-white/5 last:border-b-0"
          >
            {row.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className={cn(
                      'min-h-[72px] sm:min-h-[88px]',
                      di >= 5 ? 'bg-zinc-50/60 dark:bg-black/10' : 'bg-zinc-50/30 dark:bg-black/5'
                    )}
                  />
                )
              }

              const dayItems   = groupedMap[date] ?? []
              const isHoy      = date === hoy
              const isSelected = date === diaSeleccionado
              const isPast     = date < hoy
              const isWeekend  = di >= 5
              const dayNum     = parseInt(date.slice(8))

              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => onSelectDia(isSelected ? null : date)}
                  className={cn(
                    'min-h-[72px] sm:min-h-[88px] p-1.5 text-left align-top transition-colors relative',
                    isSelected
                      ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30'
                      : isHoy
                      ? 'bg-amber-500/5'
                      : isPast && !isWeekend
                      ? 'bg-transparent'
                      : isWeekend
                      ? 'bg-zinc-50/50 dark:bg-black/8'
                      : 'hover:bg-zinc-50 dark:hover:bg-white/3'
                  )}
                >
                  {/* Número del día */}
                  <div className={cn(
                    'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium leading-none',
                    isHoy
                      ? 'bg-amber-500 text-white font-bold'
                      : isPast
                      ? 'text-zinc-400 dark:text-zinc-600'
                      : isWeekend
                      ? 'text-zinc-500 dark:text-zinc-500'
                      : 'text-zinc-700 dark:text-zinc-300'
                  )}>
                    {dayNum}
                  </div>

                  {/* Eventos: etiquetas en desktop, puntos en mobile */}
                  {dayItems.length > 0 && (
                    <div className="space-y-0.5">
                      {/* Etiquetas de texto (sm+) */}
                      <div className="hidden sm:block space-y-0.5">
                        {dayItems.slice(0, 2).map((item, i) => (
                          <div
                            key={i}
                            className={cn(
                              'truncate rounded px-1 py-px text-[10px] leading-[1.3]',
                              item.kind === 'audiencia'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : item.kind === 'plazo'
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            )}
                          >
                            {item.hora ? `${item.hora.slice(0, 5)} ` : ''}{item.titulo}
                          </div>
                        ))}
                        {dayItems.length > 2 && (
                          <div className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                            +{dayItems.length - 2} más
                          </div>
                        )}
                      </div>

                      {/* Puntos de color (solo mobile) */}
                      <div className="flex gap-0.5 sm:hidden flex-wrap">
                        {dayItems.slice(0, 4).map((item, i) => (
                          <span
                            key={i}
                            className={cn(
                              'h-1.5 w-1.5 rounded-full shrink-0',
                              item.kind === 'audiencia' ? 'bg-sky-500' :
                              item.kind === 'plazo' ? 'bg-rose-500' : 'bg-amber-500'
                            )}
                          />
                        ))}
                        {dayItems.length > 4 && (
                          <span className="text-[9px] text-zinc-400">+{dayItems.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel del día seleccionado
// ---------------------------------------------------------------------------

function DiaSeleccionadoPanel({
  fecha,
  items,
  hoy,
  onClose,
}: {
  fecha: string
  items: AgendaItem[]
  hoy: string
  onClose: () => void
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/5">
        <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">
          {labelFecha(fecha, hoy)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-2 text-center">
            Sin eventos para este día
          </p>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <AgendaItemCard key={`${item.kind}-${item.id}`} item={item} hoy={hoy} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista skeleton (loading)
// ---------------------------------------------------------------------------

function AgendaSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
          <div className="h-16 rounded-lg bg-zinc-100 dark:bg-white/5 animate-pulse" />
          <div className="h-16 rounded-lg bg-zinc-100 dark:bg-white/5 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista unificada — componente principal
// ---------------------------------------------------------------------------

function AgendaUnificada() {
  const hoy = isoHoy()
  const { grouped, groupedMap, isLoading } = useAgendaUnificada()

  // Vista: lista o calendario
  const [vista, setVista] = useState<'lista' | 'calendario'>(() => {
    try { return (localStorage.getItem('agenda-vista') as 'lista' | 'calendario') ?? 'lista' }
    catch { return 'lista' }
  })

  // Mes mostrado en el calendario
  const [mesCalendario, setMesCalendario] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  // Día seleccionado en el calendario
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  function cambiarVista(v: 'lista' | 'calendario') {
    setVista(v)
    try { localStorage.setItem('agenda-vista', v) } catch {}
    if (v === 'calendario') setDiaSeleccionado(null)
  }

  // Items de la lista filtrados a los próximos 45 días (subset del rango total)
  const hoy45 = isoShift(hoy, 45)
  const hoyMinus3 = isoShift(hoy, -3)
  const groupedLista = useMemo(
    () => grouped.filter(([fecha]) => fecha >= hoyMinus3 && fecha <= hoy45),
    [grouped, hoyMinus3, hoy45]
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 dark:bg-amber-500/10">
            <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Agenda</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {vista === 'lista' ? 'Próximos 45 días' : 'Vista mensual'} · audiencias, tareas y plazos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Leyenda */}
          <div className="hidden md:flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Audiencia</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Plazo</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Tarea</span>
          </div>

          {/* Toggle de vista */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-white/10 p-1 gap-1">
            <button
              type="button"
              onClick={() => cambiarVista('lista')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                vista === 'lista'
                  ? 'bg-amber-500 text-white'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => cambiarVista('calendario')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                vista === 'calendario'
                  ? 'bg-amber-500 text-white'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendario
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <AgendaSkeleton />
      ) : vista === 'lista' ? (

        // ── Vista lista ──────────────────────────────────────────────────────
        groupedLista.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-6 py-12 text-center">
            <CalendarDays className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Sin eventos próximos</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              No hay audiencias ni tareas con vencimiento en los próximos 45 días.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLista.map(([fecha, items]) => (
              <div key={fecha}>
                <div className={cn(
                  'flex items-center gap-2 mb-3',
                  isHoyLabel(fecha, hoy) && 'sticky top-0 z-10 bg-[var(--layout-bg)]/95 backdrop-blur-sm py-1 -mx-1 px-1 rounded'
                )}>
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    isHoyLabel(fecha, hoy) ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
                  )} />
                  <span className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    isHoyLabel(fecha, hoy) ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
                  )}>
                    {labelFecha(fecha, hoy)}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {items.length} {items.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
                <div className="space-y-2 ml-4">
                  {items.map(item => (
                    <AgendaItemCard key={`${item.kind}-${item.id}`} item={item} hoy={hoy} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )

      ) : (

        // ── Vista calendario ─────────────────────────────────────────────────
        <div className="space-y-4">
          <CalendarioMes
            mes={mesCalendario}
            onPrev={() => { setMesCalendario(prevMes); setDiaSeleccionado(null) }}
            onNext={() => { setMesCalendario(nextMes); setDiaSeleccionado(null) }}
            onHoy={() => {
              const d = new Date()
              setMesCalendario({ year: d.getFullYear(), month: d.getMonth() + 1 })
              setDiaSeleccionado(null)
            }}
            groupedMap={groupedMap}
            diaSeleccionado={diaSeleccionado}
            onSelectDia={setDiaSeleccionado}
            hoy={hoy}
          />

          {diaSeleccionado && (
            <DiaSeleccionadoPanel
              fecha={diaSeleccionado}
              items={groupedMap[diaSeleccionado] ?? []}
              hoy={hoy}
              onClose={() => setDiaSeleccionado(null)}
            />
          )}
        </div>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Export — adaptive por rol
// ---------------------------------------------------------------------------

export default function AgendaPage() {
  const rol = useAuthStore(s => s.profile?.rol)

  if (rol === 'SECRETARIA') {
    return (
      <Suspense fallback={<AppSplash fullscreen={false} message="Cargando agenda" />}>
        <AgendaSecretaria />
      </Suspense>
    )
  }

  return <AgendaUnificada />
}
