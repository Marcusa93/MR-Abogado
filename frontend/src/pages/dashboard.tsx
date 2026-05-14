import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar, Bell, ArrowRight, ChevronRight, Plus, CheckSquare, CalendarClock,
  Timer, AlertTriangle, Zap, FolderOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics'
import type { DashboardMetrics, ProximoTurno } from '@/hooks/use-dashboard-metrics'
import {
  usePanelExpedientes,
  getExpCategory,
  COLOR_CONFIG,
  PIPELINE_CATEGORIES,
  type PipelineCategory,
} from '@/hooks/use-panel-expedientes'
import { useAlertas } from '@/hooks/use-alertas'
import type { AlertaWithExpediente } from '@/hooks/use-alertas'
import { useTareas } from '@/hooks/use-tareas'
import type { TareaWithRelations } from '@/hooks/use-tareas'
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
import type { PlazoProximo, ActuacionReciente } from '@/hooks/use-sae-dashboard'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'

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

type PipelineCounts = Record<PipelineCategory, number> & { total: number }

export interface ProductivityMetricsData {
  tareasProximas48h: number
  tiempoPromedioResolucion: number | null
  expedientesEstancados: number
}

export interface DashboardViewProps {
  greeting: string
  userName: string
  subtitle: string
  todayLabel: string
  metricsLoading: boolean
  metrics?: DashboardMetrics
  pipelineCounts: PipelineCounts | null
  panelLoading: boolean
  panelError: boolean
  expedientes?: ExpedienteWithRelations[]
  prodMetrics?: ProductivityMetricsData
  alertas: AlertaWithExpediente[]
  onRetry?: () => void
  previewTasks?: TareaWithRelations[]
  previewPlazos?: PlazoProximo[]
  previewActuaciones?: ActuacionReciente[]
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

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useDashboardMetrics()
  const { data: expedientes, isLoading: panelLoading, isError: panelError, refetch: refetchPanel } = usePanelExpedientes(abogadoId)
  const { data: alertas } = useAlertas()
  const { data: prodMetrics } = useProductivityMetrics()

  // Quick count for greeting
  const { data: misTareasData } = useTareas({
    asignado_a: isAdmin ? undefined : profile?.id,
    pageSize: 1,
  })
  const tareasPendientes = misTareasData?.count ?? 0

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

  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return (
    <DashboardView
      greeting={greeting}
      userName={userName}
      subtitle={subtitle}
      todayLabel={todayLabel}
      metricsLoading={metricsLoading}
      metrics={metrics}
      pipelineCounts={pipelineCounts}
      panelLoading={panelLoading}
      panelError={panelError}
      expedientes={expedientes}
      prodMetrics={prodMetrics}
      alertas={alertas ?? []}
      onRetry={() => { refetchPanel(); refetchMetrics() }}
    />
  )
}

