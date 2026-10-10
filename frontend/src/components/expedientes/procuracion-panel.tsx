import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronDown, FileText, Loader2, Play, AlertTriangle, CheckCircle2, MinusCircle, PenLine, ThumbsUp, ThumbsDown } from 'lucide-react'
import {
  useProcuracionConfig, useProcuracionEventos, useSetProcuracion, useProcesarAhora, useRedactarPropuesta,
  useDiligencias, useSetEstadoDiligencia, useFeedbackEvento,
  type ProcuracionEvento, type Diligencia, type EstadoDiligencia,
} from '@/hooks/use-procuracion'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Procuración automática del expediente: interruptor, responsable, registro de
// lo que hizo con cada actuación y seguimiento de las diligencias de prueba.
// El procurador PROPONE escritos; recién se redactan al tocar "Redactar borrador".

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const hoy = () => new Date().toISOString().slice(0, 10)

function RedactarBoton({ expedienteId, propuesta, label, onListo }: {
  expedienteId: string
  propuesta: { evento_id: string } | { diligencia_id: string }
  label: string
  onListo?: () => void
}) {
  const redactar = useRedactarPropuesta(expedienteId)
  return (
    <button
      type="button"
      disabled={redactar.isPending}
      onClick={() => redactar.mutate(propuesta, {
        onSuccess: (r) => {
          toast.success(r.ya_existia ? 'Ya estaba redactado' : 'Borrador listo', `"${r.titulo}" en la solapa Escritos.`)
          onListo?.()
        },
        onError: (err) => toast.error('No se pudo redactar', err instanceof Error ? err.message : undefined),
      })}
      className="flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-0.5 font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300"
      title="Redactar el borrador ahora (usa IA). No se presenta: queda para revisar y firmar."
    >
      {redactar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
      {redactar.isPending ? 'Redactando…' : label}
    </button>
  )
}

/** "Correcto" / "Corregir": las correcciones se le pasan al procurador como ejemplos. */
function FeedbackEvento({ ev, expedienteId }: { ev: ProcuracionEvento; expedienteId: string }) {
  const feedback = useFeedbackEvento(expedienteId)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [nota, setNota] = useState('')

  if (ev.feedback === 'correcto') return <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Marcado como correcto.</p>
  if (ev.feedback === 'incorrecto') {
    return <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">Corrección registrada: {ev.feedback_nota}</p>
  }

  const enviar = (correcto: boolean) => feedback.mutate(
    { eventoId: ev.id, correcto, nota: correcto ? undefined : nota },
    {
      onSuccess: () => {
        if (!correcto) toast.success('Corrección guardada', 'El procurador la va a tener en cuenta en las próximas actuaciones.')
        setCorrigiendo(false)
      },
      onError: (err) => toast.error('No se pudo guardar', err instanceof Error ? err.message : undefined),
    },
  )

  if (corrigiendo) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <textarea
          autoFocus
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Qué estaba mal y qué correspondía. Ej: era apertura a producción, no a ofrecimiento; correspondía diligenciar los oficios propios."
          className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"
        />
        <div className="flex gap-2">
          <button type="button" disabled={!nota.trim() || feedback.isPending} onClick={() => enviar(false)}
            className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {feedback.isPending ? 'Guardando…' : 'Guardar corrección'}
          </button>
          <button type="button" onClick={() => setCorrigiendo(false)} className="text-[11px] text-zinc-500 hover:underline">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400">
      <button type="button" disabled={feedback.isPending} onClick={() => enviar(true)} className="flex items-center gap-1 hover:text-emerald-600" title="La decisión fue correcta">
        <ThumbsUp className="h-3 w-3" /> Correcto
      </button>
      <button type="button" onClick={() => setCorrigiendo(true)} className="flex items-center gap-1 hover:text-violet-600" title="Corregir: el procurador aprende de esto">
        <ThumbsDown className="h-3 w-3" /> Corregir
      </button>
    </div>
  )
}

