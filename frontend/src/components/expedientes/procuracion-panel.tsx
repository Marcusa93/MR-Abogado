import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronDown, FileText, Loader2, Play, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import {
  useProcuracionConfig, useProcuracionEventos, useSetProcuracion, useProcesarAhora, type ProcuracionEvento,
} from '@/hooks/use-procuracion'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Procuración automática del expediente: interruptor, responsable y registro
// de lo que hizo el procurador con cada actuación nueva del SAE.

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function EventoItem({ ev, onVerEscritos }: { ev: ProcuracionEvento; onVerEscritos?: () => void }) {
  const icono = ev.estado === 'procesado'
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    : ev.estado === 'error'
      ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
      : <MinusCircle className="h-3.5 w-3.5 text-zinc-400" />

  return (
    <li className="flex gap-2.5 py-2.5">
      <span className="mt-0.5 shrink-0">{icono}</span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-zinc-500 dark:text-zinc-400">
          {ev.movimiento ? `${fechaCorta(ev.movimiento.fecha)} · ${ev.movimiento.titulo}` : 'Actuación'}
        </p>
        {ev.estado === 'procesado' ? (
          <>
            <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{ev.accion}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {ev.vencimiento && (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Vence {fechaCorta(ev.vencimiento)}
                  {ev.dias ? ` (${ev.dias} días ${ev.es_habiles ? 'hábiles' : 'corridos'})` : ''}
                </span>
              )}
              {ev.tarea_id && <Link to="/tareas" className="text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">Tarea creada</Link>}
              {ev.escrito_id && (
                <button type="button" onClick={onVerEscritos} className="flex items-center gap-1 text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                  <FileText className="h-3 w-3" /> Ver borrador
                </button>
              )}
              {!ev.escrito_id && ev.escrito_tipo && (
                <span className="text-zinc-500 dark:text-zinc-400">Escrito a preparar: {ev.escrito_tipo}</span>
              )}
            </div>
          </>
        ) : ev.estado === 'error' ? (
          <p className="mt-0.5 text-rose-600 dark:text-rose-400">{ev.error}</p>
        ) : (
          <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{ev.resumen ? `${ev.resumen} ` : ''}<span className="text-zinc-400">Sin acción requerida.</span></p>
        )}
      </div>
    </li>
  )
}

export function ProcuracionPanel({ expedienteId, tieneSae, onVerEscritos }: {
  expedienteId: string
  tieneSae: boolean
  onVerEscritos?: () => void
}) {
  const rol = useAuthStore((s) => s.profile?.rol)
  const puedeEditar = rol === 'DIRECTOR' || rol === 'ADMIN' || rol === 'ABOGADO'
  const { data: config, isLoading } = useProcuracionConfig(expedienteId)
  const activo = !!config?.procuracion_auto
  const { data: eventos = [] } = useProcuracionEventos(expedienteId, activo)
  const { data: equipo = [] } = useTeamMembers()
  const setProcuracion = useSetProcuracion(expedienteId)
  const procesar = useProcesarAhora(expedienteId)
  const [abierto, setAbierto] = useState(false)

  if (isLoading || !config) return null
  if (!activo && !puedeEditar) return null

  const responsableId = config.procuracion_responsable_id ?? config.abogado_responsable_id ?? ''

  const toggle = () => {
    setProcuracion.mutate(
      { procuracion_auto: !activo },
      {
        onSuccess: () => {
          if (!activo) {
            toast.success('Procuración automática activada', 'Revisa las actuaciones nuevas cada hora, de lunes a viernes.')
            setAbierto(true)
          } else {
            toast.info('Procuración automática desactivada')
          }
        },
        onError: (err) => toast.error('No se pudo cambiar', err instanceof Error ? err.message : undefined),
      },
    )
  }

  const procesarAhora = () => {
    procesar.mutate(undefined, {
      onSuccess: (r) => {
        if (r.mensaje) toast.info(r.mensaje)
        else if (r.procesadas === 0) toast.info('No hay actuaciones nuevas para procesar')
        else toast.success(
          `${r.procesadas} ${r.procesadas === 1 ? 'actuación revisada' : 'actuaciones revisadas'}`,
          `${r.con_accion} con acción${r.escritos ? `, ${r.escritos} ${r.escritos === 1 ? 'borrador' : 'borradores'}` : ''}${r.cortado_por_tope ? '. Quedan más: se siguen procesando en la próxima corrida.' : ''}`,
        )
      },
      onError: (err) => toast.error('No se pudo procesar', err instanceof Error ? err.message : undefined),
    })
  }

  const conAccion = eventos.filter((e) => e.estado === 'procesado').length

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3',
      activo ? 'border-violet-500/30 bg-violet-500/[0.04]' : 'border-zinc-200 dark:border-white/10',
    )}>
      <div className="flex flex-wrap items-center gap-3">
        <Bot className={cn('h-4 w-4 shrink-0', activo ? 'text-violet-500' : 'text-zinc-400')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Procuración automática</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {activo
              ? `Cada actuación nueva: plazo, tarea y borrador del escrito para revisar.${conAccion ? ` ${conAccion} ${conAccion === 1 ? 'acción generada' : 'acciones generadas'}.` : ''}`
              : tieneSae
                ? 'Revisa sola las actuaciones nuevas, calcula el plazo, crea la tarea y deja el borrador del escrito. Nada se presenta sin tu revisión.'
                : 'Necesita el número SAE del expediente para traer las actuaciones.'}
          </p>
        </div>

        {activo && (
          <button
            type="button"
            onClick={procesarAhora}
            disabled={procesar.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300"
            title="Sincronizar con el SAE y procesar ya, sin esperar la próxima corrida"
          >
            {procesar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {procesar.isPending ? 'Procesando…' : 'Procesar ahora'}
          </button>
        )}

        {puedeEditar && (
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            onClick={toggle}
            disabled={setProcuracion.isPending || (!activo && !tieneSae)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
              activo ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700',
            )}
            title={activo ? 'Desactivar' : 'Activar'}
          >
            <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', activo ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        )}

        {activo && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-500/10"
            aria-expanded={abierto}
            title={abierto ? 'Ocultar detalle' : 'Ver detalle'}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', abierto && 'rotate-180')} />
          </button>
        )}
      </div>

      {activo && abierto && (
        <div className="mt-3 border-t border-violet-500/15 pt-3">
          {puedeEditar && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              Tareas para:
              <select
                value={responsableId}
                onChange={(e) => setProcuracion.mutate({ procuracion_responsable_id: e.target.value || null })}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {!config.procuracion_responsable_id && !config.abogado_responsable_id && <option value="">Director del estudio</option>}
                {equipo.map((m) => (
                  <option key={m.id} value={m.id}>{m.apellido} {m.nombre}</option>
                ))}
              </select>
            </label>
          )}
          {eventos.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Todavía no procesó actuaciones. Toma las de los últimos 7 días y las que vayan entrando.
            </p>
          ) : (
            <ul className="mt-1 max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-white/5">
              {eventos.map((ev) => <EventoItem key={ev.id} ev={ev} onVerEscritos={onVerEscritos} />)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            Los plazos salen de la tabla de plazos procesales y de la IA: verificalos antes de confiar en la fecha.
          </p>
        </div>
      )}
    </div>
  )
}
