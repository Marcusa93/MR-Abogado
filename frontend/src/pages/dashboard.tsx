import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, CalendarClock, Bell, ArrowRight, ChevronRight,
  Clock, Zap, MessageSquare, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics'
import type { DashboardMetrics, ProximoTurno } from '@/hooks/use-dashboard-metrics'
import { usePanelExpedientes } from '@/hooks/use-panel-expedientes'
import { useAlertas } from '@/hooks/use-alertas'
import type { AlertaWithExpediente } from '@/hooks/use-alertas'
import { MisTareasPanel } from '@/components/dashboard/mis-tareas-panel'
import { PlazosProximosPanel } from '@/components/dashboard/plazos-proximos-panel'
import { ActuacionesRecientesPanel } from '@/components/dashboard/sae-actuaciones-recientes-panel'
import { SemaforoPanel, SemaforoPanelSkeleton } from '@/components/dashboard/semaforo-panel'
import { AbogadosPanel } from '@/components/dashboard/abogados-panel'
import { CargaEquipoPanel } from '@/components/dashboard/carga-equipo-panel'
import { ConsultasWidget } from '@/components/dashboard/consultas-widget'
import { ActividadRecienteDashboardPanel } from '@/components/dashboard/actividad-reciente-dashboard-panel'
import { ErrorState } from '@/components/shared/error-state'
import { timeAgo } from '@/lib/utils/date-helpers'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'

const TIPO_TURNO_LABELS: Record<string, string> = {
  INICIO_TRAMITE: 'Inicio de trámite',
  AUDIENCIA: 'Audiencia',
  PERICIAL: 'Pericial',
  OTRO: 'Otro',
}

// ── Fuero config ─────────────────────────────────────────────────────────────

const FUERO_CFG: Record<string, { label: string; color: string; bar: string }> = {
  laboral:               { label: 'Laboral',           color: 'text-sky-400',     bar: 'bg-sky-500' },
  civil:                 { label: 'Civil y Com.',       color: 'text-violet-400',  bar: 'bg-violet-500' },
  documentos_locaciones: { label: 'Doc. y Locaciones',  color: 'text-teal-400',    bar: 'bg-teal-500' },
  familia:               { label: 'Familia',            color: 'text-rose-400',    bar: 'bg-rose-500' },
  administrativo:        { label: 'Administrativo',     color: 'text-amber-400',   bar: 'bg-amber-500' },
  previsional:           { label: 'Previsional',        color: 'text-emerald-400', bar: 'bg-emerald-500' },
  penal:                 { label: 'Penal',              color: 'text-orange-400',  bar: 'bg-orange-500' },
  comercial:             { label: 'Comercial',          color: 'text-blue-400',    bar: 'bg-blue-500' },
  otro:                  { label: 'Otro',               color: 'text-zinc-400',    bar: 'bg-zinc-500' },
}

// ── Etapa config — etapas procesales (PARA_INICIAR/NUEVA_CONSULTA excluidos) ─

const ETAPA_ORDER = ['INICIADO', 'PRUEBA', 'ALEGATOS', 'SENTENCIA', 'APELACION', 'CORTE', 'PAUSADO', 'FINALIZADO'] as const

