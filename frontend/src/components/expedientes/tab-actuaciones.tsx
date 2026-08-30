import { useEffect, useMemo, useRef, useState } from 'react'
import { useModalHistory } from '@/hooks/use-modal-history'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { useSaeMovements, useTriggerSaeSync, useSaeDocument, useAnalyzeMovements, useSetMovementKey, useSetMovementAudiencia, useSetMovementOle, useDeleteManualActuacion, useFetchBodies, hasAudioAttachment, type SaeMovement } from '@/hooks/use-sae'
import { ModalNuevaActuacion } from './modal-nueva-actuacion'
import { formatDate, formatDateTime, daysAgo } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { useEscritoIntent } from '@/stores/escrito-intent-store'
import type { Tables } from '@/types/database.types'

// Tipos de providencia a los que típicamente se contesta / da cumplimiento.
const RESPONDIBLE_MOV = new Set(['decreto', 'traslado', 'intimacion', 'cedula', 'sentencia', 'providencia', 'resolucion', 'auto'])
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
  BookOpen,
  Clock,
  Plus,
  PenLine,
  Check,
  Users,
  Star,
  Video,
  Trash2,
  ListTodo,
  List,
  GanttChart,
} from 'lucide-react'
import { toast } from '@/stores/toast-store'
import { SaePdfViewerDialog } from './sae-pdf-viewer-dialog'
import { CrearTareaDialog } from './crear-tarea-dialog'
import { CrearTurnoDialog } from './crear-turno-dialog'
import { SaeIntelligencePanel } from './sae-intelligence-panel'
import { extractPdfText } from '@/lib/utils/pdf-text'

type MovementType = Tables<'sae_movements'>['tipo_movimiento']
type AiSuggestedAction = NonNullable<SaeMovement['ai_suggested_action']>

