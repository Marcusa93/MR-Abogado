import { Link } from 'react-router-dom'
import { Layers, ArrowRight } from 'lucide-react'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'

const FUERO_CONFIG: Record<string, { label: string; bar: string; hex: string }> = {
  laboral:       { label: 'Laboral',        bar: 'bg-amber-400',   hex: '#f59e0b' },
  civil:         { label: 'Civil',           bar: 'bg-blue-500',    hex: '#3b82f6' },
  familia:       { label: 'Familia',         bar: 'bg-rose-400',    hex: '#fb7185' },
  penal:         { label: 'Penal',           bar: 'bg-red-500',     hex: '#ef4444' },
  previsional:   { label: 'Previsional',     bar: 'bg-violet-500',  hex: '#8b5cf6' },
  administrativo:{ label: 'Administrativo',  bar: 'bg-teal-500',    hex: '#14b8a6' },
  comercial:     { label: 'Comercial',       bar: 'bg-indigo-500',  hex: '#6366f1' },
}

const FUERO_FALLBACK = { label: 'Sin asignar', bar: 'bg-zinc-400', hex: '#a1a1aa' }

export function FueroDistributionPanel({ expedientes }: { expedientes: ExpedienteWithRelations[] }) {
  const counts = new Map<string, number>()
  for (const exp of expedientes) {
    const key = (exp as any).fuero ?? 'sin_fuero'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const total = expedientes.length
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">composición</p>
          <div className="mt-1 flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Distribución por fuero</h3>
          </div>
        </div>
        <span className="dashboard-chip dashboard-chip-accent">{total} activos</span>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">No hay expedientes activos</p>
      ) : (
        <>
          {/* Segmented bar */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 mb-5">
            {sorted.map(([key, count]) => {
              const pct = Math.round((count / total) * 100)
              const cfg = FUERO_CONFIG[key] ?? FUERO_FALLBACK
              return pct > 0 ? (
                <div
                  key={key}
                  className={`h-full ${cfg.bar} first:rounded-l-full last:rounded-r-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${cfg.label}: ${count}`}
                />
              ) : null
            })}
          </div>

          {/* Rows */}
          <div className="space-y-1">
            {sorted.map(([key, count]) => {
              const cfg = key === 'sin_fuero'
                ? { ...FUERO_FALLBACK, label: 'Sin asignar' }
                : (FUERO_CONFIG[key] ?? { ...FUERO_FALLBACK, label: key })
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <Link
                  key={key}
                  to={key === 'sin_fuero' ? '/expedientes' : `/expedientes?fuero=${key}`}
                  className="group flex items-center gap-2.5 rounded-xl px-2 py-2 -mx-2 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cfg.hex }}
                  />
                  <span className="flex-1 min-w-0 text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {cfg.label}
                  </span>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {count}
                  </span>
                  <div className="w-14 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <div
                      className={`h-full ${cfg.bar} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 w-7 text-right tabular-nums">
                    {pct}%
                  </span>
                  <ArrowRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
