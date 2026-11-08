import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useExpedientes, useCambiarEstado, type ExpedientesFilters, type ExpedienteWithRelations } from '@/hooks/use-expedientes'
import { useExpedientesSalud, type SaludExpediente } from '@/hooks/use-expediente-salud'
import { SALUD_STYLE, SaludDot, SaludMotivo } from './salud-indicador'
import { ESTADO_INTERNO_LABELS, VALID_ESTADO_TRANSITIONS, type EstadoInterno } from '@/types/enums'
import { toast } from '@/stores/toast-store'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Columnas del tablero. Apelación agrupa también los expedientes en la Corte.
const COLUMNAS: { id: string; label: string; estados: EstadoInterno[]; destino: EstadoInterno }[] = [
  { id: 'consulta',  label: 'Consulta',     estados: ['NUEVA_CONSULTA'], destino: 'NUEVA_CONSULTA' },
  { id: 'iniciar',   label: 'Para iniciar', estados: ['PARA_INICIAR'],   destino: 'PARA_INICIAR' },
  { id: 'iniciado',  label: 'Iniciado',     estados: ['INICIADO'],       destino: 'INICIADO' },
  { id: 'prueba',    label: 'Prueba',       estados: ['PRUEBA'],         destino: 'PRUEBA' },
  { id: 'alegatos',  label: 'Alegatos',     estados: ['ALEGATOS'],       destino: 'ALEGATOS' },
  { id: 'sentencia', label: 'Sentencia',    estados: ['SENTENCIA'],      destino: 'SENTENCIA' },
  { id: 'apelacion', label: 'Apelación y Corte', estados: ['APELACION', 'CORTE'], destino: 'APELACION' },
]
const EN_TABLERO = new Set(COLUMNAS.flatMap((c) => c.estados))
const PESO: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, gris: 3 }

function puedePasar(desde: EstadoInterno, hacia: EstadoInterno) {
  if (desde === hacia) return false
  const ok = VALID_ESTADO_TRANSITIONS[desde]
  return !ok || ok.includes(hacia)
}

function Tarjeta({ exp, salud, arrastrando }: { exp: ExpedienteWithRelations; salud?: SaludExpediente; arrastrando?: boolean }) {
  const cliente = exp.clientes
  const resp = exp.abogado_responsable
  const titulo = exp.caratula || `${cliente?.apellido ?? ''} ${cliente?.nombre ?? ''}`.trim() || (exp as any).numero || 'Sin carátula'
  const dias = salud?.dias_sin_movimiento
  return (
    <div
      className={cn(
        'rounded-lg border border-l-[3px] border-zinc-200 bg-white px-3 py-2 text-left shadow-sm dark:border-white/10 dark:bg-zinc-900',
        salud ? SALUD_STYLE[salud.semaforo].borde : 'border-l-zinc-200',
        arrastrando && 'rotate-1 shadow-lg ring-2 ring-[var(--brand-navy)]/30',
      )}
    >
      <div className="flex items-start gap-2">
        <SaludDot salud={salud} className="mt-1" />
        <p className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">{titulo}</p>
      </div>
      <SaludMotivo salud={salud} className="mt-1 pl-[18px]" />
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-[18px] text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className={cn('truncate', !resp && 'text-amber-600 dark:text-amber-400')}>
          {resp ? `${resp.nombre?.[0] ?? ''}. ${resp.apellido ?? ''}` : 'Sin responsable'}
        </span>
        {dias != null && (
          <span className={cn('shrink-0', dias >= 120 ? 'text-rose-600 dark:text-rose-400' : dias >= 60 ? 'text-amber-600 dark:text-amber-400' : '')} title="Días desde el último movimiento del SAE">
            {dias === 0 ? 'mov. hoy' : `${dias} d`}
          </span>
        )}
      </div>
    </div>
  )
}