const PRIORIDAD_COLORS: Record<AiSuggestedAction['prioridad'], string> = {
  URGENTE: 'bg-red-500/15 text-red-300 border-red-500/30',
  ALTA: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  MEDIA: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  BAJA: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

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

export interface SaeAttachment {
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

export function extractAttachments(movement: SaeMovement): SaeAttachment[] {
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
  isHighlighted,
  onOpenPdf,
  onCreateFromSuggestion,
  onAnalyze,
  isAnalyzing,
  onToggleKey,
  onToggleAudiencia,
  onToggleOle,
  onDelete,
  onCreateTarea,
}: {
  movement: SaeMovement
  isNew: boolean
  isHighlighted?: boolean
  onOpenPdf: (atts: SaeAttachment[], startIndex: number, movement: SaeMovement) => void
  onCreateFromSuggestion: (action: AiSuggestedAction) => void
  onAnalyze: (movementId: string) => void
  isAnalyzing: boolean
  onToggleKey: (movement: SaeMovement) => void
  onToggleAudiencia: (movement: SaeMovement) => void
  onToggleOle: (movement: SaeMovement) => void
  onDelete: (movement: SaeMovement) => void
  onCreateTarea: (movement: SaeMovement) => void
}) {
  const [expanded, setExpanded] = useState(isHighlighted ?? false)
  const [reading, setReading] = useState(false)
  const hasCuerpo = !!movement.cuerpo?.trim()
  const cuerpoLen = movement.cuerpo?.trim().length ?? 0
  const esLargo = cuerpoLen > 1200
  const attachments = extractAttachments(movement)
  // cuerpo === null (no undefined) significa que aún no fue descargado por sae-fetch-bodies
  const cuerpoNoCargado = movement.cuerpo === null && movement.fuente !== 'manual'
  const canExpand = hasCuerpo || attachments.length > 0 || cuerpoNoCargado
  const fetchBodies = useFetchBodies()

  const aiSummary = movement.ai_summary?.trim() || null
  const aiExtracted = movement.ai_extracted ?? null
  const aiAction = movement.ai_suggested_action ?? null
  const redactarRespuesta = useEscritoIntent((s) => s.redactarRespuesta)
  const puedeResponder = Boolean(aiAction) || RESPONDIBLE_MOV.has(movement.tipo_movimiento ?? '')
  const aiError = movement.ai_error?.trim() || null
  const wasAnalyzed = Boolean(movement.ai_analyzed_at)
  const hasAi = Boolean(aiSummary || aiExtracted || aiAction)
  const hasActionableHighlight = Boolean(aiAction)

  return (
    <div
      data-movement-id={movement.id}
      className={cn(
        'rounded-lg border bg-white/[0.02] overflow-hidden transition-colors',
        isNew
          ? 'border-cyan-500/30 bg-cyan-500/[0.04]'
          : hasActionableHighlight
            ? 'border-white/10'
            : 'border-white/5',
        isHighlighted && 'ring-2 ring-amber-500/40 border-amber-500/30 bg-amber-500/[0.03]',
      )}
    >
      <button
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
          canExpand ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
        )}
      >
        <div className="shrink-0 mt-0.5 flex flex-col gap-0.5 -ml-1 pr-2 border-r border-white/[0.04]">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleKey(movement) }}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={
              movement.is_key === true
                ? 'Marcada como clave (click para desmarcar)'
                : movement.is_key === false
                  ? 'Excluida de claves (click para marcar)'
                  : 'Marcar como clave'
            }
          >
            <Star
              className={cn(
                'h-4 w-4 transition-colors',
                movement.is_key === true
                  ? 'fill-amber-400 text-amber-400'
                  : movement.is_key === false
                    ? 'text-zinc-700 dark:text-zinc-200'
                    : 'text-zinc-600 dark:text-zinc-300 hover:text-amber-400'
              )}
            />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAudiencia(movement) }}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={
              movement.is_audiencia === true
                ? 'Marcada como audiencia (click para desmarcar)'
                : movement.is_audiencia === false
                  ? 'Excluida de audiencias (click para marcar)'
                  : hasAudioAttachment(movement)
                    ? 'Auto-detectada como audiencia por adjunto de audio (click para anclar manualmente)'
                    : 'Marcar como audiencia'
            }
          >
            <Video
              className={cn(
                'h-4 w-4 transition-colors',
                movement.is_audiencia === true
                  ? 'fill-cyan-500/30 text-cyan-400'
                  : movement.is_audiencia === false
                    ? 'text-zinc-700 dark:text-zinc-200'
                    : hasAudioAttachment(movement)
                      ? 'text-cyan-500/50 hover:text-cyan-400'
                      : 'text-zinc-600 dark:text-zinc-300 hover:text-cyan-400'
              )}
            />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleOle(movement) }}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={
              (movement as SaeMovement & { is_ole?: boolean }).is_ole
                ? 'Olé: actuación ejemplar (click para desmarcar). El sistema aprende de las que marcás.'
                : 'Marcar con "olé": actuación que vale recordar. Alimenta el aprendizaje cross-expedientes.'
            }
          >
            <Sparkles
              className={cn(
                'h-4 w-4 transition-colors',
                (movement as SaeMovement & { is_ole?: boolean }).is_ole
                  ? 'fill-violet-400/30 text-violet-400'
                  : 'text-zinc-600 dark:text-zinc-300 hover:text-violet-400'
              )}
            />
          </button>
        </div>

        <div className="shrink-0 mt-0.5 flex flex-col gap-1">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[movement.tipo_movimiento])}>
            <MovementIcon tipo={movement.tipo_movimiento} />
            {TIPO_LABELS[movement.tipo_movimiento]}
          </span>
          {movement.fuente === 'manual' && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400 uppercase tracking-wide">
              Manual
            </span>
          )}
          {(movement as { respondida_at?: string | null }).respondida_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[9px] font-medium text-teal-300 uppercase tracking-wide" title="Ya se generó un escrito que responde a esta providencia">
              <Check className="h-2.5 w-2.5" /> Respondida
            </span>
          )}
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
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(movement.fecha)}
            {attachments.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-sky-400">
                <Paperclip className="h-3 w-3" />
                {attachments.length} {attachments.length === 1 ? 'archivo' : 'archivos'}
              </span>
            )}
          </p>

          {/* Bloque IA: summary + chips + acción sugerida, agrupados */}
          {hasAi && (
            <div className="mt-2 rounded-md border border-violet-500/15 bg-violet-500/[0.04] px-2.5 py-2 space-y-1.5">
              {aiSummary && (
                <p className="text-xs text-zinc-300 leading-snug flex items-start gap-1.5">
                  <Sparkles className="h-3 w-3 shrink-0 mt-[2px] text-violet-400" />
                  <span className="flex-1">{aiSummary}</span>
                </p>
              )}

              {(aiExtracted?.fechas?.length || aiExtracted?.plazos?.length || aiExtracted?.partes?.length) ? (
                <div className="flex items-center flex-wrap gap-1.5">
                  {aiExtracted?.fechas?.map((f, i) => (
                    <span key={`f-${i}`} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title={f.descripcion}>
                      <Calendar className="h-2.5 w-2.5" />
                      {f.tipo}: {formatDate(f.fecha_iso)}
                    </span>
                  ))}
                  {aiExtracted?.plazos?.map((p, i) => (
                    <span key={`p-${i}`} className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-300" title={p.descripcion}>
                      <Clock className="h-2.5 w-2.5" />
                      {p.dias} {p.habiles ? 'días háb.' : 'días'}
                      {p.vence_aprox && <span className="opacity-80">· vence {formatDate(p.vence_aprox)}</span>}
                    </span>
                  ))}
                  {aiExtracted?.partes && aiExtracted.partes.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400" title={aiExtracted.partes.join(', ')}>
                      <Users className="h-2.5 w-2.5" />
                      {aiExtracted.partes.length} {aiExtracted.partes.length === 1 ? 'parte' : 'partes'}
                    </span>
                  )}
                </div>
              ) : null}

              {(aiAction || puedeResponder) && (
                <div className="flex flex-wrap items-center gap-2">
                  {aiAction && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCreateFromSuggestion(aiAction) }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-125',
                        PRIORIDAD_COLORS[aiAction.prioridad],
                      )}
                      title={aiAction.descripcion}
                    >
                      <Plus className="h-3 w-3" />
                      Crear {aiAction.tipo}: {aiAction.titulo}
                      <span className="ml-1 opacity-70">· {aiAction.prioridad.toLowerCase()}</span>
                    </button>
                  )}
                  {puedeResponder && (
                    <button
                      onClick={(e) => { e.stopPropagation(); redactarRespuesta(movement.id) }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition-colors hover:brightness-125"
                      title="Abrir el generador de escritos apuntado a esta providencia"
                    >
                      <PenLine className="h-3 w-3" />
                      Redactar respuesta
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Analyze with AI button (only when not yet analyzed) */}
          {!wasAnalyzed && hasCuerpo && (
            <div className="mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onAnalyze(movement.id) }}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                title="Resumir y extraer datos clave con IA"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {isAnalyzing ? 'Analizando…' : 'Analizar con IA'}
              </button>
            </div>
          )}

          {/* AI error feedback (lets the user retry) */}
          {wasAnalyzed && aiError && !hasAi && (
            <div className="mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onAnalyze(movement.id) }}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                title={aiError}
              >
                <AlertCircle className="h-3 w-3" />
                Reintentar análisis IA
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-0.5 mt-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCreateTarea(movement) }}
            className="p-1 rounded text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Crear tarea vinculada a esta actuación"
          >
            <ListTodo className="h-3.5 w-3.5" />
          </button>
          {movement.fuente === 'manual' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(movement) }}
              className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Eliminar actuación manual"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {canExpand && (
            <span className="text-zinc-600 dark:text-zinc-500">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {cuerpoNoCargado && !hasCuerpo && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <span className="text-xs text-zinc-500">Texto del decreto no descargado aún</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fetchBodies.mutate({ expedienteId: movement.expediente_id })
                }}
                disabled={fetchBodies.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/10 transition-colors disabled:opacity-50"
              >
                {fetchBodies.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Clock className="h-3 w-3" />
                }
                Cargar texto
              </button>
            </div>
          )}
          {hasCuerpo && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Cuerpo de la actuación{esLargo ? ` · ${cuerpoLen.toLocaleString('es-AR')} caracteres` : ''}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReading(true) }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/10 transition-colors"
                  title="Abrir el texto completo en un panel de lectura cómodo"
                >
                  <BookOpen className="h-3 w-3" />
                  Abrir en lectura
                </button>
              </div>
              <div className={cn('relative', esLargo && 'max-h-64 overflow-hidden')}>
                <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
                  {movement.cuerpo}
                </p>
                {esLargo && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0a0b] to-transparent" />
                )}
              </div>
              {esLargo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReading(true) }}
                  className="text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Leer completo →
                </button>
              )}
            </>
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
                  <Eye className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-sky-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {reading && hasCuerpo && (
        <ActuacionReader movement={movement} onClose={() => setReading(false)} />
      )}
    </div>
  )
}

