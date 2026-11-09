import { useEffect, useRef, useState } from 'react'
import {
  Sparkles, Plus, Loader2, Pencil, Mic, Square, X, ChevronDown, ChevronUp, MoreHorizontal, HelpCircle, Check, RefreshCw, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import {
  useFicha, usePropuestasFicha, useArmarFicha, useDictarFicha, useGuardarFicha,
} from '@/hooks/use-ficha'
import {
  conteoPrueba, siguienteEstado, ETIQUETA_ESTADO, ETIQUETA_CAMPO, fichaVacia,
  type CampoTexto, type EstadoPrueba, type Ficha,
} from '@/lib/expedientes/ficha'
import { RevisarPropuestaFicha } from './revisar-propuesta-ficha'

// Ficha del caso: de qué trata el expediente y en qué está, en una sola tarjeta.
// La IA la arma desde el SAE y la mantiene al día con propuestas que el abogado
// acepta o descarta. Todo se puede corregir a mano tocando el texto.

const COLOR_ESTADO: Record<EstadoPrueba, string> = {
  pendiente: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ofrecida: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
  producida: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  desistida: 'bg-zinc-500/10 text-zinc-400 line-through',
}
const ORDEN_ESTADO: Record<EstadoPrueba, number> = { pendiente: 0, ofrecida: 1, producida: 2, desistida: 3 }

const boton = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50'
const botonSecundario = cn(boton, 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10')
const botonPrimario = cn(boton, 'bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900')

export function FichaCaso({ expedienteId, etapa, tieneSae }: { expedienteId: string; etapa: string | null; tieneSae: boolean }) {
  const { data: ficha, isLoading } = useFicha(expedienteId)
  const { data: propuestas = [] } = usePropuestasFicha(expedienteId)
  const armar = useArmarFicha(expedienteId)
  const guardar = useGuardarFicha(expedienteId)
  const [revisando, setRevisando] = useState(false)
  const [agregando, setAgregando] = useState<{ pregunta?: string } | null>(null)
  const [menu, setMenu] = useState(false)

  const armarConIa = () => armar.mutate(undefined, {
    onSuccess: () => toast.success('Ficha armada', 'Leela y corregí lo que haga falta.'),
    onError: (e) => toast.error('No se pudo armar la ficha', e.message),
  })

  if (isLoading) return <div className="app-card h-28 animate-pulse" />

  // ── Sin ficha ────────────────────────────────────────────────────────────
  if (!ficha) {
    return (
      <section className="app-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ficha del caso</h2>
        {armar.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            {tieneSae ? 'Leyendo los movimientos del SAE…' : 'Leyendo los escritos y las notas…'} Tarda alrededor de un minuto.
          </p>
        ) : (
          <>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              De qué trata el caso, qué se demandó, qué contestaron, la prueba y lo resuelto, en un solo lugar.
              {tieneSae && ' Después se mantiene al día con cada novedad del SAE.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={armarConIa} className={botonPrimario}>
                <Sparkles className="h-4 w-4" /> {tieneSae ? 'Armarla con IA desde el SAE' : 'Armarla con IA'}
              </button>
              <button type="button" className={botonSecundario}
                onClick={() => guardar.mutate({ ...soloDatos(fichaVacia(expedienteId)) }, { onError: (e) => toast.error('No se pudo crear', e.message) })}>
                Escribirla yo
              </button>
            </div>
          </>
        )}
        {propuestas.length > 0 && <BannerPropuestas n={propuestas.length} onRevisar={() => setRevisando(true)} />}
        {revisando && <RevisarPropuestaFicha expedienteId={expedienteId} ficha={null} propuestas={propuestas} onCerrar={() => setRevisando(false)} />}
      </section>
    )
  }

  const pendientesCompletar = Object.entries(ficha.completar ?? {}).filter(([, v]) => v) as [CampoTexto, string][]

  return (
    <section className="app-card">
      {/* Encabezado */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-white/5">
        <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ficha del caso</h2>
          {etapa && <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">{etapa}</span>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setAgregando({})} className={botonSecundario} title="Contá qué pasó y la IA lo ubica en la ficha">
            <Plus className="h-4 w-4" /> Agregar
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Más opciones"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
                  <button type="button" disabled={armar.isPending}
                    onClick={() => {
                      setMenu(false)
                      if (window.confirm('Se arma una ficha nueva desde cero con lo que hay en el SAE, los escritos y las notas, y reemplaza la actual. ¿Seguir?')) armarConIa()
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Volver a armarla con IA<span className="block text-xs text-zinc-500">Reemplaza la ficha actual</span></span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Avisos: lo que espera una decisión va arriba de todo */}
      {(propuestas.length > 0 || !ficha.revisada || armar.isPending) && (
        <div className="space-y-2 px-4 pt-3">
          {armar.isPending && (
            <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Armando la ficha de nuevo…</p>
          )}
          {propuestas.length > 0 && <BannerPropuestas n={propuestas.length} titulo={propuestas[0]!.titulo} origen={propuestas[0]!.origen} onRevisar={() => setRevisando(true)} />}
          {!ficha.revisada && !armar.isPending && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-500/5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span className="flex-1">La armó la IA con lo que hay en el expediente. Leela y corregí lo que haga falta tocando el texto.</span>
              <button type="button" onClick={() => guardar.mutate({ revisada: true })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-blue-700 hover:bg-blue-500/10 dark:text-blue-300">
                <Check className="h-3.5 w-3.5" /> Está bien
              </button>
            </div>
          )}
        </div>
      )}

      {agregando && (
        <div className="px-4 pt-3">
          <Agregar expedienteId={expedienteId} pregunta={agregando.pregunta}
            onCerrar={() => setAgregando(null)}
            onPropuesta={() => { setAgregando(null); setRevisando(true) }} />
        </div>
      )}

      <div className="space-y-4 p-4">
        {/* De qué trata */}
        <TextoEditable ficha={ficha} campo="resumen" grande recortar vacio="Escribí en dos o tres líneas de qué trata el caso." />

        {/* Próximo paso: lo que más se consulta */}
        <div className="rounded-lg border-l-2 border-blue-500 bg-blue-500/5 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Próximo paso</p>
          <TextoEditable ficha={ficha} campo="proximo_paso" sinTitulo vacio="Qué hay que hacer o esperar." />
        </div>

        {/* Preguntas que solo el abogado puede responder */}
        {pendientesCompletar.filter(([, pregunta]) => pregunta !== agregando?.pregunta).map(([campo, pregunta]) => (
          <button key={campo} type="button" onClick={() => setAgregando({ pregunta })}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-amber-500/50 px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-500/5 dark:text-amber-200">
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1"><span className="font-medium">{ETIQUETA_CAMPO[campo]}:</span> {pregunta}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium">Responder <ArrowRight className="h-3.5 w-3.5" /></span>
          </button>
        ))}

        <dl className="divide-y divide-zinc-100 dark:divide-white/5">
          <Fila etiqueta="Demanda"><TextoEditable ficha={ficha} campo="demanda" sinTitulo recortar vacio="Qué se demanda, a quién y por cuánto." /></Fila>
          <Fila etiqueta="Contestación"><TextoEditable ficha={ficha} campo="contestacion" sinTitulo recortar vacio="Quién contestó y qué planteó." /></Fila>
          <Fila etiqueta="Prueba"><PruebaFicha ficha={ficha} /></Fila>
          <Fila etiqueta="Resoluciones"><ResolucionesFicha ficha={ficha} /></Fila>
        </dl>
      </div>

      {revisando && propuestas.length > 0 && (
        <RevisarPropuestaFicha expedienteId={expedienteId} ficha={ficha} propuestas={propuestas} onCerrar={() => setRevisando(false)} />
      )}
    </section>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────

function soloDatos(f: Ficha) {
  const { expediente_id: _e, updated_at: _u, ...resto } = f
  return resto
}

function BannerPropuestas({ n, titulo, origen, onRevisar }: { n: number; titulo?: string; origen?: string; onRevisar: () => void }) {
  return (
    <button type="button" onClick={onRevisar}
      className="flex w-full items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-500/15 dark:text-amber-100">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{n === 1 ? (origen === 'dictado' ? 'Lo que agregaste' : 'Novedad del SAE') : `${n} novedades para la ficha`}</span>
        {n === 1 && titulo && <span className="text-amber-800/80 dark:text-amber-200/80"> · {titulo}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold">Revisar <ArrowRight className="h-3.5 w-3.5" /></span>
    </button>
  )
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-zinc-500 sm:pt-0.5">{etiqueta}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** Texto que se edita tocándolo. */
function TextoEditable({ ficha, campo, vacio, grande, sinTitulo, recortar }: {
  ficha: Ficha; campo: CampoTexto; vacio: string; grande?: boolean; sinTitulo?: boolean; recortar?: boolean
}) {
  const guardar = useGuardarFicha(ficha.expediente_id)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(ficha[campo])
  const [abierto, setAbierto] = useState(false)
  const texto = ficha[campo]?.trim() ?? ''
  const largo = recortar && texto.length > (grande ? 380 : 220)

  if (editando) {
    return (
      <div className="space-y-2">
        {!sinTitulo && <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{ETIQUETA_CAMPO[campo]}</p>}
        <textarea autoFocus value={valor} onChange={(e) => setValor(e.target.value)} rows={Math.min(10, Math.max(3, Math.ceil(valor.length / 90)))}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 focus:border-cyan-500/50 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-100" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setEditando(false); setValor(ficha[campo]) }} className="min-h-9 rounded-lg px-3 text-sm text-zinc-600 dark:text-zinc-300">Cancelar</button>
          <button type="button" className={botonPrimario}
            onClick={() => {
              const completar = { ...ficha.completar }
              if (valor.trim() !== texto) delete completar[campo]
              guardar.mutate({ [campo]: valor.trim(), completar }, {
                onSuccess: () => setEditando(false),
                onError: (e) => toast.error('No se pudo guardar', e.message),
              })
            }}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <Pencil className="pointer-events-none absolute right-0 top-0.5 h-3 w-3 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
      {!sinTitulo && <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{ETIQUETA_CAMPO[campo]}</p>}
      <button type="button" title="Tocá para editar" onClick={() => { setValor(ficha[campo]); setEditando(true) }}
        className={cn('w-full whitespace-pre-line rounded-md text-left -mx-1 px-1 hover:bg-zinc-500/5',
          grande ? 'text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-50' : 'text-sm text-zinc-800 dark:text-zinc-200',
          !texto && 'italic text-zinc-400 dark:text-zinc-500',
          largo && !abierto && (grande ? 'line-clamp-5' : 'line-clamp-3'))}>
        {texto || vacio}
      </button>
      {largo && (
        <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          {abierto ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  )
}

function PruebaFicha({ ficha }: { ficha: Ficha }) {
  const guardar = useGuardarFicha(ficha.expediente_id)
  const [abierto, setAbierto] = useState(false)
  const prueba = [...ficha.prueba].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado])
  if (!prueba.length) return <p className="text-sm italic text-zinc-400 dark:text-zinc-500">Sin prueba cargada. Usá «Agregar» para sumarla.</p>

  const conteo = conteoPrueba(ficha.prueba)
  const cambiarEstado = (id: string) => guardar.mutate({
    prueba: ficha.prueba.map((p) => (p.id === id ? { ...p, estado: siguienteEstado(p.estado) } : p)),
  })
  const quitar = (id: string) => guardar.mutate({ prueba: ficha.prueba.filter((p) => p.id !== id) })

  return (
    <div>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-200">
        {conteo.map(({ estado, n }) => (
          <span key={estado} className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', COLOR_ESTADO[estado])}>
            {n} {ETIQUETA_ESTADO[estado].toLowerCase()}{n === 1 ? '' : 's'}
          </span>
        ))}
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          {abierto ? <>Ocultar <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver detalle <ChevronDown className="h-3.5 w-3.5" /></>}
        </span>
      </button>
      {abierto && (
        <ul className="mt-2 space-y-1">
          {prueba.map((p) => (
            <li key={p.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-zinc-500/5">
              <button type="button" onClick={() => cambiarEstado(p.id)} title="Tocá para cambiar el estado"
                className={cn('mt-0.5 w-[5.5rem] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-medium', COLOR_ESTADO[p.estado])}>
                {ETIQUETA_ESTADO[p.estado]}
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-zinc-800 dark:text-zinc-200">{p.medio}</p>
                {p.detalle && <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.detalle}</p>}
              </div>
              <button type="button" onClick={() => quitar(p.id)} aria-label="Quitar"
                className="rounded p-1 text-zinc-400 opacity-0 hover:text-red-600 group-hover:opacity-100 max-sm:opacity-60">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          <li className="px-1 pt-1 text-[11px] text-zinc-500">Tocá el estado para cambiarlo.</li>
        </ul>
      )}
    </div>
  )
}

function ResolucionesFicha({ ficha }: { ficha: Ficha }) {
  const guardar = useGuardarFicha(ficha.expediente_id)
  const [abierto, setAbierto] = useState(false)
  const lista = [...ficha.resoluciones].reverse() // la más reciente arriba
  if (!lista.length) return <p className="text-sm italic text-zinc-400 dark:text-zinc-500">Sin resoluciones relevantes todavía.</p>
  const visibles = abierto ? lista : lista.slice(0, 1)
  return (
    <div>
      <ul className="space-y-1.5">
        {visibles.map((r) => (
          <li key={r.id} className="group flex items-start gap-2 text-sm">
            <span className="w-[5.5rem] shrink-0 pt-px font-mono text-xs text-zinc-500">{r.fecha || 's/f'}</span>
            <span className={cn('min-w-0 flex-1 text-zinc-800 dark:text-zinc-200', !abierto && 'line-clamp-2')}>{r.texto}</span>
            {abierto && (
              <button type="button" onClick={() => guardar.mutate({ resoluciones: ficha.resoluciones.filter((x) => x.id !== r.id) })} aria-label="Quitar"
                className="rounded p-1 text-zinc-400 opacity-0 hover:text-red-600 group-hover:opacity-100 max-sm:opacity-60">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {lista.length > 1 && (
        <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          {abierto ? <>Ver solo la última <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver las {lista.length} <ChevronDown className="h-3.5 w-3.5" /></>}
        </button>
      )}
    </div>
  )
}

// ── Agregar a la ficha (escrito o dictado) ─────────────────────────────────

function Agregar({ expedienteId, pregunta, onCerrar, onPropuesta }: {
  expedienteId: string; pregunta?: string; onCerrar: () => void; onPropuesta: () => void
}) {
  const dictar = useDictarFicha(expedienteId)
  const [texto, setTexto] = useState('')
  const voz = useDictadoVoz((t) => setTexto((v) => [v.trim(), t].filter(Boolean).join(' ')))

  const enviar = () => {
    const t = texto.trim()
    if (!t) return
    dictar.mutate(pregunta ? `Respuesta a «${pregunta}»: ${t}` : t, {
      onSuccess: (r) => {
        if (r.propuesta_id) onPropuesta()
        else toast.info('No encontré nada para agregar a la ficha', 'Probá contarlo con otras palabras.')
      },
      onError: (e) => toast.error('No se pudo procesar', e.message),
    })
  }

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="mb-2 flex items-start gap-2">
        <p className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">{pregunta ?? '¿Qué pasó en el expediente?'}</p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
        placeholder={pregunta ? 'Respondé con tus palabras.' : 'Contalo con tus palabras. Ej.: «contestó negando la relación laboral», «se produjo la pericial contable», «la audiencia pasó al 12/3».'}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 focus:border-cyan-500/50 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {voz.disponible && (
          voz.grabando ? (
            <button type="button" onClick={voz.detener} className={cn(boton, 'bg-red-600 text-white hover:bg-red-700')}>
              <Square className="h-3.5 w-3.5 fill-current" /> Detener · {voz.segundos}s
            </button>
          ) : (
            <button type="button" onClick={voz.empezar} disabled={voz.transcribiendo || dictar.isPending} className={botonSecundario}>
              {voz.transcribiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {voz.transcribiendo ? 'Transcribiendo…' : 'Dictar'}
            </button>
          )
        )}
        <span className="flex-1 text-xs text-zinc-500 max-sm:hidden">La IA lo ubica en la ficha y te muestra cómo queda antes de guardarlo.</span>
        <button type="button" onClick={enviar} disabled={!texto.trim() || dictar.isPending || voz.grabando} className={botonPrimario}>
          {dictar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Ubicar en la ficha
        </button>
      </div>
    </div>
  )
}

/** Graba una nota de voz corta (hasta 2 minutos) y la transcribe con Whisper. No se guarda el audio. */
function useDictadoVoz(onTexto: (t: string) => void) {
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)
  const disponible = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current)
    rec.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  const detener = () => {
    if (timer.current) window.clearInterval(timer.current)
    if (rec.current?.state === 'recording') rec.current.stop()
  }

  const empezar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
      const partes: Blob[] = []
      r.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setGrabando(false)
        const audio = new Blob(partes, { type: r.mimeType || 'audio/webm' })
        if (audio.size < 2000) return
        setTranscribiendo(true)
        try {
          const form = new FormData()
          form.append('audio', audio, 'dictado')
          const { data, error } = await createClient().functions.invoke('consulta-transcribir', { body: form })
          if (error) throw error
          const segs = (data as { segmentos?: ({ texto: string } | string)[] })?.segmentos ?? []
          const t = segs.map((s) => (typeof s === 'string' ? s : s.texto)).join(' ').trim()
          if (t) onTexto(t)
          else toast.info('No se entendió el audio', 'Probá de nuevo más cerca del micrófono.')
        } catch {
          toast.error('No se pudo transcribir el audio')
        } finally {
          setTranscribiendo(false)
        }
      }
      rec.current = r
      r.start()
      setGrabando(true); setSegundos(0)
      timer.current = window.setInterval(() => setSegundos((s) => {
        if (s + 1 >= 120) detener()
        return s + 1
      }), 1000)
    } catch {
      toast.error('No hay acceso al micrófono', 'Revisá los permisos del navegador.')
    }
  }

  return { disponible, grabando, transcribiendo, segundos, empezar, detener }
}
