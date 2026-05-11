import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar, Bell, ArrowRight, ChevronRight, Plus, CheckSquare, CalendarClock,
  Timer, AlertTriangle, Zap, FolderOpen, TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics'
import {
  usePanelExpedientes,
  getExpCategory,
  COLOR_CONFIG,
  PIPELINE_CATEGORIES,
  type PipelineCategory,
} from '@/hooks/use-panel-expedientes'
import { useAlertas } from '@/hooks/use-alertas'
import { useTareas } from '@/hooks/use-tareas'
import { KPIStrip, KPIStripSkeleton } from '@/components/dashboard/kpi-strip'
import { SemaforoPanel, SemaforoPanelSkeleton } from '@/components/dashboard/semaforo-panel'
import { MisTareasPanel } from '@/components/dashboard/mis-tareas-panel'
import { PlazosProximosPanel } from '@/components/dashboard/plazos-proximos-panel'
import { ActuacionesRecientesPanel } from '@/components/dashboard/sae-actuaciones-recientes-panel'
import { ErrorState } from '@/components/shared/error-state'
import { timeAgo } from '@/lib/utils/date-helpers'
import { ESTADOS_TERMINALES } from '@/types/enums'

const TIPO_TURNO_LABELS: Record<string, string> = {
  INICIO_TRAMITE: 'Inicio de trámite',
  AUDIENCIA: 'Audiencia',
  PERICIAL: 'Pericial',
  OTRO: 'Otro',
}
import type { ProximoTurno } from '@/hooks/use-dashboard-metrics'
import type { AlertaWithExpediente } from '@/hooks/use-alertas'

// ---------------------------------------------------------------------------
// Productivity metrics (client-side calculation)
// ---------------------------------------------------------------------------

