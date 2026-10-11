import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, ClipboardCheck, Copy, Download, Eye, FileText, History, Loader2, PenLine, RotateCcw, Save, Send, ShieldAlert, Sparkles,
} from 'lucide-react'
import {
  useAccesoEditorial, useArticulo, useVersiones, useEditorialIA, useGuardarArticulo, useCambiarEstadoArticulo, useEnviarAContenidos, useGuardarBibliografia, usePuedeAprobarEditorial,
  TIPO_ARTICULO_LABEL, ESTADO_ARTICULO_LABEL, type TipoArticulo, type Version,
} from '@/hooks/use-editorial'
import { MarkdownView } from '@/components/editorial/markdown-view'
import { descargarWord, imprimirPdf } from '@/components/editorial/exportar'
import { HojaEditor } from '@/components/editorial/hoja-editor'
import { DictarBoton } from '@/components/shared/dictar-boton'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Editor de un artículo: Marco edita título, bajada y cuerpo (markdown); cada
// guardado es una versión restaurable. La IA investiga, redacta y revisa, pero
// aprobar es siempre una decisión de Marco.

type Panel = 'investigacion' | 'revision' | 'verificar' | 'bibliografia' | 'versiones'

const contarVerificar = (t: string) => (t.match(/\[VERIFICAR:/g) ?? []).length
const palabras = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

export default function EditorialArticuloPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: acceso, isLoading: cargandoAcceso } = useAccesoEditorial()
  const { data: art, isLoading } = useArticulo(id)
  const { data: versiones = [] } = useVersiones(id)
  const ia = useEditorialIA()
  const guardar = useGuardarArticulo(id)
  const cambiarEstado = useCambiarEstadoArticulo(id)
  const enviarContenidos = useEnviarAContenidos()
  const guardarBiblio = useGuardarBibliografia(id)
  const { data: puedeAprobar = false } = usePuedeAprobarEditorial()
  const [biblioTexto, setBiblioTexto] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('')
  const [bajada, setBajada] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [cargado, setCargado] = useState<string | null>(null)
  const [vista, setVista] = useState<'editar' | 'previa'>('previa')
  const [panel, setPanel] = useState<Panel>('investigacion')
  const [tipo, setTipo] = useState<TipoArticulo>('analisis_profesional')
  const [indicaciones, setIndicaciones] = useState('')
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const [confirmarAprobar, setConfirmarAprobar] = useState(false)

  // Cargar el artículo en el editor (y al llegar una versión nueva de la IA)
  useEffect(() => {
    if (!art) return
    const firma = `${art.id}:${art.version}`
    if (cargado === firma) return
    setTitulo(art.titulo); setBajada(art.bajada ?? ''); setCuerpo(art.cuerpo ?? ''); setTipo(art.tipo)
    setCargado(firma)
    if (!art.cuerpo) setPanel('investigacion')
  }, [art, cargado])

  const sucio = !!art && (titulo !== art.titulo || bajada !== (art.bajada ?? '') || cuerpo !== (art.cuerpo ?? ''))
  const verificarEnTexto = useMemo(() => contarVerificar(`${titulo}\n${bajada}\n${cuerpo}`), [titulo, bajada, cuerpo])

  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => { if (sucio) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sucio])

  if (cargandoAcceso || isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
  if (!acceso) return <Navigate to="/inicio" replace />
  if (!art) return <p className="py-10 text-center text-sm text-zinc-500">Artículo no encontrado.</p>

  const aprobado = art.estado === 'aprobado' || art.estado === 'publicado'

  const correrIA = (modo: string, extra: Record<string, unknown>, ok: string) => {
    setPidiendo(modo)
    ia.mutate({ modo, articulo_id: id, ...extra }, {
      onSuccess: (r) => {
        toast.success(ok, typeof r.alertas === 'number' && r.alertas > 0 ? `Atención: ${r.alertas} posibles datos identificatorios.` : undefined)
        if (modo === 'revisar') setPanel('revision')
      },
      onError: (e) => toast.error('La IA no pudo completar el pedido', e instanceof Error ? e.message : undefined),
      onSettled: () => setPidiendo(null),
    })
  }

  const guardarVersion = () => guardar.mutate({ articulo: art, titulo, bajada, cuerpo }, {
    onSuccess: () => toast.success(`Versión ${art.version + 1} guardada`),
    onError: (e) => toast.error('No se pudo guardar', e instanceof Error ? e.message : undefined),
  })

  const redactar = () => {
    if (sucio) return toast.info('Guardá tus cambios primero', 'La IA trabaja sobre la última versión guardada.')
    correrIA('redactar', { tipo, indicaciones: indicaciones.trim() }, art.cuerpo ? 'Nueva versión redactada' : 'Borrador redactado')
  }

  const aprobar = async () => {
    // Control de confidencialidad sin IA justo antes de aprobar
    try { await ia.mutateAsync({ modo: 'chequeo', articulo_id: id }) } catch { /* se muestra lo que haya */ }
    setConfirmarAprobar(true)
  }

  const restaurar = (v: Version) => {
    setTitulo(v.titulo); setBajada(v.bajada ?? ''); setCuerpo(v.cuerpo); setVista('editar')
    toast.info(`Versión ${v.version} cargada en el editor`, 'Guardala para que quede como la actual.')
  }

  const generarBibliografia = async (): Promise<string[] | null> => {
    setPidiendo('apa')
    try {
      const r = await ia.mutateAsync({ modo: 'apa', articulo_id: id })
      setBiblioTexto(null)
      return (r.bibliografia as string[]) ?? []
    } catch (e) {
      toast.error('No se pudo armar la bibliografía', e instanceof Error ? e.message : undefined)
      return null
    } finally {
      setPidiendo(null)
    }
  }

  const exportar = async (formato: 'word' | 'pdf') => {
    let bibliografia = art.bibliografia ?? []
    if (!bibliografia.length) {
      toast.info('Armando la bibliografía APA', 'Es la primera descarga: tarda unos segundos.')
      const generada = await generarBibliografia()
      if (!generada) return
      bibliografia = generada
    }
    const datos = { titulo: art.titulo, bajada: art.bajada, cuerpo: art.cuerpo, bibliografia }
    if (formato === 'word') return descargarWord(datos)
    if (!imprimirPdf(datos)) toast.info('El navegador bloqueó la ventana', 'Tocá PDF de nuevo.')
  }

  const copiar = async (texto: string, que: string) => {
    await navigator.clipboard.writeText(texto).catch(() => {})
    toast.success(`${que} copiado`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16">
      <Breadcrumb items={[{ label: 'Editorial', href: '/editorial' }, { label: art.titulo.slice(0, 50) }]} />

      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/editorial" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-500/10" title="Volver"><ArrowLeft className="h-4 w-4" /></Link>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
          aprobado ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
          {ESTADO_ARTICULO_LABEL[art.estado]}
        </span>
        <span className="text-xs text-zinc-500">v{art.version} · {palabras(cuerpo)} palabras{art.modelo_ia ? ` · ${art.modelo_ia.replace('anthropic/', '')}` : ''}</span>
        {sucio && <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Cambios sin guardar</span>}
        <span className="flex-1" />
        {!aprobado && (
          <button type="button" onClick={guardarVersion} disabled={!sucio || guardar.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
            {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar versión
          </button>
        )}
        {art.estado === 'borrador' && !puedeAprobar && (
          <button type="button" disabled={sucio || !art.cuerpo || pidiendo === 'pedir_aprobacion'}
            onClick={() => correrIA('pedir_aprobacion', {}, 'Le avisamos a Marco por Telegram')}
            title={sucio ? 'Guardá los cambios antes de pedir la aprobación' : 'Los artículos salen a nombre de Marco: él hace la revisión final y aprueba'}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
            {pidiendo === 'pedir_aprobacion' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Pedir aprobación a Marco
          </button>
        )}
        {art.estado === 'borrador' && puedeAprobar && (
          <button type="button" onClick={aprobar} disabled={sucio || !art.cuerpo}
            title={sucio ? 'Guardá los cambios antes de aprobar' : 'Aprobar el artículo (revisión final tuya)'}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
          </button>
        )}
        {aprobado && puedeAprobar && (
          <button type="button" onClick={() => cambiarEstado.mutate({ estado: 'borrador' }, { onSuccess: () => toast.info('Volvió a borrador') })}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300">
            <PenLine className="h-3.5 w-3.5" /> Volver a editar
          </button>
        )}
        {aprobado && (
          <>
            <button type="button" onClick={() => exportar('word')} disabled={pidiendo === 'apa'}
              title="Descargar en Word: Times New Roman 12, interlineado 1,5, bibliografía APA al final"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
              {pidiendo === 'apa' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Word
            </button>
            <button type="button" onClick={() => exportar('pdf')} disabled={pidiendo === 'apa'}
              title="Imprimir o guardar como PDF con el mismo formato"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
          </>
        )}
        <button type="button" onClick={() => copiar(`# ${titulo}\n\n${bajada ? `_${bajada}_\n\n` : ''}${cuerpo}`, 'Artículo')}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-500/10" title="Copiar el artículo (markdown)">
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {/* Alertas */}
      {art.alertas_confidencialidad?.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Posibles datos identificatorios del caso de origen</p>
            <ul className="mt-1 list-disc pl-4">{art.alertas_confidencialidad.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        </div>
      )}
      {verificarEnTexto > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {verificarEnTexto} {verificarEnTexto === 1 ? 'afirmación marcada' : 'afirmaciones marcadas'} [VERIFICAR] en el texto: comprobalas y sacá la marca antes de aprobar.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Editor */}
        <div className="dashboard-panel rounded-2xl p-4">
          {!art.cuerpo && !cuerpo ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Todavía no hay borrador. Revisá la investigación (a la derecha) y pedí la redacción abajo.
            </p>
          ) : (
            <>
              <div className="mb-3 flex gap-1">
                {(['previa', 'editar'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setVista(v)}
                    className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium',
                      vista === v ? 'bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700')}>
                    {v === 'previa' ? <Eye className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
                    {v === 'previa' ? 'Vista previa' : 'Editar'}
                  </button>
                ))}
              </div>
              {vista === 'editar' && !aprobado ? (
                <HojaEditor articuloId={id} titulo={titulo} bajada={bajada} cuerpo={cuerpo}
                  onTitulo={setTitulo} onBajada={setBajada} onCuerpo={setCuerpo} />
              ) : (
                <article className="overflow-hidden rounded-lg bg-white text-black shadow-sm ring-1 ring-zinc-200 dark:ring-white/10">
                  <div className="mx-auto max-w-[21cm] px-5 py-8 text-justify sm:px-[2.5cm] sm:py-[2.5cm]"
                    style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: 1.5 }}>
                    <p className="text-center font-bold" style={{ fontSize: '14pt' }}>{titulo}</p>
                    {bajada && <p className="mt-1 text-center italic">{bajada}</p>}
                    <MarkdownView texto={cuerpo} hoja className="mt-6" />
                    {(art.bibliografia?.length ?? 0) > 0 && (
                      <div className="mt-10">
                        <p className="mb-3 text-center font-bold">Referencias</p>
                        {[...art.bibliografia].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' })).map((r, i) => (
                          <p key={i} className="mb-2 pl-[1.27cm] -indent-[1.27cm] text-left">{r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )}
            </>
          )}

          {/* IA */}
          {!aprobado && (
            <div className="mt-4 space-y-2 border-t border-zinc-200 pt-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoArticulo)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200">
                  {(Object.keys(TIPO_ARTICULO_LABEL) as TipoArticulo[]).map((t) => <option key={t} value={t}>{TIPO_ARTICULO_LABEL[t]}</option>)}
                </select>
                <button type="button" onClick={redactar} disabled={!!pidiendo}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-navy)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-[var(--brand-navy)]">
                  {pidiendo === 'redactar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {pidiendo === 'redactar' ? 'Redactando… (1-2 min)' : art.cuerpo ? 'Reescribir con IA' : 'Redactar borrador'}
                </button>
                {art.cuerpo && (
                  <button type="button" onClick={() => { if (sucio) return toast.info('Guardá tus cambios primero'); correrIA('revisar', {}, 'Revisión crítica lista') }} disabled={!!pidiendo}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
                    {pidiendo === 'revisar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />} Revisión crítica
                  </button>
                )}
              </div>
              <div className="flex justify-end">
                <DictarBoton label="Dictar indicaciones" disabled={!!pidiendo}
                  onTexto={(t) => setIndicaciones((p) => (p.trim() ? `${p.trim()} ${t}` : t))} />
              </div>
              <textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} rows={2}
                placeholder="Indicaciones para la IA (opcional): enfoque, extensión, qué agregar o sacar, a quién va dirigido…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300" />
            </div>
          )}

          {/* Adaptaciones (solo aprobado) */}
          {aprobado && (
            <div className="mt-4 space-y-3 border-t border-zinc-200 pt-3 dark:border-white/10">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Adaptaciones</p>
              <div className="flex flex-wrap gap-2">
                {([['linkedin', 'LinkedIn'], ['redes', 'Instagram / Facebook'], ['boletin', 'Boletín']] as const).map(([f, label]) => (
                  <button key={f} type="button" disabled={!!pidiendo} onClick={() => correrIA('adaptar', { formato: f }, `Versión para ${label} lista`)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
                    {pidiendo === 'adaptar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {art.adaptaciones?.[f] ? `Rehacer ${label}` : label}
                  </button>
                ))}
              </div>
              {(['linkedin', 'redes', 'boletin'] as const).filter((f) => art.adaptaciones?.[f]).map((f) => (
                <div key={f} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{f === 'redes' ? 'Instagram / Facebook' : f === 'boletin' ? 'Boletín' : 'LinkedIn'}</p>
                    <button type="button" onClick={() => copiar(art.adaptaciones[f]!, 'Texto')} className="text-xs text-zinc-500 hover:underline">Copiar</button>
                    <button type="button" disabled={enviarContenidos.isPending}
                      onClick={() => enviarContenidos.mutate(
                        { titulo: art.titulo, texto: art.adaptaciones[f]!, categoria: f === 'linkedin' ? 'linkedin' : f === 'boletin' ? 'newsletter' : 'instagram' },
                        { onSuccess: () => toast.success('Enviado a Contenidos como borrador'), onError: (e) => toast.error('No se pudo enviar', e instanceof Error ? e.message : undefined) },
                      )}
                      className="flex items-center gap-1 text-xs text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                      <Send className="h-3 w-3" /> Enviar a Contenidos
                    </button>
                  </div>
                  <MarkdownView texto={art.adaptaciones[f]!} className="text-sm" />
                </div>
              ))}
              {art.estado === 'aprobado' && puedeAprobar && (
                <button type="button" onClick={() => {
                  const url = window.prompt('Link de la publicación (opcional)') ?? null
                  cambiarEstado.mutate({ estado: 'publicado', publicado_url: url }, { onSuccess: () => toast.success('Marcado como publicado') })
                }} className="text-xs text-zinc-500 hover:underline">Marcar como publicado</button>
              )}
            </div>
          )}
        </div>

        {/* Panel lateral */}
        <aside className="dashboard-panel h-fit rounded-2xl p-3 lg:sticky lg:top-4">
          <div className="mb-3 grid grid-cols-5 gap-1">
            {([['investigacion', 'Investig.'], ['revision', 'Revisión'], ['verificar', 'Verificar'], ['bibliografia', 'Biblio.'], ['versiones', 'Versiones']] as const).map(([p, label]) => (
              <button key={p} type="button" onClick={() => setPanel(p)}
                className={cn('rounded-md px-1.5 py-1 text-[11px] font-medium',
                  panel === p ? 'bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700')}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {panel === 'investigacion' && (art.investigacion
              ? <MarkdownView texto={art.investigacion} className="text-sm" />
              : <p className="text-xs text-zinc-500">Sin investigación.</p>)}
            {panel === 'revision' && (art.revision_critica
              ? <MarkdownView texto={art.revision_critica} className="text-sm" />
              : <p className="text-xs text-zinc-500">Pedí una revisión crítica del borrador con el botón de abajo del editor.</p>)}
            {panel === 'bibliografia' && (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <BookOpen className="h-3.5 w-3.5" /> Referencias (APA 7) · siempre al final del documento
                </p>
                {biblioTexto !== null ? (
                  <>
                    <textarea value={biblioTexto} onChange={(e) => setBiblioTexto(e.target.value)} rows={10}
                      placeholder="Una entrada por línea"
                      className="w-full rounded-lg border border-zinc-200 bg-transparent p-2 text-xs leading-relaxed dark:border-white/10" />
                    <div className="flex gap-2">
                      <button type="button" disabled={guardarBiblio.isPending}
                        onClick={() => guardarBiblio.mutate(
                          biblioTexto.split('\n').map((l) => l.trim()).filter(Boolean),
                          { onSuccess: () => { setBiblioTexto(null); toast.success('Bibliografía guardada') },
                            onError: (e) => toast.error('No se pudo guardar', e instanceof Error ? e.message : undefined) })}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900">
                        Guardar
                      </button>
                      <button type="button" onClick={() => setBiblioTexto(null)} className="text-xs text-zinc-500 hover:underline">Cancelar</button>
                    </div>
                  </>
                ) : (
                  <>
                    {art.bibliografia?.length ? (
                      <ul className="space-y-1.5">
                        {[...art.bibliografia].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })).map((r, i) => (
                          <li key={i} className="pl-4 -indent-4 text-zinc-700 dark:text-zinc-300"><MarkdownView texto={r} className="text-sm" /></li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-zinc-500">Todavía no hay bibliografía. Se arma sola al redactar o al descargar.</p>}
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button type="button" onClick={() => setBiblioTexto((art.bibliografia ?? []).join('\n'))} className="text-xs text-zinc-600 hover:underline dark:text-zinc-300">Editar</button>
                      <button type="button" disabled={pidiendo === 'apa'} onClick={() => { void generarBibliografia().then((b) => { if (b) toast.success('Bibliografía APA generada') }) }}
                        className="flex items-center gap-1 text-xs text-zinc-600 hover:underline disabled:opacity-40 dark:text-zinc-300">
                        {pidiendo === 'apa' && <Loader2 className="h-3 w-3 animate-spin" />}{art.bibliografia?.length ? 'Regenerar con IA' : 'Generar con IA'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {panel === 'verificar' && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">A comprobar antes de aprobar</p>
                  {art.a_verificar?.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700 dark:text-zinc-300">{art.a_verificar.map((v, i) => <li key={i}>{v}</li>)}</ul>
                  ) : <p className="mt-1 text-xs text-zinc-500">Nada indicado por la IA.</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Referencias</p>
                  {art.referencias?.length ? (
                    <ul className="mt-1 space-y-1.5">
                      {art.referencias.map((r, i) => (
                        <li key={i} className="text-zinc-700 dark:text-zinc-300">
                          <span className={cn('mr-1 rounded px-1 text-[10px] font-semibold', r.verificada ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                            {r.verificada ? 'con fuente' : 'sin verificar'}
                          </span>
                          {r.cita}{r.fuente ? <span className="text-zinc-500"> — {r.fuente}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-zinc-500">Sin referencias.</p>}
                </div>
              </div>
            )}
            {panel === 'versiones' && (
              <ul className="space-y-1.5">
                {versiones.length === 0 && <li className="text-xs text-zinc-500">Sin versiones todavía.</li>}
                {versiones.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs dark:border-white/10">
                    <History className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">v{v.version}</span>
                      <span className="text-zinc-500"> · {v.origen === 'ia' ? 'IA' : 'tu edición'} · {new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    {!aprobado && v.version !== art.version && (
                      <button type="button" onClick={() => restaurar(v)} className="flex items-center gap-0.5 text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                        <RotateCcw className="h-3 w-3" /> usar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmarAprobar}
        onClose={() => setConfirmarAprobar(false)}
        onConfirm={() => {
          cambiarEstado.mutate({ estado: 'aprobado' }, {
            onSuccess: () => toast.success('Artículo aprobado', 'Ya podés generar las adaptaciones.'),
            onError: (e) => toast.error('No se pudo aprobar', e instanceof Error ? e.message : undefined),
          })
          setConfirmarAprobar(false)
        }}
        title="Aprobar artículo"
        description={
          `${verificarEnTexto ? `Quedan ${verificarEnTexto} marcas [VERIFICAR] en el texto. ` : ''}` +
          `${art.alertas_confidencialidad?.length ? `Hay ${art.alertas_confidencialidad.length} posibles datos identificatorios del caso de origen. ` : ''}` +
          '¿Lo revisaste y lo aprobás como versión final? Nada se publica automáticamente.'
        }
        confirmLabel="Aprobar"
        variant="warning"
      />
    </div>
  )
}
