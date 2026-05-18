import { useState, useMemo, useCallback, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SemaforoBadge } from '@/components/shared/semaforo-badge'
import { getKanbanCardClass } from '@/lib/utils/estado-colors'
import { EmptyState } from '@/components/shared/empty-state'
import { calcularSemaforoKanban } from '@/lib/utils/semaforo'
import {
  getEstadoConfig,
} from '@/components/shared/estado-badge'
import {
  useKanbanData,
  PIPELINE_DEFAULT_ESTADO,
  type KanbanCard,
  type KanbanColumn,
  type KanbanFilters,
} from '@/hooks/use-kanban'
import { COLOR_CONFIG, PIPELINE_CATEGORIES, type PipelineCategory } from '@/hooks/use-panel-expedientes'
import { useTiposTramite } from '@/hooks/use-expedientes'
import { useCambiarEstado } from '@/hooks/use-expedientes'
import { useAuth } from '@/hooks/use-auth'
import { daysAgo, formatDateShort } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import type { EstadoInterno } from '@/types/enums'
import {
  LayoutGrid,
  GripVertical,
  User,
  Clock,
  Loader2,
  ChevronRight,
  Search,
  X,
  ClipboardList,
  CalendarDays,
  Database,
} from 'lucide-react'
import { toast } from '@/stores/toast-store'
import { VALID_ESTADO_TRANSITIONS } from '@/types/enums'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_ESTADO_TRANSITIONS[from as keyof typeof VALID_ESTADO_TRANSITIONS]
  // If the source state is not in the transitions map (e.g., a newly-added state),
  // allow the transition rather than silently blocking it.
  if (!allowed) return true
  return allowed.includes(to as EstadoInterno)
}

const AVATAR_COLORS = [
  'bg-amber-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-blue-600',
  'bg-indigo-600',
  'bg-pink-600',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(nombre: string, apellido: string): string {
  return `${(nombre?.[0] ?? '').toUpperCase()}${(apellido?.[0] ?? '').toUpperCase()}`
}

const PRIORIDAD_BORDER: Record<string, string> = {
  URGENTE: 'border-l-rose-500',
  ALTA: 'border-l-amber-500',
  MEDIA: 'border-l-blue-500',
  BAJA: 'border-l-slate-600',
}

// ---------------------------------------------------------------------------
// Pipeline Summary Bar
// ---------------------------------------------------------------------------

function PipelineBar({
  columns,
}: {
  columns: KanbanColumn[]
}) {
  const total = columns.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="glass-card rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
        <span className="font-bold text-lg text-zinc-800 dark:text-zinc-200">{total}</span>
        <span>expedientes en pipeline</span>
      </div>
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1 no-scrollbar">
        {columns.map((col, i) => {
          const cfg = COLOR_CONFIG[col.category]
          const hasCards = col.count > 0

          return (
            <Fragment key={col.category}>
              {i > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-600" />
              )}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg shrink-0',
                  !hasCards && 'opacity-40'
                )}
                title={`${col.label}: ${col.count} expedientes`}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold',
                    hasCards
                      ? cn(cfg.counterBg, cfg.counterText)
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                  )}
                >
                  {col.count}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap hidden sm:inline">
                  {col.label}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters Bar
// ---------------------------------------------------------------------------

function KanbanFiltersBar({
  filters,
  onFiltersChange,
  searchValue,
  onSearchChange,
}: {
  filters: KanbanFilters
  onFiltersChange: (f: KanbanFilters) => void
  searchValue: string
  onSearchChange: (v: string) => void
}) {
  const { data: tiposTramite } = useTiposTramite()
  const { profile } = useAuth()
  // TODO: "Mis expedientes" toggle disabled — abogado_id removed from expedientes schema
  // Use expediente_miembros to filter by member in the future

  const hasFilters =
    !!filters.tipo_tramite_id ||
    !!filters.prioridad ||
    !!searchValue

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* TODO: "Mis expedientes" toggle — abogado_id removed; implement via expediente_miembros */}
      {false && profile?.id && null}

      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-700 dark:text-zinc-300" />
        <input
          placeholder="Buscar nombre o expediente..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
        />
      </div>

      {/* Tipo Tramite */}
      <select
        value={filters.tipo_tramite_id ?? ''}
        onChange={(e) =>
          onFiltersChange({ ...filters, tipo_tramite_id: e.target.value || null })
        }
        className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-700 dark:text-zinc-300 focus:border-amber-500/40 focus:outline-none focus:ring-amber-500/15"
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
          onFiltersChange({
            ...filters,
            prioridad: (e.target.value || null) as KanbanFilters['prioridad'],
          })
        }
        className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-700 dark:text-zinc-300 focus:border-amber-500/40 focus:outline-none focus:ring-amber-500/15"
      >
        <option value="">Prioridad</option>
        {PRIORIDAD_VALUES.map((p) => (
          <option key={p} value={p}>
            {PRIORIDAD_LABELS[p]}
          </option>
        ))}
      </select>

      {/* TODO: Responsable filter removed — abogado_id no longer on expedientes */}

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => {
            onFiltersChange({})
            onSearchChange('')
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban Column (droppable)
// ---------------------------------------------------------------------------

function KanbanDroppableColumn({
  column,
  isEmpty,
  children,
}: {
  column: KanbanColumn
  isEmpty: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.category })
  const cfg = COLOR_CONFIG[column.category]

  // Collapsed empty column
  if (isEmpty && !isOver) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'flex w-14 shrink-0 flex-col items-center rounded-xl border border-dashed transition-all duration-300',
          'border-zinc-300 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/20'
        )}
      >
        <div className={cn('h-1 w-full rounded-t-xl', cfg.dotClass)} />
        <div className="flex-1 flex items-center justify-center py-4">
          <span className="writing-vertical text-[10px] font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            {column.label}
          </span>
        </div>
        <span className="mb-3 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          0
        </span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[260px] sm:w-[300px] shrink-0 flex-col rounded-xl border transition-all duration-300',
        'bg-zinc-50/50 dark:bg-white/[0.02]',
        isOver
          ? 'border-amber-500/40 ring-1 ring-amber-500/15 shadow-lg'
          : 'border-zinc-200 dark:border-white/[0.07]'
      )}
    >
      {/* Color top bar */}
      <div className={cn('h-1 w-full rounded-t-xl', cfg.dotClass)} />

      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200 dark:border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dotClass)} />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
            {column.label}
          </span>
        </div>
        <span
          className={cn(
            'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
            cfg.counterBg,
            cfg.counterText,
          )}
        >
          {column.count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px] max-h-[calc(100vh-320px)]">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban Card (draggable)