function useProductivityMetrics() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const in48h = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]

  return useQuery({
    queryKey: ['dashboard-productivity'],
    queryFn: async () => {
      const [tareasProxRes, finalizadosRes, historialFinalRes, estancadosRes] = await Promise.all([
        supabase
          .from('tareas')
          .select('id, titulo, fecha_vencimiento', { count: 'exact' })
          .in('estado', ['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])
          .gt('fecha_vencimiento', today)
          .lte('fecha_vencimiento', in48h)
          .limit(5),
        supabase
          .from('expedientes')
          .select('id, created_at')
          .in('estado_interno', [...ESTADOS_TERMINALES])
          .is('deleted_at', null)
          .limit(200),
        // Get the actual finalization date from historial (more accurate than updated_at)
        supabase
          .from('historial_estados_expediente')
          .select('expediente_id, created_at')
          .in('estado_nuevo', [...ESTADOS_TERMINALES])
          .order('created_at', { ascending: false })
          .limit(400),
        supabase
          .from('expedientes')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('estado_interno', 'in', `("${ESTADOS_TERMINALES.join('","')}")`)
          .lt('updated_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      ])

      const finalizados = finalizadosRes.data ?? []
      let avgDays: number | null = null
      if (finalizados.length > 0) {
        // Build a map of expediente_id → first (most recent) finalization date from historial
        const finalDateMap = new Map<string, string>()
        for (const h of (historialFinalRes.data ?? [])) {
          if (!finalDateMap.has(h.expediente_id)) {
            finalDateMap.set(h.expediente_id, h.created_at)
          }
        }
        const total = finalizados.reduce((sum, e: any) => {
          if (!e.created_at) return sum
          const finalDate = finalDateMap.get(e.id)
          if (!finalDate) return sum
          return sum + Math.max(0, Math.floor((new Date(finalDate).getTime() - new Date(e.created_at).getTime()) / 86400000))
        }, 0)
        const withFinalDate = finalizados.filter((e: any) => finalDateMap.has(e.id)).length
        avgDays = withFinalDate > 0 ? Math.round(total / withFinalDate) : null
      }

      return {
        tareasProximas48h: tareasProxRes.count ?? 0,
        tiempoPromedioResolucion: avgDays,
        expedientesEstancados: estancadosRes.count ?? 0,
      }
    },
    staleTime: 120_000,
  })
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  // Por default todos ven todos los expedientes del estudio.
  // El filtrado "mis casos" se hace manualmente desde el toggle del Kanban.
  const abogadoId: string | undefined = undefined

  const { data: metrics, isLoading: metricsLoading, isError: metricsError, refetch: refetchMetrics } = useDashboardMetrics()
  const { data: expedientes, isLoading: panelLoading, isError: panelError, refetch: refetchPanel } = usePanelExpedientes(abogadoId)
  const { data: alertas } = useAlertas()
  const { data: prodMetrics } = useProductivityMetrics()

  // Quick count for greeting
  const { data: misTareasData } = useTareas({
    asignado_a: isAdmin ? undefined : profile?.id,
    pageSize: 1,
  })
  const tareasPendientes = misTareasData?.count ?? 0

  const isLoading = metricsLoading || panelLoading
  const isError = metricsError || panelError

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buen día' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const userName = profile?.nombre || 'Usuario'

  // Pipeline counts (5 categories)
  const pipelineCounts = useMemo(() => {
    if (!expedientes) return null
    const counts: Record<PipelineCategory, number> = {
      analisis: 0, iniciar: 0, iniciados: 0, favorable: 0, desfavorable: 0,
    }
    expedientes.forEach((exp) => {
      const cat = getExpCategory(exp)
      counts[cat]++
    })
    return { ...counts, total: expedientes.length }
  }, [expedientes])

  // Contextual subtitle
  const subtitle = useMemo(() => {
    const parts: string[] = []
    if (tareasPendientes > 0) {
      parts.push(`${tareasPendientes} tarea${tareasPendientes > 1 ? 's' : ''} pendiente${tareasPendientes > 1 ? 's' : ''}`)
    }
    const turnosCount = metrics?.turnos_semana ?? 0
    if (turnosCount > 0) {
      parts.push(`${turnosCount} turno${turnosCount > 1 ? 's' : ''} esta semana`)
    }
    if (parts.length === 0) return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return `Tenés ${parts.join(' y ')}`
  }, [tareasPendientes, metrics])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — greeting + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            {greeting}, {userName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/expedientes/nuevo"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-3 py-2 text-xs font-medium text-zinc-950 hover:opacity-90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Expediente</span>
          </Link>
          <Link
            to="/tareas"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tareas</span>
          </Link>
          <Link
            to="/agenda"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Agenda</span>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      {metricsLoading ? (
        <KPIStripSkeleton />
      ) : metrics ? (
        <KPIStrip metrics={metrics} />
      ) : null}

      {/* ── Mis Tareas + Turnos Próximos (side by side) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MisTareasPanel />
        <UpcomingTurnosPanel turnos={metrics?.turnos_proximos ?? []} />
      </div>

      {/* ── SAE: Plazos por vencer (IA) + Actuaciones recientes ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PlazosProximosPanel />
        <ActuacionesRecientesPanel />
      </div>

      <div className="divider-gradient" />

      {/* Pipeline Funnel Bar */}
      {pipelineCounts && pipelineCounts.total > 0 && (
        <PipelineFunnelBar counts={pipelineCounts} />
      )}

      {/* Semáforo Panel — operational table with pipeline categories */}
      {panelLoading ? (
        <SemaforoPanelSkeleton />
      ) : panelError ? (
        <ErrorState
          message="No se pudieron cargar los expedientes."
          onRetry={() => { refetchPanel(); refetchMetrics() }}
        />
      ) : expedientes ? (
        <SemaforoPanel expedientes={expedientes} />
      ) : null}

      <div className="divider-gradient" />

      {/* Productivity strip + Alertas */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Productivity metrics — takes 2 cols */}
        {prodMetrics && (
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Tareas próx. 48h</p>
                <p className={`text-lg font-bold ${prodMetrics.tareasProximas48h > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                  {prodMetrics.tareasProximas48h}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Timer className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Prom. resolución</p>
                <p className="text-lg font-bold text-zinc-700 dark:text-zinc-200" title="Promedio de días desde la creación hasta la finalización de expedientes">
                  {prodMetrics.tiempoPromedioResolucion !== null ? `${prodMetrics.tiempoPromedioResolucion}d` : <span className="text-sm text-zinc-400">Sin datos</span>}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Estancados &gt;30d</p>
                <p className={`text-lg font-bold ${prodMetrics.expedientesEstancados > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                  {prodMetrics.expedientesEstancados}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Alertas — takes 1 col */}
        <ActiveAlertasPanel alertas={alertas ?? []} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline Funnel Bar — 5 categories
// ---------------------------------------------------------------------------

const FUNNEL_COLORS: Record<PipelineCategory, { bar: string; hex: string }> = {
  analisis: { bar: 'bg-slate-400/60', hex: '#94a3b8' },
  iniciar: { bar: 'bg-amber-400', hex: '#fbbf24' },
  iniciados: { bar: 'bg-blue-500', hex: '#3b82f6' },
  favorable: { bar: 'bg-emerald-500', hex: '#10b981' },
  desfavorable: { bar: 'bg-rose-500', hex: '#f43f5e' },
}

function PipelineFunnelBar({ counts }: { counts: Record<PipelineCategory, number> & { total: number } }) {
  const items = PIPELINE_CATEGORIES.map((cat) => ({
    cat,
    count: counts[cat],
    pct: counts.total > 0 ? Math.round((counts[cat] / counts.total) * 100) : 0,
  }))

  return (
    <div className="glass-card rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Pipeline de expedientes
        </h3>
        <span className="text-xs text-zinc-500">{counts.total} activos</span>
      </div>

      <div className="h-3 rounded-full overflow-hidden flex gap-0.5 bg-zinc-200 dark:bg-zinc-800">
        {items.map(({ cat, pct }) =>
          pct > 0 ? (
            <div
              key={cat}
              className={`h-full ${FUNNEL_COLORS[cat].bar} transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          ) : null
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
        {items.map(({ cat, count, pct }) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: FUNNEL_COLORS[cat].hex }}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
              {COLOR_CONFIG[cat].label}
            </span>
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{count}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">({pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upcoming Turnos (compact — max 5 items)
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff < 0) return `Hace ${Math.abs(diff)}d`
  return `En ${diff} días`
}

function UpcomingTurnosPanel({ turnos }: { turnos: ProximoTurno[] }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Próximos Turnos</h3>
          {turnos.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/10 px-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">{turnos.length}</span>
          )}
        </div>
        <Link to="/agenda" className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
          Ver agenda <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="max-h-[320px] overflow-y-auto divide-y divide-zinc-100 dark:divide-white/5">
        {turnos.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar className="mx-auto h-7 w-7 text-zinc-400 dark:text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-500">No hay turnos programados</p>
          </div>
        ) : (
          turnos.slice(0, 6).map((turno) => {
            const countdown = daysUntil(turno.fecha)
            const isToday = countdown === 'Hoy'
            const isTomorrow = countdown === 'Mañana'

            return (
              <Link key={turno.id} to={`/expedientes/${turno.expediente_id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-white/[0.06] dark:bg-white/[0.03] transition-colors">
                <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg ${isToday ? 'bg-amber-500/15' : isTomorrow ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                  <span className={`text-[10px] font-bold ${isToday ? 'text-amber-600 dark:text-amber-400' : isTomorrow ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    {countdown}
                  </span>
                  {turno.hora && <span className="text-[10px] text-zinc-500">{turno.hora.slice(0, 5)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{turno.cliente_nombre} {turno.cliente_apellido}</p>
                  <p className="text-xs text-zinc-500">
                    {TIPO_TURNO_LABELS[turno.tipo_turno as keyof typeof TIPO_TURNO_LABELS] ?? turno.tipo_turno}
                    {' · '}{(turno as any).caratula || turno.numero}
                  </p>
                </div>
                <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  turno.estado === 'CONFIRMADO'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : turno.estado === 'PENDIENTE'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                }`}>
                  {turno.estado === 'CONFIRMADO' ? 'Confirmado' : turno.estado === 'PENDIENTE' ? 'Pendiente' : turno.estado}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alertas (compact — max 4 items)
// ---------------------------------------------------------------------------

const ALERTA_COLORS: Record<string, string> = {
  VENCIMIENTO_TAREA: 'bg-red-500/10 text-red-500 dark:text-red-400',
  TURNO_PROXIMO: 'bg-blue-500/10 text-blue-500 dark:text-blue-400',
  SEGUIMIENTO_PENDIENTE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  DOCUMENTO_FALTANTE: 'bg-orange-500/10 text-orange-500 dark:text-orange-400',
  COBRO_PENDIENTE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ESTADO_CAMBIO: 'bg-violet-500/10 text-violet-500 dark:text-violet-400',
  SISTEMA: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400',
}

function ActiveAlertasPanel({ alertas }: { alertas: AlertaWithExpediente[] }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Alertas</h3>
          {alertas.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/10 px-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">{alertas.length}</span>
          )}
        </div>
        <Link to="/alertas" className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="max-h-[300px] overflow-y-auto divide-y divide-zinc-100 dark:divide-white/5">
        {alertas.length === 0 ? (
          <div className="py-8 text-center">
            <Bell className="mx-auto h-7 w-7 text-zinc-400 dark:text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-500">No hay alertas activas</p>
          </div>
        ) : (
          alertas.slice(0, 5).map((alerta) => (
            <div key={alerta.id} className="flex items-start gap-3 px-4 py-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ALERTA_COLORS[alerta.tipo] ?? ALERTA_COLORS.SISTEMA}`}>
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{alerta.titulo}</p>
                {alerta.mensaje && <p className="mt-0.5 truncate text-xs text-zinc-500">{alerta.mensaje}</p>}
                {alerta.expediente && (
                  <Link to={`/expedientes/${alerta.expediente.id}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300">
                    {alerta.expediente.caratula || alerta.expediente.numero}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-zinc-400">{timeAgo(alerta.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
