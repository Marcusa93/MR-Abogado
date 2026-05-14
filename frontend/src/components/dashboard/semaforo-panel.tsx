import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import {
  type PipelineCategory,
  type ExpColor,
  COLOR_CONFIG,
  getExpCategory,
  getNextTurno,
  getPendingTareas,
  PIPELINE_CATEGORIES,
} from '@/hooks/use-panel-expedientes'
// Row colors now come from COLOR_CONFIG directly
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import { EmptyState } from '@/components/shared/empty-state'
import { formatDateCompact } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { ClipboardList, Calendar, Search } from 'lucide-react'

// ---------------------------------------------------------------------------
// Counter Card
// ---------------------------------------------------------------------------

function CounterCard({
  color,
  count,
  isActive,
  onClick,
}: {
  color: ExpColor
  count: number
  isActive: boolean
  onClick: () => void
}) {
  const cfg = COLOR_CONFIG[color]

  return (
    <button
      onClick={onClick}
      className={cn(
        'dashboard-panel-muted flex flex-col items-center gap-1 rounded-2xl border px-4 py-3 transition-all',
        isActive
          ? `${cfg.counterBg} ${cfg.counterBorder} shadow-[0_18px_40px_rgb(87_124_142_/_10%)] -translate-y-0.5`
          : 'hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.07]'
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dotClass)} />
        <span
          className={cn(
            'text-xl font-bold tabular-nums',
            isActive ? cfg.counterText : 'text-zinc-900 dark:text-zinc-50'
          )}
        >
          {count}
        </span>
      </div>
      <span
        className={cn(
          'text-[11px] font-medium',
          isActive ? cfg.counterText : 'text-zinc-600 dark:text-zinc-400'
        )}
      >
        {cfg.label}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Semáforo Panel
// ---------------------------------------------------------------------------

interface SemaforoPanelProps {
  expedientes: ExpedienteWithRelations[]
}

export function SemaforoPanel({ expedientes }: SemaforoPanelProps) {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<PipelineCategory | 'todos'>('todos')
  const [searchTerm, setSearchTerm] = useState('')

  // Compute pipeline categories for all expedientes
  const coloredExpedientes = useMemo(() => {
    return expedientes.map((exp) => ({
      ...exp,
      _color: getExpCategory(exp),
    }))
  }, [expedientes])

  // Counts per color
  const counts = useMemo(() => {
    const c: Record<string, number> = { analisis: 0, iniciar: 0, iniciados: 0, favorable: 0, desfavorable: 0, todos: 0 }
    for (const exp of coloredExpedientes) {
      c[exp._color]++
      c.todos++
    }
    return c
  }, [coloredExpedientes])

  // Filter by active color + search
  const filtered = useMemo(() => {
    let result = coloredExpedientes
    if (activeFilter !== 'todos') {
      result = result.filter((e) => e._color === activeFilter)
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (e) =>
          (e as any).numero?.toLowerCase().includes(term) ||
          e.caratula?.toLowerCase().includes(term) ||
          e.clientes?.nombre?.toLowerCase().includes(term) ||
          e.clientes?.apellido?.toLowerCase().includes(term) ||
          e.clientes?.dni?.toLowerCase().includes(term)
      )
    }
    return result
  }, [coloredExpedientes, activeFilter, searchTerm])

  const PAGE_SIZE = 25
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Reset pagination when filter/search changes
  const handleFilterClick = (color: PipelineCategory | 'todos') => {
    setActiveFilter((prev) => (prev === color ? 'todos' : color))
    setVisibleCount(PAGE_SIZE)
  }

  const visibleExpedientes = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  )

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }, [])

  return (
    <div className="space-y-4">
      {/* Counter cards + search */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Total */}
        <button
          onClick={() => handleFilterClick('todos')}
          className={cn(
            'dashboard-panel-muted flex flex-col items-center gap-1 rounded-2xl border px-4 py-3 transition-all',
            activeFilter === 'todos'
              ? 'border-[rgb(87_124_142_/_22%)] bg-[rgb(87_124_142_/_10%)] text-[rgb(48_86_104)] shadow-[0_18px_40px_rgb(87_124_142_/_10%)] -translate-y-0.5 dark:text-[rgb(221_232_238)]'
              : 'hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.07]'
          )}
        >
          <span
            className={cn(
              'text-xl font-bold tabular-nums',
              activeFilter === 'todos' ? 'text-[rgb(48_86_104)] dark:text-[rgb(221_232_238)]' : 'text-zinc-900 dark:text-zinc-50'
            )}
          >
            {counts.todos}
          </span>
          <span
            className={cn(
              'text-[11px] font-medium',
              activeFilter === 'todos' ? 'text-[rgb(48_86_104)] dark:text-[rgb(221_232_238)]' : 'text-zinc-600 dark:text-zinc-400'
            )}
          >
            Total
          </span>
        </button>

        {PIPELINE_CATEGORIES.map(
          (cat) => (
            <CounterCard
              key={cat}
              color={cat}
              count={counts[cat] ?? 0}
              isActive={activeFilter === cat}
              onClick={() => handleFilterClick(cat)}
            />
          )
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar expediente, cliente..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(PAGE_SIZE) }}
            className="dashboard-input h-10 w-64 rounded-xl pl-9 pr-3 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin expedientes"
          description={
            searchTerm
              ? 'No se encontraron resultados para la búsqueda.'
              : 'No hay expedientes en esta categoría.'
          }
        />
      ) : (<>
        <div className="dashboard-panel rounded-[1.5rem] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(87_124_142_/_12%)] dark:border-white/8">
                <th className="w-1" />
                <th className="px-3 py-3 text-left dashboard-eyebrow text-[10px]">
                  Expediente
                </th>
                <th className="px-3 py-3 text-left dashboard-eyebrow text-[10px]">
                  Prioridad
                </th>
                <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] sm:table-cell">
                  Responsable
                </th>
                <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] md:table-cell">
                  Turno
                </th>
                <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] md:table-cell">
                  Tareas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(87_124_142_/_10%)] dark:divide-white/6">
              {visibleExpedientes.map((exp) => {
                const cfg = COLOR_CONFIG[exp._color]
                const nextTurno = getNextTurno(exp.audiencias ?? [])
                const pendingTareas = getPendingTareas(exp.tareas ?? [])
                const initials = exp.clientes
                  ? `${(exp.clientes.apellido?.[0] ?? '').toUpperCase()}${(exp.clientes.nombre?.[0] ?? '').toUpperCase()}`
                  : '??'

                return (
                  <tr
                    key={exp.id}
                    onClick={() => navigate(`/expedientes/${exp.id}`)}
                    className={cn(
                      'cursor-pointer border-l-[3px] transition-all hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.08]',
                      cfg.borderClass,
                      cfg.bgClass,
                    )}
                  >
                    {/* Color dot */}
                    <td className="pl-3 py-3">
                      <span
                        className={cn(
                          'block h-2.5 w-2.5 rounded-full',
                          cfg.dotClass
                        )}
                      />
                    </td>

                    {/* Expediente */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="dashboard-stat-orb flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100 max-w-[260px]">
                            {exp.caratula || `${exp.clientes?.apellido ?? ''} ${exp.clientes?.nombre ?? ''}`.trim() || '-'}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-900 dark:text-zinc-500">
                            {exp.tipos_tramite && (
                              <>
                                <span className="truncate">{exp.tipos_tramite.nombre}</span>
                                <span className="text-zinc-700">·</span>
                              </>
                            )}
                            <span className="font-mono text-[10px] text-zinc-600">{(exp as any).numero}</span>
                          </div>
                        </div>
                        {exp.clientes?.telefono && (
                          <WhatsAppButton phone={exp.clientes.telefono} variant="icon" />
                        )}
                      </div>
                    </td>

                    {/* Prioridad */}
                    <td className="px-3 py-3">
                      <PrioridadBadge prioridad={exp.prioridad} compact />
                    </td>

                    {/* Responsable */}
                    <td className="px-3 py-3 hidden sm:table-cell">
                      {(() => {
                        const miembros = (exp.miembros ?? []) as any[]
                        const responsable = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
                        return responsable ? (
                          <div className="flex items-center gap-2">
                            <div className="dashboard-stat-orb flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                              {(responsable.nombre?.[0] ?? '').toUpperCase()}
                              {(responsable.apellido?.[0] ?? '').toUpperCase()}
                            </div>
                            <span className="truncate text-xs text-zinc-700 dark:text-zinc-300 max-w-[100px]">
                              {responsable.apellido}
                            </span>
                          </div>
                        ) : (
                          <span className="dashboard-chip dashboard-chip-warning">Sin asignar</span>
                        )
                      })()}
                    </td>

                    {/* Turno */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      {nextTurno ? (
                        <span className="dashboard-chip dashboard-chip-success">
                          <Calendar className="h-3 w-3" />
                          {formatDateCompact(nextTurno)}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Tareas pendientes */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      {pendingTareas > 0 ? (
                        <span className="dashboard-chip dashboard-chip-warning">
                          {pendingTareas}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">0</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Show more / pagination info */}
        {filtered.length > visibleCount && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-zinc-900 dark:text-zinc-500">
              Mostrando {visibleCount} de {filtered.length}
            </span>
            <button
              onClick={handleShowMore}
              className="dashboard-link text-xs font-semibold"
            >
              Ver más ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} más)
            </button>
          </div>
        )}
      </>)}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        {PIPELINE_CATEGORIES.map(
          (cat) => (
            <span key={cat} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  COLOR_CONFIG[cat].dotClass
                )}
              />
              {COLOR_CONFIG[cat].label}
            </span>
          )
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function SemaforoPanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-16 w-24 rounded-xl border border-white/5 bg-zinc-50 dark:bg-white/[0.02]" />
        ))}
        <div className="ml-auto h-9 w-56 rounded-lg bg-white/5" />
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex gap-4 border-b border-white/5 px-4 py-3.5 last:border-0">
            <div className="h-2.5 w-2.5 rounded-full bg-white/10 shrink-0 mt-1" />
            <div className="flex items-center gap-3 flex-1">
              <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-2.5 w-1/3 rounded bg-white/5" />
              </div>
            </div>
            <div className="h-5 w-14 rounded-full bg-white/5 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
