import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { useSaeMovements, useTriggerSaeSync, useSaeDocument } from '@/hooks/use-sae'
import { formatDate, formatDateTime } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import {
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  FileText,
  Gavel,
  Calendar,
  AlertCircle,
  Loader2,
  Info,
  Paperclip,
  Eye,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from '@/stores/toast-store'
import { SaePdfViewerDialog } from './sae-pdf-viewer-dialog'

type SaeMovement = Tables<'sae_movements'>
type MovementType = Tables<'sae_movements'>['tipo_movimiento']

const TIPO_LABELS: Record<MovementType, string> = {
  sentencia: 'Sentencia',
  traslado: 'Traslado',
  audiencia: 'Audiencia',
  prueba: 'Prueba',
  embargo: 'Embargo',
  cedula: 'Cédula',
  oficio: 'Oficio',
  intimacion: 'Intimación',
  planilla: 'Planilla',
  informe: 'Informe',
  decreto: 'Decreto',
  escrito_parte: 'Escrito de parte',
  otro: 'Otro',
}

const TIPO_COLORS: Record<MovementType, string> = {
  sentencia: 'bg-rose-500/15 text-rose-400',
  traslado: 'bg-violet-500/15 text-violet-400',
  audiencia: 'bg-amber-500/15 text-amber-400',
  prueba: 'bg-blue-500/15 text-blue-400',
  embargo: 'bg-orange-500/15 text-orange-400',
  cedula: 'bg-sky-500/15 text-sky-400',
  oficio: 'bg-teal-500/15 text-teal-400',
  intimacion: 'bg-red-500/15 text-red-400',
  planilla: 'bg-indigo-500/15 text-indigo-400',
  informe: 'bg-cyan-500/15 text-cyan-400',
  decreto: 'bg-purple-500/15 text-purple-400',
  escrito_parte: 'bg-emerald-500/15 text-emerald-400',
  otro: 'bg-zinc-500/15 text-zinc-400',
}

function MovementIcon({ tipo }: { tipo: MovementType }) {
  if (tipo === 'sentencia' || tipo === 'decreto') return <Gavel className="h-3.5 w-3.5" />
  if (tipo === 'audiencia') return <Calendar className="h-3.5 w-3.5" />
  return <FileText className="h-3.5 w-3.5" />
}

interface SaeAttachment {
  fileName: string
  raw: Record<string, unknown>
}

function pickFileName(entry: Record<string, unknown>): string | null {
  const candidates = [entry.nombre, entry.name, entry.filename, entry.fileName, entry.label, entry.dscr]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

function extractAttachments(movement: SaeMovement): SaeAttachment[] {
  const rp = movement.raw_payload as Record<string, unknown> | null
  if (!rp) return []
  const archivos = Array.isArray(rp.archivos) ? rp.archivos : []
  const vinculos = Array.isArray(rp.vinculos) ? rp.vinculos : []
  return [...archivos, ...vinculos]
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map(e => {
      const fileName = pickFileName(e)
      return fileName ? { fileName, raw: e } : null
    })
    .filter((x): x is SaeAttachment => x !== null)
}

// ─── Date grouping ────────────────────────────────────────────────────────────

const MES_LABELS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface DateGroup {
  key: string
  label: string
  movements: SaeMovement[]
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

function bucketLabelFor(fecha: string, today: Date): { key: string; label: string; order: number } {
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Sin fecha', order: 999 }
  const days = diffDays(today, d)
  if (days <= 0) return { key: 'today', label: 'Hoy', order: 0 }
  if (days === 1) return { key: 'yesterday', label: 'Ayer', order: 1 }
  if (days <= 7) return { key: 'thisweek', label: 'Esta semana', order: 2 }
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
    return { key: 'thismonth', label: 'Este mes', order: 3 }
  }
  // Previous month or older: bucket by month
  const monthLabel = `${MES_LABELS[d.getMonth()]} ${d.getFullYear()}`
  // capitalize first letter
  const label = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  // Order by negative timestamp so newer months come first
  return { key: `m-${d.getFullYear()}-${d.getMonth()}`, label, order: 100 + (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth()) }
}

function groupByDate(movements: SaeMovement[]): DateGroup[] {
  const today = new Date()
  const buckets = new Map<string, { label: string; order: number; movements: SaeMovement[] }>()
  for (const m of movements) {
    const { key, label, order } = bucketLabelFor(m.fecha, today)
    const b = buckets.get(key)
    if (b) b.movements.push(m)
    else buckets.set(key, { label, order, movements: [m] })
  }
  return [...buckets.entries()]
    .map(([key, v]) => ({ key, label: v.label, movements: v.movements, order: v.order }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, ...rest }) => rest)
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ActuacionRow({
  movement,
  isNew,
  onOpenPdf,
}: {
  movement: SaeMovement
  isNew: boolean
  onOpenPdf: (atts: SaeAttachment[], startIndex: number, movement: SaeMovement) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasCuerpo = !!movement.cuerpo?.trim()
  const attachments = extractAttachments(movement)
  const canExpand = hasCuerpo || attachments.length > 0

  return (
    <div className={cn(
      'rounded-lg border bg-white/[0.02] overflow-hidden transition-colors',
      isNew ? 'border-cyan-500/30 bg-cyan-500/[0.04]' : 'border-white/5'
    )}>
      <button
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
          canExpand ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
        )}
      >
        <div className="shrink-0 mt-0.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[movement.tipo_movimiento])}>
            <MovementIcon tipo={movement.tipo_movimiento} />
            {TIPO_LABELS[movement.tipo_movimiento]}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
              {movement.titulo}
            </p>
            {isNew && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-500/15 px-1.5 py-0 text-[9px] font-medium text-cyan-400 uppercase tracking-wide">
                <Sparkles className="h-2.5 w-2.5" />
                Nuevo
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatDate(movement.fecha)}
            {attachments.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-sky-400">
                <Paperclip className="h-3 w-3" />
                {attachments.length} {attachments.length === 1 ? 'archivo' : 'archivos'}
              </span>
            )}
          </p>
        </div>

        {canExpand && (
          <span className="shrink-0 text-zinc-600 dark:text-zinc-500 mt-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {hasCuerpo && (
            <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {movement.cuerpo}
            </p>
          )}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map((att, idx) => (
                <button
                  key={`${att.fileName}-${idx}`}
                  onClick={(e) => { e.stopPropagation(); onOpenPdf(attachments, idx, movement) }}
                  className="group flex w-full items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:bg-white/5 hover:border-sky-500/30"
                >
                  <FileText className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{att.fileName}</span>
                  <Eye className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-sky-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TabActuacionesProps {
  expedienteId: string
  numeroSae: string | null | undefined
  ultimaSincronizacion: string | null | undefined
}

export function TabActuaciones({ expedienteId, numeroSae, ultimaSincronizacion }: TabActuacionesProps) {
  const { data: movements = [], isLoading } = useSaeMovements(expedienteId)
  const sync = useTriggerSaeSync()
  const document = useSaeDocument()
  const [viewer, setViewer] = useState<{
    open: boolean
    attachments: SaeAttachment[]
    movement: SaeMovement | null
    index: number
    objectUrl: string | null
    error: string | null
  }>({
    open: false,
    attachments: [],
    movement: null,
    index: 0,
    objectUrl: null,
    error: null,
  })
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<MovementType | 'all'>('all')

  // Capture lastViewedAt at first render (frozen reference) so the "new" highlight stays
  // visible during this visit, then bump it on unmount/visit-end.
  const storageKey = `sae-tab-viewed-${expedienteId}`
  const lastViewedRef = useRef<string | null>(null)
  if (lastViewedRef.current === null) {
    lastViewedRef.current = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
  }

  useEffect(() => {
    return () => {
      if (viewer.objectUrl) URL.revokeObjectURL(viewer.objectUrl)
    }
  }, [viewer.objectUrl])

  // Persist current visit time once we've finished an initial load
  useEffect(() => {
    if (!isLoading && movements.length > 0 && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, new Date().toISOString())
    }
  }, [isLoading, movements.length, storageKey])

  // ── Derived data ────────────────────────────────────────────────────────────

  const countsByType = useMemo(() => {
    const counts: Partial<Record<MovementType, number>> = {}
    for (const m of movements) counts[m.tipo_movimiento] = (counts[m.tipo_movimiento] ?? 0) + 1
    return counts
  }, [movements])

  const lastSentencia = useMemo(() => {
    return movements.find((m) => m.tipo_movimiento === 'sentencia')
  }, [movements])

  const newCount = useMemo(() => {
    if (!lastViewedRef.current) return 0
    const cutoff = lastViewedRef.current
    return movements.filter((m) => m.created_at && m.created_at > cutoff).length
  }, [movements])

  function isMovementNew(m: SaeMovement): boolean {
    return Boolean(lastViewedRef.current && m.created_at && m.created_at > lastViewedRef.current)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements.filter((m) => {
      if (tipoFilter !== 'all' && m.tipo_movimiento !== tipoFilter) return false
      if (q && !m.titulo.toLowerCase().includes(q) && !(m.cuerpo?.toLowerCase().includes(q))) return false
      return true
    })
  }, [movements, search, tipoFilter])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  const topTypes = useMemo(() => {
    return Object.entries(countsByType)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 4) as [MovementType, number][]
  }, [countsByType])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const fetchAttachmentAt = (atts: SaeAttachment[], index: number, m: SaeMovement) => {
    const att = atts[index]
    if (!att) return
    const rp = m.raw_payload as Record<string, unknown> | null
    const jurisdictionId = typeof rp?.jurisdiction_id === 'number' ? rp.jurisdiction_id : null
    const procid = m.sae_case_id
    const histid = m.external_id
    if (!jurisdictionId || !procid || !histid) {
      toast.error('Falta información de la actuación para descargar el archivo.')
      return
    }
    document.mutate(
      { procid, jurisdictionId, histid, fileName: att.fileName },
      {
        onSuccess: ({ objectUrl }) => setViewer((v) => ({ ...v, objectUrl, error: null })),
        onError: (err) => setViewer((v) => ({ ...v, error: err instanceof Error ? err.message : 'No se pudo descargar el documento.' })),
      },
    )
  }

  const handleOpenPdf = (atts: SaeAttachment[], startIndex: number, m: SaeMovement) => {
    if (viewer.objectUrl) URL.revokeObjectURL(viewer.objectUrl)
    setViewer({ open: true, attachments: atts, movement: m, index: startIndex, objectUrl: null, error: null })
    fetchAttachmentAt(atts, startIndex, m)
  }

  const handleNavigatePdf = (delta: -1 | 1) => {
    const next = viewer.index + delta
    if (next < 0 || next >= viewer.attachments.length || !viewer.movement) return
    if (viewer.objectUrl) URL.revokeObjectURL(viewer.objectUrl)
    setViewer((v) => ({ ...v, index: next, objectUrl: null, error: null }))
    fetchAttachmentAt(viewer.attachments, next, viewer.movement)
  }

  const handleCloseViewer = () => {
    if (viewer.objectUrl) URL.revokeObjectURL(viewer.objectUrl)
    setViewer({ open: false, attachments: [], movement: null, index: 0, objectUrl: null, error: null })
  }

  const handleSync = () => {
    sync.mutate(
      { expedienteId },
      {
        onSuccess: (data) => {
          if (data?.success) toast.success(`Sincronización exitosa: ${data.nuevas ?? 0} actuaciones nuevas`)
          else toast.info(data?.message ?? 'Sincronización completada')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al sincronizar'),
      }
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!numeroSae) {
    return (
      <Card title="Actuaciones SAE">
        <EmptyState
          icon={Database}
          title="Sin número SAE"
          description='Este expediente no tiene número SAE. Editá el expediente y completá el campo "Número SAE" para habilitar la sincronización.'
        />
      </Card>
    )
  }

  const filtersActive = search.trim() !== '' || tipoFilter !== 'all'

  return (
    <Card
      title="Actuaciones SAE"
      headerRight={
        <div className="flex items-center gap-3">
          {ultimaSincronizacion && (
            <span className="hidden sm:block text-xs text-zinc-500">
              Última sync: {formatDateTime(ultimaSincronizacion)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {sync.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {sync.isPending ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Summary header ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-mono font-medium text-cyan-400">
            <Info className="h-3 w-3" />
            SAE: {numeroSae}
          </span>
          {movements.length > 0 && (
            <span className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-300">{movements.length}</span> actuaciones
            </span>
          )}
          {topTypes.map(([tipo, count]) => (
            <span key={tipo} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[tipo])}>
              <MovementIcon tipo={tipo} />
              {count} {TIPO_LABELS[tipo].toLowerCase()}{count !== 1 ? 's' : ''}
            </span>
          ))}
          {lastSentencia && (
            <span className="text-xs text-zinc-500 ml-auto">
              Última sentencia: <span className="text-rose-300">{formatDate(lastSentencia.fecha)}</span>
            </span>
          )}
        </div>

        {/* ── New since last visit banner ── */}
        {newCount > 0 && !isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-cyan-200">
              <span className="font-medium">{newCount}</span> actuación{newCount !== 1 ? 'es' : ''} nueva{newCount !== 1 ? 's' : ''} desde tu última visita
            </span>
          </div>
        )}

        {/* ── Search + filters ── */}
        {movements.length > 0 && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en título o cuerpo..."
                className="w-full h-9 rounded-lg border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-zinc-500 hover:text-zinc-300"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setTipoFilter('all')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  tipoFilter === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                )}
              >
                Todos ({movements.length})
              </button>
              {(Object.entries(countsByType) as [MovementType, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([tipo, count]) => (
                  <button
                    key={tipo}
                    onClick={() => setTipoFilter(tipo)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      tipoFilter === tipo
                        ? `${TIPO_COLORS[tipo]} ring-1 ring-current`
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    )}
                  >
                    {TIPO_LABELS[tipo]} ({count})
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* ── List ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Sin actuaciones sincronizadas"
            description="Presioná Sincronizar para importar las actuaciones desde el SAE."
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">Ninguna actuación coincide con el filtro.</p>
            {filtersActive && (
              <button
                onClick={() => { setSearch(''); setTipoFilter('all') }}
                className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {group.label}
                  </h4>
                  <span className="text-[11px] text-zinc-600">·</span>
                  <span className="text-[11px] text-zinc-600">
                    {group.movements.length} {group.movements.length === 1 ? 'actuación' : 'actuaciones'}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06] ml-2" />
                </div>
                <div className="space-y-2">
                  {group.movements.map((m) => (
                    <ActuacionRow
                      key={m.id}
                      movement={m}
                      isNew={isMovementNew(m)}
                      onOpenPdf={handleOpenPdf}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SaePdfViewerDialog
        open={viewer.open}
        onClose={handleCloseViewer}
        fileName={viewer.attachments[viewer.index]?.fileName ?? ''}
        isLoading={document.isPending}
        objectUrl={viewer.objectUrl}
        error={viewer.error}
        totalFiles={viewer.attachments.length}
        currentIndex={viewer.index}
        onPrev={() => handleNavigatePdf(-1)}
        onNext={() => handleNavigatePdf(1)}
      />
    </Card>
  )
}
