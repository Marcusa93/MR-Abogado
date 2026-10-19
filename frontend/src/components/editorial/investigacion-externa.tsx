import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, CircleDashed, ClipboardCopy, Database, ExternalLink, FileUp, Loader2, Lock, RefreshCw, Sparkles, X, XCircle,
} from 'lucide-react'
import {
  llamarEditorial, useHallazgos, useSumarFuenteABase,
  type EstadoHallazgo, type HallazgoEditorial,
} from '@/hooks/use-editorial'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Investigación externa: el sistema arma el pedido para Gemini Deep Research,
// Marco pega o sube el informe y el sistema lo separa en hallazgos, visita
// cada fuente y comprueba que la cita textual esté ahí.

const BTN = 'flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium disabled:opacity-50 sm:min-h-9 sm:rounded-lg sm:text-xs'
const BTN_PRI = `${BTN} bg-[var(--brand-navy)] text-white hover:opacity-90 dark:bg-white dark:text-[var(--brand-navy)]`
const BTN_OUT = `${BTN} border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5`

/** Visita las fuentes en tandas hasta terminar. Devuelve cuántas quedaron sin procesar (0 = listo). */
async function verificarTodo(articuloId: string, onAvance: (hechas: number) => void): Promise<number> {
  let hechas = 0
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const r = await llamarEditorial<{ procesadas: number; pendientes: number }>({ modo: 'verificar_fuentes', articulo_id: articuloId })
    hechas += r.procesadas
    onAvance(hechas)
    if (!r.pendientes || !r.procesadas) return r.pendientes
  }
  return -1
}

async function leerArchivo(f: File): Promise<string> {
  const nombre = f.name.toLowerCase()
  if (nombre.endsWith('.pdf') || f.type === 'application/pdf') {
    const { extractPdfText } = await import('@/lib/utils/pdf-text')
    return (await extractPdfText(f, { maxChars: 400_000 })).text
  }
  if (nombre.endsWith('.docx')) throw new Error('Para Word: en Google Docs usá Archivo → Descargar → PDF, o copiá y pegá el texto.')
  return await f.text()
}

// ── Diálogo: pedido + carga del informe ─────────────────────────────────────

