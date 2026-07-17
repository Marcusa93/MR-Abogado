import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ESTADO_INTERNO_VALUES, ESTADO_INTERNO_LABELS } from '@/types/enums'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import { isDirector } from '@/lib/utils/display-rol'
import { useTiposProceso } from '@/hooks/use-proceso'
import type { ExpedientesFilters } from '@/hooks/use-expedientes'

interface ExpedienteFiltersProps {
  filters: ExpedientesFilters
  onChange: (filters: ExpedientesFilters) => void
  className?: string
}

export const FUERO_LABELS: Record<string, string> = {
  civil:                 'Civil',
  laboral:               'Laboral',
  penal:                 'Penal',
  familia:               'Familia',
  administrativo:        'Administrativo',
  comercial:             'Comercial',
  previsional:           'Previsional',
  documentos_locaciones: 'Documentos y Locaciones',
  mediacion:             'Mediación',
  otro:                  'Otro',
}

const FUERO_OPTIONS = Object.entries(FUERO_LABELS)

export function ExpedienteFilters({
  filters,
  onChange,
  className,
}: ExpedienteFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? '')
  const { data: teamMembers } = useTeamMembers()
  const { data: tiposProceso = [] } = useTiposProceso()
  const profile = useAuthStore((s) => s.profile)
  const canFilterByAbogado = isDirector(profile)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Materias filtradas por el fuero seleccionado
  const materiasFiltradas = filters.fuero
    ? tiposProceso.filter((t) => t.fuero === filters.fuero)
    : []

  // Debounced search — fires 400ms after user stops typing
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      const val = searchValue.trim() || null
      if (val !== (filters.search ?? null)) {
        onChange({ ...filters, search: val, page: 1 })
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilterCount = [
    filters.estado_interno,
    filters.abogado_id,
    filters.prioridad,
    filters.fuero,
    filters.tipo_proceso_id,
    filters.search,
  ].filter(Boolean).length

  const clearFilters = useCallback(() => {
    setSearchValue('')
    onChange({ page: 1, pageSize: filters.pageSize })
  }, [onChange, filters.pageSize])

  const selectClass =
    'h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 text-sm text-zinc-800 dark:text-zinc-200 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20'

  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — siempre visible */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por número, carátula, cliente..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20"
          />
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="sm:hidden flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300"
          aria-expanded={expanded}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)] px-1.5 text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Filtros: colapsables en mobile, siempre visibles en sm+ */}
      <div className={cn(
        'flex flex-wrap items-center gap-2',
        expanded ? 'flex' : 'hidden sm:flex',
      )}>
        {/* Fuero */}
        <select
          value={filters.fuero ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              fuero: e.target.value || null,
              tipo_proceso_id: null,
              page: 1,
            })
          }
          className={selectClass}
        >
          <option value="">Fuero</option>
          {FUERO_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Materia — solo visible si hay fuero seleccionado y tiene materias */}
        {filters.fuero && materiasFiltradas.length > 0 && (
          <select
            value={filters.tipo_proceso_id ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                tipo_proceso_id: e.target.value || null,
                page: 1,
              })
            }
            className={selectClass}
          >
            <option value="">Materia</option>
            {materiasFiltradas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}

        {/* Estado */}
        <select
          value={filters.estado_interno ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              estado_interno: (e.target.value || null) as ExpedientesFilters['estado_interno'],
              page: 1,
            })
          }
          className={selectClass}
        >
          <option value="">Todos los estados</option>
          {ESTADO_INTERNO_VALUES.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADO_INTERNO_LABELS[estado]}
            </option>
          ))}
        </select>

        {/* Prioridad */}
        <select
          value={filters.prioridad ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              prioridad: (e.target.value || null) as ExpedientesFilters['prioridad'],
              page: 1,
            })
          }
          className={selectClass}
        >
          <option value="">Prioridad</option>
          {PRIORIDAD_VALUES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_LABELS[p]}
            </option>
          ))}
        </select>

        {/* Abogado / vínculo SAE */}
        {canFilterByAbogado && (
          <select
            value={filters.abogado_id ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                abogado_id: e.target.value || null,
                page: 1,
              })
            }
            className={selectClass}
          >
            <option value="">Todos los abogados</option>
            {teamMembers
              ?.filter((m) => ['DIRECTOR', 'ADMIN', 'ABOGADO', 'COLABORADOR'].includes(m.rol))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.apellido, m.nombre].filter(Boolean).join(', ') || m.email}
                </option>
              ))}
          </select>
        )}

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />
          <span className="mr-1 text-xs text-zinc-600 dark:text-zinc-300">Filtros activos:</span>
          {filters.fuero && (
            <FilterBadge
              label={FUERO_LABELS[filters.fuero] ?? filters.fuero}
              color="violet"
              onRemove={() =>
                onChange({ ...filters, fuero: null, tipo_proceso_id: null, page: 1 })
              }
            />
          )}
          {filters.tipo_proceso_id && (
            <FilterBadge
              label={tiposProceso.find((t) => t.id === filters.tipo_proceso_id)?.nombre ?? 'Materia'}
              color="cyan"
              onRemove={() =>
                onChange({ ...filters, tipo_proceso_id: null, page: 1 })
              }
            />
          )}
          {filters.estado_interno && (
            <FilterBadge
              label={ESTADO_INTERNO_LABELS[filters.estado_interno]}
              color="cyan"
              onRemove={() =>
                onChange({ ...filters, estado_interno: null, page: 1 })
              }
            />
          )}
          {filters.abogado_id && (
            <FilterBadge
              label={
                (() => {
                  const m = teamMembers?.find((member) => member.id === filters.abogado_id)
                  return m ? ([m.apellido, m.nombre].filter(Boolean).join(', ') || m.email) : 'Abogado'
                })()
              }
              color="indigo"
              onRemove={() =>
                onChange({ ...filters, abogado_id: null, page: 1 })
              }
            />
          )}
          {filters.prioridad && (
            <FilterBadge
              label={PRIORIDAD_LABELS[filters.prioridad]}
              color="amber"
              onRemove={() =>
                onChange({ ...filters, prioridad: null, page: 1 })
              }
            />
          )}
          {filters.search && (
            <FilterBadge
              label={`"${filters.search}"`}
              color="gray"
              onRemove={() => {
                setSearchValue('')
                onChange({ ...filters, search: null, page: 1 })
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

const BADGE_COLORS: Record<string, string> = {
  cyan:   'bg-amber-950/40 text-amber-400 hover:bg-amber-950/60',
  violet: 'bg-violet-950/40 text-violet-400 hover:bg-violet-950/60',
  amber:  'bg-amber-950/40 text-amber-400 hover:bg-amber-950/60',
  indigo: 'bg-indigo-950/40 text-indigo-400 hover:bg-indigo-950/60',
  gray:   'bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-white/10',
}

function FilterBadge({
  label,
  color,
  onRemove,
}: {
  label: string
  color: string
  onRemove: () => void
}) {
  return (
    <button
      onClick={onRemove}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer',
        BADGE_COLORS[color] ?? BADGE_COLORS.gray
      )}
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  )
}
