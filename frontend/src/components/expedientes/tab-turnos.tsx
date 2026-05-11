import { useState, useMemo } from 'react'
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
import { CalendarClock, Plus, Pencil, Trash2, X, Check, Loader2, Video, Sparkles, Paperclip } from 'lucide-react'
import { useSaeMovements, passesAudienciaFilter, hasAudioAttachment, type SaeMovement } from '@/hooks/use-sae'
import { TranscriptionPanel } from './transcription-panel'

interface TabTurnosProps {
  audiencias: Tables<'audiencias'>[]
  expedienteId: string
}

export function TabTurnos({ audiencias, expedienteId }: TabTurnosProps) {
  const turnos = audiencias
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Actuaciones marcadas (manual o auto por audio adjunto) como audiencia
  const { data: movements = [] } = useSaeMovements(expedienteId)
  const audienciasFromActuaciones = useMemo(
    () => movements.filter(passesAudienciaFilter).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [movements],
  )

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
      {/* Audiencias detectadas en actuaciones SAE (manual o por adjunto de audio) */}
      {audienciasFromActuaciones.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-cyan-300/80 font-medium flex items-center gap-1.5">
            <Video className="h-3 w-3" />
            Desde actuaciones SAE
            <span className="text-zinc-500 font-normal normal-case">· {audienciasFromActuaciones.length}</span>
          </p>
          <div className="space-y-2">
            {audienciasFromActuaciones.map((m) => (
              <ActuacionAudienciaRow key={m.id} movement={m} />
            ))}
          </div>
        </div>
      )}

      {turnos.length === 0 && audienciasFromActuaciones.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin audiencias"
          description="No hay audiencias registradas. Podés agendar una con 'Agregar' o marcar una actuación SAE como audiencia (📹 en el tab SAE)."
          size="sm"
        />
      ) : turnos.length === 0 ? (
        <p className="text-[11px] text-zinc-500">No hay audiencias agendadas manualmente. Las de arriba vienen del SAE.</p>
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
        <TranscriptionPanel audienciaId={turno.id} />
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

// ─── Audiencia desde actuación SAE ──────────────────────────────────────────

function ActuacionAudienciaRow({ movement }: { movement: SaeMovement }) {
  const audioOnly = !movement.is_audiencia && hasAudioAttachment(movement)
  const aiSummary = movement.ai_summary?.trim()
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-950/40">
          <Video className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-100 line-clamp-1">{movement.titulo}</p>
            {audioOnly && (
              <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                <Paperclip className="h-2.5 w-2.5" />
                audio adjunto
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{formatDate(movement.fecha)}</p>
          {aiSummary && (
            <p className="mt-2 text-xs text-zinc-300 leading-snug flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 mt-[2px] text-violet-400" />
              <span className="line-clamp-3">{aiSummary}</span>
            </p>
          )}
          <TranscriptionPanel movement={movement} />
        </div>
      </div>
    </div>
  )
}