export function InvestigarConGemini({ propuestaId, articuloId, onClose }: { propuestaId?: string; articuloId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pedido, setPedido] = useState<string | null>(null)
  const [informe, setInforme] = useState('')
  const [fase, setFase] = useState<'pedido' | 'informe' | 'procesando'>('pedido')
  const [avance, setAvance] = useState<string>('')
  const archivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    llamarEditorial<{ pedido: string }>({ modo: 'pedido_externo', propuesta_id: propuestaId, articulo_id: articuloId })
      .then((r) => setPedido(r.pedido))
      .catch((e) => toast.error('No se pudo armar el pedido', e instanceof Error ? e.message : undefined))
  }, [propuestaId, articuloId])

  const copiar = async () => {
    if (!pedido) return
    try {
      await navigator.clipboard.writeText(pedido)
      toast.success('Pedido copiado', 'Pegalo en Gemini con Deep Research activado.')
    } catch {
      toast.info('No se pudo copiar automáticamente', 'Mantené apretado el texto y copialo a mano.')
    }
  }

  const subir = async (f: File) => {
    try {
      setInforme(await leerArchivo(f))
    } catch (e) {
      toast.error('No se pudo leer el archivo', e instanceof Error ? e.message : undefined)
    }
  }

  const procesar = async () => {
    setFase('procesando')
    try {
      setAvance('Leyendo el informe y separando los hallazgos…')
      const r = await llamarEditorial<{ articulo_id: string; hallazgos: number; fuentes: number }>({
        modo: 'importar_informe', texto: informe, propuesta_id: propuestaId, articulo_id: articuloId,
      })
      setAvance(`${r.hallazgos} hallazgos. Visitando ${r.fuentes} fuentes…`)
      const resto = await verificarTodo(r.articulo_id, (n) => setAvance(`${r.hallazgos} hallazgos. Fuentes revisadas: ${n} de ${r.fuentes}…`))
      await qc.invalidateQueries({ queryKey: ['editorial'] })
      toast.success('Investigación cargada', resto ? 'Algunas fuentes quedaron sin revisar: podés reintentar desde el artículo.' : 'Revisá los hallazgos comprobados antes de redactar.')
      onClose()
      navigate(`/editorial/${r.articulo_id}?seccion=investigacion`)
    } catch (e) {
      toast.error('No se pudo procesar el informe', e instanceof Error ? e.message : undefined)
      setFase('informe')
    }
  }

  // Portal: las tarjetas usan backdrop-filter, que encierra a los elementos fixed
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={fase === 'procesando' ? undefined : onClose}>
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl dark:bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Investigar con Gemini Deep Research</p>
            <div className="mt-1 flex gap-1.5 text-[11px]">
              {(['pedido', 'informe'] as const).map((f, i) => (
                <span key={f} className={cn('rounded-full px-2 py-0.5', (fase === f || (fase === 'procesando' && f === 'informe')) ? 'bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]' : 'bg-zinc-500/10 text-zinc-500')}>
                  {i + 1}. {f === 'pedido' ? 'Copiar el pedido' : 'Cargar el informe'}
                </span>
              ))}
            </div>
          </div>
          {fase !== 'procesando' && <button type="button" onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-500/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {fase === 'pedido' && (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                <li>Copiá el pedido.</li>
                <li>En Gemini, elegí <b>Deep Research</b>, pegalo y aprobá el plan de investigación.</li>
                <li>Cuando termine, copiá el informe completo (o exportalo a Docs y bajalo en PDF) y volvé acá.</li>
              </ol>
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400">
                {pedido ?? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Armando el pedido…</span>}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
                <button type="button" onClick={copiar} disabled={!pedido} className={BTN_OUT}><ClipboardCopy className="h-4 w-4" /> Copiar pedido</button>
                <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" onClick={() => { void copiar() }} className={BTN_OUT}>
                  <ExternalLink className="h-4 w-4" /> Copiar y abrir Gemini
                </a>
                <button type="button" onClick={() => setFase('informe')} className={BTN_PRI}>Ya tengo el informe</button>
              </div>
            </>
          )}

          {fase === 'informe' && (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Pegá el informe completo, incluida la lista de fuentes del final, o subí el archivo.</p>
              <textarea value={informe} onChange={(e) => setInforme(e.target.value)} rows={10} autoFocus
                placeholder="Pegá acá el informe de Gemini…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100" />
              <div className="flex flex-wrap items-center gap-2">
                <input ref={archivoRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = '' }} />
                <button type="button" onClick={() => archivoRef.current?.click()} className={BTN_OUT}><FileUp className="h-4 w-4" /> Subir PDF o texto</button>
                <span className="text-xs text-zinc-500">{informe ? `${informe.length.toLocaleString('es-AR')} caracteres` : ''}</span>
                <span className="flex-1" />
                <button type="button" onClick={() => setFase('pedido')} className={`${BTN} text-zinc-500 hover:bg-zinc-500/10`}>Volver</button>
                <button type="button" onClick={() => { void procesar() }} disabled={informe.trim().length < 300} className={BTN_PRI}>
                  <Sparkles className="h-4 w-4" /> Procesar y comprobar
                </button>
              </div>
            </>
          )}

          {fase === 'procesando' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{avance}</p>
              <p className="max-w-sm text-xs text-zinc-500">El sistema abre cada fuente y busca la cita textual. Puede tardar uno o dos minutos; no cierres esta pantalla.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Panel de hallazgos ──────────────────────────────────────────────────────

const ESTADOS: Record<EstadoHallazgo, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  comprobado: { label: 'Comprobado', icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  parcial: { label: 'Parcial', icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
  no_encontrado: { label: 'No encontrado', icon: XCircle, cls: 'text-rose-600 dark:text-rose-400' },
  sin_acceso: { label: 'No se pudo abrir', icon: Lock, cls: 'text-zinc-500' },
  sin_fuente: { label: 'Sin fuente', icon: XCircle, cls: 'text-rose-600 dark:text-rose-400' },
  pendiente: { label: 'Pendiente', icon: CircleDashed, cls: 'text-zinc-400' },
}

export function HallazgosPanel({ articuloId, informeCargado, puedeCargar }: { articuloId: string; informeCargado: boolean; puedeCargar: boolean }) {
  const { data, isLoading } = useHallazgos(articuloId)
  const qc = useQueryClient()
  const sumar = useSumarFuenteABase(articuloId)
  const [dialogo, setDialogo] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'ok' | 'revisar'>('todos')
  const [reintentando, setReintentando] = useState(false)
  const [pegando, setPegando] = useState<string | null>(null)
  const [textoFuente, setTextoFuente] = useState('')

  const hs = data?.hallazgos ?? []
  const fuentes = new Map((data?.fuentes ?? []).map((f) => [f.id, f]))
  const n = (e: EstadoHallazgo) => hs.filter((h) => h.estado === e).length
  const hayPendientes = hs.some((h) => h.estado === 'pendiente')
  const visibles = hs.filter((h) => filtro === 'todos' || (filtro === 'ok' ? h.estado === 'comprobado' : h.estado !== 'comprobado'))

  const reintentar = async () => {
    setReintentando(true)
    try {
      await verificarTodo(articuloId, () => {})
      await qc.invalidateQueries({ queryKey: ['editorial', 'hallazgos', articuloId] })
    } catch (e) {
      toast.error('No se pudo completar la comprobación', e instanceof Error ? e.message : undefined)
    } finally { setReintentando(false) }
  }

  const guardarTexto = async (fuenteId: string) => {
    try {
      await llamarEditorial({ modo: 'texto_fuente', fuente_id: fuenteId, texto: textoFuente })
      setPegando(null); setTextoFuente('')
      await qc.invalidateQueries({ queryKey: ['editorial', 'hallazgos', articuloId] })
      toast.success('Fuente comprobada con el texto pegado')
    } catch (e) {
      toast.error('No se pudo comprobar', e instanceof Error ? e.message : undefined)
    }
  }

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>

  if (!hs.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-white/15">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Investigación con fuentes comprobadas</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
          Corré el pedido en Gemini Deep Research y cargá el informe: el sistema comprueba cada cita contra su fuente.
        </p>
        {puedeCargar && <button type="button" onClick={() => setDialogo(true)} className={`${BTN_PRI} mx-auto mt-3`}><Sparkles className="h-4 w-4" /> Investigar con Gemini</button>}
        {dialogo && <InvestigarConGemini articuloId={articuloId} onClose={() => setDialogo(false)} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wider text-zinc-500">Hallazgos</span>
        <span className="text-emerald-600 dark:text-emerald-400">{n('comprobado')} comprobados</span>
        {n('parcial') > 0 && <span className="text-amber-600 dark:text-amber-400">{n('parcial')} parciales</span>}
        {(n('no_encontrado') + n('sin_fuente')) > 0 && <span className="text-rose-600 dark:text-rose-400">{n('no_encontrado') + n('sin_fuente')} no encontrados</span>}
        {n('sin_acceso') > 0 && <span className="text-zinc-500">{n('sin_acceso')} sin abrir</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([['todos', 'Todos'], ['ok', 'Comprobados'], ['revisar', 'A revisar']] as const).map(([f, label]) => (
          <button key={f} type="button" onClick={() => setFiltro(f)}
            className={cn('min-h-8 rounded-full px-3 text-xs font-medium', filtro === f ? 'bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]' : 'border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300')}>
            {label}
          </button>
        ))}
        <span className="flex-1" />
        {(hayPendientes || n('sin_acceso') > 0) && (
          <button type="button" onClick={() => { void reintentar() }} disabled={reintentando} className="flex min-h-8 items-center gap-1 rounded-full px-2 text-xs text-zinc-500 hover:bg-zinc-500/10">
            {reintentando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {hayPendientes ? 'Terminar comprobación' : 'Reintentar'}
          </button>
        )}
      </div>

      {/* Lista */}
      <ul className="space-y-2">
        {visibles.map((h: HallazgoEditorial) => {
          const e = ESTADOS[h.estado]
          const fuente = h.fuente_id ? fuentes.get(h.fuente_id) : undefined
          const sumable = h.estado === 'comprobado' && (h.tipo === 'norma' || h.tipo === 'fallo') && fuente && !fuente.en_base
          return (
            <li key={h.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
              <div className="flex items-start gap-2">
                <e.icon className={cn('mt-0.5 h-4 w-4 shrink-0', e.cls)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-zinc-800 dark:text-zinc-100">{h.afirmacion}</p>
                  <p className="text-xs text-zinc-500">
                    <span className={cn('font-medium', e.cls)}>{e.label}</span>
                    {' · '}{h.tipo}{h.fuente ? ` · ${h.fuente}` : ''}
                    {h.vigencia ? ` · ${h.vigencia}` : ''}
                  </p>
                  {h.cita && <p className="border-l-2 border-zinc-200 pl-2 text-xs italic text-zinc-600 dark:border-white/15 dark:text-zinc-400">“{h.cita}”</p>}
                  {h.detalle && h.estado !== 'comprobado' && <p className="text-xs text-zinc-500">{h.detalle}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    {h.url && (
                      <a href={h.url} target="_blank" rel="noreferrer" className="inline-flex min-h-7 items-center gap-1 text-xs text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                        <ExternalLink className="h-3 w-3" /> {(() => { try { return new URL(h.url).hostname.replace(/^www\./, '') } catch { return 'fuente' } })()}
                      </a>
                    )}
                    {h.estado === 'sin_acceso' && h.fuente_id && pegando !== h.fuente_id && (
                      <button type="button" onClick={() => { setPegando(h.fuente_id); setTextoFuente('') }} className="min-h-7 text-xs font-medium text-zinc-600 underline dark:text-zinc-300">
                        Pegar el texto de la fuente
                      </button>
                    )}
                    {sumable && (
                      <button type="button" disabled={sumar.isPending}
                        onClick={() => sumar.mutate({ h }, {
                          onSuccess: () => toast.success(h.tipo === 'fallo' ? 'Fallo sumado a tu jurisprudencia' : 'Norma sumada a tu normativa', 'Se indexa en unos minutos.'),
                          onError: (err) => toast.error('No se pudo sumar', err instanceof Error ? err.message : undefined),
                        })}
                        className="inline-flex min-h-7 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        <Database className="h-3 w-3" /> Sumar a mi base
                      </button>
                    )}
                    {fuente?.en_base && <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Database className="h-3 w-3" /> En tu base</span>}
                  </div>
                  {pegando === h.fuente_id && h.fuente_id && (
                    <div className="space-y-2 pt-1">
                      <textarea value={textoFuente} onChange={(ev) => setTextoFuente(ev.target.value)} rows={5} autoFocus
                        placeholder="Abrí el link, copiá el texto de la norma o el fallo y pegalo acá"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-xs dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setPegando(null)} className={`${BTN} text-zinc-500 hover:bg-zinc-500/10`}>Cancelar</button>
                        <button type="button" onClick={() => { void guardarTexto(h.fuente_id!) }} disabled={textoFuente.trim().length < 200} className={BTN_PRI}>Comprobar</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {informeCargado && puedeCargar && (
        <button type="button" onClick={() => setDialogo(true)} className="text-xs text-zinc-500 underline">Cargar otro informe (reemplaza estos hallazgos)</button>
      )}
      {dialogo && <InvestigarConGemini articuloId={articuloId} onClose={() => setDialogo(false)} />}
    </div>
  )
}
