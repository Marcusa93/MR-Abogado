import { useState } from 'react'
import { Card, StatusBadge, getTurnoColor } from './detail-helpers'
import { CrearTurnoDialog } from './crear-turno-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { formatDate } from '@/lib/utils/date-helpers'
import {
  ESTADO_AUDIENCIA_LABELS,
  ESTADO_AUDIENCIA_VALUES,
  type EstadoAudiencia,
} from '@/types/enums'
import { useUpdateTurno, useDeleteTurno } from '@/hooks/use-turnos'
import { toast } from '@/stores/toast-store'
import type { Tables } from '@/types/database.types'
import { CalendarClock, Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'

interface TabTurnosProps {
  audiencias: Tables<'audiencias'>[]
  expedienteId: string
}

export function TabTurnos({ audiencias, expedienteId }: TabTurnosProps) {
  const turnos = audiencias
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <>
    <Card
      title="Audiencias"
      headerRight={
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      }
    >
      {turnos.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin audiencias"
          description="No hay audiencias registradas para este expediente."
          size="sm"
        />
      ) : (
        <div className="space-y-3">
          {[...turnos]
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
            .map((turno) =>
              editingId === turno.id ? (
                <TurnoEditRow
                  key={turno.id}
                  turno={turno}
                  expedienteId={expedienteId}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <TurnoRow
                  key={turno.id}
                  turno={turno}
                  expedienteId={expedienteId}
                  onEdit={() => setEditingId(turno.id)}
                />
              )
            )}
        </div>
      )}
    </Card>
    <CrearTurnoDialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      expedienteId={expedienteId}
    />
    </>
  )
}

// ---------------------------------------------------------------------------
// Read-only row with edit/delete buttons
// ---------------------------------------------------------------------------

function TurnoRow({
  turno,
  expedienteId,
  onEdit,
}: {
  turno: Tables<'audiencias'>
  expedienteId: string
  onEdit: () => void
}) {
  const deleteTurno = useDeleteTurno()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    try {
      await deleteTurno.mutateAsync({ id: turno.id, expediente_id: expedienteId })
      toast.success('Turno eliminado')
    } catch {
      toast.error('Error al eliminar turno')
    }
  }

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-950/40">
        <CalendarClock className="h-4 w-4 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {(turno as any).tipo_audiencia_id ?? 'Audiencia'}
          </p>
          <StatusBadge
            label={ESTADO_AUDIENCIA_LABELS[turno.estado as EstadoAudiencia] ?? turno.estado}
            color={getTurnoColor(turno.estado)}
          />
        </div>
        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
          {formatDate(turno.fecha)}
          {turno.hora && ` a las ${turno.hora}`}
        </p>
        {turno.notas && (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{turno.notas}</p>
        )}
      </div>
      {/* Action buttons — visible on hover */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleteTurno.isPending}
              className="rounded-lg bg-rose-500/20 p-1.5 text-rose-400 hover:bg-rose-500/30"
              title="Confirmar eliminación"
            >
              {deleteTurno.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg bg-white/5 p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="rounded-lg bg-white/5 p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200"
              title="Editar turno"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg bg-white/5 p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-rose-500/20 hover:text-rose-400"
              title="Eliminar turno"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline edit row
// ---------------------------------------------------------------------------

const inputClass =
  'h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'

function TurnoEditRow({
  turno,
  expedienteId,
  onDone,
}: {
  turno: Tables<'audiencias'>
  expedienteId: string
  onDone: () => void
}) {
  const updateTurno = useUpdateTurno()
  const [tipoTurno, setTipoTurno] = useState((turno as any).tipo_audiencia_id ?? '')
  const [estado, setEstado] = useState(turno.estado)
  const [fecha, setFecha] = useState(turno.fecha)
  const [hora, setHora] = useState(turno.hora ?? '')
  const [notas, setNotas] = useState(turno.notas ?? '')

  const handleSave = async () => {
    try {
      await updateTurno.mutateAsync({
        id: turno.id,
        expediente_id: expedienteId,
        tipo_audiencia_id: tipoTurno as any,
        estado: estado as any,
        fecha,
        hora: hora || undefined,
        notas: notas.trim() || null,
      })
      toast.success('Turno actualizado')
      onDone()
    } catch {
      toast.error('Error al actualizar turno')
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Tipo</label>
          <input
            type="text"
            value={tipoTurno}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTipoTurno(e.target.value)}
            placeholder="ID tipo audiencia"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Estado</label>
          <select
            value={estado}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEstado(e.target.value as EstadoAudiencia)}
            className={inputClass}
          >
            {ESTADO_AUDIENCIA_VALUES.map((e) => (
              <option key={e} value={e}>{ESTADO_AUDIENCIA_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Fecha</label>
          <input type="date" value={fecha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFecha(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Hora</label>
          <input type="time" value={hora} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHora(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Notas</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={updateTurno.isPending || !fecha || !tipoTurno}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
        >
          {updateTurno.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Guardar
        </button>
      </div>
    </div>
  )
}