export function DashboardView({
  greeting,
  userName,
  subtitle,
  todayLabel,
  metricsLoading,
  metrics,
  pipelineCounts,
  panelLoading,
  panelError,
  expedientes,
  prodMetrics,
  alertas,
  onRetry,
  previewTasks,
  previewPlazos,
  previewActuaciones,
}: DashboardViewProps) {
  const nextTurno = metrics?.turnos_proximos?.[0] ?? null

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="dashboard-hero px-6 py-7 sm:px-8 lg:px-10 lg:py-10">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_390px] lg:items-end">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/72">
              <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse-subtle" />
              Estudio · estrategia · datos
            </span>
            <h1 className="mt-5 text-[clamp(2.4rem,6vw,4.4rem)] font-black leading-[1.02] tracking-tight text-white">
              {greeting}, {userName}.{' '}
              <span className="bg-gradient-to-r from-white via-[rgb(204,222,231)] to-[rgb(87,124,142)] bg-clip-text text-transparent">
                Controlá el estudio con una vista hecha para decidir rápido.
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 sm:text-base">
              {subtitle}. Expedientes, plazos, actuaciones y alertas en una misma lectura operativa,
              con el tono sobrio y técnico del estudio.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/expedientes/nuevo"
                className="btn-interactive inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#07131f]"
              >
                <Plus className="h-4 w-4" />
                Nuevo expediente
              </Link>
              <Link
                to="/tareas"
                className="btn-interactive inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/88"
              >
                <CheckSquare className="h-4 w-4" />
                Revisar tareas
              </Link>
              <Link
                to="/agenda"
                className="btn-interactive inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/88"
              >
                <CalendarClock className="h-4 w-4" />
                Ver agenda
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-medium text-white/58">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/55" />
                {todayLabel}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/55" />
                {pipelineCounts?.total ?? 0} expedientes en seguimiento
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
            <img
              src="/logo/mr-monograma-blanco.svg"
              alt="MR"
              className="pointer-events-none absolute right-4 top-4 h-16 w-16 opacity-[0.08]"
            />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/48">
              Snapshot del estudio
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Expedientes activos</p>
                <div className="mt-2 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-white/68" />
                  <span className="text-2xl font-black text-white">{pipelineCounts?.total ?? 0}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Alertas abiertas</p>
                <div className="mt-2 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-white/68" />
                  <span className="text-2xl font-black text-white">{alertas?.length ?? 0}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Vencen en 48h</p>
                <div className="mt-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-white/68" />
                  <span className="text-2xl font-black text-white">{prodMetrics?.tareasProximas48h ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Próximo turno</p>
                  {nextTurno ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {nextTurno.cliente_nombre} {nextTurno.cliente_apellido}
                      </p>
                      <p className="mt-1 text-xs text-white/62">
                        {TIPO_TURNO_LABELS[nextTurno.tipo_turno as keyof typeof TIPO_TURNO_LABELS] ?? nextTurno.tipo_turno}
                        {' · '}{nextTurno.fecha}
                        {nextTurno.hora ? ` · ${nextTurno.hora.slice(0, 5)}` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-white/62">No hay turnos programados.</p>
                  )}
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-white/72">
                  {metrics?.tasa_exito ?? 0}% éxito
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      {metricsLoading ? (
        <KPIStripSkeleton />
      ) : metrics ? (
        <KPIStrip metrics={metrics} />
      ) : null}

      <SectionHeading
        eyebrow="operación diaria"
        title="Lo inmediato del estudio"
        description="Tareas personales, audiencias y próximos vencimientos en una lectura corta."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MisTareasPanel previewData={previewTasks} />
        <UpcomingTurnosPanel turnos={metrics?.turnos_proximos ?? []} />
      </div>

      <SectionHeading
        eyebrow="radar sae"
        title="Prueba electrónica y movimiento judicial"
        description="Detección asistida por IA para seguir actuaciones y plazos antes de que se conviertan en urgencias."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PlazosProximosPanel previewData={previewPlazos} />
        <ActuacionesRecientesPanel previewData={previewActuaciones} />
      </div>

      <div className="dashboard-divider" />

      <SectionHeading
        eyebrow="pipeline activo"
        title="Estado real de los expedientes"
        description="Embudo operativo del estudio y tabla de seguimiento para intervenir rápido."
      />

      {pipelineCounts && pipelineCounts.total > 0 && (
        <PipelineFunnelBar counts={pipelineCounts} />
      )}

      {panelLoading ? (
        <SemaforoPanelSkeleton />
      ) : panelError ? (
        <ErrorState
          message="No se pudieron cargar los expedientes."
          onRetry={onRetry}
        />
      ) : expedientes ? (
        <SemaforoPanel expedientes={expedientes} />
      ) : null}

      <div className="dashboard-divider" />

      <SectionHeading
        eyebrow="rendimiento"
        title="Señales de productividad y alertas"
        description="Métrica operativa para sostener ritmo, detectar fricciones y no perder foco."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {prodMetrics && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
            <ProductivityCard
              title="Tareas próx. 48h"
              value={prodMetrics.tareasProximas48h}
              icon={<Zap className="h-4 w-4" />}
              tone={prodMetrics.tareasProximas48h > 0 ? 'warning' : 'accent'}
            />
            <ProductivityCard
              title="Prom. resolución"
              value={
                prodMetrics.tiempoPromedioResolucion !== null
                  ? `${prodMetrics.tiempoPromedioResolucion}d`
                  : 'Sin datos'
              }
              icon={<Timer className="h-4 w-4" />}
              tone="success"
              tooltip="Promedio de días desde la creación hasta la finalización de expedientes"
            />
            <ProductivityCard
              title="Estancados >30d"
              value={prodMetrics.expedientesEstancados}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone={prodMetrics.expedientesEstancados > 0 ? 'danger' : 'accent'}
            />
          </div>
        )}

        <ActiveAlertasPanel alertas={alertas ?? []} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared dashboard blocks
// ---------------------------------------------------------------------------

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="dashboard-eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  )
}