// ─── Reading pane ─────────────────────────────────────────────────────────────
// Panel de lectura a pantalla casi completa para actuaciones largas (sentencias,
// resoluciones). Tipografía cómoda, ancho de lectura acotado, scrollable.
function ActuacionReader({ movement, onClose }: { movement: SaeMovement; onClose: () => void }) {
  useModalHistory(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-h-[92dvh] flex-col rounded-t-2xl bg-zinc-950 shadow-2xl border border-white/8 sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile hint */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden>
          <div className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[movement.tipo_movimiento])}>
            <MovementIcon tipo={movement.tipo_movimiento} />
            {TIPO_LABELS[movement.tipo_movimiento]}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100 leading-snug">{movement.titulo}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{formatDate(movement.fecha)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 -mr-1 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-100 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          <p className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-zinc-200 [text-align:justify]">
            {movement.cuerpo}
          </p>
        </div>

        {/* Pie con botón Cerrar */}
        <div className="shrink-0 border-t border-white/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white/8 py-3 text-sm font-medium text-zinc-300 hover:bg-white/12 hover:text-zinc-100 active:scale-[0.98] transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stat grid (SAE-specific summary) ─────────────────────────────────────────

function relativeDaysLabel(fecha: string | null | undefined): string {
  const d = daysAgo(fecha)
  if (d == null) return '—'
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  if (d < 30) return `hace ${d} d.`
  if (d < 365) return `hace ${Math.round(d / 30)} m.`
  return `hace ${Math.round(d / 365)} a.`
}

