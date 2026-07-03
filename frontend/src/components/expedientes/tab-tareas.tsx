import { useState } from 'react'
import { Card, StatusBadge, getTareaColor } from './detail-helpers'
import { CrearTareaDialog } from './crear-tarea-dialog'
import { VerTareaDialog } from './ver-tarea-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { useCompletarTarea, useDeleteTarea, useUpdateTarea, type TareaWithRelations } from '@/hooks/use-tareas'
import { useAuthStore } from '@/stores/auth-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { ESTADO_TAREA_LABELS } from '@/types/enums'
import type { Tables } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { CheckSquare, Plus, Loader2, Trash2, X } from 'lucide-react'
import { toast } from '@/stores/toast-store'

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
  const updateTarea = useUpdateTarea()
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

  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'

  const canComplete = (estado: string) =>
    estado === 'PENDIENTE' || estado === 'EN_PROGRESO'

  const isCompletada = (tarea: TareaWithAsignado) =>
    tarea.estado === 'COMPLETADA' || tarea.completada_at !== null

  const isCancelada = (tarea: TareaWithAsignado) => tarea.estado === 'CANCELADA'

  const handleCancelar = async (e: React.MouseEvent, tareaId: string) => {
    e.stopPropagation()
    try {
      await updateTarea.mutateAsync({ id: tareaId, estado: 'CANCELADA' })
      toast.success('Tarea cancelada')
    } catch {
      toast.error('No se pudo cancelar la tarea')
    }
  }

  // Ordenar: activas primero, canceladas al final
  const sortedTareas = [...tareas].sort((a, b) => {
    const aCanc = isCancelada(a) ? 1 : 0
    const bCanc = isCancelada(b) ? 1 : 0
    return aCanc - bCanc
  })

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
      {sortedTareas.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Sin tareas"
          description="No hay tareas activas para este expediente."
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {sortedTareas.map((tarea) => {
            const cancelada = isCancelada(tarea)
            return (
              <div
                key={tarea.id}
                onClick={() => !cancelada && openTarea(tarea)}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border p-3 transition-colors',
                  cancelada
                    ? 'border-rose-500/20 bg-rose-500/[0.04] cursor-default'
                    : 'border-white/5 bg-white/5 cursor-pointer hover:bg-white/[0.07]',
                  isCompletada(tarea) && !cancelada && 'opacity-50',
                )}
              >
                {/* Complete button / status icon */}
                {canComplete(tarea.estado) && !cancelada ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      completarTarea.mutate(tarea.id)
                    }}
                    disabled={completarTarea.isPending}
                    title="Completar tarea"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
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
                      tarea.estado === 'COMPLETADA' ? 'bg-emerald-500/15' :
                      cancelada ? 'bg-rose-500/15' : 'bg-white/5',
                    )}
                  >
                    <CheckSquare
                      className={cn(
                        'h-4 w-4',
                        tarea.estado === 'COMPLETADA' ? 'text-emerald-400' :
                        cancelada ? 'text-rose-400' : 'text-zinc-600 dark:text-zinc-300',
                      )}
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      cancelada
                        ? 'line-through text-rose-400/70'
                        : isCompletada(tarea)
                          ? 'text-zinc-700 dark:text-zinc-300 line-through'
                          : 'text-zinc-900 dark:text-zinc-100',
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
                      <span className={cn('text-[11px]', cancelada ? 'text-rose-400/50' : 'text-zinc-600 dark:text-zinc-300')}>
                        {tarea.asignado.nombre} {tarea.asignado.apellido}
                      </span>
                    )}
                    {tarea.fecha_vencimiento && (
                      <span className={cn('text-[11px]', cancelada ? 'text-rose-400/50' : 'text-zinc-600 dark:text-zinc-300')}>
                        Vence: {formatDate(tarea.fecha_vencimiento)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Cancelar — visible para todos en tareas no canceladas */}
                  {!cancelada && (
                    <button
                      onClick={(e) => handleCancelar(e, tarea.id)}
                      disabled={updateTarea.isPending}
                      title="Cancelar tarea"
                      className="rounded p-1.5 text-zinc-600 dark:text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Eliminar permanente — solo admin/director */}
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('¿Eliminar esta tarea permanentemente?')) {
                          deleteTarea.mutate({ tareaId: tarea.id, expedienteId })
                        }
                      }}
                      disabled={deleteTarea.isPending}
                      title="Eliminar permanentemente"
                      className="rounded p-1.5 text-zinc-600 dark:text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <PrioridadBadge prioridad={tarea.prioridad} compact />
              </div>
            )
          })}
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
