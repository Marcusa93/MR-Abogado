import { useCallback, useEffect, useLayoutEffect, useState, type ComponentType, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Bot, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, FilePen, FileSignature, HelpCircle, Lightbulb,
  ListChecks, PenLine, Send, ShieldCheck, Sparkles, Timer, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Ayuda de Escritos: "El camino" (mapa de todo el circuito, de la idea al proveído)
// y "Mostrámelo" (recorrido que resalta en pantalla cada parte real).

interface Etapa {
  icon: ComponentType<{ className?: string }>
  titulo: string
  resumen: string
  puntos: string[]
}

const ETAPAS: Etapa[] = [
  {
    icon: PenLine, titulo: 'Arrancar el escrito',
    resumen: 'Con «Nuevo escrito», acá o desde el expediente.',
    puntos: [
      'Desde la solapa Escritos del expediente arranca con el expediente ya elegido.',
      'Si respondés una actuación, el escrito queda vinculado a ella y se crea la tarea para presentarlo.',
      'También se puede pedir desde el celular al bot de escritos de Telegram (ver abajo).',
    ],
  },
  {
    icon: Lightbulb, titulo: 'Qué hay que presentar',
    resumen: 'Contalo con tus palabras, escrito o dictado.',
    puntos: [
      'Escribí la idea, dictala con el micrófono o subí un audio.',
      'Para trámites frecuentes tocá una de las opciones rápidas (pronto despacho, apertura a prueba, etc.).',
      'No hace falta elegir el tipo: lo deduce de lo que pediste.',
    ],
  },
  {
    icon: FilePen, titulo: 'Cómo se presenta',
    resumen: 'Carácter, instrucciones y el escrito de la contraparte si respondés.',
    puntos: [
      'Elegí cómo te presentás: apoderado, patrocinante o por derecho propio.',
      'Instrucciones puntuales: qué citar, qué pedir, qué evitar.',
      'Si contestás algo, pegá el texto de la contraparte: lo usa para rebatirlo punto por punto.',
      '«Opciones avanzadas» (modelo de IA, esquema, modelo del estudio, estilo): si no tocás nada, usa lo recomendado.',
    ],
  },
  {
    icon: Sparkles, titulo: 'Lo redacta la IA',
    resumen: 'Con el expediente, la normativa, los fallos y los modelos del estudio.',
    puntos: [
      'Lee las actuaciones del expediente y tu perfil de redacción (cómo escribís).',
      'Tarda alrededor de un minuto. Lo que no sabe lo deja entre corchetes, por ejemplo [COMPLETAR: fecha].',
    ],
  },
  {
    icon: Eye, titulo: 'Revisar y editar',
    resumen: 'Por secciones y párrafos, viendo la hoja final en vivo.',
    puntos: [
      'Cada párrafo tiene su botón de asistente: le pedís el cambio y lo reescribe ahí.',
      '«Lado a lado» muestra la hoja A4 con el logo mientras editás. En el celular, «Ver escrito».',
      'La guía de arriba cuenta los datos entre corchetes que faltan reemplazar.',
      'Todo se guarda solo. Las versiones anteriores están en ⋯ → Revisión, citas y versiones.',
    ],
  },
  {
    icon: ShieldCheck, titulo: 'Revisión antes de firmar',
    resumen: 'Un modelo distinto controla forma, fundamentos, citas y plazos.',
    puntos: [
      'Requisitos formales del código procesal, pedidos sin fundamento y citas sin respaldo.',
      'El resultado queda en el panel de revisión, con cada observación marcada.',
      'Si algo falta, te avisa antes de firmar; podés seguir igual.',
    ],
  },
  {
    icon: FileSignature, titulo: 'Firmar',
    resumen: 'Un botón: PDF descargado y firmar.gob.ar abierto al costado.',
    puntos: [
      'Firmás con token o firma remota en la ventana de firmar.gob.ar.',
      'Arrastrás el PDF firmado al recuadro de la app (o lo elegís de Descargas).',
      'La app verifica que tenga firma digital.',
    ],
  },
  {
    icon: Send, titulo: 'Presentar en el SAE',
    resumen: 'Desde acá, con tu usuario del SAE, sin entrar al portal.',
    puntos: [
      'Categoría sugerida, descripción y si presentás documentación original.',
      'Se presenta en la última radicación del expediente; te muestra la oficina antes de confirmar.',
      'Necesitás tus credenciales del SAE cargadas en Configuración.',
      'Si lo presentaste por otra vía, «Ya lo presenté por otra vía» lo registra igual.',
    ],
  },
  {
    icon: Timer, titulo: 'Seguimiento hasta el proveído',
    resumen: 'Tarea de control y aviso por Telegram cuando provee el juzgado.',
    puntos: [
      'Se crea la tarea de controlar el proveído a tres días hábiles.',
      'El sistema revisa el SAE cada dos horas; cuando llega el proveído te avisa y la tarea se cierra sola.',
      'Las bandejas ordenan todo: Sin terminar, Para presentar, Esperando proveído, Con proveído.',
    ],
  },
]

interface PasoTour { target: string; titulo: string; texto: string }

const TOUR: PasoTour[] = [
  { target: 'esc-nuevo', titulo: 'Nuevo escrito', texto: 'Empieza acá. Contás qué hay que presentar y la IA arma el borrador con el expediente.' },
  { target: 'esc-bandejas', titulo: 'Bandejas', texto: 'Cada escrito pasa por estas etapas: sin terminar, para presentar, esperando proveído y con proveído.' },
  { target: 'esc-lista', titulo: 'Tus escritos', texto: 'Cada uno indica qué le falta (datos, revisión, firma) y hace cuánto no se toca.' },
  { target: 'esc-herramientas', titulo: 'Ajustes de redacción', texto: 'Perfil de redacción (cómo escribís), uso de IA y modelos del estudio que sirven de base.' },
  { target: 'esc-guia', titulo: 'La guía del escrito', texto: 'Siempre te dice el próximo paso: completar datos, revisar, firmar, presentar y esperar el proveído.' },
  { target: 'esc-vista', titulo: 'Cómo lo ves', texto: 'Editar, lado a lado con la hoja en vivo, o solo el escrito como va a quedar.' },
  { target: 'esc-texto', titulo: 'El texto', texto: 'Editás por secciones y párrafos. Al lado de cada párrafo está el asistente para pedirle cambios.' },
  { target: 'esc-vivo', titulo: 'La hoja en vivo', texto: 'Así sale el escrito, con el logo y el formato del estudio. Se actualiza mientras escribís.' },
  { target: 'esc-asistente', titulo: 'Asistente', texto: 'Le pedís cambios a todo el escrito o le preguntás algo sobre el expediente.' },
  { target: 'esc-mas', titulo: 'Más acciones', texto: 'Revisión, citas y versiones; adjuntar el PDF firmado, imprimir, guardar como plantilla o eliminar.' },
]

function visible(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${sel}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export function EscritosAyudaBoton({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="Cómo se hace un escrito" aria-label="Ayuda: cómo se hace un escrito"
        className={cn('inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-cyan-300', className)}>
        <HelpCircle className="h-4 w-4" />
      </button>
      {abierto && <EscritosAyuda onClose={() => setAbierto(false)} />}
    </>
  )
}

function EscritosAyuda({ onClose }: { onClose: () => void }) {
  const [modo, setModo] = useState<'mapa' | 'tour'>('mapa')
  const [abierta, setAbierta] = useState<number | null>(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && modo === 'mapa') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modo, onClose])

  if (modo === 'tour') return <Recorrido onClose={onClose} onMapa={() => setModo('mapa')} />

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--card)] sm:max-w-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Cómo se hace un escrito</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">De la idea al proveído, sin salir de la app. Tocá cada paso para ver el detalle.</p>
          </div>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ol className="relative">
            {ETAPAS.map((e, i) => {
              const Icon = e.icon
              const open = abierta === i
              return (
                <li key={e.titulo} className="relative pb-1 pl-11">
                  {i < ETAPAS.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-200 dark:bg-white/10" />}
                  <span className={cn('absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                    open ? 'border-cyan-500 bg-cyan-500 text-white dark:text-zinc-950' : 'border-zinc-300 bg-white text-zinc-600 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-300')}>
                    {i + 1}
                  </span>
                  <button type="button" onClick={() => setAbierta(open ? null : i)} aria-expanded={open}
                    className="flex w-full items-start gap-2 rounded-lg py-1.5 text-left">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', open ? 'text-cyan-600 dark:text-cyan-300' : 'text-zinc-400')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{e.titulo}</span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{e.resumen}</span>
                    </span>
                    <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <ul className="mb-3 mt-1 space-y-1.5 pl-6">
                      {e.puntos.map((p) => (
                        <li key={p} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" /> <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"><Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-300" /> Desde el celular, por Telegram</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              Mandale al bot de escritos un audio o un texto con el expediente (número o partes) y qué hay que presentar.
              Arma el borrador con el mismo motor y te manda el enlace para seguir acá. El mismo bot te avisa cuando llega el proveído.
            </p>
          </div>
        </div>

        <div className="flex gap-2 border-t border-zinc-100 px-5 py-3 dark:border-white/5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose}
            className="min-h-10 flex-1 rounded-xl border border-zinc-200 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">Cerrar</button>
          <button type="button" onClick={() => setModo('tour')}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 text-sm font-medium text-white hover:bg-cyan-500">
            <Eye className="h-4 w-4" /> Mostrámelo en pantalla
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Recorrido sobre la pantalla real ────────────────────────────────────────

function Recorrido({ onClose, onMapa }: { onClose: () => void; onMapa: () => void }) {
  const [pasos] = useState(() => TOUR.filter((p) => visible(p.target)))
  const enEditor = pasos.some((p) => p.target === 'esc-guia')
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const paso = pasos[i]

  const medir = useCallback(() => {
    if (!paso) return
    const el = visible(paso.target)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    const alto = r.height > window.innerHeight * 0.6
    if (alto ? (r.top < 0 || r.top > window.innerHeight * 0.4) : (r.top < 60 || r.bottom > window.innerHeight - 20)) {
      el.scrollIntoView({ block: alto ? 'start' : 'center', behavior: 'smooth' })
    }
    setRect(el.getBoundingClientRect())
  }, [paso])

  useLayoutEffect(() => {
    medir()
    const t = [setTimeout(medir, 250), setTimeout(medir, 600)]
    return () => t.forEach(clearTimeout)
  }, [medir])

  useEffect(() => {
    const on = () => medir()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, pasos.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    document.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); document.removeEventListener('keydown', onKey) }
  }, [medir, onClose, pasos.length])

  useEffect(() => { if (!paso) onMapa() }, [paso, onMapa])
  if (!paso) return null

  const PAD = 6
  // Recortado a la pantalla: el texto del escrito puede ser más alto que la ventana.
  const sp = rect ? (() => {
    const top = Math.max(4, rect.top - PAD), bottom = Math.min(window.innerHeight - 4, rect.bottom + PAD)
    return { top, left: rect.left - PAD, width: rect.width + PAD * 2, height: Math.max(0, bottom - top) }
  })() : null
  const movil = window.innerWidth < 640
  const W = Math.min(340, window.innerWidth - 24)
  let pos: CSSProperties = { left: 12, right: 12, bottom: 12 }
  if (sp && !movil) {
    const abajo = sp.top + sp.height + 12
    const top = abajo + 230 < window.innerHeight ? abajo : Math.max(12, sp.top - 12 - 230)
    const left = Math.min(Math.max(12, sp.left), window.innerWidth - W - 12)
    pos = { top, left, width: W }
  }
  const ultimo = i === pasos.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true">
      {sp ? (
        <svg className="absolute inset-0 h-full w-full" onClick={onClose}>
          <defs>
            <mask id="esc-ayuda-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect x={sp.left} y={sp.top} width={sp.width} height={sp.height} rx="10" fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#esc-ayuda-mask)" />
        </svg>
      ) : <div className="absolute inset-0 bg-black/60" onClick={onClose} />}
      {sp && (
        <div aria-hidden className="pointer-events-none absolute rounded-[10px] border-2 border-cyan-400 shadow-[0_0_24px_4px_rgba(34,211,238,0.35)]"
          style={{ ...sp, transition: 'all 0.25s ease' }} />
      )}

      <div className="absolute z-10 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[var(--card)]"
        style={{ ...pos, transition: 'top 0.25s ease, left 0.25s ease' }}>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{paso.titulo}</p>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-zinc-400" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{paso.texto}</p>
        {ultimo && !enEditor && (
          <p className="mt-2 text-xs text-zinc-500">Abrí un escrito y volvé a tocar ? para recorrer el editor.</p>
        )}
        <div className="mt-3 flex gap-1">
          {pasos.map((p, n) => (
            <button key={p.target} type="button" onClick={() => setI(n)} aria-label={`Paso ${n + 1}`}
              className={cn('h-1 flex-1 rounded-full', n === i ? 'bg-cyan-500' : n < i ? 'bg-cyan-500/40' : 'bg-zinc-200 dark:bg-white/10')} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onMapa} className="text-xs text-zinc-500 underline">Ver el camino</button>
          <span className="flex-1 text-right text-xs tabular-nums text-zinc-400">{i + 1}/{pasos.length}</span>
          <button type="button" onClick={() => setI((n) => Math.max(n - 1, 0))} disabled={i === 0} aria-label="Anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => (ultimo ? onClose() : setI((n) => n + 1))}
            className="flex h-8 items-center gap-1 rounded-lg bg-cyan-600 px-3 text-sm font-medium text-white">
            {ultimo ? <><Check className="h-4 w-4" /> Listo</> : <>Siguiente <ChevronRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
