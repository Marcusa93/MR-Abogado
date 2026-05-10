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

function TareaRow({ tarea, onOpen }: { tarea: TareaWithRelations; onOpen: (t: TareaWithRelations) => void }) {
  const completar = useCompletarTarea()
  const dateInfo = getDateLabel(tarea.fecha_vencimiento)
  const expLabel = expedienteLabel(tarea.expediente)

  return (
    <div
      onClick={() => onOpen(tarea)}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/[0.06] dark:bg-white/[0.03] transition-colors group"
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          completar.mutate(tarea.id)
        }}
        disabled={completar.isPending}
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
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors truncate max-w-[240px]"
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
// Main panel
// ---------------------------------------------------------------------------

export function MisTareasPanel() {
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)

  const { data, isLoading } = useTareas({
    asignado_a: isAdmin ? undefined : profile?.id,
    pageSize: 10,
    sortBy: 'fecha_vencimiento',
    sortOrder: 'asc',
  })

  const tareas = data?.data ?? []
  // Only show pending/in-progress
  const pendientes = tareas.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')

  const vencidasCount = pendientes.filter((t) => {
    const d = getDaysUntil(t.fecha_vencimiento)
    return d !== null && d < 0
  }).length

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {isAdmin ? 'Tareas Pendientes' : 'Mis Tareas'}
          </h3>
          {vencidasCount > 0 && (
            <span className="flex h-5 items-center rounded-full bg-rose-500/15 px-2 text-[10px] font-bold text-rose-600 dark:text-rose-400">
              {vencidasCount} vencida{vencidasCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Link
          to={isAdmin ? '/tareas' : `/tareas?asignado_a=${profile?.id}`}
          className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors flex items-center gap-1"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-zinc-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : pendientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isAdmin ? 'No hay tareas pendientes' : '¡No tenés tareas pendientes!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/5">
            {pendientes.map((t) => (
              <TareaRow key={t.id} tarea={t} onOpen={setVerTarea} />
            ))}
          </div>
        )}
      </div>
      <VerTareaDialog
        open={verTarea !== null}
        onClose={() => setVerTarea(null)}
        tarea={verTarea as any}
      />
    </div>
  )
}
