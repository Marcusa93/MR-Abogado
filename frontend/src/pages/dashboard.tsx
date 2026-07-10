import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, CalendarClock, Bell, ArrowRight, ChevronRight,
  Clock, Zap, CheckSquare, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { MisTareasPanel } from '@/components/dashboard/mis-tareas-panel'
import { PlazosProximosPanel } from '@/components/dashboard/plazos-proximos-panel'
import { ActuacionesRecientesPanel } from '@/components/dashboard/sae-actuaciones-recientes-panel'
import { SemaforoPanel, SemaforoPanelSkeleton } from '@/components/dashboard/semaforo-panel'
import { AbogadosPanel } from '@/components/dashboard/abogados-panel'
import { CajaWidget } from '@/components/dashboard/caja-widget'
import { ErrorState } from '@/components/shared/error-state'
import { timeAgo } from '@/lib/utils/date-helpers'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'

const TIPO_TURNO_LABELS: Record<string, string> = {
  INICIO_TRAMITE: 'Inicio de trámite',
  AUDIENCIA: 'Audiencia',
  PERICIAL: 'Pericial',
  OTRO: 'Otro',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipelineCounts = Record<PipelineCategory, number> & { total: number }

export interface DashboardViewProps {
  greeting: string
  userName: string
  todayLabel: string
  metricsLoading: boolean
  metrics?: DashboardMetrics
  pipelineCounts: PipelineCounts | null
  panelLoading: boolean
  panelError: boolean
  expedientes?: ExpedienteWithRelations[]
  alertas: AlertaWithExpediente[]
  tasaExito: number | null
  tareasHoy: { id: string; titulo: string }[]
  onRetry?: () => void
}

// ---------------------------------------------------------------------------
// Query: tareas que vencen hoy
// ---------------------------------------------------------------------------

function useTareasHoy() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  return useQuery({
    queryKey: ['tareas-hoy', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tareas')
        .select('id, titulo')
        .in('estado', ['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])
        .eq('fecha_vencimiento', today)
        .limit(6)
      if (error) throw error
      return (data ?? []) as { id: string; titulo: string }[]
    },
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { profile } = useAuth()

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useDashboardMetrics()
  const { data: expedientes, isLoading: panelLoading, isError: panelError, refetch: refetchPanel } = usePanelExpedientes()
  const { data: alertas } = useAlertas()
  const { data: tareasHoy = [] } = useTareasHoy()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buen día' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const userName = profile?.nombre || 'Usuario'

  const { pipelineCounts, tasaExito } = useMemo(() => {
    if (!expedientes) return { pipelineCounts: null, tasaExito: null }
    const counts: Record<PipelineCategory, number> = {
      analisis: 0, iniciar: 0, iniciados: 0, favorable: 0, desfavorable: 0,
    }
    expedientes.forEach((exp) => { counts[getExpCategory(exp)]++ })
    const closed = counts.favorable + counts.desfavorable
    return {
      pipelineCounts: { ...counts, total: expedientes.length },
      tasaExito: closed > 0 ? Math.round((counts.favorable / closed) * 100) : null,
    }
  }, [expedientes])

  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <DashboardView
      greeting={greeting}
      userName={userName}
      todayLabel={todayLabel}
      metricsLoading={metricsLoading}
      metrics={metrics}
      pipelineCounts={pipelineCounts}
      panelLoading={panelLoading}
      panelError={panelError}
      expedientes={expedientes}
      alertas={alertas ?? []}
      tasaExito={tasaExito}
      tareasHoy={tareasHoy}
      onRetry={() => { refetchPanel(); refetchMetrics() }}
    />
  )
}

// ---------------------------------------------------------------------------
// Dashboard View
// ---------------------------------------------------------------------------

export function DashboardView({
  greeting,
  userName,
  todayLabel,
  metrics,
  pipelineCounts,
  panelLoading,
  panelError,
  expedientes,
  alertas,
  tasaExito,
  tareasHoy,
  onRetry,
}: DashboardViewProps) {
  const today = new Date().toISOString().split('T')[0]
  const turnosHoy = (metrics?.turnos_proximos ?? []).filter((t) => t.fecha === today)
  const hayHoy = turnosHoy.length > 0 || tareasHoy.length > 0

  return (
    <div className="space-y-5 animate-fade-in">

      {/* 1. Hero compacto */}
      <CompactHero
        greeting={greeting}
        userName={userName}
        todayLabel={todayLabel}
        totalExpedientes={pipelineCounts?.total ?? 0}
        alertasCount={alertas.length}
        turnosSemana={metrics?.turnos_semana ?? 0}
        tasaExito={tasaExito}
      />

      {/* 2. Strip de hoy */}
      {hayHoy && <HoyStrip turnosHoy={turnosHoy} tareasHoy={tareasHoy} />}

      {/* 3. Caja + Abogados (condicionales, director) */}
      <CajaWidget />
      <AbogadosPanel />

      {/* 4. Grilla principal: tareas · plazos · pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MisTareasPanel />
        <PlazosProximosPanel />
        <PipelineMiniCard pipelineCounts={pipelineCounts} tasaExito={tasaExito} />
      </div>

      {/* 5. SAE recientes + alertas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ActuacionesRecientesPanel />
        <AlertasMiniPanel alertas={alertas} />
      </div>

      {/* 6. Semáforo de expedientes */}
      {panelLoading ? (
        <SemaforoPanelSkeleton />
      ) : panelError ? (
        <ErrorState message="No se pudieron cargar los expedientes." onRetry={onRetry} />
      ) : expedientes ? (
        <SemaforoPanel expedientes={expedientes} />
      ) : null}

    </div>
  )
}

// ---------------------------------------------------------------------------
// CompactHero
// ---------------------------------------------------------------------------

function StatPill({
  value,
  label,
  icon,
  to,
  tone = 'neutral',
}: {
  value: number | string
  label: string
  icon: React.ReactNode
  to?: string
  tone?: 'neutral' | 'danger' | 'success'
}) {
  const cls = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    tone === 'danger'
      ? 'border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
      : tone === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
      : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
  )
  const inner = (
    <>
      {icon}
      <span className="font-bold">{value}</span>
      <span className="font-normal opacity-75">{label}</span>
    </>
  )
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <span className={cls}>{inner}</span>
}

function CompactHero({
  greeting,
  userName,
  todayLabel,
  totalExpedientes,
  alertasCount,
  turnosSemana,
  tasaExito,
}: {
  greeting: string
  userName: string
  todayLabel: string
  totalExpedientes: number
  alertasCount: number
  turnosSemana: number
  tasaExito: number | null
}) {
  return (
    <section className="dashboard-hero px-5 py-6 sm:px-8 sm:py-8">
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

        {/* Saludo */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/50">
            {todayLabel}
          </p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {greeting}, {userName}.
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/expedientes/nuevo"
              className="btn-interactive inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#07131f]"
            >
              <Plus className="h-4 w-4" />
              Nuevo expediente
            </Link>
            <Link
              to="/agenda"
              className="btn-interactive inline-flex items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white/88"
            >
              <CalendarClock className="h-4 w-4" />
              Agenda
            </Link>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-2">
          <StatPill
            to="/expedientes"
            value={totalExpedientes}
            label="expedientes"
            icon={<FolderOpen className="h-3.5 w-3.5" />}
          />
          {alertasCount > 0 && (
            <StatPill
              to="/alertas"
              value={alertasCount}
              label={alertasCount === 1 ? 'alerta' : 'alertas'}
              icon={<Bell className="h-3.5 w-3.5" />}
              tone="danger"
            />
          )}
          {turnosSemana > 0 && (
            <StatPill
              to="/agenda"
              value={turnosSemana}
              label={turnosSemana === 1 ? 'turno esta semana' : 'turnos esta semana'}
              icon={<CalendarClock className="h-3.5 w-3.5" />}
            />
          )}
          {tasaExito !== null && (
            <StatPill
              value={`${tasaExito}%`}
              label="tasa de éxito"
              icon={<CheckSquare className="h-3.5 w-3.5" />}
              tone="success"
            />
          )}
        </div>

      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// HoyStrip — línea del tiempo de lo urgente de hoy
// ---------------------------------------------------------------------------

function HoyStrip({
  turnosHoy,
  tareasHoy,
}: {
  turnosHoy: ProximoTurno[]
  tareasHoy: { id: string; titulo: string }[]
}) {
  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex min-w-max items-center gap-2 pb-0.5">

        <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-400">
          Hoy
        </span>

        {turnosHoy.map((t) => (
          <Link
            key={t.id}
            to={`/expedientes/${t.expediente_id}`}
            className="group flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 transition-colors hover:border-white/20 hover:bg-white/[0.09]"
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {t.hora && (
              <span className="text-xs font-bold text-amber-300">{t.hora.slice(0, 5)}</span>
            )}
            <span className="text-xs text-zinc-200">
              {t.cliente_nombre} {t.cliente_apellido}
            </span>
            <span className="text-[10px] text-zinc-500">
              {TIPO_TURNO_LABELS[t.tipo_turno] ?? t.tipo_turno}
            </span>
          </Link>
        ))}

        {tareasHoy.map((t) => (
          <Link
            key={t.id}
            to="/tareas"
            className="group flex shrink-0 items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-3 py-1.5 transition-colors hover:border-rose-500/35 hover:bg-rose-500/[0.14]"
          >
            <Zap className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span className="max-w-[180px] truncate text-xs text-zinc-200">{t.titulo}</span>
          </Link>
        ))}

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PipelineMiniCard
// ---------------------------------------------------------------------------

const PIPELINE_BAR_COLOR: Record<PipelineCategory, string> = {
  analisis:     'bg-slate-400',
  iniciar:      'bg-amber-400',
  iniciados:    'bg-sky-500',
  favorable:    'bg-emerald-500',
  desfavorable: 'bg-rose-500',
}

function PipelineMiniCard({
  pipelineCounts,
  tasaExito,
}: {
  pipelineCounts: PipelineCounts | null
  tasaExito: number | null
}) {
  const total = pipelineCounts?.total ?? 0

  return (
    <div className="dashboard-panel flex flex-col gap-4 rounded-[1.5rem] p-5">

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow text-[10px]">pipeline</p>
          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {total} expedientes
          </p>
        </div>
        {tasaExito !== null && (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">éxito</p>
            <p className="mt-0.5 text-xl font-black text-emerald-500">{tasaExito}%</p>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {PIPELINE_CATEGORIES.map((cat) => {
          const count = pipelineCounts?.[cat] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          if (count === 0) return null
          return (
            <Link
              key={cat}
              to={`/expedientes?categoria=${cat}`}
              className="group flex items-center gap-3"
            >
              <p className="w-[88px] shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors truncate">
                {COLOR_CONFIG[cat].label}
              </p>
              <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', PIPELINE_BAR_COLOR[cat])}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 w-5 text-right text-xs font-bold text-zinc-700 dark:text-zinc-200">
                {count}
              </span>
            </Link>
          )
        })}
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// AlertasMiniPanel
// ---------------------------------------------------------------------------

const ALERTA_DOT: Record<string, string> = {
  VENCIMIENTO_TAREA:      'bg-rose-500',
  TURNO_PROXIMO:          'bg-blue-500',
  SEGUIMIENTO_PENDIENTE:  'bg-amber-500',
  DOCUMENTO_FALTANTE:     'bg-orange-500',
  COBRO_PENDIENTE:        'bg-emerald-500',
  ESTADO_CAMBIO:          'bg-violet-500',
  SISTEMA:                'bg-zinc-400',
}

function AlertasMiniPanel({ alertas }: { alertas: AlertaWithExpediente[] }) {
  return (
    <div className="dashboard-panel overflow-hidden rounded-[1.5rem]">

      <div className="flex items-center justify-between border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Alertas</h3>
          {alertas.length > 0 && (
            <span className="dashboard-chip dashboard-chip-danger">{alertas.length}</span>
          )}
        </div>
        <Link to="/alertas" className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="max-h-[300px] divide-y divide-[rgb(87_124_142_/_10%)] overflow-y-auto dark:divide-white/6">
        {alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Bell className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="mt-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin alertas activas</p>
          </div>
        ) : (
          alertas.slice(0, 6).map((alerta) => (
            <div key={alerta.id} className="flex items-start gap-3 px-5 py-3">
              <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', ALERTA_DOT[alerta.tipo] ?? 'bg-zinc-400')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-zinc-800 dark:text-zinc-100">{alerta.titulo}</p>
                {alerta.expediente && (
                  <Link
                    to={`/expedientes/${alerta.expediente.id}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    {alerta.expediente.caratula || (alerta.expediente as any).numero}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                {timeAgo(alerta.created_at)}
              </span>
            </div>
          ))
        )}
      </div>

    </div>
  )
}
