import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ESTADO_INTERNO_VALUES, ESTADO_INTERNO_LABELS } from '@/types/enums'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import { useTiposTramite } from '@/hooks/use-expedientes'
import type { ExpedientesFilters } from '@/hooks/use-expedientes'

interface ExpedienteFiltersProps {
  filters: ExpedientesFilters
  onChange: (filters: ExpedientesFilters) => void
  className?: string
}

export function ExpedienteFilters({
  filters,
  onChange,
  className,
}: ExpedienteFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? '')
  const { data: tiposTramite } = useTiposTramite()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

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
    filters.tipo_tramite_id,
    filters.prioridad,
    filters.search,
  ].filter(Boolean).length

  const clearFilters = useCallback(() => {
    setSearchValue('')
    onChange({ page: 1, pageSize: filters.pageSize })
  }, [onChange, filters.pageSize])

  const selectClass =
    'h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-zinc-800 dark:text-zinc-200 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 dark:text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por número, carátula, cliente..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>

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

        {/* Tipo Tramite */}
        <select
          value={filters.tipo_tramite_id ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              tipo_tramite_id: e.target.value || null,
              page: 1,
            })
          }
          className={selectClass}
        >
          <option value="">Tipo trámite</option>
          {tiposTramite?.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.nombre}
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

        {/* TODO: Responsable filter removed — abogado_id no longer exists on expedientes */}

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-500" />
          <span className="mr-1 text-xs text-zinc-600 dark:text-zinc-400">Filtros activos:</span>
          {filters.estado_interno && (
            <FilterBadge
              label={ESTADO_INTERNO_LABELS[filters.estado_interno]}
              color="cyan"
              onRemove={() =>
                onChange({ ...filters, estado_interno: null, page: 1 })
              }
            />
          )}
          {filters.tipo_tramite_id && (
            <FilterBadge
              label={
                tiposTramite?.find((t) => t.id === filters.tipo_tramite_id)
                  ?.nombre ?? 'Tipo'
              }
              color="violet"
              onRemove={() =>
                onChange({ ...filters, tipo_tramite_id: null, page: 1 })
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
  cyan: 'bg-amber-950/40 text-amber-400 hover:bg-amber-950/60',
  violet: 'bg-violet-950/40 text-violet-400 hover:bg-violet-950/60',
  amber: 'bg-amber-950/40 text-amber-400 hover:bg-amber-950/60',
  indigo: 'bg-indigo-950/40 text-indigo-400 hover:bg-indigo-950/60',
  gray: 'bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10',
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
