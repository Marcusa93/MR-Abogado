import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useTareas, useCompletarTarea } from '@/hooks/use-tareas'
import { useAlertas, useResolverAlerta } from '@/hooks/use-alertas'
import { useCreateSeguimiento, type CreateSeguimientoInput } from '@/hooks/use-seguimientos'
import { useUpdateTurno } from '@/hooks/use-turnos'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { CrearTurnoDialog } from '@/components/expedientes/crear-turno-dialog'
import { AgendarReuniónModal } from '@/components/shared/agendar-reunion-modal'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { PageHeader } from '@/components/shared/page-header'
import { formatDateWithWeekday } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
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
  MapPin,
  Users,
  X,
  Pencil,
  Video,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Estilos compartidos de la pantalla
// ---------------------------------------------------------------------------

const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400'
const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'
const CARD_TITLE = 'text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white'
const COUNT = 'ml-auto rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums'
const FILA = 'rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.03]'
const LINK_EXP = 'block truncate text-[11px] font-medium text-cyan-700 hover:underline dark:text-cyan-300'

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

interface Reunion {
  id: string
  nombre: string
  apellido: string | null
  canal: string
  tipo_asunto: string
  fecha_turno: string
  estado: string
}

// ---------------------------------------------------------------------------
// Custom hook: agenda data
// ---------------------------------------------------------------------------

