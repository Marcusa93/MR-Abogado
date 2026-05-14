import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTareas, useCompletarTarea, expedienteLabel, type TareaWithRelations } from '@/hooks/use-tareas'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { VerTareaDialog } from '@/components/expedientes/ver-tarea-dialog'
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Loader2,
  FolderOpen,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getDateLabel(dateStr: string | null): { text: string; urgency: 'overdue' | 'today' | 'soon' | 'normal' } {
  const days = getDaysUntil(dateStr)
  if (days === null) return { text: 'Sin fecha', urgency: 'normal' }
  if (days < 0) return { text: `Venció hace ${Math.abs(days)}d`, urgency: 'overdue' }
  if (days === 0) return { text: 'Vence hoy', urgency: 'today' }
  if (days === 1) return { text: 'Vence mañana', urgency: 'soon' }
  if (days <= 7) return { text: `En ${days} días`, urgency: 'soon' }
  return { text: `En ${days} días`, urgency: 'normal' }
}

const URGENCY_CLASSES = {
  overdue: 'text-rose-500 dark:text-rose-400',
  today: 'text-amber-600 dark:text-amber-400',
  soon: 'text-amber-500 dark:text-amber-500',
  normal: 'text-zinc-500 dark:text-zinc-400',
}

const PRIORIDAD_DOT: Record<string, string> = {
  URGENTE: 'bg-rose-500',
  ALTA: 'bg-amber-500',
  MEDIA: 'bg-blue-500',
  BAJA: 'bg-zinc-400',
}

// ---------------------------------------------------------------------------
// Task row component
// ---------------------------------------------------------------------------

function TareaRow({
  tarea,
  onOpen,
  previewMode = false,
}: {
  tarea: TareaWithRelations
  onOpen: (t: TareaWithRelations) => void
  previewMode?: boolean
}) {
  const completar = useCompletarTarea()
  const dateInfo = getDateLabel(tarea.fecha_vencimiento)
  const expLabel = expedienteLabel(tarea.expediente)

  return (
    <div
      onClick={() => onOpen(tarea)}
      className="group flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.06]"
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (previewMode) return
          completar.mutate(tarea.id)
        }}
        disabled={previewMode || completar.isPending}
        className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
        title="Completar tarea"
      >
        {completar.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORIDAD_DOT[tarea.prioridad] ?? 'bg-zinc-400')} />
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {tarea.titulo}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className={cn('flex items-center gap-1', URGENCY_CLASSES[dateInfo.urgency])}>
            {dateInfo.urgency === 'overdue' && <AlertTriangle className="h-3 w-3" />}
            {dateInfo.urgency === 'today' && <Clock className="h-3 w-3" />}
            {dateInfo.text}
          </span>
          {tarea.expediente && (
            <Link
              to={`/expedientes/${tarea.expediente.id}`}
              className="dashboard-chip dashboard-chip-accent max-w-[240px] truncate"
              onClick={(e) => e.stopPropagation()}
              title={expLabel || 'Ir al expediente'}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">{expLabel || 'Expediente'}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared panel view
// ---------------------------------------------------------------------------

function MisTareasPanelView({
  pendientes,
  isLoading,
  isAdmin,
  profileId,
  verTarea,
  setVerTarea,
  previewMode = false,
}: {
  pendientes: TareaWithRelations[]
  isLoading: boolean
  isAdmin: boolean
  profileId?: string
  verTarea: TareaWithRelations | null
  setVerTarea: (tarea: TareaWithRelations | null) => void
  previewMode?: boolean
}) {
  const vencidasCount = pendientes.filter((t) => {
    const d = getDaysUntil(t.fecha_vencimiento)
    return d !== null && d < 0
  }).length

  const tareasLink = previewMode
    ? '/dashboard-preview'
    : isAdmin
    ? '/tareas'
    : `/tareas?asignado_a=${profileId}`

  return (
    <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">agenda interna</p>
          <div className="mt-1 flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {isAdmin ? 'Tareas Pendientes' : 'Mis Tareas'}
            </h3>
            {vencidasCount > 0 && (
              <span className="dashboard-chip dashboard-chip-danger">
                {vencidasCount} vencida{vencidasCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <Link
          to={tareasLink}
          className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-zinc-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : pendientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="dashboard-stat-orb mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isAdmin ? 'No hay tareas pendientes' : '¡No tenés tareas pendientes!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgb(87_124_142_/_10%)] dark:divide-white/6 px-1 py-1">
            {pendientes.map((t) => (
              <TareaRow key={t.id} tarea={t} onOpen={setVerTarea} previewMode={previewMode} />
            ))}
          </div>
        )}
      </div>
      <VerTareaDialog
        open={!previewMode && verTarea !== null}
        onClose={() => setVerTarea(null)}
        tarea={verTarea as any}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function MisTareasPanel({ previewData }: { previewData?: TareaWithRelations[] }) {
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)

  if (previewData) {
    return (
      <MisTareasPanelView
        pendientes={previewData}
        isLoading={false}
        isAdmin={false}
        verTarea={verTarea}
        setVerTarea={setVerTarea}
        previewMode
      />
    )
  }

  const { data, isLoading } = useTareas({
    asignado_a: isAdmin ? undefined : profile?.id,
    pageSize: 10,
    sortBy: 'fecha_vencimiento',
    sortOrder: 'asc',
  })

  const tareas = data?.data ?? []
  // Only show pending/in-progress
  const pendientes = tareas.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')

  return (
    <MisTareasPanelView
      pendientes={pendientes}
      isLoading={isLoading}
      isAdmin={isAdmin}
      profileId={profile?.id}
      verTarea={verTarea}
      setVerTarea={setVerTarea}
    />
  )
}