function TarjetaArrastrable({ exp, salud }: { exp: ExpedienteWithRelations; salud?: SaludExpediente }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: exp.id, data: { estado: exp.estado_interno } })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/expedientes/${exp.id}`)}
      className={cn('cursor-pointer touch-manipulation', isDragging && 'opacity-30')}
    >
      <Tarjeta exp={exp} salud={salud} />
    </div>
  )
}

function Columna({ col, items, salud, valida }: {
  col: (typeof COLUMNAS)[number]; items: ExpedienteWithRelations[]; salud?: Map<string, SaludExpediente>; valida: boolean | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })
  const rojos = items.filter((e) => salud?.get(e.id)?.semaforo === 'rojo').length
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[272px] shrink-0 snap-start flex-col rounded-xl border bg-zinc-50/80 transition-colors dark:bg-white/[0.03]',
        isOver && valida ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)]/5 dark:border-cyan-400/60' : 'border-zinc-200 dark:border-white/10',
        valida === false && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{col.label}</h3>
        <div className="flex items-center gap-1.5 text-xs">
          {rojos > 0 && <span className="rounded-full bg-rose-500/15 px-1.5 font-medium text-rose-700 dark:text-rose-300" title="Urgentes">{rojos}</span>}
          <span className="rounded-full bg-zinc-200/70 px-1.5 font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{items.length}</span>
        </div>
      </div>
      <div className="flex max-h-[calc(100vh-330px)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {items.length === 0
          ? <p className="px-1 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">Sin expedientes</p>
          : items.map((e) => <TarjetaArrastrable key={e.id} exp={e} salud={salud?.get(e.id)} />)}
      </div>
    </div>
  )
}

export function TableroEtapas({ filters }: { filters: ExpedientesFilters }) {
  const { data, isLoading } = useExpedientes({ ...filters, estado_interno: null, page: 1, pageSize: 1000, sortBy: 'caratula', sortOrder: 'asc' })
  const { data: salud } = useExpedientesSalud(null)
  const cambiarEstado = useCambiarEstado()
  const [arrastrado, setArrastrado] = useState<ExpedienteWithRelations | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )

  const { porColumna, fuera } = useMemo(() => {
    const lista = (data?.data ?? []) as ExpedienteWithRelations[]
    const porColumna = new Map<string, ExpedienteWithRelations[]>(COLUMNAS.map((c) => [c.id, []]))
    let fuera = 0
    for (const e of lista) {
      const col = COLUMNAS.find((c) => c.estados.includes(e.estado_interno as EstadoInterno))
      if (!col || !EN_TABLERO.has(e.estado_interno as EstadoInterno)) { fuera++; continue }
      porColumna.get(col.id)!.push(e)
    }
    for (const items of porColumna.values()) {
      items.sort((a, b) => {
        const sa = salud?.get(a.id), sb = salud?.get(b.id)
        const p = (PESO[sa?.semaforo ?? 'gris'] ?? 3) - (PESO[sb?.semaforo ?? 'gris'] ?? 3)
        return p !== 0 ? p : (sb?.dias_sin_movimiento ?? -1) - (sa?.dias_sin_movimiento ?? -1)
      })
    }
    return { porColumna, fuera }
  }, [data, salud])

  const onDragStart = (e: DragStartEvent) => {
    setArrastrado(((data?.data ?? []) as ExpedienteWithRelations[]).find((x) => x.id === e.active.id) ?? null)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const exp = arrastrado
    setArrastrado(null)
    if (!exp || !e.over) return
    const col = COLUMNAS.find((c) => c.id === e.over!.id)
    if (!col || col.estados.includes(exp.estado_interno as EstadoInterno)) return
    const desde = exp.estado_interno as EstadoInterno
    if (!puedePasar(desde, col.destino)) {
      toast.error(`No se puede pasar de ${ESTADO_INTERNO_LABELS[desde]} a ${ESTADO_INTERNO_LABELS[col.destino]} directamente`)
      return
    }
    try {
      await cambiarEstado.mutateAsync({ expediente_id: exp.id, nuevo_estado: col.destino, motivo: 'Movido en el tablero por etapa' })
      toast.success(`${exp.caratula ?? 'Expediente'} → ${ESTADO_INTERNO_LABELS[col.destino]}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la etapa')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Arrastrá una tarjeta para cambiar la etapa (en el celular, mantenela apretada). Arriba va lo urgente; a la derecha, los días sin movimiento en el SAE.
        {fuera > 0 && ` ${fuera} finalizados, pausados o rechazados no se muestran.`}
      </p>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setArrastrado(null)}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
          {COLUMNAS.map((col) => (
            <Columna
              key={col.id}
              col={col}
              items={porColumna.get(col.id) ?? []}
              salud={salud}
              valida={arrastrado ? (col.estados.includes(arrastrado.estado_interno as EstadoInterno) ? null : puedePasar(arrastrado.estado_interno as EstadoInterno, col.destino)) : null}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {arrastrado && <div className="w-[256px]"><Tarjeta exp={arrastrado} salud={salud?.get(arrastrado.id)} arrastrando /></div>}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