function ProductivityCard({
  title,
  value,
  icon,
  tone,
  tooltip,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  tone: 'accent' | 'warning' | 'success' | 'danger'
  tooltip?: string
}) {
  const toneClasses = {
    accent: 'dashboard-stat-orb',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  }

  return (
    <div className="dashboard-panel rounded-[1.4rem] px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClasses[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">{title}</p>
          <p
            className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-zinc-50"
            title={tooltip}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline Funnel Bar — 5 categories
// ---------------------------------------------------------------------------

const FUNNEL_COLORS: Record<PipelineCategory, { bar: string; hex: string }> = {
  analisis: { bar: 'bg-slate-400/70', hex: '#8ea2ae' },
  iniciar: { bar: 'bg-amber-400/90', hex: '#c9a460' },
  iniciados: { bar: 'bg-[#577c8e]', hex: '#577c8e' },
  favorable: { bar: 'bg-emerald-500/85', hex: '#4d8b78' },
  desfavorable: { bar: 'bg-rose-500/85', hex: '#b66b7b' },
}

function PipelineFunnelBar({ counts }: { counts: Record<PipelineCategory, number> & { total: number } }) {
  const items = PIPELINE_CATEGORIES.map((cat) => ({
    cat,
    count: counts[cat],
    pct: counts.total > 0 ? Math.round((counts[cat] / counts.total) * 100) : 0,
  }))

  return (
    <div className="dashboard-panel rounded-[1.6rem] px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow">pipeline</p>
          <h3 className="mt-2 text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
            Pipeline de expedientes
          </h3>
        </div>
        <span className="dashboard-chip dashboard-chip-accent">{counts.total} activos</span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {items.map(({ cat, pct }) =>
          pct > 0 ? (
            <div
              key={cat}
              className={`h-full ${FUNNEL_COLORS[cat].bar} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${pct}%` }}
            />
          ) : null
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
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
    <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">agenda judicial</p>
          <div className="mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Próximos Turnos</h3>
            {turnos.length > 0 && (
              <span className="dashboard-chip dashboard-chip-accent">{turnos.length}</span>
            )}
          </div>
        </div>
        <Link to="/agenda" className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold">
          Ver agenda <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="max-h-[320px] divide-y divide-[rgb(87_124_142_/_10%)] overflow-y-auto dark:divide-white/6">
        {turnos.length === 0 ? (
          <div className="py-10 text-center">
            <div className="dashboard-stat-orb mx-auto flex h-12 w-12 items-center justify-center rounded-2xl">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm text-zinc-500">No hay turnos programados</p>
          </div>
        ) : (
          turnos.slice(0, 6).map((turno) => {
            const countdown = daysUntil(turno.fecha)
            const isToday = countdown === 'Hoy'
            const isTomorrow = countdown === 'Mañana'

            return (
              <Link
                key={turno.id}
                to={`/expedientes/${turno.expediente_id}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.07]"
              >
                <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-2xl ${isToday ? 'bg-amber-500/15' : isTomorrow ? 'bg-amber-500/10' : 'dashboard-stat-orb'}`}>
                  <span className={`text-[10px] font-bold ${isToday ? 'text-amber-600 dark:text-amber-300' : isTomorrow ? 'text-amber-600 dark:text-amber-300' : 'text-[var(--brand-accent)] dark:text-[var(--brand-ice)]'}`}>
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
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : turno.estado === 'PENDIENTE'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
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
    <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">alertas</p>
          <div className="mt-1 flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Alertas</h3>
            {alertas.length > 0 && (
              <span className="dashboard-chip dashboard-chip-danger">{alertas.length}</span>
            )}
          </div>
        </div>
        <Link to="/alertas" className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="max-h-[300px] divide-y divide-[rgb(87_124_142_/_10%)] overflow-y-auto dark:divide-white/6">
        {alertas.length === 0 ? (
          <div className="py-10 text-center">
            <div className="dashboard-stat-orb mx-auto flex h-12 w-12 items-center justify-center rounded-2xl">
              <Bell className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm text-zinc-500">No hay alertas activas</p>
          </div>
        ) : (
          alertas.slice(0, 5).map((alerta) => (
            <div key={alerta.id} className="flex items-start gap-3 px-5 py-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ALERTA_COLORS[alerta.tipo] ?? ALERTA_COLORS.SISTEMA}`}>
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{alerta.titulo}</p>
                {alerta.mensaje && <p className="mt-0.5 truncate text-xs text-zinc-500">{alerta.mensaje}</p>}
                {alerta.expediente && (
                  <Link to={`/expedientes/${alerta.expediente.id}`} className="dashboard-link mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
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
