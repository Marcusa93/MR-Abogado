import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useTareas, useCompletarTarea } from '@/hooks/use-tareas'
import { useAlertas, useResolverAlerta } from '@/hooks/use-alertas'
import { useCreateSeguimiento, type CreateSeguimientoInput } from '@/hooks/use-seguimientos'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { CrearTurnoDialog } from '@/components/expedientes/crear-turno-dialog'
import { AgendarReuniónModal } from '@/components/shared/agendar-reunion-modal'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { formatDateWithWeekday } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import {
  Loader2,
  CheckCircle,
  Clock,
  CalendarClock,
  Bell,
  FileSearch,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertCircle,
  CheckSquare,
  Plus,
  Calendar,
  ListChecks,
  MapPin,
  Users,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgendaExpediente {
  id: string
  numero_expediente: string
  caratula: string
  estado_interno: string
  estado_organismo: string | null
  ultimo_seguimiento: string | null
  dias_sin_control: number
  clientes: { nombre: string; apellido: string } | null
}

const ESTADOS_EN_PROCESO = [
  'INICIADO',
  'PRUEBA',
  'ALEGATOS',
  'SENTENCIA',
  'APELACION',
  'CORTE',
] as const

interface AgendaTurno {
  id: string
  fecha: string
  hora: string | null
  tipo_audiencia?: { nombre: string } | null
  organismo?: { nombre: string } | null
  estado: string
  notas: string | null
  expediente: {
    id: string
    numero: string
    caratula: string
    clientes: { nombre: string; apellido: string } | null
  } | null
}

// ---------------------------------------------------------------------------
// Custom hook: agenda data
// ---------------------------------------------------------------------------

function useAgendaSecretaria() {
  const supabase = createClient()

  return useQuery<{ expedientes: AgendaExpediente[]; turnos: AgendaTurno[] }>({
    queryKey: ['agenda'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const past14 = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
      const next90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

      const { data: exps } = await supabase
        .from('expedientes')
        .select(
          `id, numero, caratula, estado_interno, estado_organismo, updated_at,
           clientes!expedientes_cliente_id_fkey (nombre, apellido)`
        )
        .in('estado_interno', ESTADOS_EN_PROCESO as unknown as string[])
        .is('deleted_at', null)
        .limit(60)

      const expedienteIds = (exps ?? []).map((e: any) => e.id)
      const ultimoPorExpediente = new Map<string, string>()

      if (expedienteIds.length > 0) {
        const { data: segs } = await supabase
          .from('seguimientos')
          .select('expediente_id, fecha_control')
          .in('expediente_id', expedienteIds)
          .order('fecha_control', { ascending: false })

        for (const s of segs ?? []) {
          if (!ultimoPorExpediente.has(s.expediente_id)) {
            ultimoPorExpediente.set(s.expediente_id, s.fecha_control)
          }
        }
      }

      const expedientes: AgendaExpediente[] = (exps ?? []).map((e: any) => {
        const ultimo = ultimoPorExpediente.get(e.id) ?? null
        const referencia = ultimo ?? e.updated_at ?? null
        const lastDate = referencia ? new Date(referencia).getTime() : 0
        const dias = lastDate
          ? Math.floor((Date.now() - lastDate) / 86400000)
          : 999
        return {
          id: e.id,
          numero_expediente: e.numero,
          caratula: e.caratula,
          estado_interno: e.estado_interno,
          estado_organismo: e.estado_organismo,
          ultimo_seguimiento: ultimo,
          dias_sin_control: dias,
          clientes: e.clientes,
        }
      })

      const { data: turnosData } = await supabase
        .from('audiencias')
        .select(
          `id, fecha, hora, estado, notas,
           tipo_audiencia:catalogo_tipos_audiencia!audiencias_tipo_audiencia_id_fkey (nombre),
           organismo:organismos!audiencias_organismo_id_fkey (nombre),
           expediente:expedientes!audiencias_expediente_id_fkey (
             id, numero, caratula,
             clientes!expedientes_cliente_id_fkey (nombre, apellido)
           )`
        )
        .gte('fecha', past14)
        .lte('fecha', next90)
        .in('estado', ['PENDIENTE', 'CONFIRMADA'])
        .order('fecha', { ascending: true })
        .limit(200)

      return {
        expedientes: expedientes
          .sort((a, b) => b.dias_sin_control - a.dias_sin_control)
          .slice(0, 30),
        turnos: (turnosData ?? []) as AgendaTurno[],
      }
    },
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Seguimiento Inline Form
// ---------------------------------------------------------------------------

function SeguimientoForm({
  expedienteId,
  onDone,
}: {
  expedienteId: string
  onDone: () => void
}) {
  const createSeguimiento = useCreateSeguimiento()
  const [canal, setCanal] = useState<CreateSeguimientoInput['canal']>('WEB')
  const [resultado, setResultado] = useState('')
  const [proximoControl, setProximoControl] = useState('')
  const [notas, setNotas] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createSeguimiento.mutate(
      {
        expediente_id: expedienteId,
        canal,
        estado_organismo_reportado: resultado || null,
        observacion: notas || null,
        proxima_fecha_control: proximoControl || null,
      },
      { onSuccess: () => onDone() }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Canal
          </label>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value as CreateSeguimientoInput['canal'])}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:ring-amber-500/15"
          >
            <option value="WEB">Web</option>
            <option value="TELEFONO">Tel{'é'}fono</option>
            <option value="PRESENCIAL">Presencial</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Pr{'ó'}ximo control <span className="text-zinc-700 dark:text-zinc-300 font-normal">(F = hoy)</span>
          </label>
          <input
            type="date"
            value={proximoControl}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setProximoControl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'f' || e.key === 'F') {
                e.preventDefault()
                setProximoControl(new Date().toISOString().split('T')[0])
              }
            }}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:ring-amber-500/15"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
          Resultado / Estado del organismo
        </label>
        <input
          type="text"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          placeholder="Ej: En proceso, Resolución dictada..."
          className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:ring-amber-500/15"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
          Notas
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:ring-amber-500/15"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={createSeguimiento.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
        >
          {createSeguimiento.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Registrar
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Vista semanal de audiencias — hero component
// ---------------------------------------------------------------------------

const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function getMondayOfWeek(offset: number): Date {
  const today = new Date()
  const dow = today.getDay()
  const diffToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + diffToMon + offset * 7)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function SemanaAudienciasView({
  turnos,
  onNuevaAudiencia,
  onExpedienteClick,
}: {
  turnos: AgendaTurno[]
  onNuevaAudiencia: () => void
  onExpedienteClick: (expId: string) => void
}) {
  const [weekOffset, setWeekOffset] = useState(0)

  const weekDays = useMemo(() => {
    const mon = getMondayOfWeek(weekOffset)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon)
      d.setDate(mon.getDate() + i)
      return d
    })
  }, [weekOffset])

  const todayStr = new Date().toISOString().split('T')[0]

  const weekLabel = useMemo(() => {
    const ini = weekDays[0]
    const fin = weekDays[6]
    const sameMonth = ini.getMonth() === fin.getMonth()
    if (sameMonth) {
      return `${ini.getDate()} – ${fin.getDate()} de ${ini.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
    }
    return `${ini.getDate()} ${MESES_CORTO[ini.getMonth()]} – ${fin.getDate()} ${MESES_CORTO[fin.getMonth()]} ${fin.getFullYear()}`
  }, [weekDays])

  const turnosByDate = useMemo(() => {
    const map: Record<string, AgendaTurno[]> = {}
    for (const t of turnos) {
      ;(map[t.fecha] ??= []).push(t)
    }
    for (const dateStr in map) {
      map[dateStr].sort((a, b) => {
        if (!a.hora && !b.hora) return 0
        if (!a.hora) return 1
        if (!b.hora) return -1
        return a.hora.localeCompare(b.hora)
      })
    }
    return map
  }, [turnos])

  const totalSemana = weekDays.reduce((acc, d) => {
    const ds = d.toISOString().split('T')[0]
    return acc + (turnosByDate[ds]?.length ?? 0)
  }, 0)

  return (
    <div className="rounded-xl border border-white/10 glass-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <CalendarClock className="h-5 w-5 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-none">
              Audiencias de la semana
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">{weekLabel}</p>
          </div>
          {totalSemana > 0 && (
            <span className="rounded-full bg-sky-900/40 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
              {totalSemana}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-900/30"
            >
              Esta semana
            </button>
          )}
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onNuevaAudiencia}
            className="ml-1 flex items-center gap-1 rounded-lg bg-gradient-cyan px-2.5 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            Nueva
          </button>
        </div>
      </div>

      {/* Grid de 7 días */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="grid grid-cols-7 gap-2 min-w-[560px]">
          {weekDays.map((day, i) => {
            const dateStr = day.toISOString().split('T')[0]
            const dayTurnos = turnosByDate[dateStr] ?? []
            const isToday = dateStr === todayStr
            const isPast = dateStr < todayStr
            const hasAudiencias = dayTurnos.length > 0

            return (
              <div
                key={dateStr}
                className={cn(
                  'rounded-xl border flex flex-col min-h-[130px] overflow-hidden',
                  isToday
                    ? 'border-amber-500/40 bg-amber-500/[0.07]'
                    : hasAudiencias
                    ? 'border-sky-500/25 bg-sky-500/[0.06]'
                    : 'border-white/5 bg-white/[0.02]'
                )}
              >
                {/* Encabezado del día */}
                <div
                  className={cn(
                    'px-2 py-1.5 text-center border-b',
                    isToday
                      ? 'border-amber-500/20 bg-amber-500/10'
                      : hasAudiencias
                      ? 'border-sky-500/15 bg-sky-500/10'
                      : 'border-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wider',
                      isToday ? 'text-amber-400' : isPast ? 'text-zinc-600' : 'text-zinc-400'
                    )}
                  >
                    {DIAS_CORTO[i]}
                  </div>
                  <div
                    className={cn(
                      'text-base font-bold leading-none mt-0.5',
                      isToday ? 'text-amber-300' : isPast ? 'text-zinc-600' : 'text-zinc-200'
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div
                    className={cn(
                      'text-[9px] mt-0.5',
                      isPast && !isToday ? 'text-zinc-700' : 'text-zinc-500'
                    )}
                  >
                    {MESES_CORTO[day.getMonth()]}
                  </div>
                </div>

                {/* Contenido: audiencias o guión vacío */}
                <div className="flex-1 p-1.5 space-y-1.5">
                  {dayTurnos.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-[10px] text-zinc-700">–</span>
                    </div>
                  ) : (
                    dayTurnos.map((turno) => (
                      <button
                        key={turno.id}
                        onClick={() => turno.expediente && onExpedienteClick(turno.expediente.id)}
                        className={cn(
                          'w-full rounded-lg p-2 text-left transition-colors group',
                          turno.estado === 'CONFIRMADA'
                            ? 'bg-sky-900/40 hover:bg-sky-900/60 border border-sky-700/30'
                            : 'bg-white/5 hover:bg-white/10 border border-white/5'
                        )}
                      >
                        {/* Hora — dato más importante */}
                        <div className="flex items-center gap-1 mb-1">
                          {turno.hora ? (
                            <span className="text-[13px] font-bold text-sky-200 tabular-nums leading-none">
                              {turno.hora.slice(0, 5)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic">sin hora</span>
                          )}
                          {turno.estado === 'CONFIRMADA' && (
                            <span className="rounded-full bg-emerald-900/50 px-1.5 py-0.5 text-[8px] font-medium text-emerald-400">
                              conf.
                            </span>
                          )}
                        </div>
                        {/* Tipo */}
                        <div className="text-[10px] text-zinc-300 leading-tight truncate font-medium">
                          {turno.tipo_audiencia?.nombre ?? 'Audiencia'}
                        </div>
                        {/* Caratula / cliente */}
                        {turno.expediente && (
                          <div className="text-[9px] text-amber-400 truncate mt-0.5">
                            {turno.expediente.clientes
                              ? turno.expediente.clientes.apellido.toUpperCase()
                              : turno.expediente.caratula.slice(0, 18)}
                          </div>
                        )}
                        {/* Organismo */}
                        {turno.organismo && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
                            <span className="text-[9px] text-zinc-500 truncate">
                              {turno.organismo.nombre}
                            </span>
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda rápida si hay audiencias sin hora */}
      {turnos.some((t) => {
        const ds = t.fecha
        return weekDays.some((d) => d.toISOString().split('T')[0] === ds) && !t.hora
      }) && (
        <p className="mt-2 text-[10px] text-zinc-600">
          Algunas audiencias no tienen hora registrada. Editá el turno para agregarla.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini Calendar — monthly grid with turno dots (navegación secundaria)
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function MiniCalendar({
  turnos,
  onTurnoClick,
}: {
  turnos: AgendaTurno[]
  onTurnoClick: (expedienteId: string) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const todayStr = new Date().toISOString().split('T')[0]

  const turnosByDate = useMemo(() => {
    const map: Record<string, AgendaTurno[]> = {}
    for (const t of turnos) {
      ;(map[t.fecha] ??= []).push(t)
    }
    return map
  }, [turnos])

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    let startOffset = firstDay.getDay() - 1
    if (startOffset < 0) startOffset = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [year, month])

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))
  const goToday = () => {
    const d = new Date()
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelectedDate(todayStr)
  }

  const selectedTurnos = selectedDate ? (turnosByDate[selectedDate] ?? []) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:bg-white/5 hover:text-zinc-200">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
            {currentMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goToday} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-900/30">
            Hoy
          </button>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:bg-white/5 hover:text-zinc-200">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-zinc-700 dark:text-zinc-300 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {days.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasTurnos = !!turnosByDate[dateStr]
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const count = turnosByDate[dateStr]?.length ?? 0

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs transition-colors',
                isSelected
                  ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                  : isToday
                  ? 'bg-amber-500/10 text-amber-400 font-bold'
                  : hasTurnos
                  ? 'text-zinc-900 dark:text-zinc-100 hover:bg-white/5'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.03]'
              )}
            >
              {day}
              {hasTurnos && (
                <div className="flex gap-0.5 mt-0.5">
                  {count <= 3 ? (
                    Array.from({ length: count }).map((_, j) => (
                      <span key={j} className="h-1 w-1 rounded-full bg-sky-400" />
                    ))
                  ) : (
                    <span className="text-[8px] font-bold text-sky-400">{count}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="text-xs font-medium text-zinc-500 mb-2 capitalize">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          {selectedTurnos.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-2">Sin audiencias</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTurnos.map((turno) => (
                <button
                  key={turno.id}
                  onClick={() => turno.expediente && onTurnoClick(turno.expediente.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/5 p-2 text-left hover:bg-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {turno.hora && (
                        <span className="text-xs font-bold text-sky-300 tabular-nums shrink-0">
                          {turno.hora.slice(0, 5)}
                        </span>
                      )}
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {turno.tipo_audiencia?.nombre ?? 'Audiencia'}
                      </span>
                    </div>
                    {turno.expediente && (
                      <p className="mt-0.5 text-[10px] text-amber-400 truncate">
                        {turno.expediente.clientes
                          ? `${turno.expediente.clientes.apellido} ${turno.expediente.clientes.nombre}`
                          : turno.expediente.caratula}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                      turno.estado === 'CONFIRMADA'
                        ? 'bg-emerald-900/30 text-emerald-400'
                        : 'bg-amber-900/30 text-amber-400'
                    )}
                  >
                    {turno.estado}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgendaSecretariaPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: agenda, isLoading: agendaLoading } = useAgendaSecretaria()
  const { data: tareasData } = useTareas({
    vencidas: true,
    asignado_a: profile?.id ?? undefined,
    pageSize: 10,
  })
  const { data: alertas } = useAlertas()
  const completarTarea = useCompletarTarea()
  const resolverAlerta = useResolverAlerta()

  const [expandedExp, setExpandedExp] = useState<string | null>(null)
  const [crearTareaOpen, setCrearTareaOpen] = useState(false)
  const [crearAudienciaOpen, setCrearAudienciaOpen] = useState(false)
  const [reunionOpen, setReunionOpen] = useState(false)
  const [completedExps, setCompletedExps] = useState<Set<string>>(new Set())
  const [mostrarTodosExps, setMostrarTodosExps] = useState(false)

  const toggleExpand = (id: string) => {
    setExpandedExp((prev) => (prev === id ? null : id))
  }

  const handleSeguimientoDone = (expId: string) => {
    setExpandedExp(null)
    setCompletedExps((prev) => new Set(prev).add(expId))
  }

  if (agendaLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-700 dark:text-zinc-300" />
      </div>
    )
  }

  const expedientes = agenda?.expedientes ?? []
  const turnos = agenda?.turnos ?? []
  const tareasVencidas = tareasData?.data ?? []
  const alertasList = alertas ?? []

  const todayStr = new Date().toISOString().split('T')[0]
  const audienciasHoy = turnos.filter((t) => t.fecha === todayStr)
  const expVisible = mostrarTodosExps ? expedientes : expedientes.slice(0, 8)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Agenda
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Audiencias, seguimientos y tareas pendientes
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* KPIs rápidos */}
          {audienciasHoy.length > 0 && (
            <span className="rounded-full bg-sky-900/40 px-3 py-1 text-xs font-medium text-sky-300">
              {audienciasHoy.length} audiencia{audienciasHoy.length > 1 ? 's' : ''} hoy
            </span>
          )}
          {tareasVencidas.length > 0 && (
            <span className="rounded-full bg-rose-900/30 px-3 py-1 text-xs font-medium text-rose-400">
              {tareasVencidas.length} tarea{tareasVencidas.length > 1 ? 's' : ''} vencida{tareasVencidas.length > 1 ? 's' : ''}
            </span>
          )}
          {/* Botón agendar reunión */}
          <button
            type="button"
            onClick={() => setReunionOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600/20 border border-teal-500/30 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-600/30 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Agendar reunión
          </button>
        </div>
      </div>

      {/* ── HERO: Vista semanal de audiencias ── */}
      <SemanaAudienciasView
        turnos={turnos}
        onNuevaAudiencia={() => setCrearAudienciaOpen(true)}
        onExpedienteClick={(expId) => navigate(`/expedientes/${expId}`)}
      />

      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Expedientes para revisar — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-white/10 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSearch className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Expedientes para revisar
            </h2>
            <span className="ml-auto rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-400">
              {expedientes.length}
            </span>
          </div>

          {expedientes.length === 0 ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 text-center py-6">
              No hay expedientes pendientes de control.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                {expVisible.map((exp) => {
                  const isExpanded = expandedExp === exp.id
                  const isDone = completedExps.has(exp.id)

                  return (
                    <div
                      key={exp.id}
                      className={cn(
                        'rounded-lg border transition-colors',
                        isDone
                          ? 'border-emerald-900 bg-emerald-950/20'
                          : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.05]'
                      )}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {isDone && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}

                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                            exp.dias_sin_control > 30
                              ? 'bg-rose-900/40 text-rose-400'
                              : 'bg-amber-900/40 text-amber-400'
                          )}
                          title={`${exp.dias_sin_control} días sin control`}
                        >
                          {exp.dias_sin_control}d
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/expedientes/${exp.id}`)}
                              className="font-mono text-xs text-amber-400 hover:underline truncate max-w-[220px]"
                            >
                              {exp.caratula || exp.numero_expediente}
                            </button>
                            <EstadoBadge estado={exp.estado_interno} compact />
                          </div>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {exp.clientes
                              ? `${exp.clientes.apellido}, ${exp.clientes.nombre}`
                              : 'Sin cliente'}
                          </p>
                        </div>

                        {!isDone && (
                          <button
                            onClick={() => toggleExpand(exp.id)}
                            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-white/10 hover:text-zinc-200"
                            title="Registrar seguimiento"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3">
                          <SeguimientoForm
                            expedienteId={exp.id}
                            onDone={() => handleSeguimientoDone(exp.id)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {expedientes.length > 8 && (
                <button
                  onClick={() => setMostrarTodosExps((v) => !v)}
                  className="mt-3 w-full text-center text-xs text-amber-400 hover:underline"
                >
                  {mostrarTodosExps
                    ? 'Ver menos'
                    : `Ver todos (${expedientes.length - 8} más)`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Columna derecha: tareas + alertas + mini calendario — 1/3 */}
        <div className="space-y-5">
          {/* Tareas vencidas */}
          <div className="rounded-xl border border-white/10 glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Tareas vencidas
              </h2>
              <span className="ml-auto rounded-full bg-rose-900/30 px-2 py-0.5 text-xs font-medium text-rose-400">
                {tareasVencidas.length}
              </span>
              <button
                onClick={() => setCrearTareaOpen(true)}
                className="flex items-center gap-1 rounded-lg bg-gradient-cyan px-2 py-1 text-xs font-medium text-zinc-950 hover:opacity-90"
              >
                <Plus className="h-3 w-3" />
                Nueva
              </button>
            </div>

            {tareasVencidas.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-3">Sin tareas vencidas.</p>
            ) : (
              <div className="space-y-1.5">
                {tareasVencidas.slice(0, 6).map((tarea) => (
                  <div
                    key={tarea.id}
                    className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] p-2.5"
                  >
                    <button
                      onClick={() => completarTarea.mutate(tarea.id)}
                      className="shrink-0 text-zinc-700 hover:text-emerald-400"
                      title="Completar"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-100 truncate">{tarea.titulo}</p>
                      {tarea.expediente && (
                        <button
                          onClick={() => navigate(`/expedientes/${tarea.expediente!.id}`)}
                          className="text-[10px] text-amber-400 hover:underline truncate block"
                        >
                          {tarea.expediente.caratula || (tarea.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-rose-400 whitespace-nowrap">
                      {tarea.fecha_vencimiento ? formatDateWithWeekday(tarea.fecha_vencimiento) : ''}
                    </span>
                  </div>
                ))}
                {tareasVencidas.length > 6 && (
                  <button
                    onClick={() => navigate('/tareas')}
                    className="w-full text-center text-xs text-amber-400 hover:underline pt-1"
                  >
                    Ver todas ({tareasVencidas.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Alertas */}
          <div className="rounded-xl border border-white/10 glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Alertas
              </h2>
              <span className="ml-auto rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-400">
                {alertasList.length}
              </span>
            </div>

            {alertasList.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-3">Sin alertas.</p>
            ) : (
              <div className="space-y-1.5">
                {alertasList.slice(0, 5).map((alerta) => (
                  <div
                    key={alerta.id}
                    className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] p-2.5"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-100 truncate">{alerta.titulo}</p>
                      {alerta.expediente && (
                        <button
                          onClick={() => navigate(`/expedientes/${alerta.expediente!.id}`)}
                          className="text-[10px] text-amber-400 hover:underline truncate block"
                        >
                          {alerta.expediente.caratula || (alerta.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => resolverAlerta.mutate(alerta.id)}
                      className="shrink-0 rounded-lg bg-emerald-900/30 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-900/50 whitespace-nowrap"
                    >
                      Resolver
                    </button>
                  </div>
                ))}
                {alertasList.length > 5 && (
                  <button
                    onClick={() => navigate('/alertas')}
                    className="w-full text-center text-xs text-amber-400 hover:underline pt-1"
                  >
                    Ver todas ({alertasList.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mini calendario */}
          <div className="rounded-xl border border-white/10 glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-zinc-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Calendario
              </h2>
            </div>
            <MiniCalendar
              turnos={turnos}
              onTurnoClick={(expId) => navigate(`/expedientes/${expId}`)}
            />
          </div>
        </div>
      </div>

      <CrearTareaDialog open={crearTareaOpen} onClose={() => setCrearTareaOpen(false)} />
      <CrearTurnoDialog open={crearAudienciaOpen} onClose={() => setCrearAudienciaOpen(false)} />
      <AgendarReuniónModal open={reunionOpen} onClose={() => setReunionOpen(false)} />
    </div>
  )
}