function SaeStat({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  sublabel?: React.ReactNode
  tone?: 'default' | 'violet' | 'rose' | 'cyan' | 'muted'
}) {
  const valueClass = {
    default: 'text-zinc-800 dark:text-zinc-100',
    violet: 'text-violet-400',
    rose: 'text-rose-300',
    cyan: 'text-cyan-300',
    muted: 'text-zinc-600 dark:text-zinc-400',
  }[tone]
  const iconClass = {
    default: 'text-zinc-500 dark:text-zinc-300',
    violet: 'text-violet-400',
    rose: 'text-rose-400',
    cyan: 'text-cyan-400',
    muted: 'text-zinc-600 dark:text-zinc-500',
  }[tone]
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className={cn('text-sm font-semibold leading-tight truncate', valueClass)}>{value}</p>
        {sublabel && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  )
}

// ─── Timeline view ────────────────────────────────────────────────────────────

const TIPO_DOT: Partial<Record<MovementType, string>> = {
  sentencia: 'bg-rose-400',
  traslado: 'bg-violet-400',
  audiencia: 'bg-amber-400',
  prueba: 'bg-blue-400',
  embargo: 'bg-orange-400',
  cedula: 'bg-sky-400',
  oficio: 'bg-teal-400',
  intimacion: 'bg-red-400',
  planilla: 'bg-indigo-400',
  informe: 'bg-cyan-400',
  decreto: 'bg-purple-400',
  escrito_parte: 'bg-emerald-400',
  otro: 'bg-zinc-500',
}

