import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTareas, useCompletarTarea, expedienteLabel, type TareaWithRelations } from '@/hooks/use-tareas'
import { useTelegramVinculo, useVincularTelegram, useDesvincularTelegram } from '@/hooks/use-telegram-vinculo'
import { VerTareaDialog } from '@/components/expedientes/ver-tarea-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardList, Clock, FolderOpen, Loader2, MessageSquare, Send } from 'lucide-react'

// "Lo que tenés que hacer": tareas asignadas, arriba de todo en Mi Trabajo.
// Orden: vencidas y con fecha más próxima primero, después por prioridad.

const PRIO_RANK: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

const PRIO_BADGE: Record<string, string> = {
  URGENTE: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  ALTA: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  MEDIA: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  BAJA: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
}

const PRIO_LABEL: Record<string, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - hoy.getTime()) / 86_400_000)
}

function vencimiento(fecha: string | null): { text: string; className: string } | null {
  const dias = diasHasta(fecha)
  if (dias === null) return null
  if (dias < 0) return { text: `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`, className: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias === 0) return { text: 'Vence hoy', className: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias === 1) return { text: 'Vence mañana', className: 'text-amber-600 dark:text-amber-400 font-medium' }
  const label = new Date(`${fecha!.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' })
  return { text: `Vence ${label}`, className: dias <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400' }
}

function ordenar(a: TareaWithRelations, b: TareaWithRelations): number {
  const fa = a.fecha_vencimiento ?? '9999-12-31'
  const fb = b.fecha_vencimiento ?? '9999-12-31'
  if (fa !== fb) return fa < fb ? -1 : 1
  const pa = PRIO_RANK[a.prioridad] ?? 2
  const pb = PRIO_RANK[b.prioridad] ?? 2
  if (pa !== pb) return pa - pb
  return a.created_at < b.created_at ? -1 : 1
}

function TareaItem({ tarea, onOpen }: { tarea: TareaWithRelations; onOpen: (t: TareaWithRelations) => void }) {
  const completar = useCompletarTarea()
  const venc = vencimiento(tarea.fecha_vencimiento)
  const expLabel = tarea.expediente ? expedienteLabel(tarea.expediente) : ''
  const consultaLabel = tarea.consulta ? `${tarea.consulta.apellido ?? ''} ${tarea.consulta.nombre ?? ''}`.trim() : ''

  return (
    <div
      onClick={() => onOpen(tarea)}
      className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tarea.titulo}</p>
        {tarea.descripcion && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{tarea.descripcion}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          <span className={cn('rounded px-1.5 py-0.5 font-semibold', PRIO_BADGE[tarea.prioridad] ?? PRIO_BADGE.MEDIA)}>
            {PRIO_LABEL[tarea.prioridad] ?? 'Media'}
          </span>
          {venc && (
            <span className={cn('flex items-center gap-1', venc.className)}>
              {(diasHasta(tarea.fecha_vencimiento) ?? 1) <= 0 ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {venc.text}
            </span>
          )}
          {tarea.expediente && (
            <Link
              to={`/expedientes/${tarea.expediente.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex max-w-[260px] items-center gap-1 text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]"
              title={expLabel}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">{expLabel || 'Expediente'}</span>
            </Link>
          )}
          {!tarea.expediente && tarea.consulta && (
            <Link
              to={`/consultas/${tarea.consulta.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex max-w-[260px] items-center gap-1 text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]"
            >
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="truncate">Consulta {consultaLabel}</span>
            </Link>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); completar.mutate(tarea.id) }}
        disabled={completar.isPending}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
        title="Marcar como hecha"
      >
        {completar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Hecho
      </button>
    </div>
  )
}

function TelegramVinculo({ profileId }: { profileId: string }) {
  const { vinculado, isLoading, esperando, setEsperando } = useTelegramVinculo(profileId)
  const vincular = useVincularTelegram()
  const desvincular = useDesvincularTelegram(profileId)

  if (isLoading) return null

  if (vinculado) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Send className="h-3 w-3" />
        Te avisamos por Telegram.
        <button
          type="button"
          onClick={() => desvincular.mutate()}
          disabled={desvincular.isPending}
          className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Desvincular
        </button>
      </p>
    )
  }

  const handleVincular = () => {
    // La ventana se abre antes del await para que el navegador no la bloquee.
    const ventana = window.open('', '_blank')
    vincular.mutate(undefined, {
      onSuccess: (url) => {
        if (ventana) ventana.location.href = url
        else window.location.href = url
        setEsperando(true)
      },
      onError: (err) => {
        ventana?.close()
        toast.error('No se pudo generar el enlace', err instanceof Error ? err.message : undefined)
      },
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2">
      <Send className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      <p className="flex-1 text-xs text-zinc-700 dark:text-zinc-300">
        {esperando
          ? 'En Telegram tocá "Iniciar". Esta pantalla se actualiza sola.'
          : 'Recibí tus tareas en Telegram: un aviso cuando te asignan algo y tus pendientes cada mañana.'}
      </p>
      <button
        type="button"
        onClick={handleVincular}
        disabled={vincular.isPending}
        className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {vincular.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {esperando ? 'Abrir de nuevo' : 'Vincular Telegram'}
      </button>
    </div>
  )
}

export function TareasAsignadasPanel({
  profileId,
  isSelf,
  nombre,
}: {
  profileId: string
  isSelf: boolean
  nombre?: string
}) {
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)
  const { data, isLoading } = useTareas({
    asignado_a: profileId,
    pageSize: 50,
    sortBy: 'fecha_vencimiento',
    sortOrder: 'asc',
  })

  const pendientes = (data?.data ?? [])
    .filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')
    .sort(ordenar)
  const vencidas = pendientes.filter((t) => (diasHasta(t.fecha_vencimiento) ?? 1) < 0).length
  const titulo = isSelf ? 'Lo que tenés que hacer' : `Tareas de ${nombre ?? 'este usuario'}`

  return (
    <div className="dashboard-panel overflow-hidden rounded-[1.5rem]">
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(87_124_142_/_14%)] px-5 py-4 dark:border-white/8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{titulo}</h2>
            {!isLoading && (
              <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                {pendientes.length}
              </span>
            )}
            {vencidas > 0 && (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {vencidas} vencida{vencidas > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/tareas?asignado_a=${profileId}`}
          className="dashboard-link inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />)}
        </div>
      ) : pendientes.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {isSelf ? 'No tenés tareas asignadas. Cuando te asignen una, aparece acá.' : 'Sin tareas pendientes.'}
          </p>
        </div>
      ) : (
        <div className="max-h-[420px] divide-y divide-[rgb(87_124_142_/_10%)] overflow-y-auto dark:divide-white/6">
          {pendientes.map((t) => <TareaItem key={t.id} tarea={t} onOpen={setVerTarea} />)}
        </div>
      )}

      {isSelf && (
        <div className="border-t border-[rgb(87_124_142_/_10%)] px-4 py-3 dark:border-white/6">
          <TelegramVinculo profileId={profileId} />
        </div>
      )}

      <VerTareaDialog
        open={verTarea !== null}
        onClose={() => setVerTarea(null)}
        tarea={verTarea as never}
      />
    </div>
  )
}
