import { Link } from 'react-router-dom'
import { Users, ArrowRight, TrendingUp } from 'lucide-react'
import { useConsultasFunnel } from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'

// Estados del pipeline en orden de avance
const PIPELINE_ESTADOS: { key: string; label: string; color: string; bar: string }[] = [
  { key: 'pendiente',     label: 'Pendiente',     color: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-400' },
  { key: 'en_proceso',    label: 'En proceso',    color: 'text-blue-600 dark:text-blue-400',     bar: 'bg-blue-500' },
  { key: 'presupuestada', label: 'Presupuestada', color: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  { key: 'con_claudio',   label: 'Con Claudio',   color: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-400' },
  { key: 'requiere_info', label: 'Requiere info', color: 'text-rose-600 dark:text-rose-400',     bar: 'bg-rose-400' },
  { key: 'redactando',    label: 'Redactando',    color: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-400' },
]

export function ConsultasWidget() {
  const { data, isLoading } = useConsultasFunnel()

  if (isLoading) {
    return (
      <div className="dashboard-panel rounded-[1.5rem] p-5 animate-pulse">
        <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const activas = data?.activas ?? {}
  const totalActivas = data?.totalActivas ?? 0
  const convertidas30d = data?.convertidas30d ?? 0
  const resueltasDescartadas30d = data?.resueltasDescartadas30d ?? 0
  const tasaConversion = data?.tasaConversion ?? null

  const maxCount = Math.max(...PIPELINE_ESTADOS.map(e => activas[e.key] ?? 0), 1)
  const activosFiltrados = PIPELINE_ESTADOS.filter(e => (activas[e.key] ?? 0) > 0)

  return (
    <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
          <div>
            <p className="dashboard-eyebrow text-[10px]">captación</p>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Consultas</h3>
          </div>
          {totalActivas > 0 && (
            <span className="dashboard-chip dashboard-chip-accent">{totalActivas} activas</span>
          )}
        </div>
        <Link
          to="/consultas"
          className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-5 space-y-5">
        {/* Pipeline activo */}
        {activosFiltrados.length === 0 ? (
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-4 italic">
            Sin consultas activas en este momento
          </p>
        ) : (
          <div className="space-y-2.5">
            {activosFiltrados.map(({ key, label, color, bar }) => {
              const count = activas[key] ?? 0
              const pct = Math.round((count / maxCount) * 100)
              return (
                <Link
                  key={key}
                  to={`/consultas?estado=${key}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={cn('w-[90px] shrink-0 text-[11px] font-medium truncate', color)}>
                    {label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-xs font-bold text-zinc-700 dark:text-zinc-200 tabular-nums">
                    {count}
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {/* Conversión últimos 30 días */}
        {(convertidas30d > 0 || resueltasDescartadas30d > 0) && (
          <div className="border-t border-[rgb(87_124_142_/_10%)] dark:border-white/8 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
              Últimos 30 días
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{convertidas30d}</span>
                  {' '}convertida{convertidas30d !== 1 ? 's' : ''}
                </span>
              </div>
              {resueltasDescartadas30d > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{resueltasDescartadas30d}</span>
                    {' '}cerrada{resueltasDescartadas30d !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {tasaConversion !== null && (
                <div className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {tasaConversion}% conversión
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