function EventoItem({ ev, expedienteId, onVerEscritos }: {
  ev: ProcuracionEvento
  expedienteId: string
  onVerEscritos?: () => void
}) {
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
                <span className={cn('font-medium', ev.vencimiento < hoy() ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400')}>
                  {ev.vencimiento < hoy() ? 'Venció' : 'Vence'} {fechaCorta(ev.vencimiento)}
                  {ev.dias ? ` (${ev.dias} días ${ev.es_habiles ? 'hábiles' : 'corridos'})` : ''}
                </span>
              )}
              {ev.vencimiento && ev.base_plazo && (
                <span
                  className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                    ev.base_plazo === 'casillero' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}
                  title={ev.base_plazo === 'casillero'
                    ? `Contado desde el depósito en casillero del ${fechaCorta(ev.fecha_notificacion)}`
                    : 'No se encontró la notificación en el casillero: estimado desde la fecha de la actuación. Se recalcula solo si la notificación aparece.'}
                >
                  {ev.base_plazo === 'casillero' ? `Desde casillero ${fechaCorta(ev.fecha_notificacion)}` : 'Estimado'}
                </span>
              )}
              {ev.tarea_id && <Link to="/tareas" className="text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">Tarea creada</Link>}
              {ev.escrito_id ? (
                <button type="button" onClick={onVerEscritos} className="flex items-center gap-1 text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                  <FileText className="h-3 w-3" /> Ver borrador
                </button>
              ) : ev.escrito_tipo ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-600 dark:text-zinc-300" title={ev.escrito_instrucciones ?? undefined}>
                    Propone: {ev.escrito_tipo}
                  </span>
                  <RedactarBoton expedienteId={expedienteId} propuesta={{ evento_id: ev.id }} label="Redactar borrador" />
                </span>
              ) : null}
            </div>
            <FeedbackEvento ev={ev} expedienteId={expedienteId} />
          </>
        ) : ev.estado === 'error' ? (
          <p className="mt-0.5 text-rose-600 dark:text-rose-400">{ev.error}</p>
        ) : (
          <>
            <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{ev.resumen ? `${ev.resumen} ` : ''}<span className="text-zinc-400">Sin acción requerida.</span></p>
            {ev.resumen !== 'Mero trámite del portal' && <FeedbackEvento ev={ev} expedienteId={expedienteId} />}
          </>
        )}
      </div>
    </li>
  )
}

const TIPO_LABEL: Record<Diligencia['tipo'], [string, string]> = {
  oficio: ['Oficio', 'Oficios'],
  testigo: ['Testigo', 'Testigos'],
  pericia: ['Pericia', 'Pericias'],
  cedula: ['Cédula', 'Cédulas'],
  mandamiento: ['Mandamiento', 'Mandamientos'],
  otro: ['Otra', 'Otras'],
}

const ESTADO_LABEL: Record<EstadoDiligencia, string> = {
  ordenado: 'Ordenado',
  confeccionado: 'Confeccionado',
  enviado: 'Enviado',
  contestado: 'Contestado',
  notificado: 'Notificado',
  diligenciado: 'Diligenciado',
  fracasado: 'Fracasado',
  reiterado: 'Reiterado',
  desistido: 'Desistido',
}

const CUMPLIDO: EstadoDiligencia[] = ['contestado', 'diligenciado', 'notificado']
const CERRADO: EstadoDiligencia[] = ['contestado', 'diligenciado', 'desistido', 'fracasado']

