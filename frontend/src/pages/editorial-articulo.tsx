import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, BookOpen, MoreHorizontal, X, GitCompare, MessageSquareWarning, RefreshCw, Undo2, CheckCircle2, ClipboardCheck, Copy, Download, Eye, FileText, History, Loader2, PenLine, RotateCcw, Save, Send, ShieldAlert, Sparkles,
} from 'lucide-react'
import {
  useAccesoEditorial, useArticulo, useVersiones, useEditorialIA, useGuardarArticulo, useCambiarEstadoArticulo, useEnviarAContenidos, useGuardarBibliografia, usePuedeAprobarEditorial, useEquipoEditorial,
  useMiLectura, marcarLeido, useActualizacionesArticulo, useActualizarPropuesta,
  TIPO_ARTICULO_LABEL, ESTADO_ARTICULO_LABEL, type TipoArticulo, type Version,
} from '@/hooks/use-editorial'
import { MarkdownView } from '@/components/editorial/markdown-view'
import { descargarWord, imprimirPdf } from '@/components/editorial/exportar'
import { HojaEditor } from '@/components/editorial/hoja-editor'
import { DictarBoton } from '@/components/shared/dictar-boton'
import { CompararVersiones } from '@/components/editorial/comparar-versiones'
import { VerificacionCitas } from '@/components/editorial/verificacion-citas'
import { HallazgosPanel } from '@/components/editorial/investigacion-externa'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

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
  const { data: equipo = [] } = useEquipoEditorial()
  const yo = useAuthStore((s) => s.profile?.id)
  const { data: lectura, isFetched: lecturaLista } = useMiLectura(id)
  const { data: actualizaciones = [] } = useActualizacionesArticulo(id)
  const actualizarPropuesta = useActualizarPropuesta()
  const [leidaAntes, setLeidaAntes] = useState<number | null | undefined>(undefined)
  const [comparar, setComparar] = useState<{ titulo: string; antes: { etiqueta: string; texto: string }; despues: { etiqueta: string; texto: string } } | null>(null)
  const [devolviendo, setDevolviendo] = useState(false)
  const [searchParams] = useSearchParams()
  const seccionInicial = searchParams.get('seccion') as Panel | null
  const [seccion, setSeccion] = useState<Panel | 'articulo'>(seccionInicial ?? 'articulo')
  const [iaAbierta, setIaAbierta] = useState(false)
  // Alto de la barra fija: la barra de herramientas del editor se pega justo debajo
  const barraRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = barraRef.current
    if (!el) return
    const obs = new ResizeObserver(() => document.documentElement.style.setProperty('--ed-barra', `${el.offsetHeight}px`))
    obs.observe(el)
    return () => { obs.disconnect(); document.documentElement.style.removeProperty('--ed-barra') }
  }, [art?.id])
  const [observaciones, setObservaciones] = useState('')

  // Qué versión había leído antes de entrar (para "ver cambios"); después queda leída la actual
  useEffect(() => {
    if (!art || !yo || !lecturaLista) return
    if (leidaAntes === undefined) setLeidaAntes(lectura?.version ?? null)
    void marcarLeido(id, yo, art.version)
  }, [art?.version, yo, lecturaLista]) // eslint-disable-line react-hooks/exhaustive-deps

  const quien = (autorId: string | null) => (autorId === yo ? 'vos' : equipo.find((m) => m.id === autorId)?.nombre ?? 'edición')
  const [biblioTexto, setBiblioTexto] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('')
  const [bajada, setBajada] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [cargado, setCargado] = useState<string | null>(null)
  const [vista, setVista] = useState<'editar' | 'previa'>('previa')
  const [panel, setPanel] = useState<Panel>(seccionInicial ?? 'investigacion')
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
        if (modo === 'revisar') { setPanel('revision'); setSeccion('revision') }
        if (modo === 'redactar') { setIaAbierta(false); setVista('previa') }
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

  const textoDe = (t: { titulo: string; bajada: string | null; cuerpo: string }) => `${t.titulo}\n\n${t.bajada ? `${t.bajada}\n\n` : ''}${t.cuerpo}`
  const compararCon = (v: Version) => setComparar({
    titulo: 'Cambios en el artículo',
    antes: { etiqueta: `v${v.version}`, texto: textoDe(v) },
    despues: { etiqueta: `v${art.version} (actual)`, texto: textoDe(art) },
  })
  const versionLeida = leidaAntes != null && leidaAntes < art.version ? versiones.find((v) => v.version === leidaAntes) : undefined

  const devolver = () => {
    if (!observaciones.trim()) return
    setPidiendo('devolver')
    ia.mutate({ modo: 'devolver', articulo_id: id, observaciones: observaciones.trim() }, {
      onSuccess: (r) => {
        setDevolviendo(false); setObservaciones('')
        toast.success('Artículo devuelto', r.avisado ? 'Le llegó el aviso por Telegram.' : undefined)
      },
      onError: (e) => toast.error('No se pudo devolver', e instanceof Error ? e.message : undefined),
      onSettled: () => setPidiendo(null),
    })
  }

  const usarActualizacion = (p: { id: string; problema: string | null; hipotesis: string | null }) => {
    const texto = `Actualizar el artículo. Qué cambió: ${p.problema ?? ''}${p.hipotesis ? `\nQué revisar: ${p.hipotesis}` : ''}`
    const seguir = () => {
      setIndicaciones(texto)
      actualizarPropuesta.mutate({ id: p.id, estado: 'en_curso' })
      toast.info('Indicaciones cargadas', 'Revisalas y tocá "Reescribir con IA", o editá a mano.')
    }
    if (art.estado === 'aprobado' || art.estado === 'publicado') {
      cambiarEstado.mutate({ estado: 'borrador' }, { onSuccess: seguir, onError: (e) => toast.error('No se pudo pasar a borrador', e instanceof Error ? e.message : undefined) })
    } else seguir()
  }

  const copiar = async (texto: string, que: string) => {
    await navigator.clipboard.writeText(texto).catch(() => {})
    toast.success(`${que} copiado`)
  }

  const nVerificarPanel = (art.a_verificar?.length ?? 0) + (art.verificacion_citas ?? []).filter((c) => c.estado !== 'encontrada').length
  const SECCIONES: [Panel | 'articulo', string, number?][] = [
    ['articulo', 'Artículo'],
    ['investigacion', 'Investigación'],
    ['revision', 'Revisión'],
    ['verificar', 'Verificar', nVerificarPanel],
    ['bibliografia', 'Bibliografía', art.bibliografia?.length ?? 0],
    ['versiones', 'Versiones', versiones.length],
  ]
  const irA = (x: Panel | 'articulo') => {
    setSeccion(x)
    if (x !== 'articulo') setPanel(x)
    const main = barraRef.current?.closest('main')
    if (main && barraRef.current && main.scrollTop > barraRef.current.offsetTop) main.scrollTo({ top: barraRef.current.offsetTop, behavior: 'smooth' })
  }

  // Acciones: la principal siempre visible; el resto en línea en escritorio y en el menú en el celular
  const BTN = 'flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium disabled:opacity-40'
  const BTN_OUT = `${BTN} border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5`
  const BTN_OK = `${BTN} bg-emerald-600 text-white hover:bg-emerald-700`
  type Accion = { key: string; label: string; icon: typeof Save; onClick: () => void; disabled?: boolean; cargando?: boolean; tono?: 'ok' | 'out' | 'warn'; title?: string }
  const principales: Accion[] = []
  const secundarias: Accion[] = []
  if (!aprobado) {
    const g: Accion = { key: 'guardar', label: 'Guardar', icon: Save, onClick: guardarVersion, disabled: !sucio || guardar.isPending, cargando: guardar.isPending, tono: sucio ? 'ok' : 'out', title: 'Guardar como nueva versión' }
    ;(sucio ? principales : secundarias).push(g)
  }
  if (art.estado === 'borrador' && !puedeAprobar) {
    principales.push({ key: 'pedir', label: 'Pedir aprobación', icon: Send, tono: sucio ? 'out' : 'ok', onClick: () => correrIA('pedir_aprobacion', {}, 'Le avisamos a Marco por Telegram'),
      disabled: sucio || !art.cuerpo || pidiendo === 'pedir_aprobacion', cargando: pidiendo === 'pedir_aprobacion',
      title: sucio ? 'Guardá los cambios antes de pedir la aprobación' : 'Los artículos salen a nombre de Marco: él revisa y aprueba' })
  }
  if (art.estado === 'borrador' && puedeAprobar) {
    principales.push({ key: 'aprobar', label: 'Aprobar', icon: CheckCircle2, tono: sucio ? 'out' : 'ok', onClick: () => { void aprobar() }, disabled: sucio || !art.cuerpo,
      title: sucio ? 'Guardá los cambios antes de aprobar' : 'Aprobar el artículo (revisión final tuya)' })
    if (art.cuerpo) secundarias.push({ key: 'devolver', label: 'Devolver con observaciones', icon: Undo2, tono: 'warn', onClick: () => { setDevolviendo(true); irA('articulo') } })
  }
  if (aprobado) {
    principales.push({ key: 'word', label: 'Word', icon: Download, tono: 'ok', onClick: () => { void exportar('word') }, disabled: pidiendo === 'apa', cargando: pidiendo === 'apa', title: 'Times New Roman 12, interlineado 1,5, bibliografía APA al final' })
    principales.push({ key: 'pdf', label: 'PDF', icon: FileText, tono: 'out', onClick: () => { void exportar('pdf') }, disabled: pidiendo === 'apa' })
    if (puedeAprobar) secundarias.push({ key: 'editar', label: 'Volver a editar', icon: PenLine, onClick: () => cambiarEstado.mutate({ estado: 'borrador' }, { onSuccess: () => toast.info('Volvió a borrador') }) })
    if (art.estado === 'aprobado' && puedeAprobar) secundarias.push({ key: 'publicado', label: 'Marcar como publicado', icon: CheckCircle2, onClick: () => {
      const url = window.prompt('Link de la publicación (opcional)') ?? null
      cambiarEstado.mutate({ estado: 'publicado', publicado_url: url }, { onSuccess: () => toast.success('Marcado como publicado') })
    } })
  }
  secundarias.push({ key: 'copiar', label: 'Copiar texto', icon: Copy, onClick: () => { void copiar(`# ${titulo}\n\n${bajada ? `_${bajada}_\n\n` : ''}${cuerpo}`, 'Artículo') } })
  const claseAccion = (x: Accion) => x.tono === 'ok' ? BTN_OK : x.tono === 'warn'
    ? `${BTN} border border-orange-500/40 text-orange-700 hover:bg-orange-500/10 dark:text-orange-300` : BTN_OUT
  const botonAccion = (x: Accion) => (
    <button key={x.key} type="button" onClick={x.onClick} disabled={x.disabled} title={x.title} className={claseAccion(x)}>
      {x.cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <x.icon className="h-3.5 w-3.5" />} {x.label}
    </button>
  )

  const hoja = 'mx-auto max-w-[21cm] px-4 py-6 sm:px-10 sm:py-10 xl:px-[2.5cm] xl:py-[2.5cm]'

  return (
    <div className="mx-auto max-w-6xl space-y-3 pb-24 lg:space-y-4 lg:pb-16">
      <div className="hidden sm:block"><Breadcrumb items={[{ label: 'Editorial', href: '/editorial' }, { label: art.titulo.slice(0, 50) }]} /></div>

      {/* Barra superior: fija al hacer scroll en el celular */}
      <div ref={barraRef} className="sticky top-[-1rem] z-20 -mx-4 -mt-4 border-b border-zinc-200 bg-[var(--layout-bg)]/95 px-4 pb-2 pt-[calc(1rem+0.25rem)] backdrop-blur sm:top-[-1.5rem] sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-[calc(1.5rem+0.25rem)] lg:static lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none dark:border-white/10">
        <div className="flex items-center gap-2">
          <Link to="/editorial" className="-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-500/10" title="Volver"><ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                aprobado ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
                {ESTADO_ARTICULO_LABEL[art.estado]}
              </span>
              {sucio && <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />sin guardar</span>}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              v{art.version} · {palabras(cuerpo)} palabras<span className="hidden sm:inline">{art.modelo_ia ? ` · ${art.modelo_ia.replace('anthropic/', '')}` : ''}</span>
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            {secundarias.map(botonAccion)}
          </div>
          {principales.map(botonAccion)}
          <MenuMas acciones={secundarias.filter((x) => !x.disabled)} />
        </div>

        {/* Secciones (celular y tablet) */}
        <div className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 no-scrollbar sm:-mx-6 sm:px-6 lg:hidden">
          {SECCIONES.map(([x, label, n]) => (
            <button key={x} type="button" onClick={(e) => { irA(x); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }) }}
              className={cn('flex min-h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium',
                seccion === x ? 'bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]' : 'text-zinc-500 hover:bg-zinc-500/10')}>
              {label}{n ? <span className="tabular-nums opacity-70">{n}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Avisos */}
      {devolviendo && (
        <div className="space-y-2 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Observaciones para devolver el artículo</p>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={4} autoFocus
            placeholder="Qué hay que corregir, ampliar o sacar…"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
          <div className="flex flex-wrap items-center gap-2">
            <DictarBoton label="Dictar" onTexto={(t) => setObservaciones((p) => (p.trim() ? `${p.trim()} ${t}` : t))} />
            <span className="flex-1" />
            <button type="button" onClick={() => setDevolviendo(false)} className={`${BTN} text-zinc-500 hover:bg-zinc-500/10`}>Cancelar</button>
            <button type="button" onClick={devolver} disabled={!observaciones.trim() || pidiendo === 'devolver'}
              className={`${BTN} bg-orange-600 text-white hover:bg-orange-700`}>
              {pidiendo === 'devolver' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Devolver y avisar
            </button>
          </div>
        </div>
      )}
      {art.devuelto_at && art.observaciones && art.estado === 'borrador' && (
        <Aviso tono="orange" icon={MessageSquareWarning} titulo={`Observaciones de Marco · ${new Date(art.devuelto_at).toLocaleDateString('es-AR')}`}>
          <p className="whitespace-pre-wrap">{art.observaciones}</p>
          {!puedeAprobar && <p className="mt-1.5 text-xs text-zinc-500">Cuando lo corrijas, guardá y pedí la aprobación de nuevo.</p>}
        </Aviso>
      )}
      {versionLeida && (
        <Aviso tono="sky" icon={GitCompare} titulo={`Cambió desde la v${versionLeida.version}, la última que leíste`}
          accion={{ label: 'Ver cambios', onClick: () => compararCon(versionLeida) }} />
      )}
      {actualizaciones.map((p) => (
        <Aviso key={p.id} tono="orange" icon={RefreshCw} titulo="Puede haber quedado desactualizado">
          {p.problema && <p>{p.problema}</p>}
          {p.hipotesis && <p className="mt-1 text-zinc-600 dark:text-zinc-400"><span className="font-medium">Qué revisar:</span> {p.hipotesis}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {(puedeAprobar || !aprobado) && (
              <button type="button" onClick={() => usarActualizacion(p)} className={`${BTN} bg-orange-600 text-white hover:bg-orange-700`}>
                {aprobado ? 'Volver a borrador y actualizar' : 'Usar como indicaciones'}
              </button>
            )}
            <button type="button" onClick={() => actualizarPropuesta.mutate({ id: p.id, estado: 'descartada' }, { onSuccess: () => toast.info('Descartada') })}
              className={`${BTN} text-zinc-500 hover:bg-zinc-500/10`}>No hace falta</button>
          </div>
        </Aviso>
      ))}
      {art.alertas_confidencialidad?.length > 0 && (
        <Aviso tono="rose" icon={ShieldAlert} titulo="Posibles datos identificatorios del caso de origen">
          <ul className="list-disc pl-4">{art.alertas_confidencialidad.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Aviso>
      )}
      {verificarEnTexto > 0 && (
        <Aviso tono="amber" icon={AlertTriangle}
          titulo={`${verificarEnTexto} ${verificarEnTexto === 1 ? 'marca' : 'marcas'} [VERIFICAR] en el texto`}
          accion={{ label: 'Qué revisar', onClick: () => irA('verificar') }} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Columna del artículo */}
        <div className={cn('min-w-0 space-y-3', seccion !== 'articulo' && 'hidden lg:block')}>
          {/* IA: redactar / reescribir / revisar */}
          {!aprobado && (
            <div className="dashboard-panel rounded-2xl p-3 sm:p-4">
              {art.cuerpo && !iaAbierta ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setIaAbierta(true)} disabled={!!pidiendo}
                    className={`${BTN} flex-1 bg-[var(--brand-navy)] text-white hover:opacity-90 sm:flex-none dark:bg-white dark:text-[var(--brand-navy)]`}>
                    {pidiendo === 'redactar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {pidiendo === 'redactar' ? 'Redactando…' : 'Reescribir con IA'}
                  </button>
                  <button type="button" onClick={() => { if (sucio) return toast.info('Guardá tus cambios primero'); correrIA('revisar', {}, 'Revisión crítica lista') }} disabled={!!pidiendo}
                    className={`${BTN_OUT} flex-1 sm:flex-none`}>
                    {pidiendo === 'revisar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />} Revisión crítica
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{art.cuerpo ? 'Reescribir con IA' : 'Redactar el borrador'}</p>
                      <p className="text-xs text-zinc-500">{art.cuerpo ? 'La IA rehace el texto sobre la última versión guardada, respetando tus cambios.' : 'La IA redacta a partir de la investigación. Después lo editás vos.'}</p>
                    </div>
                    {art.cuerpo && <button type="button" onClick={() => setIaAbierta(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-500/10" title="Cerrar"><X className="h-4 w-4" /></button>}
                  </div>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoArticulo)}
                    className="min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-base sm:min-h-9 sm:w-auto sm:text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200">
                    {(Object.keys(TIPO_ARTICULO_LABEL) as TipoArticulo[]).map((t) => <option key={t} value={t}>{TIPO_ARTICULO_LABEL[t]}</option>)}
                  </select>
                  <textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} rows={3}
                    placeholder="Indicaciones (opcional): enfoque, extensión, qué agregar o sacar, a quién va dirigido…"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200" />
                  {!art.cuerpo && art.investigacion && (
                    <button type="button" onClick={() => irA('investigacion')} className="text-xs font-medium text-[var(--brand-accent)] underline underline-offset-2 lg:hidden dark:text-[var(--brand-ice)]">
                      Leer la investigación antes de redactar
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <DictarBoton label="Dictar" disabled={!!pidiendo} onTexto={(t) => setIndicaciones((p) => (p.trim() ? `${p.trim()} ${t}` : t))} />
                    <span className="flex-1" />
                    <button type="button" onClick={redactar} disabled={!!pidiendo}
                      className={`${BTN} min-h-10 bg-[var(--brand-navy)] px-4 text-sm text-white hover:opacity-90 sm:min-h-9 sm:text-xs dark:bg-white dark:text-[var(--brand-navy)]`}>
                      {pidiendo === 'redactar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {pidiendo === 'redactar' ? 'Redactando… (1-2 min)' : art.cuerpo ? 'Reescribir' : 'Redactar borrador'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* El texto */}
          {(art.cuerpo || cuerpo) && (
            <div className="dashboard-panel rounded-2xl !overflow-visible p-2 sm:p-4">
              {!aprobado && (
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-zinc-500/10 p-1 sm:mb-3 sm:inline-grid">
                  {(['previa', 'editar'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setVista(v)}
                      className={cn('flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-medium sm:min-h-8',
                        vista === v ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
                      {v === 'previa' ? <Eye className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
                      {v === 'previa' ? 'Vista previa' : 'Editar'}
                    </button>
                  ))}
                </div>
              )}
              {vista === 'editar' && !aprobado ? (
                <HojaEditor articuloId={id} titulo={titulo} bajada={bajada} cuerpo={cuerpo}
                  onTitulo={setTitulo} onBajada={setBajada} onCuerpo={setCuerpo} />
              ) : (
                <article className="overflow-hidden rounded-lg bg-white text-black shadow-sm ring-1 ring-zinc-200 dark:ring-white/10">
                  <div className={cn(hoja, 'text-justify')} style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: 1.5 }}>
                    <p className="text-center font-bold" style={{ fontSize: '14pt' }}>{titulo}</p>
                    {bajada && <p className="mt-1 text-center italic">{bajada}</p>}
                    <p className="mt-3 text-center">Marco Rossi</p>
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
            </div>
          )}

          {/* Adaptaciones (solo aprobado) */}
          {aprobado && (
            <div className="dashboard-panel space-y-3 rounded-2xl p-3 sm:p-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Adaptaciones</p>
                <p className="text-xs text-zinc-500">Versiones cortas del artículo aprobado para redes y boletín.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                {([['linkedin', 'LinkedIn'], ['redes', 'Instagram / Facebook'], ['boletin', 'Boletín']] as const).map(([f, label]) => (
                  <button key={f} type="button" disabled={!!pidiendo} onClick={() => correrIA('adaptar', { formato: f }, `Versión para ${label} lista`)} className={`${BTN_OUT} min-h-10 sm:min-h-9`}>
                    {pidiendo === 'adaptar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {art.adaptaciones?.[f] ? `Rehacer ${label}` : label}
                  </button>
                ))}
              </div>
              {(['linkedin', 'redes', 'boletin'] as const).filter((f) => art.adaptaciones?.[f]).map((f) => (
                <div key={f} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{f === 'redes' ? 'Instagram / Facebook' : f === 'boletin' ? 'Boletín' : 'LinkedIn'}</p>
                    <button type="button" onClick={() => copiar(art.adaptaciones[f]!, 'Texto')} className={`${BTN} text-zinc-600 hover:bg-zinc-500/10 dark:text-zinc-300`}><Copy className="h-3.5 w-3.5" /> Copiar</button>
                    <button type="button" disabled={enviarContenidos.isPending}
                      onClick={() => enviarContenidos.mutate(
                        { titulo: art.titulo, texto: art.adaptaciones[f]!, categoria: f === 'linkedin' ? 'linkedin' : f === 'boletin' ? 'newsletter' : 'instagram' },
                        { onSuccess: () => toast.success('Enviado a Contenidos como borrador'), onError: (e) => toast.error('No se pudo enviar', e instanceof Error ? e.message : undefined) },
                      )}
                      className={`${BTN} text-[var(--brand-accent)] hover:bg-zinc-500/10 dark:text-[var(--brand-ice)]`}>
                      <Send className="h-3.5 w-3.5" /> A Contenidos
                    </button>
                  </div>
                  <MarkdownView texto={art.adaptaciones[f]!} className="text-sm" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel de apoyo: al costado en escritorio, como sección en el celular */}
        <aside className={cn('dashboard-panel h-fit rounded-2xl p-3 sm:p-4 lg:sticky lg:top-0 lg:p-3', seccion === 'articulo' && 'hidden lg:block')}>
          <div className="mb-3 hidden grid-cols-5 gap-1 lg:grid">
            {([['investigacion', 'Investig.'], ['revision', 'Revisión'], ['verificar', 'Verificar'], ['bibliografia', 'Biblio.'], ['versiones', 'Versiones']] as const).map(([p, label]) => (
              <button key={p} type="button" onClick={() => setPanel(p)}
                className={cn('rounded-md px-1.5 py-1 text-[11px] font-medium',
                  panel === p ? 'bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700')}>
                {label}
              </button>
            ))}
          </div>
          <div className="lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
            {panel === 'investigacion' && (
              <div className="space-y-4">
                <HallazgosPanel articuloId={id} informeCargado={!!art.informe_cargado_at} puedeCargar={!aprobado} />
                {art.investigacion && (
                  <div className="border-t border-zinc-200 pt-3 dark:border-white/10">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Investigación de la IA (sin fuentes comprobadas)</p>
                    <MarkdownView texto={art.investigacion} className="text-sm" />
                  </div>
                )}
                {art.informe_externo && (
                  <details className="border-t border-zinc-200 pt-3 dark:border-white/10">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Informe original de Gemini</summary>
                    <MarkdownView texto={art.informe_externo} className="mt-2 text-sm" />
                  </details>
                )}
              </div>
            )}
            {panel === 'revision' && (art.revision_critica
              ? <MarkdownView texto={art.revision_critica} className="text-sm" />
              : <p className="text-sm text-zinc-500">Todavía no hay revisión. Pedila con "Revisión crítica", arriba del texto.</p>)}
            {panel === 'bibliografia' && (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <BookOpen className="h-3.5 w-3.5" /> Referencias (APA 7) · siempre al final del documento
                </p>
                {biblioTexto !== null ? (
                  <>
                    <textarea value={biblioTexto} onChange={(e) => setBiblioTexto(e.target.value)} rows={10}
                      placeholder="Una entrada por línea"
                      className="w-full rounded-lg border border-zinc-200 bg-transparent p-2 text-base leading-relaxed sm:text-xs dark:border-white/10" />
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
                <VerificacionCitas citas={art.verificacion_citas ?? []} verificadoAt={art.citas_verificadas_at}
                  desactualizada={!!art.citas_verificadas_at && art.updated_at > art.citas_verificadas_at}
                  pidiendo={pidiendo === 'verificar_citas'}
                  onVerificar={() => {
                    if (sucio) return toast.info('Guardá tus cambios primero')
                    correrIA('verificar_citas', {}, 'Citas verificadas')
                  }} />
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
                      <span className="text-zinc-500"> · {v.origen === 'ia' ? `IA${v.autor_id && v.autor_id !== yo ? ` (pedida por ${quien(v.autor_id)})` : ''}` : quien(v.autor_id)} · {new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    {v.version !== art.version && (
                      <button type="button" onClick={() => compararCon(v)} className="flex items-center gap-0.5 text-zinc-500 hover:underline" title="Ver qué cambió desde esta versión hasta la actual">
                        <GitCompare className="h-3 w-3" /> cambios
                      </button>
                    )}
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
          `${!art.citas_verificadas_at ? 'Las citas no se verificaron contra tu base (pestaña Verificar). ' : (art.verificacion_citas ?? []).some((c) => c.estado === 'no_encontrada') ? `${(art.verificacion_citas ?? []).filter((c) => c.estado === 'no_encontrada').length} citas no están en tu base. ` : ''}` +
          '¿Lo revisaste y lo aprobás como versión final? Nada se publica automáticamente.'
        }
        confirmLabel="Aprobar"
        variant="warning"
      />
      {comparar && <CompararVersiones {...comparar} onClose={() => setComparar(null)} />}
    </div>
  )
}

const TONOS = {
  orange: { caja: 'border-orange-500/30 bg-orange-500/5', icono: 'text-orange-600 dark:text-orange-400', titulo: 'text-orange-800 dark:text-orange-300' },
  sky: { caja: 'border-sky-500/30 bg-sky-500/5', icono: 'text-sky-600 dark:text-sky-400', titulo: 'text-sky-800 dark:text-sky-300' },
  rose: { caja: 'border-rose-500/30 bg-rose-500/5', icono: 'text-rose-600 dark:text-rose-400', titulo: 'text-rose-800 dark:text-rose-300' },
  amber: { caja: 'border-amber-500/30 bg-amber-500/5', icono: 'text-amber-600 dark:text-amber-400', titulo: 'text-amber-800 dark:text-amber-300' },
} as const

function Aviso({ tono, icon: Icon, titulo, accion, children }: {
  tono: keyof typeof TONOS
  icon: typeof AlertTriangle
  titulo: string
  accion?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  const t = TONOS[tono]
  return (
    <div className={cn('flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200', t.caja)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.icono)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn('flex-1 font-medium leading-snug', t.titulo)}>{titulo}</p>
          {accion && <button type="button" onClick={accion.onClick} className={cn('shrink-0 text-xs font-semibold underline underline-offset-2', t.titulo)}>{accion.label}</button>}
        </div>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  )
}

function MenuMas({ acciones }: { acciones: { key: string; label: string; icon: typeof AlertTriangle; onClick: () => void; disabled?: boolean }[] }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // La barra tiene backdrop-blur (crea su propio contexto para elementos fixed): se cierra escuchando el documento
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  if (!acciones.length) return null
  return (
    <div ref={ref} className="relative lg:hidden">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-label="Más acciones" aria-expanded={abierto}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          {acciones.map((x) => (
            <button key={x.key} type="button" disabled={x.disabled}
              onClick={() => { setAbierto(false); x.onClick() }}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/5">
              <x.icon className="h-4 w-4 shrink-0 text-zinc-400" /> {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
