import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X, SlidersHorizontal, ChevronDown, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ESTADO_INTERNO_VALUES, ESTADO_INTERNO_LABELS } from '@/types/enums'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import { isDirector } from '@/lib/utils/display-rol'
import { useTiposProceso } from '@/hooks/use-proceso'
import { useConteoExpedientesPorAbogado, type ExpedientesFilters } from '@/hooks/use-expedientes'

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
  const { data: conteo } = useConteoExpedientesPorAbogado(canFilterByAbogado)
  const nombrePersona = (m: { nombre?: string | null; apellido?: string | null; email?: string | null }) =>
    ([m.nombre, m.apellido].filter(Boolean).join(' ') || m.email || '')
      .toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
  const abogadosConExpedientes = (teamMembers ?? [])
    .map((m) => ({ m, n: conteo?.porPerfil.get(m.id) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
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

  const selectClass = 'field h-9 w-auto py-0 pr-8 text-[13px] font-medium'

  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — siempre visible */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            placeholder="Buscar por número, carátula, cliente..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="field h-11 pl-10"
          />
        </div>

        {/* Favoritos — siempre visible */}
        <button
          type="button"
          onClick={() => onChange({ ...filters, favoritos: filters.favoritos ? null : true, page: 1 })}
          aria-pressed={!!filters.favoritos}
          className={cn(
            'btn btn-ghost h-11',
            filters.favoritos && '!border-amber-400/50 !bg-amber-400/10 !text-amber-600 dark:!text-amber-300',
          )}
          title={filters.favoritos ? 'Ver todos los expedientes' : 'Ver solo favoritos'}
        >
          <Star className={cn('h-3.5 w-3.5', filters.favoritos && 'fill-current')} />
          Favoritos
        </button>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="btn btn-ghost h-11 sm:hidden"
          aria-expanded={expanded}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[var(--brand-navy)] px-1.5 text-[10px] font-bold tabular-nums text-white dark:bg-white dark:text-[var(--brand-navy)]">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Ver los expedientes de cada abogado (solo dirección): siempre a la vista */}
      {canFilterByAbogado && abogadosConExpedientes.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: null as string | null, label: 'Todos', n: conteo?.total ?? 0 },
            ...abogadosConExpedientes.map((x) => ({ id: x.m.id as string | null, label: x.m.id === profile?.id ? `${nombrePersona(x.m)} (vos)` : nombrePersona(x.m), n: x.n }))]
            .map((op) => {
              const activo = (filters.abogado_id ?? null) === op.id
              return (
                <button key={op.id ?? 'todos'} type="button" onClick={() => onChange({ ...filters, abogado_id: op.id, page: 1 })}
                  aria-pressed={activo}
                  className="chip">
                  {op.label}
                  <span className="chip-count">{op.n}</span>
                </button>
              )
            })}
        </div>
      )}

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

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="btn btn-ghost btn-sm border-transparent"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1">Filtros activos</span>
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

// Todos los filtros activos con el mismo tono: el color no agregaba información.
const BADGE_COLORS: Record<string, string> = {
  default: 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300',
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
        'inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        BADGE_COLORS[color] ?? BADGE_COLORS.default
      )}
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  )
}