// ---------------------------------------------------------------------------

function KanbanDraggableCard({
  card,
  onClick,
}: {
  card: KanbanCard
  onClick: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: card.id,
    data: { card },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const dias = card.dias_en_estado ?? daysAgo(card.updated_at)
  const semaforo = calcularSemaforoKanban({
    estado_interno: card.estado_interno,
    tareas_pendientes_count: card.tareas_pendientes,
    proxima_fecha_audiencia: card.proximo_turno,
  })
  const initials = getInitials(card.cliente_nombre, card.cliente_apellido)
  const avatarColor = getAvatarColor(
    `${card.cliente_nombre}${card.cliente_apellido}`
  )
  const estadoBorder = getKanbanCardClass({
    estado_interno: card.estado_interno,
    tareas_pendientes_count: card.tareas_pendientes,
    proxima_fecha_audiencia: card.proximo_turno,
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-xl border-l-[3px] border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-slate-900/70 p-3 transition-all duration-200 cursor-grab active:cursor-grabbing shadow-sm dark:shadow-none',
        estadoBorder,
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/5 hover:border-white/[0.12]',
        isDragging && 'opacity-50 shadow-2xl ring-2 ring-amber-500/25'
      )}
      onClick={onClick}
    >
      {/* Header: drag indicator + avatar + name + semaforo */}
      <div className="flex items-start gap-2">
        <div className="mt-1 shrink-0 text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-700 dark:text-zinc-300">
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
            avatarColor
          )}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
            {card.caratula || `${card.cliente_apellido}, ${card.cliente_nombre}`}
          </p>
          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-0.5">
            {card.tipo_tramite || ''}
            {card.tipo_tramite && ' · '}
            <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">{(card as any).numero ?? card.numero_expediente}</span>
          </p>
        </div>

        <SemaforoBadge color={semaforo} size="md" />
      </div>

      {/* Tipo tramite */}
      {card.tipo_tramite && (
        <div className="mt-2 ml-[52px]">
          <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
            {card.tipo_tramite}
          </span>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-2 flex items-center gap-3 ml-[52px] text-[11px] text-zinc-700 dark:text-zinc-300">
        {card.tareas_pendientes > 0 && (
          <span className="flex items-center gap-1" title={`${card.tareas_pendientes} tareas pendientes`}>
            <ClipboardList className="h-3 w-3" />
            {card.tareas_pendientes}
          </span>
        )}
        {card.proximo_turno && (
          <span className="flex items-center gap-1" title={`Próximo turno: ${formatDateShort(card.proximo_turno)}`}>
            <CalendarDays className="h-3 w-3" />
            {formatDateShort(card.proximo_turno)}
          </span>
        )}
        {dias !== null && dias > 0 && (
          <span
            className={cn(
              'flex items-center gap-0.5',
              dias > 30 && 'text-amber-500',
              dias > 90 && 'text-rose-400'
            )}
            title={`${dias} días en este estado`}
          >
            <Clock className="h-3 w-3" />
            {dias}d
          </span>
        )}
        {card.abogado_apellido && (
          <span className="flex items-center gap-1 ml-auto" title={`${card.abogado_nombre ?? ''} ${card.abogado_apellido}`}>
            <User className="h-3 w-3" />
            {card.abogado_apellido?.slice(0, 3)}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlay card (shown while dragging)
// ---------------------------------------------------------------------------

function KanbanOverlayCard({ card }: { card: KanbanCard }) {
  const initials = getInitials(card.cliente_nombre, card.cliente_apellido)
  const avatarColor = getAvatarColor(
    `${card.cliente_nombre}${card.cliente_apellido}`
  )
  const estadoBorder = getKanbanCardClass({
    estado_interno: card.estado_interno,
    tareas_pendientes_count: card.tareas_pendientes,
    proxima_fecha_audiencia: card.proximo_turno,
  })

  return (
    <div
      className={cn(
        'w-[300px] rounded-xl border-l-[3px] border border-amber-500/30 bg-white dark:bg-slate-900 p-3 shadow-2xl shadow-amber-500/10',
        estadoBorder
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
            avatarColor
          )}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
            {card.caratula || `${card.cliente_apellido}, ${card.cliente_nombre}`}
          </p>
          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-0.5">
            {card.tipo_tramite || ''}
            {card.tipo_tramite && ' · '}
            <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">{(card as any).numero ?? card.numero_expediente}</span>
          </p>
        </div>
      </div>
      {card.tipo_tramite && (
        <div className="mt-2 ml-[52px]">
          <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
            {card.tipo_tramite}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban Skeleton
// ---------------------------------------------------------------------------

function KanbanSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="glass rounded-xl h-20" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[300px] shrink-0 rounded-xl glass">
            <div className="h-1 w-full rounded-t-xl bg-slate-700" />
            <div className="p-3 space-y-3">
              <div className="h-4 w-24 rounded bg-slate-700" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-24 rounded-xl bg-slate-800/50" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function KanbanPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<KanbanFilters>({})
  const [searchValue, setSearchValue] = useState('')
  const { data: kanbanData, isLoading, isError, refetch } = useKanbanData(filters)
  const cambiarEstado = useCambiarEstado()
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // The hook already returns 5 pipeline columns (always all 5, even empty)
  const columns = kanbanData ?? PIPELINE_CATEGORIES.map((cat) => ({
    category: cat,
    label: COLOR_CONFIG[cat].label,
    cards: [] as KanbanCard[],
    count: 0,
  }))

  // Apply local search filter
  const filteredColumns = useMemo(() => {
    if (!searchValue.trim()) return columns
    const q = searchValue.toLowerCase().trim()
    return columns.map((col) => {
      const filteredCards = col.cards.filter(
        (c) =>
          c.cliente_nombre.toLowerCase().includes(q) ||
          c.cliente_apellido.toLowerCase().includes(q) ||
          ((c as any).numero ?? c.numero_expediente ?? '').toLowerCase().includes(q) ||
          (c.tipo_tramite && c.tipo_tramite.toLowerCase().includes(q))
      )
      return { ...col, cards: filteredCards, count: filteredCards.length }
    })
  }, [columns, searchValue])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const card = event.active.data.current?.card as KanbanCard | undefined
    setActiveCard(card ?? null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null)
      const { active, over } = event
      if (!over) return
      const card = active.data.current?.card as KanbanCard | undefined
      if (!card) return

      const targetCategory = over.id as PipelineCategory
      const newEstado = PIPELINE_DEFAULT_ESTADO[targetCategory]
      if (!newEstado || card.estado_interno === newEstado) return

      if (!isValidTransition(card.estado_interno, newEstado)) {
        const fromLabel = getEstadoConfig(card.estado_interno).label
        const toLabel = getEstadoConfig(newEstado).label
        toast.error(
          'Transición no permitida',
          `No se puede pasar de "${fromLabel}" a "${toLabel}" directamente.`
        )
        return
      }

      cambiarEstado.mutate({
        expediente_id: card.id,
        nuevo_estado: newEstado as EstadoInterno,
        motivo: null,
      })
    },
    [cambiarEstado]
  )

  const handleDragCancel = useCallback(() => {
    setActiveCard(null)
  }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            Tablero de Estados
          </h1>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Arrastrá los expedientes entre columnas para cambiar su estado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cambiarEstado.isPending && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Actualizando estado...
            </div>
          )}
          <button
            onClick={() => navigate('/importar-sae')}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          >
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Importar SAE</span>
          </button>
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <KanbanSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-3">
          <p className="text-sm text-rose-400">
            Error al cargar el tablero.
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Pipeline summary bar */}
          <PipelineBar columns={filteredColumns} />

          {/* Filters */}
          <KanbanFiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
          />

          {/* Board columns */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div
              ref={boardRef}
              className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2"
            >
              {filteredColumns.map((column) => (
                <KanbanDroppableColumn
                  key={column.category}
                  column={column}
                  isEmpty={column.cards.length === 0}
                >
                  {column.cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-white/10">
                        <LayoutGrid className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        Arrastra expedientes aquí
                      </p>
                    </div>
                  ) : (
                    column.cards.map((card) => (
                      <KanbanDraggableCard
                        key={card.id}
                        card={card}
                        onClick={() =>
                          navigate(`/expedientes/${card.id}`)
                        }
                      />
                    ))
                  )}
                </KanbanDroppableColumn>
              ))}
            </div>

            {/* Drag overlay */}
            <DragOverlay dropAnimation={null}>
              {activeCard ? <KanbanOverlayCard card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </div>
  )
}
