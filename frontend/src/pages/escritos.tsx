import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  PenLine, Plus, Search, X, Loader2, FileText, Trash2, Printer,
  Sparkles, Pencil, Check, ChevronDown, ChevronUp, FolderOpen,
  Save, Upload, Wand2, Mic, Square, Layers, BookOpen, Gavel,
  PanelLeftClose, PanelLeftOpen, MoreHorizontal, History, UserCheck,
  ArrowLeft, Link2, ExternalLink, Copy, ClipboardCheck,
  SlidersHorizontal, Eye, ListChecks, MessageSquare, BarChart3,
} from 'lucide-react'
import { PerfilRedaccionDialog } from '@/components/escritos/perfil-redaccion-dialog'
import { NuevoDesdePlantilla, GuardarPlantillaDialog } from '@/components/escritos/plantilla-nuevo'
import { UsoIADialog } from '@/components/escritos/uso-ia'
import { ContextoIAVista, EsquemaEditor } from '@/components/escritos/contexto-ia'
import { AsistentePanel, type FocoAsistente } from '@/components/escritos/asistente-panel'
import { PanelEscrito, revisionDesactualizada, useCitasDetectadas } from '@/components/escritos/panel-escrito'
import { AntesDeFirmarDialog } from '@/components/escritos/revision-formal'
import { PresentarSaeDialog } from '@/components/escritos/presentar-sae-dialog'
import { EscritosAyudaBoton } from '@/components/escritos/escritos-ayuda'
import { BannerRevision, EnviarRevisionDialog } from '@/components/escritos/revision-escrito'
import { useAuthStore } from '@/stores/auth-store'
import { useContextoIA, useEsquemaEscrito, useRevisarEscrito, type Calidad, type ContextoIA, type Esquema } from '@/hooks/use-redaccion'
import { datosPorCompletar } from '@/components/expedientes/guia-escrito'
import { useAuth } from '@/hooks/use-auth'
import {
  useAllEscritos, useEscritoModelos, useGenerateEscrito, useUpdateEscrito,
  useDeleteEscrito, useAttachSignedPdf,
  useCrearModelo, useExtraerModelo, useTranscribirAudio, useEscritoTemplates,
  useFetchReferencia, useEscritoHistorial,
  type Escrito, type EscritoContenido, type EscritoConExpediente,
  type ReferenciaExterna,
} from '@/hooks/use-escritos'
import { useSearchNormativaByText, type NormativaDocumento } from '@/hooks/use-normativa'
import {
  useSearchJurisprudenciaByText, useBuscarJurisprudenciaAfin,
  type JurisprudenciaDocumento,
} from '@/hooks/use-jurisprudencia'
import { useSaeMovements } from '@/hooks/use-sae'
import { useCreateTarea } from '@/hooks/use-tareas'
import { EscritoPreview, type EscritoEncabezadoAbogado } from '@/components/expedientes/escrito-preview'
import { GuiaEscrito } from '@/components/expedientes/guia-escrito'
import { CaracterSelector, CARACTER_POR_DEFECTO, formulaPresentacion, inferirCaracter, type CaracterEscrito } from '@/components/expedientes/caracter-escrito'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAbogado(profile: ReturnType<typeof useAuth>['profile']): EscritoEncabezadoAbogado | null {
  if (!profile) return null
  return {
    nombreCompleto: `${profile.nombre ?? ''} ${profile.apellido ?? ''}`.trim().toUpperCase(),
    matricula: profile.matricula ?? null,
    matriculaLibro: profile.matricula_libro ?? null,
    matriculaFolio: profile.matricula_folio ?? null,
    domicilioLegal: profile.domicilio_legal ?? null,
    telefono: profile.telefono ?? null,
    email: profile.email ?? null,
    casilleroNotif: profile.casillero_notif ?? null,
    cuit: profile.cuit ?? null,
  }
}

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador', final: 'Final', firmado: 'Firmado',
  presentado_sae: 'Pres. SAE', presentado: 'Presentado',
}
const ESTADO_COLORS: Record<string, string> = {
  borrador: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  final: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  firmado: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  presentado_sae: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  presentado: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
}
const ESTADO_NEUTRO = 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'

/** Etiqueta de estado (pastilla con borde), como en Consultas. */
const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'

/** Modales y hojas inferiores con el lenguaje del sitio. */
const MODAL_FONDO = 'fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4'
const MODAL_CAJA = 'rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)] sm:rounded-3xl'
const BORDE = 'border-zinc-200 dark:border-white/[0.07]'

/** Pestañas con subrayado: un solo color activo. */
const TAB_ACTIVA = 'border-[var(--brand-navy)] text-[var(--brand-navy)] dark:border-[var(--brand-accent)] dark:text-white'
const TAB_INACTIVA = 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'

const TIPOS_SUGERIDOS = [
  'Demanda', 'Contestación de demanda', 'Contestación de traslado',
  'Alegato', 'Recurso de apelación', 'Recurso de reposición',
  'Expresión de agravios', 'Memorial', 'Ofrecimiento de prueba',
  'Oficio', 'Pronto despacho', 'Adjunta bono de movilidad',
  'Acompaña documental', 'Denuncia domicilio', 'Solicita libramiento de cédula',
  'Solicita libramiento de oficio', 'Toma vista de las actuaciones',
]

// Portales jurídicos externos para búsqueda
const PORTALES_EXTERNOS = [
  { label: 'Infojus', url: 'http://www.saij.gob.ar', desc: 'SAIJ — normativa y jurisprudencia nacional' },
  { label: 'CSJN', url: 'https://sj.csjn.gov.ar/sj/', desc: 'Corte Suprema de Justicia de la Nación' },
  { label: 'Poder Jud. Tucumán', url: 'https://www.justucuman.gov.ar', desc: 'Juzgados y cámaras provinciales' },
  { label: 'El Dial', url: 'https://www.eldial.com', desc: 'Doctrina y jurisprudencia (subscripción)' },
  { label: 'Microjuris', url: 'https://ar.microjuris.com', desc: 'Base de fallos y doctrina' },
]

/** Presentación en el portal del SAE desde la app (escritos-presentar, relevado nov-2026). */
const PRESENTACION_SAE_LISTA = true

// ─── NuevoEscritoDialog ───────────────────────────────────────────────────────

/** Mismo criterio que el servidor (_shared/modelos-ia.ts) para escritos de fondo. */
const RE_FONDO = /demanda|contesta|alegato|agravio|memorial|apelaci|recurso|casaci|nulidad|queja|reposici|revocatoria|ofrec\w* (de )?prueba|amparo|medida cautelar|cautelar|embargo|incidente|excepci|impugna|liquidaci|tutela|interdicto|ejecuci/i

const RESPONDIBLE_TYPES_FRONTEND = new Set([
  'decreto', 'traslado', 'intimacion', 'cedula', 'sentencia',
  'providencia', 'resolucion', 'auto', 'despacho',
])

/** Valores con los que se abre el formulario (desde un expediente o una actuación). */
export interface NuevoInicial { expedienteId: string; respondeA: string }

// Escritos cotidianos de un toque: cargan el tipo y una instrucción base; la IA los completa con el expediente.
const TRAMITE_PRESETS: { label: string; tipo: string; instr: string }[] = [
  { label: 'Adjunta bono', tipo: 'Adjunta bono de movilidad', instr: 'Acompañar el bono de movilidad y solicitar se tenga por cumplido a fin de notificar / diligenciar lo ordenado.' },
  { label: 'Acompaña documental', tipo: 'Acompaña documental', instr: 'Acompañar la documental que se individualiza y solicitar se tenga presente y por agregada.' },
  { label: 'Domicilio electrónico', tipo: 'Constituye domicilio electrónico', instr: 'Constituir domicilio electrónico y denunciar el real, solicitando se tenga presente.' },
  { label: 'Libramiento de cédula', tipo: 'Solicita libramiento de cédula', instr: 'Solicitar se libre cédula de notificación conforme lo ordenado, con los recaudos de estilo.' },
  { label: 'Libramiento de oficio', tipo: 'Solicita libramiento de oficio', instr: 'Solicitar se libre oficio conforme lo ordenado, autorizando su diligenciamiento.' },
  { label: 'Toma vista', tipo: 'Toma vista de las actuaciones', instr: 'Solicitar vista de las actuaciones por el plazo de ley.' },
  { label: 'Pronto despacho', tipo: 'Pronto despacho', instr: 'Solicitar pronto despacho de lo peticionado, atento el tiempo transcurrido.' },
  { label: 'Denuncia domicilio', tipo: 'Denuncia domicilio', instr: 'Denunciar el domicilio real de la contraria / del tercero para su notificación.' },
]

const campoBase = 'field'
const rotulo = 'mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300'
const rotuloNota = 'font-normal text-zinc-400 dark:text-zinc-500'

function Paso({ n, titulo, extra, children }: { n: number; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[10.5px] font-bold tabular-nums text-cyan-700 dark:text-cyan-300">{n}</span>
        <h3 className="text-[13.5px] font-bold tracking-tight text-zinc-900 dark:text-white">{titulo}</h3>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      {children}
    </section>
  )
}