function Diligencias({ expedienteId, puedeEditar }: { expedienteId: string; puedeEditar: boolean }) {
  const { data: diligencias = [] } = useDiligencias(expedienteId, true)
  const setEstado = useSetEstadoDiligencia(expedienteId)
  if (diligencias.length === 0) return null

  // Resumen por tipo: "Oficios: 3 de 4 contestados"
  const porTipo = new Map<Diligencia['tipo'], Diligencia[]>()
  for (const d of diligencias) porTipo.set(d.tipo, [...(porTipo.get(d.tipo) ?? []), d])

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Diligencias de prueba</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {[...porTipo.entries()].map(([tipo, lista]) => {
          const vivas = lista.filter((d) => d.estado !== 'desistido')
          const cumplidas = vivas.filter((d) => CUMPLIDO.includes(d.estado)).length
          const completo = vivas.length > 0 && cumplidas === vivas.length
          return (
            <span key={tipo} className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              completo ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}>
              {TIPO_LABEL[tipo][1]}: {cumplidas} de {vivas.length} {tipo === 'testigo' ? 'notificados' : 'cumplidos'}
            </span>
          )
        })}
      </div>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/5">
        {diligencias.map((d) => {
          const vencida = d.estado === 'enviado' && !!d.vence_respuesta && d.vence_respuesta < hoy()
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
              <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-200">
                {TIPO_LABEL[d.tipo][0]} a <span className="font-medium">{d.destinatario}</span>
                {d.a_pedido !== 'nuestra' && <span className="text-zinc-400"> · a pedido de {d.a_pedido === 'contraria' ? 'la contraria' : 'el juzgado'}</span>}
              </span>
              {d.fecha_audiencia && <span className="text-zinc-500">Audiencia {fechaCorta(d.fecha_audiencia)}</span>}
              {d.estado === 'enviado' && d.vence_respuesta && (
                <span className={cn(vencida ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-zinc-500')}
                  title={d.plazo_es_control ? 'El oficio no fijaba plazo: es una fecha de control, no un plazo legal.' : undefined}>
                  {vencida ? 'Venció' : 'Vence'} {d.plazo_es_control ? 'control ' : ''}{fechaCorta(d.vence_respuesta)}
                </span>
              )}
              {d.tarea_reiteracion_id && !d.reiteracion_escrito_id && (
                <RedactarBoton expedienteId={expedienteId} propuesta={{ diligencia_id: d.id }} label="Redactar reiteración" />
              )}
              {puedeEditar ? (
                <select
                  value={d.estado}
                  onChange={(e) => setEstado.mutate(
                    { id: d.id, estado: e.target.value as EstadoDiligencia },
                    { onError: () => toast.error('No se pudo cambiar el estado') },
                  )}
                  className={cn(
                    'rounded-md border px-1.5 py-0.5 text-[11px]',
                    CERRADO.includes(d.estado)
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                      : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200',
                  )}
                  title="Corregir el estado a mano"
                >
                  {(Object.keys(ESTADO_LABEL) as EstadoDiligencia[]).map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
              ) : (
                <span className="text-zinc-500">{ESTADO_LABEL[d.estado]}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
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
  const propuestasPendientes = eventos.filter((e) => e.escrito_tipo && !e.escrito_id).length

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
        else if (r.procesadas === 0 && r.con_accion === 0) toast.info('No hay actuaciones nuevas para procesar')
        else toast.success(
          `${r.procesadas} ${r.procesadas === 1 ? 'actuación revisada' : 'actuaciones revisadas'}`,
          `${r.con_accion} con acción${r.propuestas ? `, ${r.propuestas} ${r.propuestas === 1 ? 'escrito propuesto' : 'escritos propuestos'}` : ''}${r.cortado_por_tope ? '. Quedan más: se siguen procesando en la próxima corrida.' : ''}`,
        )
        setAbierto(true)
      },
      onError: (err) => toast.error('No se pudo procesar', err instanceof Error ? err.message : undefined),
    })
  }

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3',
      activo ? 'border-violet-500/30 bg-violet-500/[0.04]' : 'border-zinc-200 dark:border-white/10',
    )}>
      <div className="flex flex-wrap items-center gap-3">
        <Bot className={cn('h-4 w-4 shrink-0', activo ? 'text-violet-500' : 'text-zinc-400')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Procuración automática
            {propuestasPendientes > 0 && (
              <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                {propuestasPendientes} {propuestasPendientes === 1 ? 'escrito propuesto' : 'escritos propuestos'}
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {activo
              ? 'Cada actuación nueva: plazo, tarea y seguimiento de oficios y testigos. Los escritos los propone; se redactan solo si los aprobás.'
              : tieneSae
                ? 'Revisa sola las actuaciones nuevas, calcula plazos, crea tareas y controla oficios y testigos. Propone escritos, pero no redacta ni presenta nada sin tu aprobación.'
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

          <Diligencias expedienteId={expedienteId} puedeEditar={puedeEditar} />

          <p className="mt-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Actuaciones revisadas</p>
          {eventos.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Todavía no procesó actuaciones. Toma las de los últimos 15 días y las que vayan entrando.
            </p>
          ) : (
            <ul className="mt-1 max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-white/5">
              {eventos.map((ev) => <EventoItem key={ev.id} ev={ev} expedienteId={expedienteId} onVerEscritos={onVerEscritos} />)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            Los plazos salen de la tabla de plazos procesales y de la IA: verificalos antes de confiar en la fecha.
            Las fechas "de control" de los oficios no son plazos legales.
          </p>
        </div>
      )}
    </div>
  )
}