function TimelineView({
  movements,
  highlightMovementId,
}: {
  movements: SaeMovement[]
  highlightMovementId?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    highlightMovementId ? new Set([highlightMovementId]) : new Set()
  )
  const toggle = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (movements.length === 0) return null

  // Agrupar por mes
  const byMonth: { key: string; label: string; items: SaeMovement[] }[] = []
  for (const m of movements) {
    const d = new Date((m.fecha ?? m.created_at ?? '').slice(0, 10) + 'T00:00:00Z')
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const last = byMonth[byMonth.length - 1]
    if (last?.key === key) last.items.push(m)
    else byMonth.push({ key, label, items: [m] })
  }

  return (
    <div className="space-y-6">
      {byMonth.map((group) => (
        <div key={group.key}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 capitalize">
            {group.label}
          </p>
          <div className="relative pl-6">
            {/* Línea vertical */}
            <div className="absolute left-[7px] top-0 bottom-0 w-px bg-white/[0.07]" />

            <div className="space-y-1">
              {group.items.map((m, idx) => {
                const isLast = idx === group.items.length - 1
                const isOpen = expanded.has(m.id)
                const isHighlighted = highlightMovementId === m.id
                const dotColor = TIPO_DOT[m.tipo_movimiento] ?? 'bg-zinc-500'
                const isAudiencia = m.is_audiencia === true || m.tipo_movimiento === 'audiencia'
                const fecha = (m.fecha ?? m.created_at ?? '').slice(0, 10)
                const d = new Date(fecha + 'T00:00:00Z')
                const dd = String(d.getUTCDate()).padStart(2, '0')
                const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
                const diaSemana = diasSemana[d.getUTCDay()]

                return (
                  <div
                    key={m.id}
                    data-movement-id={m.id}
                    className={cn(
                      'relative',
                      !isLast && 'pb-1',
                    )}
                  >
                    {/* Nodo en la línea */}
                    <div className="absolute -left-6 top-[10px] flex flex-col items-center">
                      {isAudiencia ? (
                        <div
                          className={cn(
                            'h-3.5 w-3.5 rotate-45 rounded-sm border-2 border-[#1e1e2e]',
                            dotColor,
                            isHighlighted && 'ring-2 ring-amber-400/60 ring-offset-1 ring-offset-[#1e1e2e]',
                          )}
                        />
                      ) : (
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full border-2 border-[#1e1e2e]',
                            dotColor,
                            isHighlighted && 'ring-2 ring-amber-400/60 ring-offset-1 ring-offset-[#1e1e2e]',
                          )}
                        />
                      )}
                    </div>

                    {/* Tarjeta */}
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={cn(
                        'w-full text-left rounded-lg px-3 py-2 transition-colors',
                        isHighlighted
                          ? 'bg-amber-500/8 ring-1 ring-amber-500/25'
                          : isOpen
                            ? 'bg-white/[0.04]'
                            : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {/* Fecha */}
                        <div className="shrink-0 w-8 text-center pt-0.5">
                          <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 leading-none">{diaSemana}</p>
                          <p className="text-base font-bold text-zinc-400 dark:text-zinc-300 leading-tight">{dd}</p>
                        </div>

                        {/* Contenido */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              TIPO_COLORS[m.tipo_movimiento],
                            )}>
                              {TIPO_LABELS[m.tipo_movimiento]}
                            </span>
                            {m.is_key && (
                              <span className="inline-flex rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                                Clave
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-zinc-200 leading-snug line-clamp-2">
                            {m.titulo || '(sin título)'}
                          </p>
                        </div>

                        <ChevronDown
                          className={cn(
                            'mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </div>

                      {/* Cuerpo expandido */}
                      {isOpen && m.cuerpo && (
                        <p className="mt-2 ml-10 text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap line-clamp-6">
                          {m.cuerpo}
                        </p>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TabActuacionesProps {
  expedienteId: string
  numeroSae: string | null | undefined
  ultimaSincronizacion: string | null | undefined
  highlightMovementId?: string
}

export function TabActuaciones({ expedienteId, numeroSae, ultimaSincronizacion, highlightMovementId }: TabActuacionesProps) {
  const { data: movements = [], isLoading } = useSaeMovements(expedienteId)
  const sync = useTriggerSaeSync()
  const saeDocument = useSaeDocument()
  const analyze = useAnalyzeMovements()
  const setMovementKey = useSetMovementKey()
  const setMovementAudiencia = useSetMovementAudiencia()
  const setMovementOle = useSetMovementOle()
  const deleteManual = useDeleteManualActuacion()
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())

  const handleDeleteManual = (movement: SaeMovement) => {
    if (!window.confirm(`¿Eliminar la actuación "${movement.titulo}"? Esta acción no se puede deshacer.`)) return
    deleteManual.mutate(
      { movementId: movement.id, expedienteId },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la actuación'),
      },
    )
  }

  const handleToggleKey = (movement: SaeMovement) => {
    // Tri-state: null → true → false → null
    let next: boolean | null
    if (movement.is_key === true) next = false
    else if (movement.is_key === false) next = null
    else next = true
    setMovementKey.mutate(
      { movementId: movement.id, isKey: next, expedienteId },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo actualizar'),
      },
    )
  }

  const handleToggleAudiencia = (movement: SaeMovement) => {
    let next: boolean | null
    if (movement.is_audiencia === true) next = false
    else if (movement.is_audiencia === false) next = null
    else next = true
    setMovementAudiencia.mutate(
      { movementId: movement.id, isAudiencia: next, expedienteId },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo actualizar'),
      },
    )
  }

  const handleToggleOle = (movement: SaeMovement) => {
    const current = (movement as SaeMovement & { is_ole?: boolean }).is_ole === true
    setMovementOle.mutate(
      { movementId: movement.id, isOle: !current, expedienteId },
      {
        onSuccess: () => {
          if (!current) toast.success('¡Olé! El sistema va a aprender de esta actuación.')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo actualizar'),
      },
    )
  }
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
  const [fuenteFilter, setFuenteFilter] = useState<'all' | 'sae' | 'manual'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [modalNuevaOpen, setModalNuevaOpen] = useState(false)
  const [tareaPrefill, setTareaPrefill] = useState<{ open: boolean; saeMovementId?: string; values?: { titulo: string; descripcion: string; fechaVencimiento: string; prioridad: AiSuggestedAction['prioridad'] } }>({ open: false })
  const [turnoPrefill, setTurnoPrefill] = useState<{ open: boolean; values?: { fecha: string; notas: string } }>({ open: false })

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

  // Scroll y highlight de actuación referenciada por URL (?mid=...)
  useEffect(() => {
    if (!highlightMovementId || movements.length === 0) return
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-movement-id="${highlightMovementId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
    return () => clearTimeout(timer)
  }, [highlightMovementId, movements.length])

  // ── Derived data ────────────────────────────────────────────────────────────

  const countsByType = useMemo(() => {
    const counts: Partial<Record<MovementType, number>> = {}
    for (const m of movements) counts[m.tipo_movimiento] = (counts[m.tipo_movimiento] ?? 0) + 1
    return counts
  }, [movements])

  const lastSentencia = useMemo(() => {
    return movements.find((m) => m.tipo_movimiento === 'sentencia')
  }, [movements])

  const lastMovement = useMemo(() => {
    // movements ya viene ordenado por fecha desc desde el hook
    return movements[0] ?? null
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
      if (fuenteFilter !== 'all' && (m.fuente ?? 'sae') !== fuenteFilter) return false
      if (q && !m.titulo.toLowerCase().includes(q) && !(m.cuerpo?.toLowerCase().includes(q))) return false
      return true
    })
  }, [movements, search, tipoFilter, fuenteFilter])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

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
    saeDocument.mutate(
      { movementId: m.id, procid, jurisdictionId, histid, fileName: att.fileName },
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

  const [analyzingFromPdf, setAnalyzingFromPdf] = useState(false)
  const handleAnalyzePdfInViewer = async () => {
    if (!viewer.objectUrl || !viewer.movement) {
      toast.error('Esperá a que termine de cargar el PDF.')
      return
    }
    const movement = viewer.movement
    const fileName = viewer.attachments[viewer.index]?.fileName ?? 'archivo'
    setAnalyzingFromPdf(true)
    try {
      const { text, pages, truncated } = await extractPdfText(viewer.objectUrl)
      if (!text.trim()) {
        toast.error('No se pudo extraer texto del PDF (puede ser un PDF escaneado / imagen).')
        return
      }
      toast.info(`Analizando PDF (${pages} pág${pages !== 1 ? 's' : ''}${truncated ? ', truncado' : ''})…`)
      const result = await analyze.mutateAsync({
        movement_ids: [movement.id],
        expediente_id: expedienteId,
        document_text: text,
        document_file_names: [fileName],
      })
      if (result.failed > 0) {
        const err = result.results.find(r => !r.success)
        toast.error(`No se pudo analizar: ${err?.error ?? 'desconocido'}`)
      } else {
        toast.success('Análisis IA actualizado con el contenido del PDF.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error analizando PDF')
    } finally {
      setAnalyzingFromPdf(false)
    }
  }

  const handleAnalyzeIds = (ids: string[], confirmIfMany = true) => {
    if (ids.length === 0) {
      toast.info('No hay actuaciones pendientes de análisis.')
      return
    }
    if (confirmIfMany && ids.length > 5) {
      const ok = window.confirm(`Vas a analizar ${ids.length} actuaciones con IA. Costo aproximado: ${(ids.length * 0.015).toFixed(2)} USD. ¿Continuar?`)
      if (!ok) return
    }
    setAnalyzingIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    analyze.mutate(
      { movement_ids: ids, expediente_id: expedienteId },
      {
        onSuccess: (data) => {
          if (data.failed > 0) {
            toast.error(`${data.analyzed} analizadas · ${data.failed} con error`)
          } else if (data.skipped > 0 && data.analyzed === 0) {
            toast.info('La actuación es trámite administrativo, no se analiza con IA.')
          } else {
            toast.success(`${data.analyzed} actuación${data.analyzed !== 1 ? 'es' : ''} analizada${data.analyzed !== 1 ? 's' : ''}`)
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al analizar'),
        onSettled: () => {
          setAnalyzingIds((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.delete(id))
            return next
          })
        },
      },
    )
  }

  const pendingAnalysisIds = useMemo(
    () => movements.filter((m) => !m.ai_analyzed_at && (m.cuerpo?.trim() || (m.titulo?.length ?? 0) >= 10)).map((m) => m.id),
    [movements],
  )

  const TIPO_TAREA_PREFIX: Partial<Record<string, string>> = {
    decreto: 'Cumplir decreto',
    traslado: 'Contestar traslado',
    intimacion: 'Cumplir intimación',
    cedula: 'Contestar cédula',
    sentencia: 'Notificar sentencia al cliente',
    audiencia: 'Preparar audiencia',
    embargo: 'Gestionar embargo',
    oficio: 'Diligenciar oficio',
    prueba: 'Producir prueba',
  }
  const TIPO_PRIORIDAD: Partial<Record<string, 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'>> = {
    intimacion: 'ALTA', embargo: 'ALTA', sentencia: 'ALTA',
    traslado: 'ALTA', cedula: 'ALTA', audiencia: 'ALTA',
  }

  const handleCreateTarea = (movement: SaeMovement) => {
    const tipo = movement.tipo_movimiento ?? 'otro'
    const prefix = TIPO_TAREA_PREFIX[tipo] ?? 'Gestionar actuación'
    const titulo = movement.titulo
      ? `${prefix}: ${movement.titulo.slice(0, 70)}`
      : prefix
    const base = {
      titulo,
      descripcion: movement.ai_summary ?? '',
      fechaVencimiento: '',
      prioridad: TIPO_PRIORIDAD[tipo] ?? 'MEDIA',
    }
    // Si hay sugerencia IA, usa esos valores pero igual vincula la actuación
    if (movement.ai_suggested_action) {
      const action = movement.ai_suggested_action
      if (action.tipo !== 'turno') {
        setTareaPrefill({
          open: true,
          saeMovementId: movement.id,
          values: { titulo: action.titulo, descripcion: action.descripcion, fechaVencimiento: action.fecha ?? '', prioridad: action.prioridad },
        })
        return
      }
      handleCreateFromSuggestion(action)
      return
    }
    setTareaPrefill({ open: true, saeMovementId: movement.id, values: base })
  }

  const handleCreateFromSuggestion = (action: AiSuggestedAction) => {
    if (action.tipo === 'turno') {
      setTurnoPrefill({
        open: true,
        values: { fecha: action.fecha ?? '', notas: action.descripcion },
      })
    } else {
      setTareaPrefill({
        open: true,
        values: {
          titulo: action.titulo,
          descripcion: action.descripcion,
          fechaVencimiento: action.fecha ?? '',
          prioridad: action.prioridad,
        },
      })
    }
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

  const filtersActive = search.trim() !== '' || tipoFilter !== 'all' || fuenteFilter !== 'all'

  return (
    <Card
      title="Actuaciones"
      headerRight={
        <div className="flex items-center gap-2">
          {numeroSae && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-cyan-400"
              title="Número SAE del expediente"
            >
              <Info className="h-3 w-3" />
              {numeroSae}
            </span>
          )}
          {ultimaSincronizacion && (
            <span className="hidden md:block text-[11px] text-zinc-500 dark:text-zinc-400">
              Sync: {formatDateTime(ultimaSincronizacion)}
            </span>
          )}
          {pendingAnalysisIds.length > 0 && (
            <button
              onClick={() => handleAnalyzeIds(pendingAnalysisIds)}
              disabled={analyze.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              title={`Analizar las ${pendingAnalysisIds.length} actuaciones sin IA del expediente`}
            >
              {analyze.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Analizar pendientes ({pendingAnalysisIds.length})
            </button>
          )}
          {numeroSae && (
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
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Stat grid: resumen SAE de un vistazo ── */}
        {movements.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] divide-x divide-y sm:divide-y-0 divide-cyan-500/10 overflow-hidden">
            <SaeStat
              icon={Database}
              label="Actuaciones"
              value={movements.length}
            />
            <SaeStat
              icon={Sparkles}
              label="Sin analizar"
              value={pendingAnalysisIds.length}
              sublabel={pendingAnalysisIds.length > 0 ? 'pendientes IA' : 'todo al día'}
              tone={pendingAnalysisIds.length > 0 ? 'violet' : 'muted'}
            />
            <SaeStat
              icon={Clock}
              label="Última actuación"
              value={lastMovement ? relativeDaysLabel(lastMovement.fecha) : '—'}
              sublabel={lastMovement ? TIPO_LABELS[lastMovement.tipo_movimiento] : null}
              tone={lastMovement ? 'cyan' : 'muted'}
            />
            <SaeStat
              icon={Gavel}
              label="Última sentencia"
              value={lastSentencia ? formatDate(lastSentencia.fecha) : '—'}
              sublabel={lastSentencia ? relativeDaysLabel(lastSentencia.fecha) : 'sin sentencias'}
              tone={lastSentencia ? 'rose' : 'muted'}
            />
          </div>
        )}

        {/* ── Banner sin SAE ── */}
        {!numeroSae && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <Info className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="text-xs text-amber-200">
              Sin número SAE — la sincronización no está disponible. Podés registrar actuaciones manualmente.
            </span>
          </div>
        )}

        {/* ── New since last visit banner ── */}
        {newCount > 0 && !isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-cyan-200">
              <span className="font-medium">{newCount}</span> actuación{newCount !== 1 ? 'es' : ''} nueva{newCount !== 1 ? 's' : ''} desde tu última visita
            </span>
          </div>
        )}

        {/* ── Inteligencia del expediente — bajo el stat grid, colapsable internamente ── */}
        <SaeIntelligencePanel expedienteId={expedienteId} />

        {/* ── Search + filters ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en título o cuerpo..."
                className="w-full h-9 rounded-lg border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-300"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Toggle lista / timeline */}
            <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Vista lista"
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  viewMode === 'list'
                    ? 'bg-white/10 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                title="Vista línea de tiempo"
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  viewMode === 'timeline'
                    ? 'bg-white/10 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <GanttChart className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={() => setModalNuevaOpen(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva
            </button>
          </div>

          {/* Fuente filter */}
          <div className="flex items-center gap-1.5">
            {(['all', 'sae', 'manual'] as const).map((f) => {
              const label = f === 'all' ? 'Todas' : f === 'sae' ? 'SAE' : 'Manual'
              return (
                <button
                  key={f}
                  onClick={() => setFuenteFilter(f)}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    fuenteFilter === f
                      ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {movements.length > 0 && (
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
          )}
        </div>

        {/* ── List / Timeline ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400" />
          </div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Sin actuaciones"
            description={numeroSae ? 'Presioná Sincronizar para importar las actuaciones desde el SAE, o cargá una manualmente con el botón Nueva.' : 'Cargá la primera actuación con el botón Nueva.'}
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="h-8 w-8 text-zinc-600 dark:text-zinc-300" />
            <p className="text-sm text-zinc-400">Ninguna actuación coincide con el filtro.</p>
            {filtersActive && (
              <button
                onClick={() => { setSearch(''); setTipoFilter('all'); setFuenteFilter('all') }}
                className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : viewMode === 'timeline' ? (
          <TimelineView movements={filtered} highlightMovementId={highlightMovementId} />
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {group.label}
                  </h4>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300">·</span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
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
                      isHighlighted={!!highlightMovementId && m.id === highlightMovementId}
                      onOpenPdf={handleOpenPdf}
                      onCreateFromSuggestion={handleCreateFromSuggestion}
                      onAnalyze={(id) => handleAnalyzeIds([id], false)}
                      isAnalyzing={analyzingIds.has(m.id)}
                      onToggleKey={handleToggleKey}
                      onToggleAudiencia={handleToggleAudiencia}
                      onToggleOle={handleToggleOle}
                      onDelete={handleDeleteManual}
                      onCreateTarea={handleCreateTarea}
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
        isLoading={saeDocument.isPending}
        objectUrl={viewer.objectUrl}
        error={viewer.error}
        totalFiles={viewer.attachments.length}
        currentIndex={viewer.index}
        onPrev={() => handleNavigatePdf(-1)}
        onNext={() => handleNavigatePdf(1)}
        onAnalyzeWithAI={handleAnalyzePdfInViewer}
        isAnalyzing={analyzingFromPdf}
      />

      <CrearTareaDialog
        open={tareaPrefill.open}
        onClose={() => setTareaPrefill({ open: false })}
        expedienteId={expedienteId}
        saeMovementId={tareaPrefill.saeMovementId}
        initialValues={tareaPrefill.values}
      />

      <CrearTurnoDialog
        open={turnoPrefill.open}
        onClose={() => setTurnoPrefill({ open: false })}
        expedienteId={expedienteId}
        initialValues={turnoPrefill.values}
      />

      <ModalNuevaActuacion
        open={modalNuevaOpen}
        onClose={() => setModalNuevaOpen(false)}
        expedienteId={expedienteId}
      />
    </Card>
  )
}
