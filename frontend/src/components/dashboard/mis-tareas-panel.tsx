import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTareas, useCompletarTarea, useUpdateTarea, expedienteLabel, type TareaWithRelations } from '@/hooks/use-tareas'
import { useAuth } from '@/hooks/use-auth'
import { useTeamMembers } from '@/hooks/use-team-members'
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
  UserPlus,
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
  normal: 'text-zinc-500 dark:text-zinc-300',
}

const PRIORIDAD_DOT: Record<string, string> = {
  URGENTE: 'bg-rose-500',
  ALTA: 'bg-amber-500',
  MEDIA: 'bg-blue-500',
  BAJA: 'bg-zinc-400',
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

type TeamMember = { id: string; nombre: string | null; apellido: string | null }

function TareaRow({
  tarea,
  onOpen,
  members,
  onAssign,
}: {
  tarea: TareaWithRelations
  onOpen: (t: TareaWithRelations) => void
  members: TeamMember[]
  onAssign: (tareaId: string, profileId: string | null, prevProfileId: string | null) => void
}) {
  const completar = useCompletarTarea()
  const [assignOpen, setAssignOpen] = useState(false)
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
              className="dashboard-chip dashboard-chip-accent max-w-[200px] truncate"
              onClick={(e) => e.stopPropagation()}
              title={expLabel || 'Ir al expediente'}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">{expLabel || 'Expediente'}</span>
            </Link>
          )}
          {/* Asignación rápida */}
          {assignOpen ? (
            <select
              autoFocus
              className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[11px] py-0.5 px-1 cursor-pointer"
              defaultValue={tarea.asignado_a ?? ''}
              onBlur={() => setAssignOpen(false)}
              onChange={(e) => {
                e.stopPropagation()
                onAssign(tarea.id, e.target.value || null, tarea.asignado_a ?? null)
                setAssignOpen(false)
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.apellido} {m.nombre}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setAssignOpen(true)
              }}
              className={cn(
                'flex items-center gap-1 transition-colors',
                tarea.asignado_a
                  ? 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100'
                  : 'text-amber-600 dark:text-amber-400 font-medium hover:text-amber-700 dark:hover:text-amber-300'
              )}
              title={tarea.asignado_a ? 'Reasignar' : 'Asignar responsable'}
            >
              <UserPlus className="h-3 w-3" />
              {tarea.asignado_a
                ? `${tarea.asignado?.apellido ?? ''} ${tarea.asignado?.nombre ?? ''}`.trim()
                : 'Asignar'}
            </button>
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
  const isAdminOrDirector = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)
  const [tab, setTab] = useState<'pendientes' | 'sin_asignar'>('pendientes')
  const updateTarea = useUpdateTarea()
  const { data: membersData } = useTeamMembers()
  const members: TeamMember[] = membersData ?? []

  // Admins y directores ven todas; el resto solo las propias
  const { data, isLoading } = useTareas({
    asignado_a: isAdminOrDirector ? undefined : profile?.id,
    pageSize: 20,
    sortBy: 'fecha_vencimiento',
    sortOrder: 'asc',
  })

  const tareas = data?.data ?? []
  const pendientes = tareas.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')
  const sinAsignar = pendientes.filter((t) => !t.asignado_a)
  const vencidasCount = pendientes.filter((t) => {
    const d = getDaysUntil(t.fecha_vencimiento)
    return d !== null && d < 0
  }).length

  const lista = tab === 'sin_asignar' ? sinAsignar : pendientes

  const tareasLink = isAdminOrDirector ? '/tareas' : `/tareas?asignado_a=${profile?.id}`

  const handleAssign = (tareaId: string, newProfileId: string | null, prevProfileId: string | null) => {
    updateTarea.mutate({ id: tareaId, asignado_a: newProfileId, prevAsignadoA: prevProfileId })
  }

  return (
    <div className="dashboard-panel rounded-[1.5rem] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="min-w-0 flex-1">
          <p className="dashboard-eyebrow text-[10px]">agenda interna</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <CheckSquare className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {isAdminOrDirector ? 'Tareas Pendientes' : 'Mis Tareas'}
            </h3>
            {vencidasCount > 0 && (
              <span className="dashboard-chip dashboard-chip-danger">
                {vencidasCount} vencida{vencidasCount > 1 ? 's' : ''}
              </span>
            )}
            {/* Tab de sin asignar — solo admin/director */}
            {isAdminOrDirector && (
              <div className="ml-1 flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-0.5">
                <button
                  onClick={() => setTab('pendientes')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    tab === 'pendientes'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  )}
                >
                  Todas
                </button>
                <button
                  onClick={() => setTab('sin_asignar')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    tab === 'sin_asignar'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  )}
                >
                  Sin asignar
                  {sinAsignar.length > 0 && (
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                      tab === 'sin_asignar'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    )}>
                      {sinAsignar.length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        <Link
          to={tareasLink}
          className="dashboard-link inline-flex items-center gap-1 text-[11px] font-semibold shrink-0"
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
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="dashboard-stat-orb mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-300">
              {tab === 'sin_asignar'
                ? 'Todas las tareas tienen responsable'
                : isAdminOrDirector
                  ? 'No hay tareas pendientes'
                  : '¡No tenés tareas pendientes!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgb(87_124_142_/_10%)] dark:divide-white/6 px-1 py-1">
            {lista.map((t) => (
              <TareaRow key={t.id} tarea={t} onOpen={setVerTarea} members={members} onAssign={handleAssign} />
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
