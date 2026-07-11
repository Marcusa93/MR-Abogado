import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import { getNextTurno, getPendingTareas } from '@/hooks/use-panel-expedientes'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import { EmptyState } from '@/components/shared/empty-state'
import { formatDateCompact } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { ClipboardList, Calendar, Search } from 'lucide-react'
import {
  ESTADO_INTERNO_LABELS,
  ESTADO_BADGE_COLORS,
  type EstadoInterno,
} from '@/types/enums'

// Mapa de fuero a color de borde izquierdo
const FUERO_BORDER: Record<string, string> = {
  laboral:        'border-l-sky-500',
  civil:          'border-l-violet-500',
  familia:        'border-l-rose-500',
  administrativo: 'border-l-amber-500',
  previsional:    'border-l-emerald-500',
  penal:          'border-l-orange-500',
  comercial:      'border-l-blue-500',
}

interface SemaforoPanelProps {
  expedientes: ExpedienteWithRelations[]
}

export function SemaforoPanel({ expedientes }: SemaforoPanelProps) {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')

  const PAGE_SIZE = 25
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return expedientes
    const term = searchTerm.toLowerCase()
    return expedientes.filter(
      (e) =>
        (e as any).numero?.toLowerCase().includes(term) ||
        e.caratula?.toLowerCase().includes(term) ||
        e.clientes?.nombre?.toLowerCase().includes(term) ||
        e.clientes?.apellido?.toLowerCase().includes(term) ||
        e.clientes?.dni?.toLowerCase().includes(term)
    )
  }, [expedientes, searchTerm])

  const visibleExpedientes = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  )

  const handleShowMore = useCallback(() => setVisibleCount((prev) => prev + PAGE_SIZE), [])

  return (
    <div className="space-y-3">
      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar expediente, cliente..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(PAGE_SIZE) }}
          className="dashboard-input h-10 w-full sm:w-72 rounded-xl pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-50 outline-none transition-all placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin expedientes"
          description={searchTerm ? 'No se encontraron resultados.' : 'No hay expedientes registrados.'}
        />
      ) : (
        <>
          <div className="dashboard-panel rounded-[1.5rem] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(87_124_142_/_12%)] dark:border-white/8">
                  <th className="w-1" />
                  <th className="px-3 py-3 text-left dashboard-eyebrow text-[10px]">Expediente</th>
                  <th className="px-3 py-3 text-left dashboard-eyebrow text-[10px]">Etapa</th>
                  <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] sm:table-cell">Prioridad</th>
                  <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] md:table-cell">Responsable</th>
                  <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] lg:table-cell">Turno</th>
                  <th className="hidden px-3 py-3 text-left dashboard-eyebrow text-[10px] lg:table-cell">Tareas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(87_124_142_/_10%)] dark:divide-white/6">
                {visibleExpedientes.map((exp) => {
                  const nextTurno = getNextTurno(exp.audiencias ?? [])
                  const pendingTareas = getPendingTareas(exp.tareas ?? [])
                  const initials = exp.clientes
                    ? `${(exp.clientes.apellido?.[0] ?? '').toUpperCase()}${(exp.clientes.nombre?.[0] ?? '').toUpperCase()}`
                    : '??'
                  const borderColor = FUERO_BORDER[exp.fuero ?? ''] ?? 'border-l-zinc-300 dark:border-l-zinc-600'

                  return (
                    <tr
                      key={exp.id}
                      onClick={() => navigate(`/expedientes/${exp.id}`)}
                      className={cn(
                        'cursor-pointer border-l-[3px] transition-all hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.08]',
                        borderColor,
                      )}
                    >
                      <td className="pl-3 py-3" />

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
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                              {exp.fuero && (
                                <>
                                  <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">{exp.fuero}</span>
                                  <span className="text-zinc-400">·</span>
                                </>
                              )}
                              {exp.tipos_tramite && (
                                <>
                                  <span className="truncate">{exp.tipos_tramite.nombre}</span>
                                  <span className="text-zinc-400">·</span>
                                </>
                              )}
                              <span className="font-mono text-[10px]">{(exp as any).numero}</span>
                            </div>
                          </div>
                          {exp.clientes?.telefono && (
                            <WhatsAppButton phone={exp.clientes.telefono} variant="icon" />
                          )}
                        </div>
                      </td>

                      {/* Etapa */}
                      <td className="px-3 py-3">
                        {exp.estado_interno ? (
                          <span className={cn(
                            'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
                            ESTADO_BADGE_COLORS[exp.estado_interno as EstadoInterno] ?? 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-300'
                          )}>
                            {ESTADO_INTERNO_LABELS[exp.estado_interno as EstadoInterno] ?? exp.estado_interno}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Prioridad */}
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <PrioridadBadge prioridad={exp.prioridad} compact />
                      </td>

                      {/* Responsable */}
                      <td className="px-3 py-3 hidden md:table-cell">
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
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {nextTurno ? (
                          <span className="dashboard-chip dashboard-chip-success">
                            <Calendar className="h-3 w-3" />
                            {formatDateCompact(nextTurno)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600 dark:text-zinc-300">—</span>
                        )}
                      </td>

                      {/* Tareas */}
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {pendingTareas > 0 ? (
                          <span className="dashboard-chip dashboard-chip-warning">{pendingTareas}</span>
                        ) : (
                          <span className="text-xs text-zinc-600 dark:text-zinc-300">0</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > visibleCount && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                Mostrando {visibleCount} de {filtered.length}
              </span>
              <button onClick={handleShowMore} className="dashboard-link text-xs font-semibold">
                Ver más ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} más)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function SemaforoPanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-9 w-72 rounded-xl bg-zinc-100 dark:bg-white/[0.06]" />
      <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex gap-4 border-b border-zinc-100 dark:border-white/5 px-4 py-3.5 last:border-0">
            <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-white/10 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-3/4 rounded bg-zinc-100 dark:bg-white/10" />
              <div className="h-2.5 w-1/3 rounded bg-zinc-50 dark:bg-white/5" />
            </div>
            <div className="h-5 w-16 rounded-full bg-zinc-100 dark:bg-white/5 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
