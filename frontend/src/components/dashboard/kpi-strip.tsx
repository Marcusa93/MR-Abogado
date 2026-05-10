import {
  FolderOpen, Briefcase, TrendingUp, Calendar, AlertTriangle,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { DashboardMetrics } from '@/hooks/use-dashboard-metrics'

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

const KPI_COLORS: Record<string, { iconBg: string; iconText: string }> = {
  cyan: { iconBg: 'bg-amber-500/10', iconText: 'text-amber-400' },
  violet: { iconBg: 'bg-violet-500/10', iconText: 'text-violet-400' },
  emerald: { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400' },
  sky: { iconBg: 'bg-sky-500/10', iconText: 'text-sky-400' },
  amber: { iconBg: 'bg-amber-500/10', iconText: 'text-amber-400' },
  rose: { iconBg: 'bg-rose-500/10', iconText: 'text-rose-400' },
}

function KPICard({ title, value, delta, icon, color = 'cyan' }: {
  title: string
  value: number | string
  delta?: number | null
  icon: React.ReactNode
  color?: string
}) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.cyan
  return (
    <div className="glass-card-glow rounded-xl px-4 py-3.5 card-lift">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">{title}</p>
          <p className="mt-0.5 text-xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.iconBg} ${c.iconText}`}>
          {icon}
        </div>
      </div>
      {delta != null && delta !== 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          {delta > 0 ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-400" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-rose-400" />
          )}
          <span className={`text-[11px] font-medium ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        </div>
      )}
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
        color="cyan"
      />
      <KPICard
        title="En Trámite"
        value={metrics.en_tramite}
        delta={metrics.en_tramite_delta}
        icon={<Briefcase className="h-4.5 w-4.5" />}
        color="violet"
      />
      <KPICard
        title="Tasa de Éxito"
        value={`${metrics.tasa_exito}%`}
        icon={<TrendingUp className="h-4.5 w-4.5" />}
        color="emerald"
      />
      <KPICard
        title="Turnos Semana"
        value={metrics.turnos_semana}
        delta={metrics.turnos_semana_delta}
        icon={<Calendar className="h-4.5 w-4.5" />}
        color="sky"
      />
      <KPICard
        title="Tareas Vencidas"
        value={metrics.tareas_vencidas}
        delta={metrics.tareas_vencidas_delta}
        icon={<AlertTriangle className="h-4.5 w-4.5" />}
        color={metrics.tareas_vencidas > 0 ? 'rose' : 'emerald'}
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
        <div key={i} className="glass rounded-xl px-4 py-3.5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-2.5 w-16 rounded bg-white/10" />
              <div className="h-5 w-10 rounded bg-white/10" />
            </div>
            <div className="h-9 w-9 rounded-lg bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