const ETAPA_CFG: Record<string, { label: string; bar: string }> = {
  INICIADO:   { label: 'Demanda / En trámite', bar: 'bg-sky-500' },
  PRUEBA:     { label: 'Período de prueba',     bar: 'bg-amber-500' },
  ALEGATOS:   { label: 'Alegatos',              bar: 'bg-orange-500' },
  SENTENCIA:  { label: 'Sentencia',             bar: 'bg-violet-500' },
  APELACION:  { label: 'Apelación',             bar: 'bg-purple-500' },
  CORTE:      { label: 'Corte',                 bar: 'bg-indigo-500' },
  PAUSADO:    { label: 'Pausado',               bar: 'bg-zinc-400' },
  FINALIZADO: { label: 'Finalizado',            bar: 'bg-emerald-500' },
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardViewProps {
  greeting: string
  userName: string
  todayLabel: string
  metricsLoading: boolean
  metrics?: DashboardMetrics
  panelLoading: boolean
  panelError: boolean
  expedientes?: ExpedienteWithRelations[]
  alertas: AlertaWithExpediente[]
  byFuero: Record<string, number>
  byEtapa: Record<string, number>
  totalExpedientes: number
  tareasHoy: { id: string; titulo: string }[]
  onRetry?: () => void
}

// ── Query: tareas hoy ────────────────────────────────────────────────────────

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

// ── DashboardPage ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile } = useAuth()
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useDashboardMetrics()
  const { data: expedientes, isLoading: panelLoading, isError: panelError, refetch: refetchPanel } = usePanelExpedientes()
  const { data: alertas } = useAlertas()
  const { data: tareasHoy = [] } = useTareasHoy()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buen día' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const userName = profile?.nombre || 'Usuario'

  const { byFuero, byEtapa, totalExpedientes } = useMemo(() => {
    if (!expedientes) return { byFuero: {}, byEtapa: {}, totalExpedientes: 0 }
    const fuero: Record<string, number> = {}
    const etapa: Record<string, number> = {}
    for (const exp of expedientes) {
      const f = exp.fuero ?? 'otro'
      fuero[f] = (fuero[f] ?? 0) + 1
      const e = (exp as any).estado_interno as string | null
      if (e && ETAPA_ORDER.includes(e as typeof ETAPA_ORDER[number])) {
        etapa[e] = (etapa[e] ?? 0) + 1
      }
    }
    return { byFuero: fuero, byEtapa: etapa, totalExpedientes: expedientes.length }
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
      panelLoading={panelLoading}
      panelError={panelError}
      expedientes={expedientes}
      alertas={alertas ?? []}
      byFuero={byFuero}
      byEtapa={byEtapa}
      totalExpedientes={totalExpedientes}
      tareasHoy={tareasHoy}
      onRetry={() => { refetchPanel(); refetchMetrics() }}
    />
  )
}

// ── DashboardView ────────────────────────────────────────────────────────────

export function DashboardView({
  greeting,
  userName,
  todayLabel,
  metrics,
  panelLoading,
  panelError,
  expedientes,
  alertas,
  byFuero,
  byEtapa,
  totalExpedientes,
  tareasHoy,
  onRetry,
}: DashboardViewProps) {
  const today = new Date().toISOString().split('T')[0]
  const turnosHoy = (metrics?.turnos_proximos ?? []).filter((t) => t.fecha === today)
  const hayHoy = turnosHoy.length > 0 || tareasHoy.length > 0

  return (
    <div className="space-y-5 animate-fade-in">

      {/* 1. Hero */}
      <CompactHero
        greeting={greeting}
        userName={userName}
        todayLabel={todayLabel}
        totalExpedientes={totalExpedientes}
        alertasCount={alertas.length}
        turnosSemana={metrics?.turnos_semana ?? 0}
      />

      {/* 2. Strip hoy */}
      {hayHoy && <HoyStrip turnosHoy={turnosHoy} tareasHoy={tareasHoy} />}

      {/* 3. Panel abogados (director) */}
      <AbogadosPanel />

      {/* 3.5 Carga del equipo (admin/director) */}
      <CargaEquipoPanel />

      {/* 3.6 Consultas activas */}
      <ConsultasWidget />

      {/* 4. Distribución por fuero + etapa */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FueroCard byFuero={byFuero} total={totalExpedientes} />
        <EtapaCard byEtapa={byEtapa} total={totalExpedientes} />
      </div>

      {/* 5. Actuaciones SAE — protagonista */}
      <ActuacionesRecientesPanel />

      {/* 6. Tareas y plazos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MisTareasPanel />
        <PlazosProximosPanel />
      </div>

      {/* 7. Feed de actividad del equipo */}
      <ActividadRecienteDashboardPanel />

      {/* 8. Alertas */}
      {alertas.length > 0 && <AlertasMiniPanel alertas={alertas} />}

      {/* 8. Semáforo */}
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

// ── CompactHero ───────────────────────────────────────────────────────────────

function StatPill({
  value, label, icon, to, tone = 'neutral',
}: {
  value: number | string
  label: string
  icon: React.ReactNode
  to?: string
  tone?: 'neutral' | 'danger'
}) {
  const cls = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    tone === 'danger'
      ? 'border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
      : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15',
  )
  const inner = (
    <>{icon}<span className="font-bold">{value}</span><span className="font-normal opacity-75">{label}</span></>
  )
  return to ? <Link to={to} className={cls}>{inner}</Link> : <span className={cls}>{inner}</span>
}

function CompactHero({
  greeting, userName, todayLabel, totalExpedientes, alertasCount, turnosSemana,
}: {
  greeting: string
  userName: string
  todayLabel: string
  totalExpedientes: number
  alertasCount: number
  turnosSemana: number
}) {
  return (
    <section className="dashboard-hero px-5 py-6 sm:px-8 sm:py-8">
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/50">{todayLabel}</p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {greeting}, {userName}.
          </h1>
          <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <Link
              to="/consultas?nueva=1"
              className="btn-interactive inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#07131f]"
            >
              <MessageSquare className="h-4 w-4" />
              Nueva consulta
            </Link>
            <Link
              to="/expedientes/nuevo"
              className="btn-interactive inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-lg border border-white/14 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white/88"
            >
              <Plus className="h-4 w-4" />
              Nuevo expediente
            </Link>
            <Link
              to="/agenda"
              className="btn-interactive inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-lg border border-white/14 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white/88"
            >
              <CalendarClock className="h-4 w-4" />
              Agenda
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatPill to="/expedientes" value={totalExpedientes} label="expedientes"
            icon={<FolderOpen className="h-3.5 w-3.5" />} />
          {alertasCount > 0 && (
            <StatPill to="/alertas" value={alertasCount}
              label={alertasCount === 1 ? 'alerta' : 'alertas'}
              icon={<Bell className="h-3.5 w-3.5" />} tone="danger" />
          )}
          {turnosSemana > 0 && (
            <StatPill to="/agenda" value={turnosSemana}
              label={turnosSemana === 1 ? 'turno esta semana' : 'turnos esta semana'}
              icon={<CalendarClock className="h-3.5 w-3.5" />} />
          )}
        </div>

      </div>
    </section>
  )
}

// ── HoyStrip ─────────────────────────────────────────────────────────────────

function HoyStrip({ turnosHoy, tareasHoy }: { turnosHoy: ProximoTurno[]; tareasHoy: { id: string; titulo: string }[] }) {
  return (
    <div className="relative overflow-x-auto scrollbar-none">
      <div className="flex min-w-max items-center gap-2 pb-0.5">
        <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-400">
          Hoy
        </span>
        {turnosHoy.map((t) => (
          <Link key={t.id} to={`/expedientes/${t.expediente_id}`}
            className="group flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 transition-colors hover:border-white/20 hover:bg-white/[0.09]">
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {t.hora && <span className="text-xs font-bold text-amber-300">{t.hora.slice(0, 5)}</span>}
            <span className="text-xs text-zinc-200">{t.cliente_nombre} {t.cliente_apellido}</span>
            <span className="text-[10px] text-zinc-500">{TIPO_TURNO_LABELS[t.tipo_turno] ?? t.tipo_turno}</span>
          </Link>
        ))}
        {tareasHoy.map((t) => (
          <Link key={t.id} to="/tareas"
            className="group flex shrink-0 items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-3 py-1.5 transition-colors hover:border-rose-500/35 hover:bg-rose-500/[0.14]">
            <Zap className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span className="max-w-[180px] truncate text-xs text-zinc-200">{t.titulo}</span>
          </Link>
        ))}
      </div>
      {/* Fade-right hint for horizontal scroll on mobile */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--layout-bg)] to-transparent sm:hidden" />
    </div>
  )
}

// ── FueroCard ─────────────────────────────────────────────────────────────────

function FueroCard({ byFuero, total }: { byFuero: Record<string, number>; total: number }) {
  const entries = Object.entries(byFuero)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

  return (
    <div className="dashboard-panel flex flex-col gap-4 rounded-[1.5rem] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="dashboard-eyebrow text-[10px]">distribución</p>
          <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50">Por fuero</p>
        </div>
        <Link to="/expedientes" className="dashboard-link text-[11px] font-semibold inline-flex items-center gap-1">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {total === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">Sin expedientes</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([fuero, count]) => {
            const cfg = FUERO_CFG[fuero] ?? FUERO_CFG.otro
            const pct = Math.round((count / total) * 100)
            return (
              <Link key={fuero} to={`/expedientes?fuero=${fuero}`} className="group flex items-center gap-3">
                <span className={cn('w-[100px] shrink-0 text-[11px] font-medium truncate transition-colors', cfg.color, 'group-hover:opacity-80')}>
                  {cfg.label}
                </span>
                <div className="relative flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700', cfg.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right text-xs font-bold text-zinc-700 dark:text-zinc-200">{count}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── EtapaCard ─────────────────────────────────────────────────────────────────

function EtapaCard({ byEtapa, total }: { byEtapa: Record<string, number>; total: number }) {
  const entries = ETAPA_ORDER
    .filter(k => (byEtapa[k] ?? 0) > 0)
    .map(k => [k, byEtapa[k]] as [string, number])

  const maxCount = entries.length > 0 ? Math.max(...entries.map(e => e[1])) : 1

  return (
    <div className="dashboard-panel flex flex-col gap-4 rounded-[1.5rem] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="dashboard-eyebrow text-[10px]">proceso</p>
          <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50">Etapa procesal</p>
        </div>
        <Link to="/expedientes" className="dashboard-link text-[11px] font-semibold inline-flex items-center gap-1">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">Sin expedientes con etapa asignada</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([etapa, count]) => {
            const cfg = ETAPA_CFG[etapa] ?? { label: etapa, bar: 'bg-zinc-400' }
            const pct = Math.round((count / maxCount) * 100)
            return (
              <Link key={etapa} to={`/expedientes?estado_interno=${etapa}`} className="group flex items-center gap-3">
                <span className="w-[120px] shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors">
                  {cfg.label}
                </span>
                <div className="relative flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700 group-hover:opacity-80', cfg.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right text-xs font-bold text-zinc-700 dark:text-zinc-200">{count}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AlertasMiniPanel ──────────────────────────────────────────────────────────

const ALERTA_DOT: Record<string, string> = {
  VENCIMIENTO_TAREA:     'bg-rose-500',
  TURNO_PROXIMO:         'bg-blue-500',
  SEGUIMIENTO_PENDIENTE: 'bg-amber-500',
  DOCUMENTO_FALTANTE:    'bg-orange-500',
  COBRO_PENDIENTE:       'bg-emerald-500',
  ESTADO_CAMBIO:         'bg-violet-500',
  SISTEMA:               'bg-zinc-400',
}

function AlertasMiniPanel({ alertas }: { alertas: AlertaWithExpediente[] }) {
  return (
    <div className="dashboard-panel overflow-hidden rounded-[1.5rem]">
      <div className="flex items-center justify-between border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Alertas</h3>
          <span className="dashboard-chip dashboard-chip-danger">{alertas.length}</span>
        </div>
        <Link to="/alertas" className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="max-h-[280px] divide-y divide-[rgb(87_124_142_/_10%)] overflow-y-auto dark:divide-white/6">
        {alertas.slice(0, 6).map((alerta) => (
          <div key={alerta.id} className="flex items-start gap-3 px-5 py-3">
            <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', ALERTA_DOT[alerta.tipo] ?? 'bg-zinc-400')} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-zinc-800 dark:text-zinc-100">{alerta.titulo}</p>
              {alerta.expediente && (
                <Link to={`/expedientes/${alerta.expediente.id}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                  {alerta.expediente.caratula || (alerta.expediente as any).numero}
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">{timeAgo(alerta.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
