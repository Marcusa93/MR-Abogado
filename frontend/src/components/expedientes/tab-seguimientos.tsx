import { useState } from 'react'
import { Card, CanalIcon } from './detail-helpers'
import { CrearSeguimientoDialog } from './crear-seguimiento-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { formatDate, timeAgo } from '@/lib/utils/date-helpers'
import { CANAL_SEGUIMIENTO_LABELS } from '@/types/enums'
import type { Tables } from '@/types/database.types'
import { MessageSquare, Plus } from 'lucide-react'

interface TabSeguimientosProps {
  seguimientos: Tables<'seguimientos'>[]
  expedienteId: string
  clienteTelefono?: string | null
  clienteTelefonoAlt?: string | null
  clienteNombre?: string | null
  caratula?: string | null
}

export function TabSeguimientos({ seguimientos, expedienteId, clienteTelefono, clienteTelefonoAlt, clienteNombre, caratula }: TabSeguimientosProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
    <Card
      title="Seguimientos"
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
      {seguimientos.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Sin seguimientos"
          description="No se registraron seguimientos para este expediente."
          size="sm"
        />
      ) : (
        <div className="space-y-3">
          {[...seguimientos]
            .sort((a, b) => new Date(b.fecha_control).getTime() - new Date(a.fecha_control).getTime())
            .map((seg) => (
              <div
                key={seg.id}
                className="rounded-lg border border-white/5 bg-white/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CanalIcon canal={seg.canal} />
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {CANAL_SEGUIMIENTO_LABELS[seg.canal as keyof typeof CANAL_SEGUIMIENTO_LABELS] ?? seg.canal}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{formatDate(seg.fecha_control)}</p>
                    <p className="text-[10px] text-zinc-700 dark:text-zinc-300">{timeAgo(seg.fecha_control)}</p>
                  </div>
                </div>
                {seg.estado_organismo_reportado && (
                  <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {seg.estado_organismo_reportado}
                  </p>
                )}
                {seg.observacion && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 italic">{seg.observacion}</p>
                )}
                {seg.proxima_fecha_control && (
                  <p className="mt-2 text-xs text-amber-400">
                    Próximo seguimiento: {formatDate(seg.proxima_fecha_control)}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}
    </Card>
    <CrearSeguimientoDialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      expedienteId={expedienteId}
      clienteTelefono={clienteTelefono}
      clienteTelefonoAlt={clienteTelefonoAlt}
      clienteNombre={clienteNombre}
      caratula={caratula}
    />
    </>
  )
}