function useAgendaSecretaria() {
  const supabase = createClient()

  return useQuery<{ expedientes: AgendaExpediente[]; turnos: AgendaTurno[]; reuniones: Reunion[] }>({
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

      const { data: reunionesData } = await supabase
        .from('consultas' as any)
        .select('id, nombre, apellido, canal, tipo_asunto, fecha_turno, estado')
        .not('fecha_turno', 'is', null)
        .gte('fecha_turno', today + 'T00:00:00')
        .lte('fecha_turno', next90 + 'T23:59:59')
        .not('estado', 'in', '(convertida,resuelta,descartada)')
        .order('fecha_turno', { ascending: true })
        .limit(50)

      return {
        expedientes: expedientes
          .sort((a, b) => b.dias_sin_control - a.dias_sin_control)
          .slice(0, 30),
        turnos: (turnosData ?? []) as AgendaTurno[],
        reuniones: (reunionesData ?? []) as unknown as Reunion[],
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
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>
            Canal
          </label>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value as CreateSeguimientoInput['canal'])}
            className="field h-9 py-0 text-[13px]"
          >
            <option value="WEB">Web</option>
            <option value="TELEFONO">Tel{'é'}fono</option>
            <option value="PRESENCIAL">Presencial</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>
            Pr{'ó'}ximo control <span className="font-normal normal-case tracking-normal text-zinc-400">(F = hoy)</span>
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
            className="field h-9 py-0 text-[13px]"
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>
          Resultado / Estado del organismo
        </label>
        <input
          type="text"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          placeholder="Ej: En proceso, Resolución dictada..."
          className="field h-9 py-0 text-[13px]"
        />
      </div>

      <div>
        <label className={LABEL}>
          Notas
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="field text-[13px]"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="btn btn-ghost btn-sm border-transparent"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={createSeguimiento.isPending}
          className="btn btn-primary btn-sm"
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
  onEditAudiencia,
}: {
  turnos: AgendaTurno[]
  onNuevaAudiencia: () => void
  onExpedienteClick: (expId: string) => void
  onEditAudiencia: (turno: AgendaTurno) => void
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
    <div className="app-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <CalendarClock className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <div>
            <h2 className={cn(CARD_TITLE, 'leading-none')}>
              Audiencias de la semana
            </h2>
            <p className="mt-1 text-[11.5px] font-medium capitalize text-zinc-500">{weekLabel}</p>
          </div>
          {totalSemana > 0 && (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {totalSemana}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="btn btn-ghost btn-sm"
            >
              Esta semana
            </button>
          )}
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Semana anterior"
            className="btn btn-ghost btn-icon h-8 w-8 border-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Semana siguiente"
            className="btn btn-ghost btn-icon h-8 w-8 border-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onNuevaAudiencia}
            className="btn btn-primary btn-sm ml-1"
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
                    ? 'border-cyan-500/40 bg-cyan-500/[0.07]'
                    : hasAudiencias
                    ? 'border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                    : 'border-zinc-100 bg-zinc-50/60 dark:border-white/5 dark:bg-white/[0.015]'
                )}
              >
                {/* Encabezado del día */}
                <div
                  className={cn(
                    'px-2 py-1.5 text-center border-b',
                    isToday
                      ? 'border-cyan-500/20 bg-cyan-500/10'
                      : hasAudiencias
                      ? 'border-zinc-200 dark:border-white/[0.06]'
                      : 'border-zinc-100 dark:border-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-[0.1em]',
                      isToday ? 'text-cyan-700 dark:text-cyan-300' : isPast ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
                    )}
                  >
                    {DIAS_CORTO[i]}
                  </div>
                  <div
                    className={cn(
                      'mt-0.5 text-base font-extrabold leading-none tabular-nums',
                      isToday ? 'text-cyan-700 dark:text-cyan-200' : isPast ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div
                    className={cn(
                      'text-[9px] mt-0.5',
                      isPast && !isToday ? 'text-zinc-400 dark:text-zinc-700' : 'text-zinc-500'
                    )}
                  >
                    {MESES_CORTO[day.getMonth()]}
                  </div>
                </div>

                {/* Contenido: audiencias o guión vacío */}
                <div className="flex-1 p-1.5 space-y-1.5">
                  {dayTurnos.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-700">–</span>
                    </div>
                  ) : (
                    dayTurnos.map((turno) => (
                      <div
                        key={turno.id}
                        className={cn(
                          'w-full rounded-lg p-2 text-left transition-colors group relative',
                          turno.estado === 'CONFIRMADA'
                            ? 'border border-cyan-500/30 bg-cyan-500/10'
                            : 'border border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.05]'
                        )}
                      >
                      <button
                        onClick={() => turno.expediente && onExpedienteClick(turno.expediente.id)}
                        className="w-full text-left"
                      >
                        {/* Hora — dato más importante */}
                        <div className="flex items-center gap-1 mb-1">
                          {turno.hora ? (
                            <span className="text-[13px] font-extrabold leading-none tabular-nums text-zinc-900 dark:text-white">
                              {turno.hora.slice(0, 5)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-zinc-500">sin hora</span>
                          )}
                          {turno.estado === 'CONFIRMADA' && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[8.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                              conf.
                            </span>
                          )}
                        </div>
                        {/* Tipo */}
                        <div className="truncate text-[10.5px] font-semibold leading-tight text-zinc-700 dark:text-zinc-300">
                          {turno.tipo_audiencia?.nombre ?? 'Audiencia'}
                        </div>
                        {/* Caratula / cliente */}
                        {turno.expediente && (
                          <div className="mt-0.5 truncate text-[9.5px] font-semibold text-cyan-700 dark:text-cyan-300">
                            {turno.expediente.clientes
                              ? turno.expediente.clientes.apellido.toUpperCase()
                              : turno.expediente.caratula.slice(0, 18)}
                          </div>
                        )}
                        {/* Organismo */}
                        {turno.organismo && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
                            <span className="text-[9px] text-zinc-500 truncate">
                              {turno.organismo.nombre}
                            </span>
                          </div>
                        )}
                      </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditAudiencia(turno) }}
                          className="absolute top-1 right-1 rounded p-0.5 text-zinc-400 opacity-0 transition-all hover:text-cyan-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-cyan-400"
                          title="Editar audiencia"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      </div>
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
        <p className="mt-2 text-[10.5px] text-zinc-500">
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
        <button onClick={prevMonth} aria-label="Mes anterior" className="btn btn-ghost btn-icon h-8 w-8 border-transparent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold capitalize tracking-tight text-zinc-900 dark:text-white">
            {currentMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goToday} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300">
            Hoy
          </button>
        </div>
        <button onClick={nextMonth} aria-label="Mes siguiente" className="btn btn-ghost btn-icon h-8 w-8 border-transparent">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">
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
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs tabular-nums transition-colors',
                isSelected
                  ? 'bg-cyan-500/20 font-bold text-cyan-800 ring-1 ring-cyan-500/40 dark:text-cyan-200'
                  : isToday
                  ? 'bg-cyan-500/10 font-bold text-cyan-700 dark:text-cyan-300'
                  : hasTurnos
                  ? 'font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/5'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.03]'
              )}
            >
              {day}
              {hasTurnos && (
                <div className="flex gap-0.5 mt-0.5">
                  {count <= 3 ? (
                    Array.from({ length: count }).map((_, j) => (
                      <span key={j} className="h-1 w-1 rounded-full bg-cyan-500 dark:bg-cyan-400" />
                    ))
                  ) : (
                    <span className="text-[8px] font-bold text-cyan-600 dark:text-cyan-400">{count}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
          <p className="mb-2 text-xs font-semibold capitalize text-zinc-500">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          {selectedTurnos.length === 0 ? (
            <p className="py-2 text-center text-xs font-medium text-zinc-500">Sin audiencias</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTurnos.map((turno) => (
                <button
                  key={turno.id}
                  onClick={() => turno.expediente && onTurnoClick(turno.expediente.id)}
                  className={cn(FILA, 'flex w-full items-center gap-2 p-2 text-left hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {turno.hora && (
                        <span className="shrink-0 text-xs font-extrabold tabular-nums text-zinc-900 dark:text-white">
                          {turno.hora.slice(0, 5)}
                        </span>
                      )}
                      <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {turno.tipo_audiencia?.nombre ?? 'Audiencia'}
                      </span>
                    </div>
                    {turno.expediente && (
                      <p className="mt-0.5 truncate text-[10.5px] font-medium text-cyan-700 dark:text-cyan-300">
                        {turno.expediente.clientes
                          ? `${turno.expediente.clientes.apellido} ${turno.expediente.clientes.nombre}`
                          : turno.expediente.caratula}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      TAG, 'px-1.5 text-[9.5px]',
                      turno.estado === 'CONFIRMADA'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
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
// Editar audiencia (modal inline)
// ---------------------------------------------------------------------------

const ESTADO_AUDIENCIA_OPTS = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'CONFIRMADA', label: 'Confirmada' },
  { value: 'REALIZADA', label: 'Realizada' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'POSTERGADA', label: 'Postergada' },
]

interface AudienciaEditable extends AgendaTurno {}

function EditarAudienciaDialog({
  audiencia,
  onClose,
}: {
  audiencia: AudienciaEditable | null
  onClose: () => void
}) {
  const updateTurno = useUpdateTurno()
  const [fecha, setFecha] = useState(audiencia?.fecha ?? '')
  const [hora, setHora] = useState(audiencia?.hora?.slice(0, 5) ?? '')
  const [estado, setEstado] = useState(audiencia?.estado ?? 'PENDIENTE')
  const [notas, setNotas] = useState(audiencia?.notas ?? '')

  if (!audiencia) return null

  const expedienteId = audiencia.expediente?.id

  const handleSave = async () => {
    if (!expedienteId) return
    try {
      await updateTurno.mutateAsync({
        id: audiencia.id,
        expediente_id: expedienteId,
        fecha,
        hora: hora || null,
        estado,
        notas: notas.trim() || null,
      })
      toast.success('Audiencia actualizada')
      onClose()
    } catch (err) {
      toast.error('No se pudo actualizar', err instanceof Error ? err.message : '')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="app-card w-full max-w-md rounded-3xl p-5 shadow-2xl dark:bg-[var(--popover)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Editar audiencia</h2>
          <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {audiencia.expediente && (
          <p className="mb-4 truncate text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            {audiencia.expediente.clientes
              ? `${audiencia.expediente.clientes.apellido}, ${audiencia.expediente.clientes.nombre}`
              : audiencia.expediente.caratula}
          </p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="field h-10 py-0"
              />
            </div>
            <div>
              <label className={LABEL}>Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="field h-10 py-0"
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="field h-10 py-0"
            >
              {ESTADO_AUDIENCIA_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL}>Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="field"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost border-transparent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!fecha || updateTurno.isPending}
            className="btn btn-primary"
          >
            {updateTurno.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editar fecha_turno de reunión
// ---------------------------------------------------------------------------

function useActualizarFechaTurno() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fecha_turno }: { id: string; fecha_turno: string }) => {
      const { error } = await (supabase.from as any)('consultas')
        .update({ fecha_turno })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda'] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
    },
  })
}

const TIPO_ASUNTO_SHORT: Record<string, string> = {
  laboral_trabajador: 'Laboral (trab.)',
  laboral_empleador: 'Laboral (empl.)',
  civil: 'Civil',
  familia: 'Familia',
  previsional: 'Previsional',
  penal: 'Penal',
  otro: 'Otro',
}

function ReunionesPanelSecretaria({ reuniones }: { reuniones: Reunion[] }) {
  const navigate = useNavigate()
  const actualizarFecha = useActualizarFechaTurno()
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nuevaFecha, setNuevaFecha] = useState('')

  if (reuniones.length === 0) return null

  const hoy = new Date().toISOString().split('T')[0]

  return (
    <div className="app-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Video className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        <h2 className={CARD_TITLE}>Reuniones próximas</h2>
        <span className={cn(COUNT, 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300')}>
          {reuniones.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {reuniones.map((r) => {
          const dt = new Date(r.fecha_turno)
          const fechaStr = dt.toISOString().split('T')[0]
          const horaStr = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const esHoy = fechaStr === hoy

          return (
            <div
              key={r.id}
              className={cn(
                'rounded-xl border px-3 py-2.5',
                esHoy ? 'border-cyan-500/30 bg-cyan-500/[0.06]' : 'border-zinc-200 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.03]'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {r.apellido ? `${r.apellido}, ${r.nombre}` : r.nombre}
                    </p>
                    {esHoy && (
                      <span className={cn(TAG, 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300')}>
                        Hoy
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {TIPO_ASUNTO_SHORT[r.tipo_asunto] ?? r.tipo_asunto} · {r.canal}
                  </p>

                  {editandoId === r.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={nuevaFecha}
                        onChange={(e) => setNuevaFecha(e.target.value)}
                        className="field h-8 min-w-0 flex-1 py-0 text-xs"
                      />
                      <button
                        onClick={async () => {
                          if (!nuevaFecha) return
                          try {
                            await actualizarFecha.mutateAsync({
                              id: r.id,
                              fecha_turno: new Date(nuevaFecha).toISOString(),
                            })
                            toast.success('Reunión reprogramada')
                            setEditandoId(null)
                          } catch {
                            toast.error('No se pudo actualizar')
                          }
                        }}
                        disabled={!nuevaFecha || actualizarFecha.isPending}
                        className="btn btn-primary btn-sm h-8 min-h-0"
                      >
                        {actualizarFecha.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        aria-label="Cancelar"
                        className="btn btn-ghost btn-icon h-8 w-8 border-transparent"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[11px] font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
                    {dt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {horaStr}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditandoId(r.id)
                        setNuevaFecha(r.fecha_turno.slice(0, 16))
                      }}
                      className="rounded p-1 text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                      title="Reprogramar"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => navigate(`/consultas/${r.id}`)}
                      className="btn btn-ghost btn-sm min-h-0 px-2 py-0.5 text-[11px]"
                    >
                      Ver
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
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
  const [editandoAudiencia, setEditandoAudiencia] = useState<AgendaTurno | null>(null)
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
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  const expedientes = agenda?.expedientes ?? []
  const turnos = agenda?.turnos ?? []
  const reuniones = agenda?.reuniones ?? []
  const tareasVencidas = tareasData?.data ?? []
  const alertasList = alertas ?? []

  const todayStr = new Date().toISOString().split('T')[0]
  const audienciasHoy = turnos.filter((t) => t.fecha === todayStr)
  const expVisible = mostrarTodosExps ? expedientes : expedientes.slice(0, 8)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Agenda"
        subtitle="Audiencias, seguimientos y tareas pendientes"
        actions={
          <>
            {/* KPIs rápidos */}
            {audienciasHoy.length > 0 && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
                {audienciasHoy.length} audiencia{audienciasHoy.length > 1 ? 's' : ''} hoy
              </span>
            )}
            {tareasVencidas.length > 0 && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {tareasVencidas.length} tarea{tareasVencidas.length > 1 ? 's' : ''} vencida{tareasVencidas.length > 1 ? 's' : ''}
              </span>
            )}
            {/* Botón agendar reunión */}
            <button
              type="button"
              onClick={() => setReunionOpen(true)}
              className="btn btn-secondary"
            >
              <Users className="h-4 w-4" />
              Agendar reunión
            </button>
          </>
        }
      />

      {/* ── HERO: Vista semanal de audiencias ── */}
      <SemanaAudienciasView
        turnos={turnos}
        onNuevaAudiencia={() => setCrearAudienciaOpen(true)}
        onExpedienteClick={(expId) => navigate(`/expedientes/${expId}`)}
        onEditAudiencia={(turno) => setEditandoAudiencia(turno)}
      />

      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Expedientes para revisar — 2/3 */}
        <div className="app-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className={CARD_TITLE}>
              Expedientes para revisar
            </h2>
            <span className={cn(COUNT, 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300')}>
              {expedientes.length}
            </span>
          </div>

          {expedientes.length === 0 ? (
            <p className="py-6 text-center text-xs font-medium text-zinc-500">
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
                        'rounded-xl border transition-colors',
                        isDone
                          ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                          : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]'
                      )}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {isDone && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}

                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold tabular-nums',
                            exp.dias_sin_control > 30
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          )}
                          title={`${exp.dias_sin_control} días sin control`}
                        >
                          {exp.dias_sin_control}d
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/expedientes/${exp.id}`)}
                              className="min-w-0 max-w-[220px] truncate text-[13px] font-semibold text-zinc-900 hover:text-[#577c8e] dark:text-white dark:hover:text-[var(--brand-accent)]"
                            >
                              {exp.caratula || exp.numero_expediente}
                            </button>
                            <EstadoBadge estado={exp.estado_interno} compact />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {exp.clientes
                              ? `${exp.clientes.apellido}, ${exp.clientes.nombre}`
                              : 'Sin cliente'}
                          </p>
                        </div>

                        {!isDone && (
                          <button
                            onClick={() => toggleExpand(exp.id)}
                            className="btn btn-ghost btn-icon h-8 w-8 shrink-0"
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
                  className="dashboard-link mt-3 w-full text-center text-xs"
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
          <div className="app-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-500 dark:text-rose-400" />
              <h2 className={CARD_TITLE}>
                Tareas vencidas
              </h2>
              <span className={cn(COUNT, 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300')}>
                {tareasVencidas.length}
              </span>
              <button
                onClick={() => setCrearTareaOpen(true)}
                className="btn btn-primary btn-sm"
              >
                <Plus className="h-3 w-3" />
                Nueva
              </button>
            </div>

            {tareasVencidas.length === 0 ? (
              <p className="py-3 text-center text-xs font-medium text-zinc-500">Sin tareas vencidas.</p>
            ) : (
              <div className="space-y-1.5">
                {tareasVencidas.slice(0, 6).map((tarea) => (
                  <div
                    key={tarea.id}
                    className={cn(FILA, 'flex items-center gap-2.5 p-2.5')}
                  >
                    <button
                      onClick={() => completarTarea.mutate(tarea.id)}
                      className="shrink-0 text-zinc-400 hover:text-emerald-500 dark:text-zinc-600 dark:hover:text-emerald-400"
                      title="Completar"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{tarea.titulo}</p>
                      {tarea.expediente && (
                        <button
                          onClick={() => navigate(`/expedientes/${tarea.expediente!.id}`)}
                          className={LINK_EXP}
                        >
                          {tarea.expediente.caratula || (tarea.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[10.5px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {tarea.fecha_vencimiento ? formatDateWithWeekday(tarea.fecha_vencimiento) : ''}
                    </span>
                  </div>
                ))}
                {tareasVencidas.length > 6 && (
                  <button
                    onClick={() => navigate('/tareas')}
                    className="dashboard-link w-full pt-1 text-center text-xs"
                  >
                    Ver todas ({tareasVencidas.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Alertas */}
          <div className="app-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <h2 className={CARD_TITLE}>
                Alertas
              </h2>
              <span className={cn(COUNT, 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
                {alertasList.length}
              </span>
            </div>

            {alertasList.length === 0 ? (
              <p className="py-3 text-center text-xs font-medium text-zinc-500">Sin alertas.</p>
            ) : (
              <div className="space-y-1.5">
                {alertasList.slice(0, 5).map((alerta) => (
                  <div
                    key={alerta.id}
                    className={cn(FILA, 'flex items-start gap-2.5 p-2.5')}
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{alerta.titulo}</p>
                      {alerta.expediente && (
                        <button
                          onClick={() => navigate(`/expedientes/${alerta.expediente!.id}`)}
                          className={LINK_EXP}
                        >
                          {alerta.expediente.caratula || (alerta.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => resolverAlerta.mutate(alerta.id)}
                      className="btn btn-sm min-h-0 shrink-0 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                    >
                      Resolver
                    </button>
                  </div>
                ))}
                {alertasList.length > 5 && (
                  <button
                    onClick={() => navigate('/alertas')}
                    className="dashboard-link w-full pt-1 text-center text-xs"
                  >
                    Ver todas ({alertasList.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mini calendario */}
          <div className="app-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-500" />
              <h2 className="eyebrow">
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

      {/* ── Reuniones próximas ── */}
      {reuniones.length > 0 && <ReunionesPanelSecretaria reuniones={reuniones} />}

      <CrearTareaDialog open={crearTareaOpen} onClose={() => setCrearTareaOpen(false)} />
      <CrearTurnoDialog open={crearAudienciaOpen} onClose={() => setCrearAudienciaOpen(false)} />
      <AgendarReuniónModal open={reunionOpen} onClose={() => setReunionOpen(false)} />
      <EditarAudienciaDialog
        audiencia={editandoAudiencia}
        onClose={() => setEditandoAudiencia(null)}
      />
    </div>
  )
}