function NuevoEscritoDialog({ inicial, onClose, onCreated }: { inicial?: NuevoInicial; onClose: () => void; onCreated: (id: string) => void }) {
  const [tipo, setTipo] = useState('')
  const [ideaLibre, setIdeaLibre] = useState('')
  const [instrucciones, setInstrucciones] = useState('')
  const [caracter, setCaracter] = useState<CaracterEscrito>(CARACTER_POR_DEFECTO)
  const [caracterTocado, setCaracterTocado] = useState(false)
  useEffect(() => {
    if (!caracterTocado) setCaracter(inferirCaracter(`${tipo} ${ideaLibre}`, CARACTER_POR_DEFECTO))
  }, [tipo, ideaLibre, caracterTocado])
  const [expedienteId, setExpedienteId] = useState(inicial?.expedienteId ?? '')
  const [expedienteQuery, setExpedienteQuery] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [mediaRec, setMediaRec] = useState<MediaRecorder | null>(null)
  const audioFileRef = useRef<HTMLInputElement>(null)
  const [respondeA, setRespondeA] = useState('')
  const [actuacionesExtra, setActuacionesExtra] = useState<string[]>([])
  const [contraparteTexto, setContraparteTexto] = useState('')
  const [showContraparte, setShowContraparte] = useState(false)
  const [avanzadas, setAvanzadas] = useState(false)
  const [calidad, setCalidad] = useState<Calidad>('auto')
  const [modo, setModo] = useState<'ia' | 'plantilla'>('ia')
  const esFondo = RE_FONDO.test(`${tipo} ${ideaLibre}`)
  const [esquemaPrimero, setEsquemaPrimero] = useState<boolean | null>(null)
  const usarEsquema = esquemaPrimero ?? esFondo
  const [esquema, setEsquema] = useState<Esquema | null>(null)
  const [contexto, setContexto] = useState<ContextoIA | null>(null)
  const verContexto = useContextoIA()
  const armarEsquema = useEsquemaEscrito()
  const { data: modelos = [] } = useEscritoModelos()
  const { data: templates = [] } = useEscritoTemplates()
  const { data: movimientos = [] } = useSaeMovements(expedienteId)
  const { progressMsg, ...generate } = useGenerateEscrito()
  const transcribir = useTranscribirAudio()
  const crearTarea = useCreateTarea()
  const { profile } = useAuth()
  const [expedientes, setExpedientes] = useState<Array<{ id: string; label: string }>>([])
  const supabase = createClient()

  // Abierto desde un expediente: mostrar su carátula
  useEffect(() => {
    if (!inicial?.expedienteId) return
    void (async () => {
      const { data } = await (supabase as any).from('expedientes').select('id, numero, caratula').eq('id', inicial.expedienteId).maybeSingle()
      if (data) setExpedienteQuery(data.caratula ? `${data.caratula} (${data.numero})` : data.numero)
    })()
  }, [inicial?.expedienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const buscarExpedientes = useCallback(async (q: string) => {
    const t = q.replace(/[,()%]/g, ' ').trim()
    if (t.length < 2) return
    const { data } = await (supabase as any)
      .from('expedientes').select('id, numero, caratula').or(`caratula.ilike.%${t}%,numero.ilike.%${t}%`).limit(20)
    setExpedientes((data ?? []).map((e: { id: string; numero: string; caratula: string | null }) => ({
      id: e.id, label: e.caratula ? `${e.caratula} (${e.numero})` : e.numero,
    })))
  }, [supabase])

  const onSelectActuacion = (id: string) => {
    setRespondeA(id)
    const m = movimientos.find(mv => mv.id === id)
    const acc = m?.ai_suggested_action
    if (!acc) return
    if (!tipo.trim() && !ideaLibre.trim() && acc.titulo) setTipo(acc.titulo)
    const desc = [acc.titulo, acc.descripcion].filter(Boolean).join(' — ')
    if (!instrucciones.trim() && desc) setInstrucciones(desc)
  }

  // Abierto desde "Redactar respuesta": preseleccionar la actuación cuando cargan los movimientos
  const respondeAplicado = useRef(false)
  useEffect(() => {
    if (respondeAplicado.current || !inicial?.respondeA || !movimientos.length) return
    respondeAplicado.current = true
    onSelectActuacion(inicial.respondeA)
  }, [inicial?.respondeA, movimientos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const volcarAudio = async (blob: Blob) => {
    try {
      const texto = await transcribir.mutateAsync(blob)
      setIdeaLibre(prev => prev.trim() ? `${prev.trim()}\n${texto}` : texto)
    } catch { toast.error('No se pudo transcribir el audio') }
  }

  const toggleGrabar = async () => {
    if (grabando && mediaRec) { mediaRec.stop(); setGrabando(false); return }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) { toast.error('No se pudo acceder al micrófono'); return }
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      void volcarAudio(new Blob(chunks, { type: 'audio/webm' }))
    }
    setMediaRec(rec)
    rec.start()
    setGrabando(true)
  }

  const aplicarPreset = (p: { tipo: string; instr: string }) => {
    if (tipo === p.tipo) { setTipo(''); if (instrucciones === p.instr) setInstrucciones(''); return }
    setTipo(p.tipo)
    if (!instrucciones.trim() || TRAMITE_PRESETS.some(x => x.instr === instrucciones)) setInstrucciones(p.instr)
  }

  const selectedModelo = modelos.find(m => m.id === modeloId)

  const inputBase = () => ({
    expediente_id: expedienteId || null,
    tipo: tipo || '',
    idea_libre: ideaLibre.trim() || null,
    responde_a_movimiento_id: respondeA || undefined,
    escrito_contraparte_texto: contraparteTexto.trim() || null,
    instrucciones: instrucciones.trim() || undefined,
    caracter,
    template_id: templateId || null,
    modelo_id: modeloId || null,
    borrador_previo: selectedModelo?.contenido_modelo ?? undefined,
    actuaciones_extra_ids: actuacionesExtra.length > 0 ? actuacionesExtra : null,
    calidad,
  })

  const hayPedido = !!tipo.trim() || !!ideaLibre.trim()

  const handleVerContexto = async () => {
    if (!hayPedido) { toast.error('Contá qué necesitás presentar o elegí un trámite'); return }
    try { setContexto(await verContexto.mutateAsync(inputBase())) }
    catch (err) { toast.error('No se pudo armar el contexto', err instanceof Error ? err.message : '') }
  }

  const handleEsquema = async () => {
    if (!hayPedido) { toast.error('Contá qué necesitás presentar o elegí un trámite'); return }
    try {
      const r = await armarEsquema.mutateAsync(inputBase())
      setEsquema(r.esquema ?? {})
      setContexto(r.contexto)
    } catch (err) { toast.error('No se pudo armar el esquema', err instanceof Error ? err.message : '') }
  }

  const handleGenerar = async () => {
    if (!hayPedido) { toast.error('Contá qué necesitás presentar o elegí un trámite'); return }
    try {
      const result = await generate.mutateAsync({ ...inputBase(), esquema: esquema ?? null })
      // Si responde a una actuación, queda una tarea de presentación (no queda suelto)
      if (respondeA && expedienteId && profile?.id) {
        const mov = movimientos.find(m => m.id === respondeA)
        const ref = mov ? `${mov.tipo_movimiento} del ${mov.fecha}${mov.titulo ? ` — ${mov.titulo}` : ''}` : ''
        crearTarea.mutate({
          titulo: `Presentar escrito${tipo.trim() ? `: ${tipo.trim()}` : ''}`.slice(0, 200),
          descripcion: ref ? `Responde a: ${ref}` : null,
          expediente_id: expedienteId,
          estado: 'PENDIENTE',
          prioridad: 'MEDIA',
          created_by: profile.id,
          asignado_a: profile.id,
        } as never)
      }
      onCreated(result.escrito_id)
    } catch (err) {
      toast.error('Error al generar', err instanceof Error ? err.message : '')
    }
  }

  const ocupado = generate.isPending || transcribir.isPending || armarEsquema.isPending
  const modeloTxt = calidad === 'preciso' || (calidad === 'auto' && esFondo) ? 'Opus' : 'Sonnet'
  const resumenAvanzadas = [
    `${calidad === 'auto' ? 'Automático' : calidad === 'preciso' ? 'Preciso' : 'Rápido'} (${modeloTxt})`,
    usarEsquema ? 'con esquema previo' : 'sin esquema',
    selectedModelo ? `modelo: ${selectedModelo.nombre}` : null,
    actuacionesExtra.length ? `+${actuacionesExtra.length} actuaciones` : null,
  ].filter(Boolean).join(' · ')
  const aviso = !hayPedido
    ? 'Contá qué necesitás presentar o elegí un trámite.'
    : !expedienteId
      ? 'Sin expediente, la IA no usa las actuaciones ni los datos de la causa.'
      : usarEsquema && !esquema
        ? 'Primero vas a ver el esquema de argumentos para aprobarlo.'
        : `Lo redacta ${modeloTxt} con los datos del expediente.`

  const pickerExpediente = (
    <div>
      {expedienteId ? (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span className="flex-1 truncate text-sm font-semibold text-cyan-800 dark:text-cyan-100">{expedienteQuery || 'Expediente seleccionado'}</span>
          <button type="button" title="Cambiar expediente"
            onClick={() => { setExpedienteId(''); setExpedienteQuery(''); setRespondeA(''); setActuacionesExtra([]) }}
            className="text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text" list="escritos-expedientes" value={expedienteQuery} autoFocus={!inicial?.expedienteId}
              onChange={e => {
                const val = e.target.value
                setExpedienteQuery(val)
                const match = expedientes.find(ex => ex.label === val)
                setExpedienteId(match?.id ?? '')
                setRespondeA('')
                setActuacionesExtra([])
                void buscarExpedientes(val)
              }}
              placeholder="Buscar por carátula o número…"
              className={cn(campoBase, 'h-11 pl-10')}
            />
          </div>
          <datalist id="escritos-expedientes">
            {expedientes.map(ex => <option key={ex.id} value={ex.label} />)}
          </datalist>
          <p className="mt-1.5 text-[11.5px] text-zinc-500">Con el expediente se completan solos el carácter, la carátula y las actuaciones. Podés seguir sin elegir uno.</p>
        </>
      )}
    </div>
  )

  return (
    <div data-oculta-bogabot className={MODAL_FONDO} onClick={ocupado ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()}
        className={cn(MODAL_CAJA, 'flex max-h-[94vh] w-full flex-col overflow-hidden', esquema ? 'sm:max-w-2xl' : 'sm:max-w-xl')}>
        <div className={cn('flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4', BORDE)}>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">{esquema ? 'Esquema del escrito' : 'Nuevo escrito'}</h2>
            <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{esquema ? 'Ajustá los argumentos y el orden. La redacción va a seguir este esquema.' : modo === 'plantilla' ? 'Escritos de trámite con los datos del expediente, al instante.' : 'Elegí el expediente y contá qué hay que presentar.'}</p>
          </div>
          <button onClick={onClose} disabled={ocupado} title="Cerrar" className="btn btn-ghost btn-icon shrink-0 border-transparent"><X className="h-4 w-4" /></button>
        </div>

        {!esquema && (
          <div className="shrink-0 px-5 pt-4">
            <div className="segmented grid w-full grid-cols-2 text-[12.5px]" role="group" aria-label="Modo">
              {([['ia', 'Redactar con IA'], ['plantilla', 'Plantilla de trámite, sin IA']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setModo(k)} aria-pressed={modo === k}
                  className="px-2 py-2 font-semibold">{l}</button>
              ))}
            </div>
          </div>
        )}

        {modo === 'plantilla' && !esquema ? (
          <NuevoDesdePlantilla expedienteId={expedienteId} pickerExpediente={pickerExpediente} onCreated={onCreated} onClose={onClose} />
        ) : (<>
        {esquema ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <EsquemaEditor esquema={esquema} onChange={setEsquema} />
            {contexto && <p className="text-[10.5px] font-medium text-zinc-500">{contexto.modelo_nombre} · {contexto.motivo_modelo}</p>}
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Paso n={1} titulo="Expediente">
            {pickerExpediente}
            {expedienteId && movimientos.length > 0 && (() => {
              const respondibles = movimientos.filter(m =>
                m.is_key === true || RESPONDIBLE_TYPES_FRONTEND.has(m.tipo_movimiento ?? '')
              ).slice(0, 40)
              const otrasActuaciones = movimientos.filter(m =>
                m.is_key !== true && !RESPONDIBLE_TYPES_FRONTEND.has(m.tipo_movimiento ?? '')
              ).slice(0, 20)
              const mov = movimientos.find(mv => mv.id === respondeA)
              return (
                <div>
                  <label className={rotulo}>Responde a <span className={rotuloNota}>(opcional)</span></label>
                  <select value={respondeA} onChange={e => onSelectActuacion(e.target.value)}
                    className="field h-10 py-0">
                    <option value="">Ninguna actuación en particular</option>
                    {respondibles.length > 0 && (
                      <optgroup label="Para responder o cumplir">
                        {respondibles.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.is_key === true ? '★ ' : ''}{m.fecha ? m.fecha.slice(0, 10) : ''}{m.tipo_movimiento ? ` — ${m.tipo_movimiento}` : ''}{m.titulo ? ` — ${m.titulo.slice(0, 55)}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otrasActuaciones.length > 0 && (
                      <optgroup label="Otras actuaciones">
                        {otrasActuaciones.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.fecha ? m.fecha.slice(0, 10) : ''}{m.tipo_movimiento ? ` — ${m.tipo_movimiento}` : ''}{m.titulo ? ` — ${m.titulo.slice(0, 55)}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {mov?.ai_suggested_action && <p className="mt-1.5 text-[11.5px] font-medium text-cyan-700 dark:text-cyan-300">Acción sugerida: {mov.ai_suggested_action.titulo}</p>}
                </div>
              )
            })()}
          </Paso>

          <Paso n={2} titulo="Qué hay que presentar" extra={
            <div className="flex items-center gap-1">
              <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void volcarAudio(f); e.target.value = '' }} />
              {transcribir.isPending ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300"><Loader2 className="h-3 w-3 animate-spin" /> Transcribiendo…</span>
              ) : (<>
                <button type="button" onClick={toggleGrabar}
                  className={cn('btn btn-sm h-7 min-h-0 gap-1 px-2 text-[11px]',
                    grabando ? 'animate-pulse border border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300' : 'btn-ghost border-transparent')}>
                  {grabando ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  {grabando ? 'Detener' : 'Dictar'}
                </button>
                {!grabando && (
                  <button type="button" onClick={() => audioFileRef.current?.click()} title="Subir un audio (por ejemplo, de WhatsApp)"
                    className="btn btn-ghost btn-sm h-7 min-h-0 gap-1 border-transparent px-2 text-[11px]">
                    <Upload className="h-3 w-3" /> Audio
                  </button>
                )}
              </>)}
            </div>
          }>
            <textarea
              value={ideaLibre} onChange={e => setIdeaLibre(e.target.value)}
              placeholder="Contalo como a un colega. Ej.: contestar el traslado de la demanda laboral de Juan García, reconviniendo por preaviso."
              rows={3}
              className={cn(campoBase, 'resize-none py-2.5')}
            />
            <div>
              <p className="mb-2 text-[11.5px] font-medium text-zinc-500">O elegí un trámite frecuente</p>
              <div className="flex flex-wrap gap-1.5">
                {TRAMITE_PRESETS.map(p => (
                  <button key={p.tipo} type="button" onClick={() => aplicarPreset(p)} aria-pressed={tipo === p.tipo}
                    className="chip">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={rotulo}>Tipo de escrito <span className={rotuloNota}>(opcional si lo contaste arriba)</span></label>
              <input
                type="text" list="escritos-tipos" value={tipo} onChange={e => setTipo(e.target.value)}
                placeholder="Contestación de traslado, Demanda, Recurso…"
                className={cn(campoBase, 'h-10')}
              />
              <datalist id="escritos-tipos">{TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>
            </div>
          </Paso>

          <Paso n={3} titulo="Cómo se presenta">
            <CaracterSelector value={caracter} expedienteId={expedienteId || null}
              onChange={(c) => { setCaracter(c); setCaracterTocado(true) }} />
            <div>
              <label className={rotulo}>Instrucciones <span className={rotuloNota}>(opcional)</span></label>
              <textarea
                value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
                placeholder="Tono, puntos a destacar, normativa a citar…"
                rows={2}
                className={cn(campoBase, 'resize-none py-2.5')}
              />
            </div>
            <div>
              <button type="button" onClick={() => setShowContraparte(v => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                {showContraparte ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Texto de la contraparte para rebatir {contraparteTexto.trim() && <span className="tag-mono">cargado</span>}
              </button>
              {showContraparte && (
                <div className="mt-2">
                  <textarea
                    value={contraparteTexto} onChange={e => setContraparteTexto(e.target.value)}
                    placeholder="Pegá los fragmentos del escrito de la contraparte que querés rebatir. Con los argumentos principales alcanza."
                    rows={5}
                    className={cn(campoBase, 'resize-y py-2.5')}
                  />
                </div>
              )}
            </div>
          </Paso>

          <section className={cn('rounded-2xl border', BORDE)}>
            <button type="button" onClick={() => setAvanzadas(v => !v)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="text-[12.5px] font-semibold text-zinc-700 dark:text-zinc-200">Opciones avanzadas</span>
              <span className="min-w-0 flex-1 truncate text-right text-[10.5px] font-medium text-zinc-500">{resumenAvanzadas}</span>
              {avanzadas ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
            </button>
            {avanzadas && (
              <div className={cn('space-y-4 border-t px-4 py-4', BORDE)}>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Modelo de IA</span>
                    <div className="segmented ml-auto text-[11.5px]" role="group" aria-label="Modelo de IA">
                      {([['auto', 'Automático'], ['preciso', 'Preciso'], ['rapido', 'Rápido']] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => { setCalidad(k); setContexto(null) }} aria-pressed={calidad === k}
                          className="px-2.5 py-1 font-semibold">{l}</button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11.5px] text-zinc-500">
                    {calidad === 'auto' ? (esFondo ? 'Escrito de fondo: se usa el modelo que mejor argumenta (Opus).' : 'Escrito de trámite: alcanza con el modelo rápido (Sonnet).')
                      : calidad === 'preciso' ? 'Opus: el que mejor razona. Más lento y más caro.' : 'Sonnet: rápido y económico.'}
                  </p>
                  <label className="flex items-start gap-2 text-[12.5px] text-zinc-700 dark:text-zinc-300">
                    <input type="checkbox" checked={usarEsquema} onChange={(e) => setEsquemaPrimero(e.target.checked)} className="mt-0.5 accent-cyan-500" />
                    <span>Ver el esquema antes de redactar <span className="text-zinc-500">— argumentos, defensas de la contraria y prueba, para aprobar o corregir.{esFondo && esquemaPrimero === null ? ' Recomendado para este escrito.' : ''}</span></span>
                  </label>
                </div>

                {modelos.length > 0 && (
                  <div>
                    <label className={rotulo}>Modelo estructural <span className={rotuloNota}>(base del escrito)</span></label>
                    <select value={modeloId} onChange={e => setModeloId(e.target.value)}
                      className="field h-10 py-0">
                      <option value="">Sin modelo (generación libre)</option>
                      {modelos.map(m => <option key={m.id} value={m.id}>{m.nombre} — {m.tipo}</option>)}
                    </select>
                  </div>
                )}

                {templates.filter(t => t.categoria === 'estilo').length > 0 && (
                  <div>
                    <label className={rotulo}>Template de estilo</label>
                    <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                      className="field h-10 py-0">
                      <option value="">Sin template</option>
                      {templates.filter(t => t.categoria === 'estilo').map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                )}

                {expedienteId && movimientos.length > 1 && (
                  <div>
                    <label className={rotulo}>Actuaciones adicionales para el contexto</label>
                    <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                      {movimientos.slice(0, 60).map(m => {
                        if (m.id === respondeA) return null
                        const checked = actuacionesExtra.includes(m.id)
                        return (
                          <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-white/5">
                            <input type="checkbox" checked={checked}
                              onChange={e => setActuacionesExtra(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))}
                              className="mt-0.5 accent-cyan-500 shrink-0" />
                            <span className="text-xs leading-tight text-zinc-700 dark:text-zinc-300">
                              {m.is_key === true ? '★ ' : ''}{m.fecha?.slice(0, 10)} — {m.tipo_movimiento}{m.titulo ? ` — ${m.titulo.slice(0, 50)}` : ''}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button type="button" onClick={handleVerContexto} disabled={verContexto.isPending}
                  className="dashboard-link inline-flex items-center gap-1.5 text-[12px] disabled:opacity-50">
                  {verContexto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Qué va a usar la IA
                </button>
                {contexto && <div className={cn('border-t pt-3', BORDE)}><ContextoIAVista c={contexto} /></div>}
              </div>
            )}
          </section>
        </div>
        )}

        <div className={cn('flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-zinc-50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-black/10 sm:pb-3', BORDE)}>
          {esquema ? (
            <button onClick={() => setEsquema(null)} disabled={ocupado} className="btn btn-ghost mr-auto border-transparent">Volver</button>
          ) : (
            <p className={cn('mr-auto min-w-0 flex-1 basis-48 text-[11.5px] font-medium', hayPedido ? 'text-zinc-500' : 'text-amber-700 dark:text-amber-300/90')}>{aviso}</p>
          )}
          {esquema && (
            <button onClick={handleEsquema} disabled={ocupado} className="btn btn-ghost border-transparent">
              Rehacer esquema
            </button>
          )}
          {!esquema && <button onClick={onClose} disabled={ocupado} className="btn btn-ghost border-transparent">Cancelar</button>}
          <button onClick={usarEsquema && !esquema ? handleEsquema : handleGenerar} disabled={ocupado || !hayPedido}
            className="btn btn-primary">
            {generate.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{progressMsg ?? 'Generando…'}</>
            ) : armarEsquema.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Armando la estrategia…</>
            ) : usarEsquema && !esquema ? (
              <><ListChecks className="h-4 w-4" />Armar esquema</>
            ) : (
              <><Sparkles className="h-4 w-4" />{esquema ? 'Redactar con este esquema' : 'Generar con IA'}</>
            )}
          </button>
        </div>
        </>)}
      </div>
    </div>
  )
}

// ─── ModelosPanel ─────────────────────────────────────────────────────────────

function ModelosPanel({ onClose }: { onClose: () => void }) {
  const { data: modelos = [], isLoading } = useEscritoModelos()
  const crearModelo = useCrearModelo()
  const extraerModelo = useExtraerModelo()
  const [modo, setModo] = useState<'lista' | 'upload' | 'manual'>('lista')
  const [textoModelo, setTextoModelo] = useState('')
  const [nombreModelo, setNombreModelo] = useState('')
  const [tipoModelo, setTipoModelo] = useState('')
  const [modeloExtraido, setModeloExtraido] = useState<{ contenido: EscritoContenido; nombre: string; tipo: string } | null>(null)

  const handleExtraer = async () => {
    if (!textoModelo.trim()) return
    try {
      const result = await extraerModelo.mutateAsync({ texto: textoModelo, nombre: nombreModelo.trim() || undefined, tipo: tipoModelo.trim() || undefined })
      setModeloExtraido(result)
      setNombreModelo(result.nombre)
      setTipoModelo(result.tipo)
    } catch (err) { toast.error('Error al extraer modelo', err instanceof Error ? err.message : '') }
  }

  const handleGuardarModelo = async (contenido: unknown) => {
    if (!nombreModelo.trim()) { toast.error('El nombre es requerido'); return }
    try {
      await crearModelo.mutateAsync({
        nombre: nombreModelo, tipo: tipoModelo || nombreModelo,
        contenido_modelo: contenido as EscritoContenido, compartido: true,
      })
      toast.success('Modelo guardado y disponible para todo el estudio')
      setModo('lista'); setTextoModelo(''); setNombreModelo(''); setTipoModelo(''); setModeloExtraido(null)
    } catch (err) { toast.error('Error al guardar', err instanceof Error ? err.message : '') }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith('.txt')) {
      setTextoModelo(await file.text())
    } else {
      toast.info('Para DOCX/PDF, copiá y pegá el texto del documento en el área de texto')
    }
    e.target.value = ''
  }

  return (
    <div className={MODAL_FONDO}>
      <div className={cn(MODAL_CAJA, 'flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-2xl')}>
        <div className={cn('flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 sm:px-6', BORDE)}>
          <div className="flex min-w-0 items-center gap-3">
            <Layers className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Modelos del estudio</h2>
              <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Plantillas estructurales compartidas</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon shrink-0 border-transparent"><X className="h-4 w-4" /></button>
        </div>

        <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-5 pt-4 sm:px-6">
          {(['lista', 'upload', 'manual'] as const).map(tab => (
            <button key={tab} onClick={() => { setModo(tab); setModeloExtraido(null) }} aria-pressed={modo === tab}
              className="chip">
              {tab === 'lista' && 'Biblioteca'}
              {tab === 'upload' && 'Cargar desde texto'}
              {tab === 'manual' && 'Crear manualmente'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {modo === 'lista' && (
            <div className="space-y-2">
              {isLoading && <div className="text-sm text-zinc-500">Cargando...</div>}
              {!isLoading && modelos.length === 0 && (
                <div className="text-center py-10">
                  <Layers className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No hay modelos cargados aún</p>
                  <button onClick={() => setModo('upload')}
                    className="btn btn-secondary btn-sm mt-4">
                    <Upload className="h-3.5 w-3.5" /> Cargar primer modelo
                  </button>
                </div>
              )}
              {modelos.map(m => (
                <div key={m.id} className="dashboard-panel-muted rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">{m.nombre}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{m.tipo}</p>
                    </div>
                    <span className={cn(TAG, m.compartido ? 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300' : ESTADO_NEUTRO)}>
                      {m.compartido ? 'Compartido' : 'Personal'}
                    </span>
                  </div>
                  {m.contenido_modelo && <p className="mt-1 text-xs tabular-nums text-zinc-500">{m.contenido_modelo.secciones?.length ?? 0} secciones</p>}
                </div>
              ))}
            </div>
          )}

          {modo === 'upload' && !modeloExtraido && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Pegá el texto de un escrito real. La IA extrae su estructura como modelo reutilizable, reemplazando datos concretos con marcadores genéricos.</p>
              <div className="flex items-center gap-2">
                <label className="btn btn-ghost btn-sm cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Cargar .txt
                  <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                </label>
                <span className="text-xs text-zinc-500">o pegá el texto</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nombre del modelo</label>
                  <input type="text" value={nombreModelo} onChange={e => setNombreModelo(e.target.value)} placeholder="Demanda laboral tipo"
                    className="field h-9 py-0 px-2.5 text-[13px]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tipo</label>
                  <input type="text" value={tipoModelo} onChange={e => setTipoModelo(e.target.value)} placeholder="Demanda"
                    className="field h-9 py-0 px-2.5 text-[13px]" />
                </div>
              </div>
              <textarea value={textoModelo} onChange={e => setTextoModelo(e.target.value)} rows={10}
                placeholder="Pegá aquí el texto completo del escrito modelo..."
                className="field resize-none text-xs leading-relaxed" />
              <button onClick={handleExtraer} disabled={!textoModelo.trim() || extraerModelo.isPending}
                className="btn btn-primary w-full">
                {extraerModelo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {extraerModelo.isPending ? 'Extrayendo...' : 'Extraer estructura con IA'}
              </button>
            </div>
          )}

          {modo === 'upload' && modeloExtraido && (
            <div className="space-y-4">
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3">
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Estructura extraída — revisá antes de guardar</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nombre</label>
                  <input type="text" value={nombreModelo} onChange={e => setNombreModelo(e.target.value)}
                    className="field h-9 py-0 px-2.5 text-[13px]" /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tipo</label>
                  <input type="text" value={tipoModelo} onChange={e => setTipoModelo(e.target.value)}
                    className="field h-9 py-0 px-2.5 text-[13px]" /></div>
              </div>
              <div className="space-y-2">
                <p className="eyebrow">Secciones ({modeloExtraido.contenido.secciones.length})</p>
                {modeloExtraido.contenido.secciones.map((s, i) => (
                  <div key={i} className="dashboard-panel-muted px-3 py-2">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{s.titulo}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{s.parrafos.length} párrafo{s.parrafos.length !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModeloExtraido(null)} className="btn btn-ghost flex-1">Volver</button>
                <button onClick={() => handleGuardarModelo(modeloExtraido.contenido)} disabled={crearModelo.isPending}
                  className="btn btn-primary flex-1">
                  {crearModelo.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Guardar modelo
                </button>
              </div>
            </div>
          )}

          {modo === 'manual' && (
            <ManualModeloEditor onGuardar={handleGuardarModelo} guardando={crearModelo.isPending}
              nombre={nombreModelo} setNombre={setNombreModelo} tipo={tipoModelo} setTipo={setTipoModelo} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ManualModeloEditor ───────────────────────────────────────────────────────

function ManualModeloEditor({ onGuardar, guardando, nombre, setNombre, tipo, setTipo }: {
  onGuardar: (contenido: unknown) => void; guardando: boolean
  nombre: string; setNombre: (v: string) => void; tipo: string; setTipo: (v: string) => void
}) {
  const [titulo, setTitulo] = useState('')
  const [encabezado, setEncabezado] = useState('Señor/a Juez/a:')
  const [caratula, setCaratula] = useState('[CARATULA]')
  const [secciones, setSecciones] = useState([{ titulo: 'I. OBJETO', parrafos: [''] }])

  const addSeccion = () => setSecciones(s => [...s, { titulo: '', parrafos: [''] }])
  const removeSeccion = (i: number) => setSecciones(s => s.filter((_, idx) => idx !== i))
  const updateSeccionTitulo = (i: number, v: string) => setSecciones(s => s.map((sec, idx) => idx === i ? { ...sec, titulo: v } : sec))
  const addParrafo = (si: number) => setSecciones(s => s.map((sec, idx) => idx === si ? { ...sec, parrafos: [...sec.parrafos, ''] } : sec))
  const updateParrafo = (si: number, pi: number, v: string) =>
    setSecciones(s => s.map((sec, idx) => idx === si ? { ...sec, parrafos: sec.parrafos.map((p, pidx) => pidx === pi ? v : p) } : sec))
  const removeParrafo = (si: number, pi: number) =>
    setSecciones(s => s.map((sec, idx) => idx === si ? { ...sec, parrafos: sec.parrafos.filter((_, pidx) => pidx !== pi) } : sec))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nombre del modelo</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            className="field h-9 py-0 px-2.5 text-[13px]" /></div>
        <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tipo</label>
          <input type="text" value={tipo} onChange={e => setTipo(e.target.value)}
            className="field h-9 py-0 px-2.5 text-[13px]" /></div>
      </div>
      <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Título del escrito</label>
        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="DEMANDA LABORAL"
          className="field h-9 py-0 px-2.5 text-[13px]" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Encabezado</label>
          <input type="text" value={encabezado} onChange={e => setEncabezado(e.target.value)}
            className="field h-9 py-0 px-2.5 text-[13px]" /></div>
        <div><label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Carátula</label>
          <input type="text" value={caratula} onChange={e => setCaratula(e.target.value)}
            className="field h-9 py-0 px-2.5 text-[13px]" /></div>
      </div>
      <div className="space-y-3">
        {secciones.map((sec, si) => (
          <div key={si} className="dashboard-panel-muted space-y-2 p-3">
            <div className="flex items-center gap-2">
              <input type="text" value={sec.titulo} onChange={e => updateSeccionTitulo(si, e.target.value)}
                placeholder="Título (ej: I. HECHOS)"
                className="field h-8 min-w-0 flex-1 px-2.5 py-0 text-xs font-semibold" />
              <button onClick={() => removeSeccion(si)} aria-label="Quitar sección" className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"><X className="h-3 w-3" /></button>
            </div>
            {sec.parrafos.map((p, pi) => (
              <div key={pi} className="flex gap-1.5">
                <textarea value={p} onChange={e => updateParrafo(si, pi, e.target.value)} rows={2}
                  placeholder="Texto del párrafo..."
                  className="field min-w-0 flex-1 resize-none px-2.5 py-1.5 text-xs" />
                <button onClick={() => removeParrafo(si, pi)} aria-label="Quitar párrafo" className="self-start rounded-md p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={() => addParrafo(si)} className="flex items-center gap-1 pl-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
              <Plus className="h-3 w-3" /> párrafo
            </button>
          </div>
        ))}
        <button onClick={addSeccion}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-semibold text-zinc-500 hover:border-[var(--brand-accent)] hover:text-zinc-800 dark:border-white/15 dark:hover:text-zinc-100">
          <Plus className="h-3 w-3" /> Agregar sección
        </button>
      </div>
      <button onClick={() => onGuardar({ titulo, encabezado_juez: encabezado, caratula, secciones })}
        disabled={guardando || !nombre.trim()}
        className="btn btn-primary w-full">
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar modelo
      </button>
    </div>
  )
}

// ─── Panel de referencias (normativa, jurisprudencia, citar URL) ──────────────

type RefTab = 'normativa' | 'jurisprudencia' | 'citar'

interface ReferenciasProps {
  onInsertarReferencia: (texto: string) => void
}

function ReferenciasPanel({ onInsertarReferencia }: ReferenciasProps) {
  const [tab, setTab] = useState<RefTab>('jurisprudencia')
  const [searchNorm, setSearchNorm] = useState('')
  const [searchJuris, setSearchJuris] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [citaExtraida, setCitaExtraida] = useState<ReferenciaExterna | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const searchNormativa = useSearchNormativaByText()
  const searchJurisprudenciaText = useSearchJurisprudenciaByText()
  const buscarJurisprudenciaSemantica = useBuscarJurisprudenciaAfin()
  const fetchReferencia = useFetchReferencia()

  const handleSearchNorm = () => { if (searchNorm.trim()) searchNormativa.mutate(searchNorm) }
  const handleSearchJuris = () => {
    if (!searchJuris.trim()) return
    if (searchJuris.length > 30) {
      buscarJurisprudenciaSemantica.mutate({ query: searchJuris, limit: 5 })
    } else {
      searchJurisprudenciaText.mutate(searchJuris)
    }
  }

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return
    setCitaExtraida(null)
    try {
      const result = await fetchReferencia.mutateAsync(urlInput.trim())
      setCitaExtraida(result)
    } catch (err) {
      toast.error('No se pudo extraer la referencia', err instanceof Error ? err.message : '')
    }
  }

  const copiar = async (texto: string, id: string) => {
    await navigator.clipboard.writeText(texto).catch(() => {})
    setCopiado(id)
    setTimeout(() => setCopiado(null), 2000)
  }

  const formatNormativaCita = (n: Pick<NormativaDocumento, 'titulo' | 'tipo' | 'numero'>): string => {
    const parts: string[] = []
    if (n.tipo) parts.push(n.tipo)
    if (n.numero) parts.push(`N° ${n.numero}`)
    if (n.titulo) parts.push(`"${n.titulo}"`)
    return parts.join(' ')
  }

  const formatJurisprudenciaCita = (j: Pick<JurisprudenciaDocumento, 'caratula' | 'tribunal' | 'tipo'>): string => {
    const parts: string[] = []
    if (j.caratula) parts.push(`"${j.caratula}"`)
    if (j.tribunal) parts.push(`— ${j.tribunal}`)
    return parts.join(' ')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className={cn('flex shrink-0 border-b', BORDE)}>
        {([
          { key: 'jurisprudencia', label: 'Fallos', icon: Gavel },
          { key: 'normativa', label: 'Normativa', icon: BookOpen },
          { key: 'citar', label: 'Citar URL', icon: Link2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors',
              tab === key ? TAB_ACTIVA : TAB_INACTIVA
            )}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ── Tab: Jurisprudencia ── */}
        {tab === 'jurisprudencia' && (
          <>
            <div className="flex gap-1.5">
              <input
                type="text" value={searchJuris} onChange={e => setSearchJuris(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchJuris()}
                placeholder="Buscar fallo o describir..."
                className="field h-9 min-w-0 flex-1 px-2.5 py-0 text-xs"
              />
              <button onClick={handleSearchJuris} disabled={searchJurisprudenciaText.isPending || buscarJurisprudenciaSemantica.isPending}
                className="btn btn-secondary btn-icon h-9 w-9 shrink-0">
                {(searchJurisprudenciaText.isPending || buscarJurisprudenciaSemantica.isPending)
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Search className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-[10.5px] text-zinc-500">Texto corto → búsqueda exacta · Texto largo → búsqueda semántica</p>

            {/* Resultados texto */}
            {searchJurisprudenciaText.data && searchJurisprudenciaText.data.length > 0 && (
              <div className="space-y-1.5">
                {searchJurisprudenciaText.data.map(j => (
                  <FalloCard key={j.id} caratula={j.caratula} tribunal={j.tribunal ?? ''} tipo={j.tipo ?? 'otro'}
                    onCopiar={() => copiar(formatJurisprudenciaCita(j), j.id)}
                    onInsertar={() => onInsertarReferencia(formatJurisprudenciaCita(j))}
                    copiado={copiado === j.id} />
                ))}
              </div>
            )}
            {searchJurisprudenciaText.data?.length === 0 && <p className="py-3 text-center text-xs text-zinc-500">Sin resultados en el corpus local</p>}

            {/* Resultados semánticos */}
            {buscarJurisprudenciaSemantica.data && buscarJurisprudenciaSemantica.data.length > 0 && (
              <div className="space-y-1.5">
                {buscarJurisprudenciaSemantica.data.map((r, i) => (
                  <FalloCard key={i} caratula={r.caratula ?? ''} tribunal={r.tribunal ?? ''} tipo="fallo"
                    score={r.score} extracto={r.fragmento}
                    onCopiar={() => copiar(`"${r.caratula}" — ${r.tribunal ?? ''}\n${r.fragmento ? `\n"${r.fragmento}"` : ''}`, String(i))}
                    onInsertar={() => onInsertarReferencia(`"${r.caratula}" — ${r.tribunal ?? ''}`)}
                    copiado={copiado === String(i)} />
                ))}
              </div>
            )}

            {/* Divider portales externos */}
            <div className={cn('border-t pt-3', BORDE)}>
              <p className="eyebrow mb-2">Portales externos</p>
              <div className="space-y-1">
                {PORTALES_EXTERNOS.map(p => (
                  <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="dashboard-panel-muted group flex items-center justify-between px-3 py-2 transition-colors hover:border-cyan-500/30">
                    <div>
                      <p className="text-xs font-semibold text-zinc-800 group-hover:text-cyan-700 dark:text-zinc-200 dark:group-hover:text-cyan-300">{p.label}</p>
                      <p className="text-[10.5px] text-zinc-500">{p.desc}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-zinc-400 group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400" />
                  </a>
                ))}
              </div>
              <p className="text-[10.5px] text-zinc-500 mt-2">Copiá la URL del fallo que encontrés y usala en la pestaña "Citar URL"</p>
            </div>
          </>
        )}

        {/* ── Tab: Normativa ── */}
        {tab === 'normativa' && (
          <>
            <div className="flex gap-1.5">
              <input
                type="text" value={searchNorm} onChange={e => setSearchNorm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchNorm()}
                placeholder="Ley, número, decreto..."
                className="field h-9 min-w-0 flex-1 px-2.5 py-0 text-xs"
              />
              <button onClick={handleSearchNorm} disabled={searchNormativa.isPending}
                className="btn btn-secondary btn-icon h-9 w-9 shrink-0">
                {searchNormativa.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </button>
            </div>

            {searchNormativa.data && searchNormativa.data.length > 0 && (
              <div className="space-y-1.5">
                {searchNormativa.data.map(n => {
                  const cita = formatNormativaCita(n)
                  return (
                    <div key={n.id} className="dashboard-panel-muted px-3 py-2">
                      <p className="text-xs font-semibold leading-snug text-zinc-800 dark:text-zinc-100">{n.titulo}</p>
                      {n.numero && <p className="mt-0.5 text-[10.5px] tabular-nums text-zinc-500">{n.tipo} N° {n.numero}</p>}
                      <div className="mt-2 flex gap-1.5">
                        <button onClick={() => copiar(cita, n.id)}
                          className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors',
                            copiado === n.id ? 'border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'
                          )}>
                          {copiado === n.id ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiado === n.id ? 'Copiado' : 'Copiar'}
                        </button>
                        <button onClick={() => onInsertarReferencia(cita)}
                          className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300">
                          <Plus className="h-3 w-3" /> Insertar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {searchNormativa.data?.length === 0 && <p className="py-3 text-center text-xs text-zinc-500">Sin resultados en el corpus</p>}

            <div className={cn('border-t pt-3', BORDE)}>
              <p className="eyebrow mb-2">Normativa nacional</p>
              <a href="http://www.saij.gob.ar" target="_blank" rel="noopener noreferrer"
                className="dashboard-panel-muted group flex items-center justify-between px-3 py-2 transition-colors hover:border-cyan-500/30">
                <div>
                  <p className="text-xs font-semibold text-zinc-800 group-hover:text-cyan-700 dark:text-zinc-200 dark:group-hover:text-cyan-300">SAIJ / Infojus</p>
                  <p className="text-[10.5px] text-zinc-500">Sistema Argentino de Información Jurídica</p>
                </div>
                <ExternalLink className="h-3 w-3 text-zinc-400 group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400" />
              </a>
              <p className="text-[10.5px] text-zinc-500 mt-2">Encontrá la norma y copiá su URL en "Citar URL" para extraerla automáticamente</p>
            </div>
          </>
        )}

        {/* ── Tab: Citar URL ── */}
        {tab === 'citar' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">URL del fallo o normativa</label>
              <div className="flex gap-1.5">
                <input
                  type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
                  placeholder="https://..."
                  className="field h-9 min-w-0 flex-1 px-2.5 py-0 text-xs"
                />
                <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetchReferencia.isPending}
                  className="btn btn-secondary btn-sm h-9 shrink-0 gap-1 px-2.5">
                  {fetchReferencia.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {fetchReferencia.isPending ? 'Extrayendo...' : 'Extraer'}
                </button>
              </div>
              <p className="mt-1.5 text-[10.5px] text-zinc-500">Pegá la URL de cualquier portal jurídico. La IA extrae el tribunal, fecha y cita formal.</p>
            </div>

            {citaExtraida && (
              <div className="space-y-2 rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3">
                <div className="flex items-center justify-between">
                  <span className={cn(TAG,
                    citaExtraida.tipo === 'fallo' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' :
                    citaExtraida.tipo === 'normativa' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
                    ESTADO_NEUTRO
                  )}>
                    {citaExtraida.tipo}
                  </span>
                  <a href={citaExtraida.fuente_url} target="_blank" rel="noopener noreferrer"
                    className="dashboard-link flex items-center gap-0.5 text-[10.5px]">
                    fuente <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                {citaExtraida.caratula && <p className="text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-100">{citaExtraida.caratula}</p>}
                {citaExtraida.numero && <p className="text-[11px] tabular-nums text-zinc-500">N° {citaExtraida.numero}</p>}

                <div className="grid grid-cols-2 gap-2">
                  {citaExtraida.tribunal && (
                    <div>
                      <p className="text-[10.5px] font-semibold text-zinc-500">Tribunal</p>
                      <p className="text-[11px] text-zinc-700 dark:text-zinc-300">{citaExtraida.tribunal}</p>
                    </div>
                  )}
                  {citaExtraida.fecha && (
                    <div>
                      <p className="text-[10.5px] font-semibold text-zinc-500">Fecha</p>
                      <p className="text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">{citaExtraida.fecha}</p>
                    </div>
                  )}
                </div>

                {citaExtraida.extracto && (
                  <div>
                    <p className="mb-0.5 text-[10.5px] font-semibold text-zinc-500">Extracto</p>
                    <p className="line-clamp-4 text-[11px] italic leading-relaxed text-zinc-600 dark:text-zinc-400">&ldquo;{citaExtraida.extracto}&rdquo;</p>
                  </div>
                )}

                <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <p className="mb-0.5 text-[10.5px] font-semibold text-zinc-500">Cita formal</p>
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{citaExtraida.cita_formal}</p>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button onClick={() => copiar(citaExtraida.cita_formal, 'cita_formal')}
                    className={cn('inline-flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                      copiado === 'cita_formal' ? 'border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'
                    )}>
                    {copiado === 'cita_formal' ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar cita
                  </button>
                  {citaExtraida.extracto && (
                    <button onClick={() => copiar(`${citaExtraida.cita_formal}\n\n"${citaExtraida.extracto}"`, 'cita_con_extracto')}
                      className={cn('inline-flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                        copiado === 'cita_con_extracto' ? 'border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'
                      )}>
                      {copiado === 'cita_con_extracto' ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Con extracto
                    </button>
                  )}
                  <button onClick={() => onInsertarReferencia(citaExtraida.cita_formal + (citaExtraida.extracto ? `\n"${citaExtraida.extracto}"` : ''))}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300">
                    <Plus className="h-3 w-3" /> Insertar
                  </button>
                </div>

                <button onClick={() => { setUrlInput(''); setCitaExtraida(null) }}
                  className="w-full pt-1 text-[10.5px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                  Extraer otra URL
                </button>
              </div>
            )}

            <div className={cn('border-t pt-3', BORDE)}>
              <p className="eyebrow mb-2">URLs de ejemplo</p>
              <div className="space-y-1">
                {PORTALES_EXTERNOS.slice(0, 3).map(p => (
                  <button key={p.url} onClick={() => setUrlInput(p.url)}
                    className="dashboard-panel-muted group flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:border-cyan-500/30">
                    <span className="text-[11px] font-semibold text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100">{p.label}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{p.url.replace('https://', '').replace('http://', '').split('/')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Subcomponente reutilizable para mostrar un fallo
function FalloCard({ caratula, tribunal, tipo, score, extracto, onCopiar, onInsertar, copiado }: {
  caratula: string; tribunal: string; tipo: string
  score?: number; extracto?: string
  onCopiar: () => void; onInsertar: () => void; copiado: boolean
}) {
  return (
    <div className="dashboard-panel-muted px-3 py-2">
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-800 dark:text-zinc-100">{caratula}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {tribunal && <p className="flex-1 truncate text-[10.5px] text-zinc-500">{tribunal}</p>}
        {score && <span className="text-[10.5px] font-semibold tabular-nums text-zinc-500">{(score * 100).toFixed(0)}%</span>}
      </div>
      {extracto && <p className="mt-1 line-clamp-2 text-[10.5px] italic text-zinc-500">&ldquo;{extracto}&rdquo;</p>}
      <div className="mt-2 flex gap-1.5">
        <button onClick={onCopiar}
          className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors',
            copiado ? 'border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'
          )}>
          {copiado ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button onClick={onInsertar}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300">
          <Plus className="h-3 w-3" /> Insertar
        </button>
      </div>
    </div>
  )
}

// ─── EscritoEditor ────────────────────────────────────────────────────────────

function EscritoEditor({
  escrito, abogado, onUpdate, onDelete, onBack, refsOpen, onToggleRefs,
}: {
  escrito: EscritoConExpediente
  abogado: EscritoEncabezadoAbogado | null
  onUpdate: (patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>, snapshotAntes?: EscritoContenido) => Promise<void>
  onDelete: () => void
  onBack?: () => void
  refsOpen: boolean
  onToggleRefs: () => void
}) {
  // 'lado': editor y escrito en vivo lado a lado (pantallas anchas). Se recuerda en este navegador.
  const [vista, setVistaState] = useState<'editar' | 'lado' | 'preview'>(() => {
    try {
      const v = localStorage.getItem('escritos-vista')
      if (v === 'editar' || v === 'lado' || v === 'preview') return v
    } catch { /* sin storage */ }
    return typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'lado' : 'editar'
  })
  const setVista = (v: 'editar' | 'lado' | 'preview') => {
    setVistaState(v)
    try { localStorage.setItem('escritos-vista', v) } catch { /* sin storage */ }
    if (v === 'lado' && refsOpen) onToggleRefs()
  }
  const ladoALado = vista === 'lado' && !!abogado
  // Lado a lado y asistente abierto no entran juntos: al abrir, manda la vista elegida
  useEffect(() => { if (vista === 'lado' && refsOpen) onToggleRefs() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [contenido, setContenido] = useState<EscritoContenido>(escrito.contenido)
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [tituloLocal, setTituloLocal] = useState(escrito.titulo)
  const [dirty, setDirty] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [panelIzq, setPanelIzq] = useState(false)
  const [panelDer, setPanelDer] = useState<'asistente' | 'referencias'>('asistente')
  const [foco, setFoco] = useState<FocoAsistente | null>(null)
  const [antesDeFirmar, setAntesDeFirmar] = useState<null | (() => void)>(null)
  const [guardarPlantilla, setGuardarPlantilla] = useState(false)
  const [enviarRevision, setEnviarRevision] = useState(false)
  const [saeOpen, setSaeOpen] = useState(false)
  const [masOpen, setMasOpen] = useState(false)
  const navigate = useNavigate()
  const attachPdf = useAttachSignedPdf()
  const historialMutation = useEscritoHistorial()
  const revisar = useRevisarEscrito()
  const { detectadas } = useCitasDetectadas(escrito.id, contenido)
  const printRef = useRef<HTMLDivElement>(null)
  const archivoRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Capture snapshot of contenido at the start of each save cycle
  const contenidoBeforeSaveRef = useRef<EscritoContenido>(escrito.contenido)

  // Sincronizar si cambia el escrito desde fuera (otra sesión, etc.)
  useEffect(() => {
    setContenido(escrito.contenido)
    setTituloLocal(escrito.titulo)
    setDirty(false)
    contenidoBeforeSaveRef.current = escrito.contenido
  }, [escrito.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const doGuardar = useCallback(async (c: EscritoContenido, t: string, snapshotAntes?: EscritoContenido) => {
    setGuardando(true)
    try {
      await onUpdate({ contenido: c, titulo: t }, snapshotAntes)
      setDirty(false)
      setSavedAt(new Date())
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : '')
    } finally { setGuardando(false) }
  }, [onUpdate])

  const updateContenido = (c: EscritoContenido) => {
    setContenido(c)
    setDirty(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const snapshot = contenidoBeforeSaveRef.current
    saveTimerRef.current = setTimeout(() => {
      contenidoBeforeSaveRef.current = c
      doGuardar(c, tituloLocal, snapshot)
    }, 2500)
  }

  const guardarAhora = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const snapshot = contenidoBeforeSaveRef.current
    contenidoBeforeSaveRef.current = contenido
    return doGuardar(contenido, tituloLocal, snapshot)
  }

  // Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) void guardarAhora()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dirty, contenido, tituloLocal, doGuardar]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInsertarReferencia = (textoRef: string) => {
    const refIdx = contenido.secciones.findIndex(s =>
      /REFERENCIA|JURISPRUDENCIA CITADA|DOCTRINA/i.test(s.titulo)
    )
    if (refIdx >= 0) {
      const nuevas = contenido.secciones.map((s, i) =>
        i === refIdx ? { ...s, parrafos: [...s.parrafos, textoRef] } : s
      )
      updateContenido({ ...contenido, secciones: nuevas })
    } else {
      updateContenido({ ...contenido, secciones: [...contenido.secciones, { titulo: 'REFERENCIAS', parrafos: [textoRef] }] })
    }
    toast.success('Referencia agregada al documento')
  }

  const handleImprimir = () => {
    if (!printRef.current) return
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${contenido.titulo}</title></head><body>${printRef.current.innerHTML}</body></html>`)
    w.document.close(); w.focus(); w.print(); w.close()
  }

  const adjuntarPdf = async (file: File) => {
    try {
      const { hasSignature } = await attachPdf.mutateAsync({ escrito_id: escrito.id, expediente_id: escrito.expediente_id, file })
      toast.success(hasSignature ? 'PDF con firma digital adjuntado' : 'PDF adjuntado', hasSignature ? undefined : 'No detecté una firma digital: verificá que esté firmado.')
    } catch (err) { toast.error('Error al adjuntar', err instanceof Error ? err.message : '') }
  }

  /** Antes de firmar: revisión formal y citas. Si está todo bien, sigue directo. */
  const revision = revisar.data ?? escrito.revision_formal ?? null
  const desactualizada = !revisar.data && revisionDesactualizada(escrito)
  const sinRespaldo = detectadas.filter((d) => !d.respaldada)
  const conControl = (seguir: () => void) => {
    const faltan = (revision?.diagnostico?.control_formal ?? []).filter((x) => x.estado === 'falta').length
    if (revision && !desactualizada && !dirty && faltan === 0 && sinRespaldo.length === 0) { seguir(); return }
    setAntesDeFirmar(() => seguir)
  }

  const abrirAsistente = (si: number, pi?: number) => {
    if (vista === 'lado') setVistaState('editar')
    setFoco({ seccion: si + 1, parrafo: pi != null ? pi + 1 : null, nonce: Date.now() })
    setPanelDer('asistente')
    if (!refsOpen) onToggleRefs()
  }

  const addSeccion = () => updateContenido({ ...contenido, secciones: [...contenido.secciones, { titulo: 'Nueva sección', parrafos: [''] }] })

  const panelContexto = (
    <PanelEscrito escrito={escrito} contenido={contenido}
      restaurando={historialMutation.restore.isPending}
      onRestaurar={async (snap) => {
        await historialMutation.restore.mutateAsync({
          id: escrito.id, expediente_id: escrito.expediente_id,
          contenido: snap.contenido, current_snapshot: contenido,
        })
        setContenido(snap.contenido)
        contenidoBeforeSaveRef.current = snap.contenido
        setDirty(false)
        toast.success('Versión restaurada', 'La versión anterior quedó guardada en el historial.')
      }} />
  )

  const panelDerecho = (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-0.5 border-b px-2', BORDE)}>
        {([['asistente', 'Asistente'], ['referencias', 'Referencias']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPanelDer(k)}
            className={cn('border-b-2 px-2.5 py-3 text-[12.5px] font-semibold transition-colors', panelDer === k ? TAB_ACTIVA : TAB_INACTIVA)}>{l}</button>
        ))}
        <button type="button" onClick={onToggleRefs} className="btn btn-ghost btn-icon ml-auto h-8 w-8 border-transparent" title="Cerrar panel"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="min-h-0 flex-1">
        {panelDer === 'asistente'
          ? <AsistentePanel escritoId={escrito.id} contenido={contenido} onAplicar={updateContenido} foco={foco} />
          : <ReferenciasPanel onInsertarReferencia={handleInsertarReferencia} />}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <input ref={archivoRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void adjuntarPdf(f); e.target.value = '' }} />
      {/* Header */}
      <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 sm:px-4 sm:py-2.5', BORDE)}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onBack && (
            <button onClick={onBack} aria-label="Volver a la lista" className="btn btn-ghost btn-icon h-9 w-9 shrink-0 border-transparent sm:hidden">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setPanelIzq(v => !v)} title={panelIzq ? 'Cerrar contexto' : 'Contexto, citas, revisión y versiones'}
            className={cn('btn btn-ghost btn-icon h-9 w-9 shrink-0 border-transparent', panelIzq && 'text-cyan-700 dark:text-cyan-300', 'hidden lg:inline-flex')}>
            {panelIzq ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {editandoTitulo ? (
            <input autoFocus value={tituloLocal}
              onChange={e => { setTituloLocal(e.target.value); setDirty(true) }}
              onBlur={() => setEditandoTitulo(false)}
              onKeyDown={e => e.key === 'Enter' && setEditandoTitulo(false)}
              className="field h-9 min-w-0 flex-1 px-2.5 py-0 text-sm font-semibold"
            />
          ) : (
            <button onClick={() => setEditandoTitulo(true)}
              className="flex max-w-[180px] items-center gap-1.5 truncate text-left text-[15px] font-bold tracking-tight text-zinc-900 hover:text-cyan-700 dark:text-white dark:hover:text-cyan-300 sm:max-w-xs">
              <span className="truncate">{tituloLocal || escrito.tipo}</span>
              <Pencil className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500" />
            </button>
          )}
          <span className={cn(TAG, ESTADO_COLORS[escrito.estado] ?? ESTADO_NEUTRO, 'hidden sm:inline-flex')}>
            {ESTADO_LABELS[escrito.estado] ?? escrito.estado}
          </span>
          {escrito.expediente && (
            <Link to={`/expedientes/${escrito.expediente_id}`}
              className="hidden max-w-[160px] shrink-0 items-center gap-1 truncate text-[11.5px] font-medium text-zinc-500 hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300 md:inline-flex">
              <FolderOpen className="h-3 w-3" />
              <span className="truncate">{escrito.expediente.caratula ?? escrito.expediente.numero}</span>
            </Link>
          )}
          {escrito.contexto_ia?.modelo_nombre && (
            <span className="hidden xl:inline tag-mono shrink-0" title="Modelo que redactó el escrito">{escrito.contexto_ia.modelo_nombre}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Vista toggle */}
          <div data-tour="esc-vista" className="segmented mr-1 hidden sm:inline-flex" role="group" aria-label="Vista">
            {([['editar', 'Editar', ''], ['lado', 'Lado a lado', 'hidden lg:inline-flex'], ['preview', 'Escrito', '']] as const).map(([k, l, extra]) => (
              <button key={k} onClick={() => setVista(k)} title={k === 'lado' ? 'Editar y ver el escrito en vivo al costado' : undefined} aria-pressed={vista === k}
                className={cn('px-2.5 py-1 text-xs font-semibold', extra)}>
                {l}
              </button>
            ))}
          </div>

          {/* Autosave indicator */}
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500 shrink-0" />}
          {!guardando && dirty && (
            <button onClick={() => void guardarAhora()}
              className="btn btn-ghost btn-sm gap-1 px-2.5">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          {!guardando && !dirty && savedAt && (
            <span className="hidden text-[10.5px] font-medium tabular-nums text-zinc-500 sm:inline">
              guardado {savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}

          <EscritosAyudaBoton />
          <button data-tour="esc-asistente" onClick={() => { if (refsOpen && panelDer === 'asistente') onToggleRefs(); else { if (vista === 'lado') setVistaState('editar'); setPanelDer('asistente'); if (!refsOpen) onToggleRefs() } }}
            title="Asistente"
            className={cn('btn btn-ghost btn-sm min-h-9 gap-1 border-transparent px-2', refsOpen && 'text-cyan-700 dark:text-cyan-300')}>
            <MessageSquare className="h-4 w-4" /> <span className="hidden md:inline">Asistente</span>
          </button>
          <div data-tour="esc-mas" className="relative">
            <button onClick={() => setMasOpen(v => !v)} aria-label="Más acciones" aria-expanded={masOpen} title="Más acciones"
              className="btn btn-ghost btn-icon border-transparent">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {masOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMasOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]">
                  {([
                    { icon: UserCheck, label: 'Enviar a revisión', onClick: () => setEnviarRevision(true) },
                    { icon: History, label: 'Revisión, citas y versiones', onClick: () => setPanelIzq(true) },
                    { icon: Upload, label: 'Adjuntar PDF firmado', onClick: () => conControl(() => archivoRef.current?.click()) },
                    { icon: Printer, label: 'Imprimir', onClick: handleImprimir },
                    { icon: Layers, label: 'Guardar como plantilla', onClick: () => setGuardarPlantilla(true) },
                    ...(escrito.expediente_id ? [{ icon: FolderOpen, label: 'Ir al expediente', onClick: () => navigate(`/expedientes/${escrito.expediente_id}`) }] : []),
                  ]).map(({ icon: Icono, label, onClick }) => (
                    <button key={label} onClick={() => { setMasOpen(false); onClick() }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white">
                      <Icono className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" /> {label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-zinc-200 dark:border-white/10" />
                  <button onClick={() => { setMasOpen(false); setConfirmarEliminar(true) }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
                    <Trash2 className="h-4 w-4 shrink-0" /> Eliminar escrito
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Celular y tablet: alternar entre editar y ver el escrito */}
      <div data-tour="esc-vista" className={cn('flex shrink-0 border-b sm:hidden', BORDE)}>
        {([['editar', 'Editar'], ['preview', 'Ver escrito']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVistaState(k)}
            className={cn('flex-1 border-b-2 py-3 text-[13px] font-semibold transition-colors',
              (vista === k || (k === 'editar' && vista === 'lado')) ? TAB_ACTIVA : TAB_INACTIVA)}>
            {l}
          </button>
        ))}
      </div>

      {/* Body: contexto | documento | asistente */}
      <div className="flex-1 overflow-hidden flex">
        {panelIzq && (
          <div className={cn('hidden w-80 shrink-0 flex-col overflow-hidden border-r bg-white/60 dark:bg-white/[0.02] lg:flex', BORDE)}>
            {panelContexto}
          </div>
        )}
        {/* Editor / Preview */}
        <div className="flex-1 overflow-y-auto">
          <div data-tour="esc-guia" className="mx-auto max-w-3xl px-3 pt-3 sm:px-4 sm:pt-4">
            <BannerRevision escrito={escrito} />
            <GuiaEscrito escrito={escrito} contenido={contenido} abogado={abogado} dirty={dirty} guardando={guardando}
              onGuardar={() => { void guardarAhora() }}
              revisado={!!revision && !desactualizada}
              revisando={revisar.isPending}
              onRevisar={() => {
                const correr = () => revisar.mutate(escrito.id, {
                  onSuccess: () => { setPanelIzq(true); toast.success('Revisión lista', 'Está en el panel de la izquierda.') },
                  onError: (e) => toast.error('No se pudo revisar', e.message),
                })
                if (dirty) void guardarAhora().then(correr); else correr()
              }}
              onAntesDeFirmar={conControl}
              // Presentación en el portal del SAE con el PDF firmado
              onPresentarSae={PRESENTACION_SAE_LISTA && escrito.expediente_id ? () => setSaeOpen(true) : undefined}
              onVerProveido={escrito.expediente_id && escrito.proveido_movement_id
                ? () => navigate(`/expedientes/${escrito.expediente_id}?tab=actuaciones&mid=${escrito.proveido_movement_id}`)
                : undefined} />
          </div>
          {(vista === 'editar' || vista === 'lado') && (
            <div className="p-3 pb-24 sm:p-4 space-y-3 sm:space-y-4 max-w-3xl mx-auto">
              <div data-tour="esc-texto" className="space-y-3 sm:space-y-4">
              {/* Encabezado y carátula */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="eyebrow mb-1.5 block">Encabezado</label>
                  <input value={contenido.encabezado_juez}
                    onChange={e => updateContenido({ ...contenido, encabezado_juez: e.target.value })}
                    className="field h-9 px-2.5 py-0 text-xs" />
                </div>
                <div>
                  <label className="eyebrow mb-1.5 block">Carátula</label>
                  <input value={contenido.caratula}
                    onChange={e => updateContenido({ ...contenido, caratula: e.target.value })}
                    className="field h-9 px-2.5 py-0 text-xs" />
                </div>
              </div>

              <div>
                <label className="eyebrow mb-1.5 block">Me presento como</label>
                <CaracterSelector compacto expedienteId={escrito.expediente_id}
                  value={contenido.caracter ?? CARACTER_POR_DEFECTO}
                  onChange={(c) => {
                    const anterior = contenido.caracter ?? CARACTER_POR_DEFECTO
                    const actual = contenido.presentacion?.trim() ?? ''
                    const automatica = !actual || actual === formulaPresentacion(anterior)
                      || (!contenido.caracter && /^En mi car[aá]cter de apoderad|^Por mi propio derecho/i.test(actual))
                    updateContenido({ ...contenido, caracter: c, presentacion: automatica ? formulaPresentacion(c) : contenido.presentacion })
                  }} />
              </div>

              <div>
                <label className="eyebrow mb-1.5 block">Presentación</label>
                <textarea value={contenido.presentacion ?? ''} rows={2}
                  onChange={e => updateContenido({ ...contenido, presentacion: e.target.value })}
                  className="field resize-none px-2.5 py-1.5 text-xs" />
              </div>

              {contenido.secciones.map((seccion, si) => (
                <SeccionEditor key={si} seccion={seccion} si={si}
                  onUpdateTitulo={v => {
                    const s = contenido.secciones.map((sec, i) => i === si ? { ...sec, titulo: v } : sec)
                    updateContenido({ ...contenido, secciones: s })
                  }}
                  onUpdateParrafo={(pi, v) => {
                    const s = contenido.secciones.map((sec, i) =>
                      i === si ? { ...sec, parrafos: sec.parrafos.map((p, j) => j === pi ? v : p) } : sec)
                    updateContenido({ ...contenido, secciones: s })
                  }}
                  onAddParrafo={() => {
                    const s = contenido.secciones.map((sec, i) => i === si ? { ...sec, parrafos: [...sec.parrafos, ''] } : sec)
                    updateContenido({ ...contenido, secciones: s })
                  }}
                  onRemoveParrafo={pi => {
                    const s = contenido.secciones.map((sec, i) => i === si ? { ...sec, parrafos: sec.parrafos.filter((_, j) => j !== pi) } : sec)
                    updateContenido({ ...contenido, secciones: s })
                  }}
                  onRemove={() => updateContenido({ ...contenido, secciones: contenido.secciones.filter((_, i) => i !== si) })}
                  onAsistente={pi => abrirAsistente(si, pi)}
                  enFoco={foco && refsOpen && panelDer === 'asistente' && foco.seccion === si + 1 ? (foco.parrafo ?? 0) : null}
                />
              ))}

              </div>

              <button onClick={addSeccion}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-300 py-3 text-xs font-semibold text-zinc-500 hover:border-[var(--brand-accent)] hover:text-zinc-800 dark:border-white/15 dark:hover:text-zinc-100">
                <Plus className="h-3.5 w-3.5" /> Agregar sección
              </button>
            </div>
          )}

          {vista === 'preview' && abogado && (
            <div className="mt-3 sm:mx-auto sm:max-w-[860px]">
              <VistaEnVivo contenido={contenido} abogado={abogado} printRef={printRef} llenar={false} />
            </div>
          )}
          {vista === 'preview' && !abogado && (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Completá tus datos profesionales en Configuración para ver la vista previa A4
            </div>
          )}
        </div>

        {/* Escrito en vivo al costado */}
        {ladoALado && (
          <div data-tour="esc-vivo" className={cn('hidden w-[44%] max-w-[640px] shrink-0 border-l lg:block', BORDE)}>
            <VistaEnVivo contenido={contenido} abogado={abogado!} printRef={printRef} />
          </div>
        )}

        {/* Panel derecho: asistente / referencias — desktop */}
        {refsOpen && (
          <div className={cn('hidden w-80 shrink-0 flex-col overflow-hidden border-l bg-white/60 dark:bg-white/[0.02] sm:flex xl:w-96', BORDE)}>
            {panelDerecho}
          </div>
        )}
      </div>

      {/* Pantallas chicas: revisión, citas y versiones como hoja inferior */}
      {panelIzq && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setPanelIzq(false)}>
          <div className="flex h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-zinc-200 bg-white dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
            <div className={cn('flex shrink-0 items-center justify-between border-b px-4 py-2.5', BORDE)}>
              <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Revisión, citas y versiones</span>
              <button onClick={() => setPanelIzq(false)} title="Cerrar" className="btn btn-ghost btn-icon border-transparent"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{panelContexto}</div>
          </div>
        </div>
      )}

      {/* Mobile: panel derecho como hoja inferior */}
      {refsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 backdrop-blur-sm sm:hidden" onClick={onToggleRefs}>
          <div className="flex h-[80vh] flex-col overflow-hidden rounded-t-3xl border-t border-zinc-200 bg-white dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
            {panelDerecho}
          </div>
        </div>
      )}

      {antesDeFirmar && (
        <AntesDeFirmarDialog
          revision={revision}
          revisando={revisar.isPending}
          desactualizada={desactualizada || dirty}
          citasSinRespaldo={sinRespaldo}
          onRevisar={() => {
            const correr = () => revisar.mutate(escrito.id, { onError: (e) => toast.error('No se pudo revisar', e.message) })
            if (dirty) void guardarAhora().then(correr); else correr()
          }}
          onSeguir={() => { const f = antesDeFirmar; setAntesDeFirmar(null); f() }}
          onClose={() => setAntesDeFirmar(null)}
        />
      )}

      {saeOpen && (
        <PresentarSaeDialog escrito={escrito} onClose={() => setSaeOpen(false)}
          onSuccess={(msg) => { setSaeOpen(false); toast.success('Escrito presentado en el SAE', msg ?? undefined) }} />
      )}
      {enviarRevision && <EnviarRevisionDialog escrito={escrito} onClose={() => setEnviarRevision(false)} />}
      {guardarPlantilla && (
        <GuardarPlantillaDialog titulo={escrito.titulo} tipo={escrito.tipo} contenido={contenido}
          expedienteId={escrito.expediente_id} onClose={() => setGuardarPlantilla(false)} />
      )}
      <ConfirmDialog open={confirmarEliminar} title="Eliminar escrito"
        description="Esta acción no se puede deshacer. El escrito se eliminará permanentemente."
        confirmLabel="Eliminar"
        onConfirm={() => { setConfirmarEliminar(false); onDelete() }}
        onClose={() => setConfirmarEliminar(false)} variant="danger" />
    </div>
  )
}

// ─── Vista en vivo ─────────────────────────────────────────────────────────────

const ANCHO_A4_PX = 794 // 21cm a 96 dpi

/** El escrito tal como sale (hoja A4, logo y formato), achicado para entrar en la columna. */
function VistaEnVivo({ contenido, abogado, printRef, llenar = true }: {
  contenido: EscritoContenido; abogado: EscritoEncabezadoAbogado
  printRef: React.RefObject<HTMLDivElement | null>
  /** true: ocupa la columna con su propio scroll; false: fluye dentro del scroll de la página */
  llenar?: boolean
}) {
  const marcoRef = useRef<HTMLDivElement>(null)
  const hojaRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.6)
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const marco = marcoRef.current
    const hoja = hojaRef.current
    if (!marco || !hoja) return
    const medir = () => {
      setEscala(Math.min(1, (marco.clientWidth - 32) / ANCHO_A4_PX))
      setAlto(hoja.scrollHeight)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(marco); ro.observe(hoja)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={marcoRef} className={cn('bg-zinc-800/40 px-4 py-4', llenar && 'h-full overflow-y-auto')}>
      <div style={{ height: alto * escala }} className="mx-auto" >
        <div ref={hojaRef} style={{ width: ANCHO_A4_PX, transform: `scale(${escala})`, transformOrigin: 'top left' }}
          className="shadow-2xl">
          <div ref={printRef}><EscritoPreview contenido={contenido} abogado={abogado} /></div>
        </div>
      </div>
    </div>
  )
}

// ─── SeccionEditor ─────────────────────────────────────────────────────────────

function SeccionEditor({ seccion, si, onUpdateTitulo, onUpdateParrafo, onAddParrafo, onRemoveParrafo, onRemove, onAsistente, enFoco }: {
  seccion: { titulo: string; parrafos: string[] }; si: number
  onUpdateTitulo: (v: string) => void
  onUpdateParrafo: (pi: number, v: string) => void
  onAddParrafo: () => void; onRemoveParrafo: (pi: number) => void; onRemove: () => void
  onAsistente: (pi?: number) => void
  /** null = sin foco; 0 = la sección completa; n = párrafo n (base 1) */
  enFoco: number | null
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={cn('app-card', enFoco === 0 && 'border-cyan-500/40')}>
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.03]">
        <button onClick={() => setCollapsed(c => !c)} className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <span className="text-[10.5px] font-bold tabular-nums text-zinc-400 dark:text-zinc-500">{si + 1}</span>
        <input value={seccion.titulo} onChange={e => onUpdateTitulo(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs font-bold uppercase tracking-[0.08em] text-zinc-800 focus:outline-none dark:text-zinc-100" />
        <button onClick={() => onAsistente(undefined)} title="Pedirle al asistente sobre esta sección"
          className="rounded-md p-1 text-zinc-400 hover:bg-cyan-500/10 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400">
          <Wand2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} aria-label="Quitar sección" className="rounded-md p-1 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-2 px-3 pb-3 pt-3">
          {seccion.parrafos.map((parrafo, pi) => (
            <div key={pi} className="group relative">
              <textarea value={parrafo} onChange={e => onUpdateParrafo(pi, e.target.value)}
                rows={Math.max(2, Math.ceil(parrafo.length / 80))}
                className={cn('field resize-none px-3 py-2 pr-16 text-[13px] leading-relaxed [@media(hover:hover)]:pr-3 sm:text-xs',
                  enFoco === pi + 1 && 'border-cyan-500/40')}
                placeholder="Párrafo..." />
              <div className="absolute right-1 top-1 flex gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                <button onClick={() => onAsistente(pi)} title="Pedirle al asistente sobre este párrafo"
                  className="rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 hover:text-cyan-600 dark:border-white/10 dark:bg-[var(--popover)] dark:hover:text-cyan-400">
                  <Wand2 className="h-3 w-3" />
                </button>
                <button onClick={() => onRemoveParrafo(pi)} aria-label="Quitar párrafo" className="rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 hover:text-rose-500 dark:border-white/10 dark:bg-[var(--popover)] dark:hover:text-rose-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          <button onClick={onAddParrafo} className="flex items-center gap-1 pl-1 text-[11.5px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            <Plus className="h-3 w-3" /> párrafo
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EscritosPage() {
  const { profile } = useAuth()
  const abogado = useMemo(() => buildAbogado(profile), [profile])

  const { data: escritos = [], isLoading } = useAllEscritos()
  const updateEscrito = useUpdateEscrito()
  const deleteEscrito = useDeleteEscrito()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [refsOpen, setRefsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280)
  const [showPerfil, setShowPerfil] = useState(false)
  const [showUso, setShowUso] = useState(false)
  const [search, setSearch] = useState('')
  const [filtroExpediente, setFiltroExpediente] = useState('')
  const [bandeja, setBandeja] = useState<'revisar' | 'pendientes' | 'presentar' | 'proveido' | 'cerrados' | 'todos'>('pendientes')
  const yo = useAuthStore((s) => s.user?.id)
  // El escrito abierto vive en la URL (/escritos/:id): se puede enlazar desde el expediente y volver con "atrás".
  const navigate = useNavigate()
  const { id: selectedId = null } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const setSelectedId = useCallback((id: string | null) => {
    navigate(id ? `/escritos/${id}` : '/escritos', { replace: true })
  }, [navigate])
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevoInicial, setNuevoInicial] = useState<NuevoInicial | undefined>(undefined)
  const [showModelos, setShowModelos] = useState(false)

  // ?nuevo=1&expediente=…&responde=… → abre el formulario apuntado a ese expediente/actuación
  useEffect(() => {
    if (searchParams.get('nuevo') !== '1') return
    setNuevoInicial({ expedienteId: searchParams.get('expediente') ?? '', respondeA: searchParams.get('responde') ?? '' })
    setShowNuevo(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  // Al llegar con un escrito desde otro lado, la lista muestra los de su expediente
  const contextoAplicado = useRef(false)
  useEffect(() => {
    if (contextoAplicado.current || !selectedId || !escritos.length) return
    contextoAplicado.current = true
    const e = (escritos as EscritoConExpediente[]).find((x) => x.id === selectedId)
    if (e?.expediente_id) { setFiltroExpediente(e.expediente_id); setBandeja('todos') }
  }, [selectedId, escritos])

  const escritoActual = useMemo(() => {
    if (!selectedId) return null
    return (escritos as EscritoConExpediente[]).find(e => e.id === selectedId) ?? null
  }, [selectedId, escritos])

  const expedientesUnicos = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of escritos) {
      const ec = e as EscritoConExpediente
      if (ec.expediente_id && ec.expediente) {
        map.set(ec.expediente_id, ec.expediente.caratula ?? ec.expediente.numero)
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [escritos])

  // Bandejas según dónde está cada escrito en su recorrido
  const enBandeja = (e: EscritoConExpediente, b: typeof bandeja) => {
    const presentado = e.estado === 'presentado' || e.estado === 'presentado_sae'
    if (b === 'revisar') return e.revision_pedida_a === yo && !e.revision_resultado
    if (b === 'pendientes') return e.estado === 'borrador' || e.estado === 'final'
    if (b === 'presentar') return e.estado === 'firmado'
    if (b === 'proveido') return presentado && !e.proveido_movement_id
    if (b === 'cerrados') return presentado && !!e.proveido_movement_id
    return true
  }
  const conteoBandeja = (b: typeof bandeja) => (escritos as EscritoConExpediente[]).filter((e) => enBandeja(e, b)).length
  // Si hay escritos esperando tu revisión, la lista arranca ahí
  const revisarInicial = useRef(false)
  useEffect(() => {
    if (revisarInicial.current || !(escritos as EscritoConExpediente[]).length) return
    revisarInicial.current = true
    if (!selectedId && conteoBandeja('revisar') > 0) setBandeja('revisar')
  }, [escritos]) // eslint-disable-line react-hooks/exhaustive-deps

  const escritosFiltrados = useMemo(() => {
    let list = (escritos as EscritoConExpediente[]).filter((e) => enBandeja(e, bandeja))
    if (filtroExpediente) list = list.filter(e => e.expediente_id === filtroExpediente)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.titulo.toLowerCase().includes(q) || e.tipo.toLowerCase().includes(q) ||
        (e.expediente?.caratula ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [escritos, search, filtroExpediente, bandeja]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreated = (escritoId: string) => {
    setShowNuevo(false)
    setNuevoInicial(undefined)
    setSelectedId(escritoId)
  }
  const abrirNuevo = () => { setNuevoInicial(filtroExpediente ? { expedienteId: filtroExpediente, respondeA: '' } : undefined); setShowNuevo(true) }

  const handleUpdate = async (patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>, snapshotAntes?: EscritoContenido) => {
    if (!escritoActual) return
    await updateEscrito.mutateAsync({ id: escritoActual.id, expediente_id: escritoActual.expediente_id, patch, snapshotAntes })
  }

  const handleDelete = async () => {
    if (!escritoActual) return
    await deleteEscrito.mutateAsync({ id: escritoActual.id, expediente_id: escritoActual.expediente_id })
    setSelectedId(null)
    toast.success('Escrito eliminado')
  }

  return (
    <div data-escritos className="-mx-4 -mt-4 -mb-20 flex h-[calc(100dvh-3.75rem)] overflow-hidden sm:-m-6">
      {/* ── Sidebar — oculto en mobile cuando hay selección ── */}
      <div className={cn(
        'flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 dark:border-white/[0.07] dark:bg-white/[0.025]',
        // Mobile: full screen si no hay selección; oculto si hay
        selectedId ? 'hidden sm:flex' : 'flex w-full',
        // Desktop: togglable, ancho fijo
        sidebarOpen ? 'sm:flex sm:w-64' : 'sm:hidden',
      )}>
        {/* Header sidebar */}
        <div className={cn('flex items-center justify-between border-b px-3 py-3', BORDE)}>
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Escritos</span>
          </div>
          <div className="flex items-center gap-1">
            <EscritosAyudaBoton className="min-h-7 min-w-7" />
            <span data-tour="esc-herramientas" className="flex gap-1">
            <button onClick={() => setShowPerfil(true)} title="Perfil de redacción" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowUso(true)} title="Uso de IA" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100">
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowModelos(true)} title="Modelos" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100">
              <Layers className="h-3.5 w-3.5" />
            </button>
            </span>
            <button data-tour="esc-nuevo" onClick={abrirNuevo} title="Nuevo escrito" className="rounded-md p-1 text-zinc-400 hover:bg-cyan-500/10 hover:text-cyan-700 dark:text-zinc-500 dark:hover:text-cyan-300">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setSidebarOpen(false)} aria-label="Ocultar lista" className="hidden rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100 sm:block">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className={cn('border-b px-3 py-2.5', BORDE)}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="field h-10 py-0 pl-10 text-[13px]" />
          </div>
        </div>

        {/* Bandejas */}
        <div data-tour="esc-bandejas" className={cn('no-scrollbar flex gap-1.5 overflow-x-auto border-b px-3 py-2.5', BORDE)}>
          {([['revisar', 'Para revisar'], ['pendientes', 'Sin terminar'], ['presentar', 'Para presentar'], ['proveido', 'Esperando proveído'], ['cerrados', 'Con proveído'], ['todos', 'Todos']] as const)
            .filter(([b]) => b !== 'revisar' || conteoBandeja('revisar') > 0 || bandeja === 'revisar').map(([b, label]) => (
            <button key={b} type="button" onClick={() => setBandeja(b)} aria-pressed={bandeja === b}
              className="chip min-h-8 gap-1 px-3 text-[11.5px]">
              {label} <span className="chip-count">{conteoBandeja(b)}</span>
            </button>
          ))}
        </div>

        {/* Filtro expediente */}
        {expedientesUnicos.length > 0 && (
          <div className={cn('border-b px-3 py-2', BORDE)}>
            <select value={filtroExpediente} onChange={e => setFiltroExpediente(e.target.value)}
              className="field h-9 py-0 text-xs font-medium">
              <option value="">Todos los expedientes</option>
              {expedientesUnicos.map(ex => <option key={ex.id} value={ex.id}>{ex.label}</option>)}
            </select>
          </div>
        )}

        {/* Lista */}
        <div data-tour="esc-lista" className="flex-1 overflow-y-auto">
          {isLoading && <div className="px-3 py-4 text-xs text-zinc-500">Cargando...</div>}
          {!isLoading && escritosFiltrados.length === 0 && (
            <div className="px-3 py-8 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-zinc-300 dark:text-zinc-600" />
              <p className="text-xs font-medium text-zinc-500">No hay escritos</p>
              <button onClick={abrirNuevo} className="dashboard-link mt-2 text-xs">Crear primero</button>
            </div>
          )}
          {escritosFiltrados.map(e => (
            <button key={e.id} onClick={() => setSelectedId(e.id)}
              className={cn(
                'w-full border-b border-zinc-100 px-3 py-3 text-left transition-colors dark:border-white/[0.04]',
                selectedId === e.id ? 'border-l-2 border-l-[var(--brand-accent)] bg-[var(--brand-navy)]/[0.05] dark:bg-[rgb(102_172_204/0.12)]' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
              )}>
              <p className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{e.titulo || e.tipo}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={cn(TAG, ESTADO_COLORS[e.estado] ?? ESTADO_NEUTRO)}>
                  {ESTADO_LABELS[e.estado] ?? e.estado}
                </span>
                {e.revision_pedida_a && (
                  <span className={cn(TAG,
                    !e.revision_resultado ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : e.revision_resultado === 'aprobado' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300')}>
                    {!e.revision_resultado ? (e.revision_pedida_a === yo ? 'revisar' : 'en revisión') : e.revision_resultado === 'aprobado' ? 'aprobado' : 'observado'}
                  </span>
                )}
                {e.expediente && <span className="truncate text-[11px] text-zinc-500">{e.expediente.caratula ?? e.expediente.numero}</span>}
              </div>
              {(() => {
                const dias = Math.floor((Date.now() - new Date(e.updated_at).getTime()) / 86_400_000)
                const viejo = dias > 7 && (e.estado === 'borrador' || e.estado === 'final' || e.estado === 'firmado')
                const sinTerminar = e.estado === 'borrador' || e.estado === 'final'
                const falta: string[] = []
                if (sinTerminar) {
                  const n = datosPorCompletar(e.contenido).length
                  if (n) falta.push(`${n} ${n === 1 ? 'dato' : 'datos'}`)
                  if (revisionDesactualizada(e)) falta.push('revisión')
                  else if ((e.revision_formal?.diagnostico?.control_formal ?? []).some((x) => x.estado === 'falta')) falta.push('requisitos')
                  falta.push('firma')
                }
                return (
                  <p className={cn('mt-1 text-[10.5px] font-medium tabular-nums', viejo ? 'text-amber-600 dark:text-amber-400/90' : 'text-zinc-500')}>
                    {e.proveido_movement_id ? 'proveído recibido' : (e.estado === 'presentado' || e.estado === 'presentado_sae') ? 'esperando proveído · ' : ''}
                    {!e.proveido_movement_id && (dias === 0 ? 'hoy' : `hace ${dias} d`)}
                    {falta.length > 0 && ` · falta: ${falta.join(', ')}`}
                  </p>
                )
              })()}
            </button>
          ))}
        </div>

        {/* FAB móvil */}
        <div className={cn('border-t p-3 pr-[4.75rem] sm:hidden', BORDE)}>
          <button data-tour="esc-nuevo" onClick={abrirNuevo}
            className="btn btn-primary w-full py-2.5 text-sm">
            <Plus className="h-4 w-4" /> Nuevo escrito
          </button>
        </div>
      </div>

      {/* ── Editor principal ── */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden bg-[var(--background)]',
        // Mobile: visible solo si hay selección
        !selectedId && 'hidden sm:flex',
      )}>
        {/* Sidebar toggle (desktop, cuando cerrado) */}
        {!sidebarOpen && (
          <div className={cn('hidden shrink-0 items-center gap-2 border-b px-3 py-2 sm:flex', BORDE)}>
            <button onClick={() => setSidebarOpen(true)} aria-label="Mostrar lista" className="btn btn-ghost btn-icon h-8 w-8 border-transparent">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span className="truncate text-xs font-semibold text-zinc-500">{escritoActual?.titulo ?? ''}</span>
          </div>
        )}

        {!escritoActual && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <PenLine className="mx-auto mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <h2 className="mb-2 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Taller de escritos</h2>
              <p className="mb-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">Redactá con IA usando el expediente, la normativa y los fallos del estudio, o armá los de trámite con una plantilla, sin IA. Revisá con un asistente y controlá citas y forma antes de firmar.</p>
              <div className="flex flex-col gap-2 items-center">
                <button onClick={abrirNuevo}
                  className="btn btn-primary px-5">
                  <Sparkles className="h-4 w-4" /> Nuevo escrito con IA
                </button>
                <button onClick={() => setShowPerfil(true)}
                  className="btn btn-ghost px-5">
                  <SlidersHorizontal className="h-4 w-4" /> Perfil de redacción
                </button>
                <button onClick={() => setShowModelos(true)}
                  className="btn btn-ghost px-5">
                  <Layers className="h-4 w-4" /> Gestionar modelos
                </button>
                <button onClick={() => setShowUso(true)}
                  className="btn btn-ghost px-5">
                  <BarChart3 className="h-4 w-4" /> Uso de IA
                </button>
              </div>
            </div>
          </div>
        )}

        {escritoActual && (
          <EscritoEditor
            escrito={escritoActual}
            abogado={abogado}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onBack={() => setSelectedId(null)}
            refsOpen={refsOpen}
            onToggleRefs={() => setRefsOpen(r => !r)}
          />
        )}
      </div>

      {showNuevo && <NuevoEscritoDialog inicial={nuevoInicial} onClose={() => { setShowNuevo(false); setNuevoInicial(undefined) }} onCreated={handleCreated} />}
      {showModelos && <ModelosPanel onClose={() => setShowModelos(false)} />}
      {showPerfil && <PerfilRedaccionDialog onClose={() => setShowPerfil(false)} />}
      {showUso && <UsoIADialog onClose={() => setShowUso(false)} />}
    </div>
  )
}
