import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useTareas, useCompletarTarea } from '@/hooks/use-tareas'
import { useAlertas, useResolverAlerta } from '@/hooks/use-alertas'
import { useCreateSeguimiento, type CreateSeguimientoInput } from '@/hooks/use-seguimientos'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { formatDateWithWeekday } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
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
  ExternalLink,
  Plus,
  Calendar,
  ListChecks,
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
      // Extend to 60 days so the MiniCalendar can show dots for the whole visible month
      const next60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
      const next7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

      // Expedientes en tramite que necesitan control
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

      // Audiencias proximas
      const { data: turnosData } = await supabase
        .from('audiencias')
        .select(
          `id, fecha, estado, notas,
           tipo_audiencia:catalogo_tipos_audiencia!audiencias_tipo_audiencia_id_fkey (nombre),
           organismo:organismos!audiencias_organismo_id_fkey (nombre),
           expediente:expedientes!audiencias_expediente_id_fkey (
             id, numero, caratula,
             clientes!expedientes_cliente_id_fkey (nombre, apellido)
           )`
        )
        .gte('fecha', today)
        .lte('fecha', next60)
        .in('estado', ['PENDIENTE', 'CONFIRMADA'])
        .order('fecha', { ascending: true })
        .limit(100)

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
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:ring-amber-500/15"
          >
            <option value="WEB">Web</option>
            <option value="TELEFONO">Tel{'\u00E9'}fono</option>
            <option value="PRESENCIAL">Presencial</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Pr{'\u00F3'}ximo control <span className="text-zinc-700 dark:text-zinc-300 font-normal">(F = hoy)</span>
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
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:ring-amber-500/15"
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
          className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:ring-amber-500/15"
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
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:ring-amber-500/15"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
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
// Mini Calendar — monthly grid with turno dots
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

  // Build turno lookup by date
  const turnosByDate = useMemo(() => {
    const map: Record<string, AgendaTurno[]> = {}
    for (const t of turnos) {
      ;(map[t.fecha] ??= []).push(t)
    }
    return map
  }, [turnos])

  // Calendar grid
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    // Monday = 0 offset
    let startOffset = firstDay.getDay() - 1
    if (startOffset < 0) startOffset = 6

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []

    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    // Pad to full weeks
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
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200">
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
        <button onClick={nextMonth} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-zinc-700 dark:text-zinc-300 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
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

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          {selectedTurnos.length === 0 ? (
            <p className="text-xs text-zinc-700 dark:text-zinc-300 text-center py-3">Sin audiencias este día</p>
          ) : (
            <div className="space-y-2">
              {selectedTurnos.map((turno) => (
                <button
                  key={turno.id}
                  onClick={() => turno.expediente && onTurnoClick(turno.expediente.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-white/5',
                    turno.estado === 'CONFIRMADA' ? 'border-emerald-900/30' : 'border-white/5'
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-900/30">
                    <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {turno.tipo_audiencia?.nombre ?? 'Audiencia'}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          turno.estado === 'CONFIRMADA'
                            ? 'bg-emerald-900/30 text-emerald-400'
                            : 'bg-amber-900/30 text-amber-400'
                        )}
                      >
                        {turno.estado}
                      </span>
                    </div>
                    {turno.expediente && (
                      <p className="mt-0.5 text-[11px] text-amber-400 truncate">
                        {turno.expediente.clientes
                          ? `${turno.expediente.clientes.apellido} ${turno.expediente.clientes.nombre}`
                          : turno.expediente.caratula || turno.expediente.numero}
                      </p>
                    )}
                  </div>
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
  const [completedExps, setCompletedExps] = useState<Set<string>>(new Set())

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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Audiencias / Agenda
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Resumen diario de seguimientos, audiencias y tareas pendientes.
        </p>
      </div>

      {/* Daily summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-card-glow rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Hoy</span>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div className="glass-card-glow rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-sky-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Audiencias</span>
          </div>
          <p className="text-lg font-bold text-sky-400">
            {turnos.filter(t => t.fecha === new Date().toISOString().split('T')[0]).length} hoy
            <span className="text-xs text-zinc-700 dark:text-zinc-300 font-normal ml-1">/ {turnos.filter(t => t.fecha <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]).length} semana</span>
          </p>
        </div>
        <div className="glass-card-glow rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <FileSearch className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Revisar</span>
          </div>
          <p className="text-lg font-bold text-amber-400">
            {expedientes.filter(e => e.dias_sin_control > 14).length}
            <span className="text-xs text-zinc-700 dark:text-zinc-300 font-normal ml-1"> atrasados</span>
          </p>
        </div>
        <div className="glass-card-glow rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks className="h-4 w-4 text-rose-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Vencidas</span>
          </div>
          <p className="text-lg font-bold text-rose-400">
            {tareasVencidas.length}
            <span className="text-xs text-zinc-700 dark:text-zinc-300 font-normal ml-1"> tareas</span>
          </p>
        </div>
      </div>

      {/* Grid layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---- Section 1: Expedientes para revisar ---- */}
        <div className="lg:col-span-2 rounded-xl border border-white/10 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSearch className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Expedientes para revisar
            </h2>
            <span className="ml-auto rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-400">
              {expedientes.length}
            </span>
          </div>

          {expedientes.length === 0 ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 text-center py-6">
              No hay expedientes pendientes de control.
            </p>
          ) : (
            <div className="space-y-2">
              {expedientes.map((exp) => {
                const isExpanded = expandedExp === exp.id
                const isDone = completedExps.has(exp.id)

                return (
                  <div
                    key={exp.id}
                    className={cn(
                      'rounded-lg border transition-colors',
                      isDone
                        ? 'border-emerald-900 bg-emerald-950/20'
                        : 'border-white/5 bg-white/5 hover:bg-zinc-100 dark:bg-white/[0.04]'
                    )}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Done indicator */}
                      {isDone && (
                        <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                      )}

                      {/* Dias sin control badge */}
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                          exp.dias_sin_control > 30
                            ? 'bg-rose-900/40 text-rose-400'
                            : exp.dias_sin_control > 14
                            ? 'bg-amber-900/40 text-amber-400'
                            : 'bg-amber-900/40 text-amber-400'
                        )}
                        title={`${exp.dias_sin_control} d\u00EDas sin control`}
                      >
                        {exp.dias_sin_control}d
                      </div>

                      {/* Expediente info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/expedientes/${exp.id}`)}
                            className="font-mono text-xs text-amber-400 hover:underline"
                          >
                            {exp.caratula || exp.numero_expediente}
                          </button>
                          <EstadoBadge estado={exp.estado_interno} compact />
                        </div>
                        <p className="text-xs text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                          {exp.clientes
                            ? `${exp.clientes.apellido} ${exp.clientes.nombre}`
                            : 'Sin cliente'}
                          {' \u2014 '}
                          {(exp as any).numero_expediente}
                        </p>
                      </div>

                      {/* Expand / collapse */}
                      {!isDone && (
                        <button
                          onClick={() => toggleExpand(exp.id)}
                          className="shrink-0 rounded-lg border border-white/10 p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200"
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

                    {/* Inline form */}
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
          )}
        </div>

        {/* ---- Section 2: Turnos — calendar + list ---- */}
        <div className="rounded-xl border border-white/10 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="h-5 w-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Audiencias
            </h2>
            <span className="ml-auto rounded-full bg-sky-900/30 px-2 py-0.5 text-xs font-medium text-sky-400">
              {turnos.length}
            </span>
          </div>

          <MiniCalendar turnos={turnos} onTurnoClick={(expId) => navigate(`/expedientes/${expId}`)} />
        </div>

        {/* ---- Section 3: Tareas vencidas + Alertas ---- */}
        <div className="space-y-6">
          {/* Tareas vencidas */}
          <div className="rounded-xl border border-white/10 glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-rose-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Tareas vencidas
              </h2>
              <span className="rounded-full bg-rose-900/30 px-2 py-0.5 text-xs font-medium text-rose-400">
                {tareasVencidas.length}
              </span>
              <button
                onClick={() => setCrearTareaOpen(true)}
                className="ml-auto flex items-center gap-1 rounded-lg bg-gradient-cyan px-2.5 py-1 text-xs font-medium text-zinc-950 hover:opacity-90"
              >
                <Plus className="h-3 w-3" />
                Nueva
              </button>
            </div>

            {tareasVencidas.length === 0 ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400 text-center py-4">
                No hay tareas vencidas.
              </p>
            ) : (
              <div className="space-y-2">
                {tareasVencidas.slice(0, 5).map((tarea) => (
                  <div
                    key={tarea.id}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5"
                  >
                    <button
                      onClick={() => completarTarea.mutate(tarea.id)}
                      className="shrink-0 rounded p-1 text-zinc-700 dark:text-zinc-300 hover:text-emerald-400"
                      title="Completar"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {tarea.titulo}
                      </p>
                      {tarea.expediente && (
                        <button
                          onClick={() =>
                            navigate(`/expedientes/${tarea.expediente!.id}`)
                          }
                          className="text-[10px] text-amber-400 hover:underline"
                        >
                          {tarea.expediente.caratula || (tarea.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-rose-400">
                      {tarea.fecha_vencimiento
                        ? formatDateWithWeekday(tarea.fecha_vencimiento)
                        : ''}
                    </span>
                  </div>
                ))}
                {tareasVencidas.length > 5 && (
                  <button
                    onClick={() => navigate('/tareas')}
                    className="w-full text-center text-xs text-amber-400 hover:underline pt-1"
                  >
                    Ver todas las tareas vencidas ({tareasVencidas.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Alertas */}
          <div className="rounded-xl border border-white/10 glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Alertas pendientes
              </h2>
              <span className="ml-auto rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-400">
                {alertasList.length}
              </span>
            </div>

            {alertasList.length === 0 ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400 text-center py-4">
                Sin alertas pendientes.
              </p>
            ) : (
              <div className="space-y-2">
                {alertasList.slice(0, 5).map((alerta) => (
                  <div
                    key={alerta.id}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {alerta.titulo}
                      </p>
                      {alerta.expediente && (
                        <button
                          onClick={() =>
                            navigate(`/expedientes/${alerta.expediente!.id}`)
                          }
                          className="text-[10px] text-amber-400 hover:underline"
                        >
                          {alerta.expediente.caratula || (alerta.expediente as any).numero_expediente}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => resolverAlerta.mutate(alerta.id)}
                      className="shrink-0 rounded-lg bg-emerald-900/30 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-900/50"
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
                    Ver todas las alertas ({alertasList.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <CrearTareaDialog
        open={crearTareaOpen}
        onClose={() => setCrearTareaOpen(false)}
      />
    </div>
  )
}
