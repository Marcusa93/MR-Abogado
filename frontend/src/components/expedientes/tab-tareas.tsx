import { useState } from 'react'
import { Card, StatusBadge, getTareaColor } from './detail-helpers'
import { CrearTareaDialog } from './crear-tarea-dialog'
import { VerTareaDialog } from './ver-tarea-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { useCompletarTarea, useDeleteTarea, type TareaWithRelations } from '@/hooks/use-tareas'
import { useAuthStore } from '@/stores/auth-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { ESTADO_TAREA_LABELS } from '@/types/enums'
import type { Tables } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { CheckSquare, Plus, Loader2, Trash2 } from 'lucide-react'

type TareaWithAsignado = Tables<'tareas'> & {
  asignado: Tables<'profiles'> | null
}

interface ExpedienteContext {
  id: string
  numero?: string | null
  numero_expediente?: string | null
  caratula?: string | null
  clientes?: {
    id: string
    nombre: string | null
    apellido: string | null
    dni?: string | null
    cuil?: string | null
  } | null
}

interface TabTareasProps {
  tareas: TareaWithAsignado[]
  expedienteId: string
  expedienteInfo?: ExpedienteContext
}

export function TabTareas({ tareas, expedienteId, expedienteInfo }: TabTareasProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)
  const completarTarea = useCompletarTarea()
  const deleteTarea = useDeleteTarea()
  const profile = useAuthStore((s) => s.profile)

  const openTarea = (tarea: TareaWithAsignado) => {
    setVerTarea({
      ...tarea,
      expediente: expedienteInfo
        ? {
            id: expedienteInfo.id,
            numero: expedienteInfo.numero ?? null,
            numero_expediente: expedienteInfo.numero_expediente ?? null,
            caratula: expedienteInfo.caratula ?? null,
            clientes: expedienteInfo.clientes
              ? { ...expedienteInfo.clientes, clave_arca: null }
              : null,
          }
        : null,
    } as any)
  }

  const isAdmin = profile?.rol === 'ADMIN'

  const canComplete = (estado: string) =>
    estado === 'PENDIENTE' || estado === 'EN_PROGRESO'

  // Use completada_at as indicator of "done" for display purposes
  const isCompletada = (tarea: TareaWithAsignado) =>
    tarea.estado === 'COMPLETADA' || tarea.completada_at !== null

  const visibleTareas = tareas

  return (
    <>
    <Card
      title="Tareas"
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      }
    >
      {visibleTareas.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Sin tareas"
          description="No hay tareas activas para este expediente."
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {visibleTareas.map((tarea) => (
            <div
              key={tarea.id}
              onClick={() => openTarea(tarea)}
              className={cn(
                'group flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3 cursor-pointer hover:bg-white/[0.07] transition-colors',
                isCompletada(tarea) && 'opacity-50'
              )}
            >
              {/* Complete button or status icon */}
              {canComplete(tarea.estado) ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    completarTarea.mutate(tarea.id)
                  }}
                  disabled={completarTarea.isPending}
                  title="Completar tarea"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
                >
                  {completarTarea.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckSquare className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    tarea.estado === 'COMPLETADA'
                      ? 'bg-emerald-500/15'
                      : 'bg-white/5'
                  )}
                >
                  <CheckSquare
                    className={cn(
                      'h-4 w-4',
                      tarea.estado === 'COMPLETADA'
                        ? 'text-emerald-400'
                        : 'text-zinc-600 dark:text-zinc-400'
                    )}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    isCompletada(tarea)
                      ? 'text-zinc-700 dark:text-zinc-300 line-through'
                      : 'text-zinc-900 dark:text-zinc-100'
                  )}
                >
                  {tarea.titulo}
                </p>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  <StatusBadge
                    label={ESTADO_TAREA_LABELS[tarea.estado as keyof typeof ESTADO_TAREA_LABELS] ?? tarea.estado}
                    color={getTareaColor(tarea.estado)}
                  />
                  {tarea.asignado && (
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      {tarea.asignado.nombre} {tarea.asignado.apellido}
                    </span>
                  )}
                  {tarea.fecha_vencimiento && (
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Vence: {formatDate(tarea.fecha_vencimiento)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('¿Eliminar esta tarea permanentemente?')) {
                        deleteTarea.mutate({ tareaId: tarea.id, expedienteId })
                      }
                    }}
                    disabled={deleteTarea.isPending}
                    title="Eliminar tarea"
                    className="rounded p-1.5 text-zinc-600 dark:text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <PrioridadBadge prioridad={tarea.prioridad} compact />
            </div>
          ))}
        </div>
      )}
    </Card>
    <CrearTareaDialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      expedienteId={expedienteId}
    />
    <VerTareaDialog
      open={verTarea !== null}
      onClose={() => setVerTarea(null)}
      tarea={verTarea as any}
    />
    </>
  )
}
