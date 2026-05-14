import {
  FolderOpen, Briefcase, TrendingUp, Calendar, AlertTriangle,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { DashboardMetrics } from '@/hooks/use-dashboard-metrics'

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

const KPI_COLORS: Record<string, { iconBg: string; iconText: string }> = {
  accent: { iconBg: 'dashboard-stat-orb', iconText: '' },
  success: { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-600 dark:text-emerald-300' },
  warning: { iconBg: 'bg-amber-500/10', iconText: 'text-amber-600 dark:text-amber-300' },
  danger: { iconBg: 'bg-rose-500/10', iconText: 'text-rose-600 dark:text-rose-300' },
}

function KPICard({ title, value, delta, icon, color = 'accent' }: {
  title: string
  value: number | string
  delta?: number | null
  icon: React.ReactNode
  color?: string
}) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.accent

  return (
    <div className="dashboard-panel card-lift rounded-[1.4rem] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">{title}</p>
          <p className="mt-2 text-[1.75rem] font-black tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${c.iconBg} ${c.iconText}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="h-px flex-1 bg-[rgb(87_124_142_/_14%)] dark:bg-white/10" />
        {delta != null && delta !== 0 ? (
          <div className="flex items-center gap-1">
            {delta > 0 ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500 dark:text-emerald-300" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-rose-500 dark:text-rose-300" />
            )}
            <span className={`text-[11px] font-semibold ${delta > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
              {delta > 0 ? '+' : ''}{delta}%
            </span>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">sin variación</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Strip — compact 5-card row
// ---------------------------------------------------------------------------

export function KPIStrip({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 animate-stagger-fade-in">
      <KPICard
        title="Total Expedientes"
        value={metrics.total_expedientes}
        delta={metrics.total_expedientes_delta}
        icon={<FolderOpen className="h-4.5 w-4.5" />}
        color="accent"
      />
      <KPICard
        title="En Trámite"
        value={metrics.en_tramite}
        delta={metrics.en_tramite_delta}
        icon={<Briefcase className="h-4.5 w-4.5" />}
        color="accent"
      />
      <KPICard
        title="Tasa de Éxito"
        value={`${metrics.tasa_exito}%`}
        icon={<TrendingUp className="h-4.5 w-4.5" />}
        color="success"
      />
      <KPICard
        title="Turnos Semana"
        value={metrics.turnos_semana}
        delta={metrics.turnos_semana_delta}
        icon={<Calendar className="h-4.5 w-4.5" />}
        color="warning"
      />
      <KPICard
        title="Tareas Vencidas"
        value={metrics.tareas_vencidas}
        delta={metrics.tareas_vencidas_delta}
        icon={<AlertTriangle className="h-4.5 w-4.5" />}
        color={metrics.tareas_vencidas > 0 ? 'danger' : 'success'}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Skeleton
// ---------------------------------------------------------------------------

export function KPIStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="dashboard-panel rounded-[1.4rem] px-4 py-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-2.5 w-16 rounded bg-zinc-200 dark:bg-white/10" />
              <div className="h-6 w-14 rounded bg-zinc-200 dark:bg-white/10" />
            </div>
            <div className="h-11 w-11 rounded-2xl bg-zinc-200 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
