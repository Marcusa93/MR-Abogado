import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  PenLine, Plus, Search, X, Loader2, FileText, Trash2, Printer,
  Sparkles, Pencil, Check, ChevronDown, ChevronUp, FolderOpen,
  Save, Upload, Wand2, Mic, Square, Layers, BookOpen, Gavel,
  PanelLeftClose, PanelLeftOpen, MoreHorizontal, History,
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
  borrador: 'bg-zinc-500/15 text-zinc-400',
  final: 'bg-sky-500/15 text-sky-400',
  firmado: 'bg-emerald-500/15 text-emerald-400',
  presentado_sae: 'bg-amber-500/15 text-amber-400',
  presentado: 'bg-amber-500/15 text-amber-400',
}

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

const campoBase = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none'

function Paso({ n, titulo, extra, children }: { n: number; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10.5px] text-zinc-300">{n}</span>
        <h3 className="text-[13px] font-medium text-zinc-200">{titulo}</h3>
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
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span className="flex-1 text-sm text-cyan-200 truncate">{expedienteQuery || 'Expediente seleccionado'}</span>
          <button type="button" title="Cambiar expediente"
            onClick={() => { setExpedienteId(''); setExpedienteQuery(''); setRespondeA(''); setActuacionesExtra([]) }}
            className="text-cyan-500 hover:text-cyan-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
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
              className={cn(campoBase, 'h-9 pl-8')}
            />
          </div>
          <datalist id="escritos-expedientes">
            {expedientes.map(ex => <option key={ex.id} value={ex.label} />)}
          </datalist>
          <p className="mt-1 text-[11px] text-zinc-500">Con el expediente se completan solos el carácter, la carátula y las actuaciones. Podés seguir sin elegir uno.</p>
        </>
      )}
    </div>
  )

  return (
    <div data-oculta-bogabot className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70" onClick={ocupado ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()}
        className={cn('flex max-h-[94vh] w-full flex-col rounded-t-xl sm:rounded-xl border border-white/10 bg-[#10161d] shadow-2xl overflow-hidden', esquema ? 'sm:max-w-2xl' : 'sm:max-w-xl')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{esquema ? 'Esquema del escrito' : 'Nuevo escrito'}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{esquema ? 'Ajustá los argumentos y el orden. La redacción va a seguir este esquema.' : modo === 'plantilla' ? 'Escritos de trámite con los datos del expediente, al instante.' : 'Elegí el expediente y contá qué hay que presentar.'}</p>
          </div>
          <button onClick={onClose} disabled={ocupado} title="Cerrar" className="text-zinc-500 hover:text-zinc-200 p-1 disabled:opacity-30"><X className="h-4 w-4" /></button>
        </div>

        {!esquema && (
          <div className="px-5 pt-3 shrink-0">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1 text-[12.5px]">
              {([['ia', 'Redactar con IA'], ['plantilla', 'Plantilla de trámite, sin IA']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setModo(k)}
                  className={cn('rounded-md px-2 py-1.5 font-medium', modo === k ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200')}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {modo === 'plantilla' && !esquema ? (
          <NuevoDesdePlantilla expedienteId={expedienteId} pickerExpediente={pickerExpediente} onCreated={onCreated} onClose={onClose} />
        ) : (<>
        {esquema ? (
          <div className="min-h-0 flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            <EsquemaEditor esquema={esquema} onChange={setEsquema} />
            {contexto && <p className="font-mono text-[10.5px] text-zinc-600">{contexto.modelo_nombre} · {contexto.motivo_modelo}</p>}
          </div>
        ) : (
        <div className="min-h-0 flex-1 px-5 py-4 space-y-5 overflow-y-auto">
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
                  <label className="mb-1 block text-xs text-zinc-400">Responde a <span className="text-zinc-600">(opcional)</span></label>
                  <select value={respondeA} onChange={e => onSelectActuacion(e.target.value)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none">
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
                  {mov?.ai_suggested_action && <p className="mt-1 text-[11px] text-cyan-400/80">Acción sugerida: {mov.ai_suggested_action.titulo}</p>}
                </div>
              )
            })()}
          </Paso>

          <Paso n={2} titulo="Qué hay que presentar" extra={
            <div className="flex items-center gap-1">
              <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void volcarAudio(f); e.target.value = '' }} />
              {transcribir.isPending ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Loader2 className="h-3 w-3 animate-spin" /> Transcribiendo…</span>
              ) : (<>
                <button type="button" onClick={toggleGrabar}
                  className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
                    grabando ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200')}>
                  {grabando ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  {grabando ? 'Detener' : 'Dictar'}
                </button>
                {!grabando && (
                  <button type="button" onClick={() => audioFileRef.current?.click()} title="Subir un audio (por ejemplo, de WhatsApp)"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
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
              className={cn(campoBase, 'py-2 resize-none')}
            />
            <div>
              <p className="mb-1.5 text-[11px] text-zinc-500">O elegí un trámite frecuente</p>
              <div className="flex flex-wrap gap-1.5">
                {TRAMITE_PRESETS.map(p => (
                  <button key={p.tipo} type="button" onClick={() => aplicarPreset(p)}
                    className={cn('rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                      tipo === p.tipo ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/10 hover:text-zinc-200')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Tipo de escrito <span className="text-zinc-600">(opcional si lo contaste arriba)</span></label>
              <input
                type="text" list="escritos-tipos" value={tipo} onChange={e => setTipo(e.target.value)}
                placeholder="Contestación de traslado, Demanda, Recurso…"
                className={cn(campoBase, 'h-9')}
              />
              <datalist id="escritos-tipos">{TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>
            </div>
          </Paso>

          <Paso n={3} titulo="Cómo se presenta">
            <CaracterSelector value={caracter} expedienteId={expedienteId || null}
              onChange={(c) => { setCaracter(c); setCaracterTocado(true) }} />
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Instrucciones <span className="text-zinc-600">(opcional)</span></label>
              <textarea
                value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
                placeholder="Tono, puntos a destacar, normativa a citar…"
                rows={2}
                className={cn(campoBase, 'py-2 resize-none')}
              />
            </div>
            <div>
              <button type="button" onClick={() => setShowContraparte(v => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-200">
                {showContraparte ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Texto de la contraparte para rebatir {contraparteTexto.trim() && <span className="tag-mono">cargado</span>}
              </button>
              {showContraparte && (
                <div className="mt-2">
                  <textarea
                    value={contraparteTexto} onChange={e => setContraparteTexto(e.target.value)}
                    placeholder="Pegá los fragmentos del escrito de la contraparte que querés rebatir. Con los argumentos principales alcanza."
                    rows={5}
                    className={cn(campoBase, 'py-2 resize-y')}
                  />
                </div>
              )}
            </div>
          </Paso>

          <section className="rounded-lg border border-white/[0.08]">
            <button type="button" onClick={() => setAvanzadas(v => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="text-[12.5px] font-medium text-zinc-300">Opciones avanzadas</span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] text-zinc-500">{resumenAvanzadas}</span>
              {avanzadas ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
            </button>
            {avanzadas && (
              <div className="space-y-4 border-t border-white/[0.06] px-3 py-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-300">Modelo de IA</span>
                    <div className="ml-auto flex overflow-hidden rounded-md border border-white/10 text-[11.5px]">
                      {([['auto', 'Automático'], ['preciso', 'Preciso'], ['rapido', 'Rápido']] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => { setCalidad(k); setContexto(null) }}
                          className={cn('px-2.5 py-1', calidad === k ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200')}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11.5px] text-zinc-500">
                    {calidad === 'auto' ? (esFondo ? 'Escrito de fondo: se usa el modelo que mejor argumenta (Opus).' : 'Escrito de trámite: alcanza con el modelo rápido (Sonnet).')
                      : calidad === 'preciso' ? 'Opus: el que mejor razona. Más lento y más caro.' : 'Sonnet: rápido y económico.'}
                  </p>
                  <label className="flex items-start gap-2 text-[12.5px] text-zinc-300">
                    <input type="checkbox" checked={usarEsquema} onChange={(e) => setEsquemaPrimero(e.target.checked)} className="mt-0.5 accent-cyan-500" />
                    <span>Ver el esquema antes de redactar <span className="text-zinc-500">— argumentos, defensas de la contraria y prueba, para aprobar o corregir.{esFondo && esquemaPrimero === null ? ' Recomendado para este escrito.' : ''}</span></span>
                  </label>
                </div>

                {modelos.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-300">Modelo estructural <span className="text-zinc-500">(base del escrito)</span></label>
                    <select value={modeloId} onChange={e => setModeloId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none">
                      <option value="">Sin modelo (generación libre)</option>
                      {modelos.map(m => <option key={m.id} value={m.id}>{m.nombre} — {m.tipo}</option>)}
                    </select>
                  </div>
                )}

                {templates.filter(t => t.categoria === 'estilo').length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-300">Template de estilo</label>
                    <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none">
                      <option value="">Sin template</option>
                      {templates.filter(t => t.categoria === 'estilo').map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                )}

                {expedienteId && movimientos.length > 1 && (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-300">Actuaciones adicionales para el contexto</label>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-zinc-800 p-1 space-y-0.5">
                      {movimientos.slice(0, 60).map(m => {
                        if (m.id === respondeA) return null
                        const checked = actuacionesExtra.includes(m.id)
                        return (
                          <label key={m.id} className="flex items-start gap-2 px-2 py-1 rounded cursor-pointer hover:bg-white/5">
                            <input type="checkbox" checked={checked}
                              onChange={e => setActuacionesExtra(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))}
                              className="mt-0.5 accent-cyan-500 shrink-0" />
                            <span className="text-xs text-zinc-300 leading-tight">
                              {m.is_key === true ? '★ ' : ''}{m.fecha?.slice(0, 10)} — {m.tipo_movimiento}{m.titulo ? ` — ${m.titulo.slice(0, 50)}` : ''}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button type="button" onClick={handleVerContexto} disabled={verContexto.isPending}
                  className="inline-flex items-center gap-1.5 text-[12px] text-cyan-300 hover:text-cyan-200 disabled:opacity-50">
                  {verContexto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Qué va a usar la IA
                </button>
                {contexto && <div className="border-t border-white/5 pt-2"><ContextoIAVista c={contexto} /></div>}
              </div>
            )}
          </section>
        </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-white/5 bg-[#0d1319]">
          {esquema ? (
            <button onClick={() => setEsquema(null)} disabled={ocupado} className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg mr-auto">Volver</button>
          ) : (
            <p className={cn('mr-auto min-w-0 flex-1 basis-48 text-[11.5px]', hayPedido ? 'text-zinc-500' : 'text-amber-300/80')}>{aviso}</p>
          )}
          {esquema && (
            <button onClick={handleEsquema} disabled={ocupado} className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg">
              Rehacer esquema
            </button>
          )}
          {!esquema && <button onClick={onClose} disabled={ocupado} className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg disabled:opacity-30">Cancelar</button>}
          <button onClick={usarEsquema && !esquema ? handleEsquema : handleGenerar} disabled={ocupado || !hayPedido}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 disabled:opacity-50">
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70">
      <div className="w-full sm:max-w-2xl max-h-[90vh] rounded-t-xl sm:rounded-xl border border-white/10 bg-[#10161d] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Modelos del estudio</h2>
              <p className="text-xs text-zinc-400">Plantillas estructurales compartidas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {(['lista', 'upload', 'manual'] as const).map(tab => (
            <button key={tab} onClick={() => { setModo(tab); setModeloExtraido(null) }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                modo === tab ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-zinc-200'
              )}>
              {tab === 'lista' && 'Biblioteca'}
              {tab === 'upload' && 'Cargar desde texto'}
              {tab === 'manual' && 'Crear manualmente'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {modo === 'lista' && (
            <div className="space-y-2">
              {isLoading && <div className="text-sm text-zinc-500">Cargando...</div>}
              {!isLoading && modelos.length === 0 && (
                <div className="text-center py-10">
                  <Layers className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400">No hay modelos cargados aún</p>
                  <button onClick={() => setModo('upload')}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-300">
                    <Upload className="h-3.5 w-3.5" /> Cargar primer modelo
                  </button>
                </div>
              )}
              {modelos.map(m => (
                <div key={m.id} className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{m.nombre}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{m.tipo}</p>
                    </div>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full', m.compartido ? 'bg-teal-500/10 text-teal-400' : 'bg-zinc-500/10 text-zinc-400')}>
                      {m.compartido ? 'Compartido' : 'Personal'}
                    </span>
                  </div>
                  {m.contenido_modelo && <p className="text-xs text-zinc-600 mt-1">{m.contenido_modelo.secciones?.length ?? 0} secciones</p>}
                </div>
              ))}
            </div>
          )}

          {modo === 'upload' && !modeloExtraido && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">Pegá el texto de un escrito real. La IA extrae su estructura como modelo reutilizable, reemplazando datos concretos con marcadores genéricos.</p>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
                  <Upload className="h-3.5 w-3.5" /> Cargar .txt
                  <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                </label>
                <span className="text-xs text-zinc-600">o pegá el texto</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">Nombre del modelo</label>
                  <input type="text" value={nombreModelo} onChange={e => setNombreModelo(e.target.value)} placeholder="Demanda laboral tipo"
                    className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">Tipo</label>
                  <input type="text" value={tipoModelo} onChange={e => setTipoModelo(e.target.value)} placeholder="Demanda"
                    className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" />
                </div>
              </div>
              <textarea value={textoModelo} onChange={e => setTextoModelo(e.target.value)} rows={10}
                placeholder="Pegá aquí el texto completo del escrito modelo..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none" />
              <button onClick={handleExtraer} disabled={!textoModelo.trim() || extraerModelo.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 disabled:opacity-50">
                {extraerModelo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {extraerModelo.isPending ? 'Extrayendo...' : 'Extraer estructura con IA'}
              </button>
            </div>
          )}

          {modo === 'upload' && modeloExtraido && (
            <div className="space-y-4">
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3">
                <p className="text-xs font-medium text-teal-300">Estructura extraída — revisá antes de guardar</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-zinc-300">Nombre</label>
                  <input type="text" value={nombreModelo} onChange={e => setNombreModelo(e.target.value)}
                    className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
                <div><label className="mb-1 block text-xs font-medium text-zinc-300">Tipo</label>
                  <input type="text" value={tipoModelo} onChange={e => setTipoModelo(e.target.value)}
                    className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-300">Secciones ({modeloExtraido.contenido.secciones.length})</p>
                {modeloExtraido.contenido.secciones.map((s, i) => (
                  <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                    <p className="text-xs font-medium text-zinc-300">{s.titulo}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">{s.parrafos.length} párrafo{s.parrafos.length !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModeloExtraido(null)} className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200">Volver</button>
                <button onClick={() => handleGuardarModelo(modeloExtraido.contenido)} disabled={crearModelo.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
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
        <div><label className="mb-1 block text-xs font-medium text-zinc-300">Nombre del modelo</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
        <div><label className="mb-1 block text-xs font-medium text-zinc-300">Tipo</label>
          <input type="text" value={tipo} onChange={e => setTipo(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-zinc-300">Título del escrito</label>
        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="DEMANDA LABORAL"
          className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block text-xs font-medium text-zinc-300">Encabezado</label>
          <input type="text" value={encabezado} onChange={e => setEncabezado(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
        <div><label className="mb-1 block text-xs font-medium text-zinc-300">Carátula</label>
          <input type="text" value={caratula} onChange={e => setCaratula(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 focus:outline-none" /></div>
      </div>
      <div className="space-y-3">
        {secciones.map((sec, si) => (
          <div key={si} className="rounded-lg border border-white/8 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input type="text" value={sec.titulo} onChange={e => updateSeccionTitulo(si, e.target.value)}
                placeholder="Título (ej: I. HECHOS)"
                className="flex-1 h-7 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-zinc-100 font-medium focus:outline-none" />
              <button onClick={() => removeSeccion(si)} className="text-zinc-600 hover:text-rose-400 p-1"><X className="h-3 w-3" /></button>
            </div>
            {sec.parrafos.map((p, pi) => (
              <div key={pi} className="flex gap-1.5">
                <textarea value={p} onChange={e => updateParrafo(si, pi, e.target.value)} rows={2}
                  placeholder="Texto del párrafo..."
                  className="flex-1 rounded-md border border-white/8 bg-white/[0.02] px-2 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none resize-none" />
                <button onClick={() => removeParrafo(si, pi)} className="self-start text-zinc-600 hover:text-rose-400 p-1"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={() => addParrafo(si)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 pl-1">
              <Plus className="h-3 w-3" /> párrafo
            </button>
          </div>
        ))}
        <button onClick={addSeccion}
          className="w-full rounded-lg border border-dashed border-white/10 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/20 flex items-center justify-center gap-1.5">
          <Plus className="h-3 w-3" /> Agregar sección
        </button>
      </div>
      <button onClick={() => onGuardar({ titulo, encabezado_juez: encabezado, caratula, secciones })}
        disabled={guardando || !nombre.trim()}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 disabled:opacity-50">
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
    <div className="flex flex-col h-full bg-[#10161d] border-l border-white/5">
      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {([
          { key: 'jurisprudencia', label: 'Fallos', icon: Gavel },
          { key: 'normativa', label: 'Normativa', icon: BookOpen },
          { key: 'citar', label: 'Citar URL', icon: Link2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              tab === key ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'
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
                className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/30"
              />
              <button onClick={handleSearchJuris} disabled={searchJurisprudenciaText.isPending || buscarJurisprudenciaSemantica.isPending}
                className="h-8 px-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-500/25 disabled:opacity-50 inline-flex items-center gap-1">
                {(searchJurisprudenciaText.isPending || buscarJurisprudenciaSemantica.isPending)
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Search className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600">Texto corto → búsqueda exacta · Texto largo → búsqueda semántica</p>

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
            {searchJurisprudenciaText.data?.length === 0 && <p className="text-xs text-zinc-600 text-center py-3">Sin resultados en el corpus local</p>}

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
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">Portales externos</p>
              <div className="space-y-1">
                {PORTALES_EXTERNOS.map(p => (
                  <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] group">
                    <div>
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-cyan-300">{p.label}</p>
                      <p className="text-[10px] text-zinc-600">{p.desc}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-cyan-400" />
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">Copiá la URL del fallo que encontrés y usala en la pestaña "Citar URL"</p>
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
                className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/30"
              />
              <button onClick={handleSearchNorm} disabled={searchNormativa.isPending}
                className="h-8 px-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-500/25 disabled:opacity-50 inline-flex items-center gap-1">
                {searchNormativa.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </button>
            </div>

            {searchNormativa.data && searchNormativa.data.length > 0 && (
              <div className="space-y-1.5">
                {searchNormativa.data.map(n => {
                  const cita = formatNormativaCita(n)
                  return (
                    <div key={n.id} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                      <p className="text-xs font-medium text-zinc-200 leading-snug">{n.titulo}</p>
                      {n.numero && <p className="text-[10px] text-zinc-500 mt-0.5">{n.tipo} N° {n.numero}</p>}
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => copiar(cita, n.id)}
                          className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] border transition-colors',
                            copiado === n.id ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200'
                          )}>
                          {copiado === n.id ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiado === n.id ? 'Copiado' : 'Copiar'}
                        </button>
                        <button onClick={() => onInsertarReferencia(cita)}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/8 px-2 py-0.5 text-[10px] text-cyan-400 hover:bg-cyan-500/15">
                          <Plus className="h-3 w-3" /> Insertar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {searchNormativa.data?.length === 0 && <p className="text-xs text-zinc-600 text-center py-3">Sin resultados en el corpus</p>}

            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">Normativa nacional</p>
              <a href="http://www.saij.gob.ar" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] group">
                <div>
                  <p className="text-xs font-medium text-zinc-300 group-hover:text-cyan-300">SAIJ / Infojus</p>
                  <p className="text-[10px] text-zinc-600">Sistema Argentino de Información Jurídica</p>
                </div>
                <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-cyan-400" />
              </a>
              <p className="text-[10px] text-zinc-600 mt-2">Encontrá la norma y copiá su URL en "Citar URL" para extraerla automáticamente</p>
            </div>
          </>
        )}

        {/* ── Tab: Citar URL ── */}
        {tab === 'citar' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">URL del fallo o normativa</label>
              <div className="flex gap-1.5">
                <input
                  type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
                  placeholder="https://..."
                  className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/30"
                />
                <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetchReferencia.isPending}
                  className="h-8 px-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-500/25 disabled:opacity-50 inline-flex items-center gap-1">
                  {fetchReferencia.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {fetchReferencia.isPending ? 'Extrayendo...' : 'Extraer'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Pegá la URL de cualquier portal jurídico. La IA extrae el tribunal, fecha y cita formal.</p>
            </div>

            {citaExtraida && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-semibold',
                    citaExtraida.tipo === 'fallo' ? 'bg-sky-500/15 text-sky-400' :
                    citaExtraida.tipo === 'normativa' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-zinc-500/15 text-zinc-400'
                  )}>
                    {citaExtraida.tipo}
                  </span>
                  <a href={citaExtraida.fuente_url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-cyan-400/60 hover:text-cyan-400 flex items-center gap-0.5">
                    fuente <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                {citaExtraida.caratula && <p className="text-xs font-semibold text-zinc-200 leading-snug">{citaExtraida.caratula}</p>}
                {citaExtraida.numero && <p className="text-[11px] text-zinc-500">N° {citaExtraida.numero}</p>}

                <div className="grid grid-cols-2 gap-2">
                  {citaExtraida.tribunal && (
                    <div>
                      <p className="text-[10px] text-zinc-600">Tribunal</p>
                      <p className="text-[11px] text-zinc-300">{citaExtraida.tribunal}</p>
                    </div>
                  )}
                  {citaExtraida.fecha && (
                    <div>
                      <p className="text-[10px] text-zinc-600">Fecha</p>
                      <p className="text-[11px] text-zinc-300">{citaExtraida.fecha}</p>
                    </div>
                  )}
                </div>

                {citaExtraida.extracto && (
                  <div>
                    <p className="text-[10px] text-zinc-600 mb-0.5">Extracto</p>
                    <p className="text-[11px] text-zinc-400 italic leading-relaxed line-clamp-4">&ldquo;{citaExtraida.extracto}&rdquo;</p>
                  </div>
                )}

                <div className="rounded-md bg-zinc-800/50 border border-white/5 px-2 py-1.5">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Cita formal</p>
                  <p className="text-xs text-zinc-300 font-medium">{citaExtraida.cita_formal}</p>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button onClick={() => copiar(citaExtraida.cita_formal, 'cita_formal')}
                    className={cn('flex-1 inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs border transition-colors',
                      copiado === 'cita_formal' ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200'
                    )}>
                    {copiado === 'cita_formal' ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar cita
                  </button>
                  {citaExtraida.extracto && (
                    <button onClick={() => copiar(`${citaExtraida.cita_formal}\n\n"${citaExtraida.extracto}"`, 'cita_con_extracto')}
                      className={cn('flex-1 inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs border transition-colors',
                        copiado === 'cita_con_extracto' ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200'
                      )}>
                      {copiado === 'cita_con_extracto' ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Con extracto
                    </button>
                  )}
                  <button onClick={() => onInsertarReferencia(citaExtraida.cita_formal + (citaExtraida.extracto ? `\n"${citaExtraida.extracto}"` : ''))}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/25">
                    <Plus className="h-3 w-3" /> Insertar
                  </button>
                </div>

                <button onClick={() => { setUrlInput(''); setCitaExtraida(null) }}
                  className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 pt-1">
                  Extraer otra URL
                </button>
              </div>
            )}

            <div className="pt-1 border-t border-white/5">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">URLs de ejemplo</p>
              <div className="space-y-1">
                {PORTALES_EXTERNOS.slice(0, 3).map(p => (
                  <button key={p.url} onClick={() => setUrlInput(p.url)}
                    className="w-full text-left flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 hover:bg-white/[0.04] group">
                    <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200">{p.label}</span>
                    <span className="text-[10px] text-zinc-700">{p.url.replace('https://', '').replace('http://', '').split('/')[0]}</span>
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
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
      <p className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">{caratula}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {tribunal && <p className="text-[10px] text-zinc-500 truncate flex-1">{tribunal}</p>}
        {score && <span className="text-[10px] text-zinc-600">{(score * 100).toFixed(0)}%</span>}
      </div>
      {extracto && <p className="text-[10px] text-zinc-600 italic mt-1 line-clamp-2">&ldquo;{extracto}&rdquo;</p>}
      <div className="flex gap-1.5 mt-2">
        <button onClick={onCopiar}
          className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] border transition-colors',
            copiado ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200'
          )}>
          {copiado ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button onClick={onInsertar}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/8 px-2 py-0.5 text-[10px] text-cyan-400 hover:bg-cyan-500/15">
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
      <div className="flex gap-0.5 border-b border-white/5 px-2">
        {([['asistente', 'Asistente'], ['referencias', 'Referencias']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPanelDer(k)}
            className={cn('border-b-2 px-2.5 py-2.5 text-[12px] font-medium', panelDer === k ? 'border-cyan-400 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>{l}</button>
        ))}
        <button type="button" onClick={onToggleRefs} className="ml-auto p-2 text-zinc-500 hover:text-zinc-200" title="Cerrar panel"><X className="h-3.5 w-3.5" /></button>
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
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button onClick={onBack} className="sm:hidden p-1 rounded text-zinc-500 hover:text-zinc-200 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setPanelIzq(v => !v)} title={panelIzq ? 'Cerrar contexto' : 'Contexto, citas, revisión y versiones'}
            className={cn('hidden lg:inline-flex p-1.5 rounded-lg hover:bg-white/5 shrink-0', panelIzq ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-200')}>
            {panelIzq ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {editandoTitulo ? (
            <input autoFocus value={tituloLocal}
              onChange={e => { setTituloLocal(e.target.value); setDirty(true) }}
              onBlur={() => setEditandoTitulo(false)}
              onKeyDown={e => e.key === 'Enter' && setEditandoTitulo(false)}
              className="flex-1 min-w-0 rounded-md border border-cyan-500/40 bg-white/5 px-2 py-1 text-sm font-semibold text-zinc-100 focus:outline-none"
            />
          ) : (
            <button onClick={() => setEditandoTitulo(true)}
              className="text-sm font-semibold text-zinc-100 hover:text-cyan-300 truncate max-w-[180px] sm:max-w-xs text-left flex items-center gap-1">
              <span className="truncate">{tituloLocal || escrito.tipo}</span>
              <Pencil className="h-3 w-3 text-zinc-600 shrink-0" />
            </button>
          )}
          <span className={cn('hidden sm:inline shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', ESTADO_COLORS[escrito.estado] ?? 'bg-zinc-500/15 text-zinc-400')}>
            {ESTADO_LABELS[escrito.estado] ?? escrito.estado}
          </span>
          {escrito.expediente && (
            <Link to={`/expedientes/${escrito.expediente_id}`}
              className="hidden md:inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-400 hover:text-cyan-300 truncate max-w-[160px]">
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
          <div className="hidden sm:flex rounded-lg border border-white/10 overflow-hidden">
            {([['editar', 'Editar', ''], ['lado', 'Lado a lado', 'hidden lg:block'], ['preview', 'Escrito', '']] as const).map(([k, l, extra]) => (
              <button key={k} onClick={() => setVista(k)} title={k === 'lado' ? 'Editar y ver el escrito en vivo al costado' : undefined}
                className={cn('px-2.5 py-1 text-xs font-medium', extra, vista === k ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300')}>
                {l}
              </button>
            ))}
          </div>

          {/* Autosave indicator */}
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500 shrink-0" />}
          {!guardando && dirty && (
            <button onClick={() => void guardarAhora()}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-white/5">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          {!guardando && !dirty && savedAt && (
            <span className="hidden sm:inline font-mono text-[10px] text-zinc-600">
              guardado {savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}

          <button onClick={() => { if (refsOpen && panelDer === 'asistente') onToggleRefs(); else { if (vista === 'lado') setVistaState('editar'); setPanelDer('asistente'); if (!refsOpen) onToggleRefs() } }}
            title="Asistente"
            className={cn('inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium hover:bg-white/5', refsOpen ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200')}>
            <MessageSquare className="h-4 w-4" /> <span className="hidden md:inline">Asistente</span>
          </button>
          <div className="relative">
            <button onClick={() => setMasOpen(v => !v)} aria-label="Más acciones" aria-expanded={masOpen} title="Más acciones"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {masOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMasOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-xl">
                  {([
                    { icon: History, label: 'Revisión, citas y versiones', onClick: () => setPanelIzq(true) },
                    { icon: Upload, label: 'Adjuntar PDF firmado', onClick: () => conControl(() => archivoRef.current?.click()) },
                    { icon: Printer, label: 'Imprimir', onClick: handleImprimir },
                    { icon: Layers, label: 'Guardar como plantilla', onClick: () => setGuardarPlantilla(true) },
                    ...(escrito.expediente_id ? [{ icon: FolderOpen, label: 'Ir al expediente', onClick: () => navigate(`/expedientes/${escrito.expediente_id}`) }] : []),
                  ]).map(({ icon: Icono, label, onClick }) => (
                    <button key={label} onClick={() => { setMasOpen(false); onClick() }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/5">
                      <Icono className="h-4 w-4 shrink-0 text-zinc-500" /> {label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-white/10" />
                  <button onClick={() => { setMasOpen(false); setConfirmarEliminar(true) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-rose-400 hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4 shrink-0" /> Eliminar escrito
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Celular y tablet: alternar entre editar y ver el escrito */}
      <div className="flex shrink-0 border-b border-white/5 sm:hidden">
        {([['editar', 'Editar'], ['preview', 'Ver escrito']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVistaState(k)}
            className={cn('flex-1 border-b-2 py-2.5 text-xs font-medium',
              (vista === k || (k === 'editar' && vista === 'lado')) ? 'border-cyan-400 text-white' : 'border-transparent text-zinc-500')}>
            {l}
          </button>
        ))}
      </div>

      {/* Body: contexto | documento | asistente */}
      <div className="flex-1 overflow-hidden flex">
        {panelIzq && (
          <div className="hidden lg:flex w-80 shrink-0 flex-col overflow-hidden border-r border-white/5">
            {panelContexto}
          </div>
        )}
        {/* Editor / Preview */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-4 sm:pt-4">
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
              {/* Encabezado y carátula */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">Encabezado</label>
                  <input value={contenido.encabezado_juez}
                    onChange={e => updateContenido({ ...contenido, encabezado_juez: e.target.value })}
                    className="h-8 w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 text-xs text-zinc-300 focus:border-cyan-500/30 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">Carátula</label>
                  <input value={contenido.caratula}
                    onChange={e => updateContenido({ ...contenido, caratula: e.target.value })}
                    className="h-8 w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 text-xs text-zinc-300 focus:border-cyan-500/30 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">Me presento como</label>
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
                <label className="mb-1 block font-mono text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">Presentación</label>
                <textarea value={contenido.presentacion ?? ''} rows={2}
                  onChange={e => updateContenido({ ...contenido, presentacion: e.target.value })}
                  className="w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5 text-xs text-zinc-300 focus:outline-none resize-none" />
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

              <button onClick={addSeccion}
                className="w-full rounded-lg border border-dashed border-white/10 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/20 flex items-center justify-center gap-1.5">
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
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm p-4 text-center">
              Completá tus datos profesionales en Configuración para ver la vista previa A4
            </div>
          )}
        </div>

        {/* Escrito en vivo al costado */}
        {ladoALado && (
          <div className="hidden lg:block w-[44%] max-w-[640px] shrink-0 border-l border-white/5">
            <VistaEnVivo contenido={contenido} abogado={abogado!} printRef={printRef} />
          </div>
        )}

        {/* Panel derecho: asistente / referencias — desktop */}
        {refsOpen && (
          <div className="hidden sm:flex w-80 xl:w-96 shrink-0 flex-col overflow-hidden border-l border-white/5">
            {panelDerecho}
          </div>
        )}
      </div>

      {/* Pantallas chicas: revisión, citas y versiones como hoja inferior */}
      {panelIzq && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setPanelIzq(false)}>
          <div className="flex h-[85vh] flex-col overflow-hidden rounded-t-xl border-t border-white/10 bg-[#10161d]" onClick={e => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2.5">
              <span className="text-sm font-medium text-zinc-200">Revisión, citas y versiones</span>
              <button onClick={() => setPanelIzq(false)} title="Cerrar" className="p-1.5 text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{panelContexto}</div>
          </div>
        </div>
      )}

      {/* Mobile: panel derecho como hoja inferior */}
      {refsOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onToggleRefs}>
          <div className="rounded-t-xl bg-[#10161d] border-t border-white/10 h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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
    <div className={cn('rounded-xl border bg-white/[0.02] overflow-hidden', enFoco === 0 ? 'border-cyan-500/40' : 'border-white/8')}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03]">
        <button onClick={() => setCollapsed(c => !c)} className="text-zinc-600 hover:text-zinc-300">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <span className="font-mono text-[10px] text-zinc-600">{si + 1}</span>
        <input value={seccion.titulo} onChange={e => onUpdateTitulo(e.target.value)}
          className="flex-1 bg-transparent text-xs font-semibold text-zinc-300 uppercase tracking-wide focus:outline-none" />
        <button onClick={() => onAsistente(undefined)} title="Pedirle al asistente sobre esta sección"
          className="p-1 rounded hover:bg-white/10 text-zinc-600 hover:text-cyan-400">
          <Wand2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="p-1 rounded text-zinc-700 hover:text-rose-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {seccion.parrafos.map((parrafo, pi) => (
            <div key={pi} className="group relative">
              <textarea value={parrafo} onChange={e => onUpdateParrafo(pi, e.target.value)}
                rows={Math.max(2, Math.ceil(parrafo.length / 80))}
                className={cn('w-full rounded-lg border bg-white/[0.01] px-3 py-2 pr-16 [@media(hover:hover)]:pr-3 text-[13px] sm:text-xs text-zinc-300 leading-relaxed placeholder:text-zinc-700 focus:border-cyan-500/20 focus:bg-white/[0.03] focus:outline-none resize-none',
                  enFoco === pi + 1 ? 'border-cyan-500/40' : 'border-white/5')}
                placeholder="Párrafo..." />
              <div className="absolute right-1 top-1 flex gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                <button onClick={() => onAsistente(pi)} title="Pedirle al asistente sobre este párrafo"
                  className="p-1 rounded bg-zinc-800 border border-white/8 text-zinc-500 hover:text-cyan-400">
                  <Wand2 className="h-3 w-3" />
                </button>
                <button onClick={() => onRemoveParrafo(pi)} className="p-1 rounded bg-zinc-800 border border-white/8 text-zinc-600 hover:text-rose-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          <button onClick={onAddParrafo} className="text-[11px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1 pl-1">
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
  const [bandeja, setBandeja] = useState<'pendientes' | 'presentar' | 'proveido' | 'cerrados' | 'todos'>('pendientes')
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
    if (b === 'pendientes') return e.estado === 'borrador' || e.estado === 'final'
    if (b === 'presentar') return e.estado === 'firmado'
    if (b === 'proveido') return presentado && !e.proveido_movement_id
    if (b === 'cerrados') return presentado && !!e.proveido_movement_id
    return true
  }
  const conteoBandeja = (b: typeof bandeja) => (escritos as EscritoConExpediente[]).filter((e) => enBandeja(e, b)).length

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
    <div data-escritos className="-mx-4 -mt-4 -mb-20 flex h-[calc(100dvh-3.5rem)] overflow-hidden sm:-m-6">
      {/* ── Sidebar — oculto en mobile cuando hay selección ── */}
      <div className={cn(
        'flex flex-col border-r border-white/5 bg-zinc-900/50 transition-all duration-200',
        // Mobile: full screen si no hay selección; oculto si hay
        selectedId ? 'hidden sm:flex' : 'flex w-full',
        // Desktop: togglable, ancho fijo
        sidebarOpen ? 'sm:flex sm:w-64' : 'sm:hidden',
      )}>
        {/* Header sidebar */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-200">Escritos</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowPerfil(true)} title="Perfil de redacción" className="p-1 rounded text-zinc-600 hover:text-zinc-300">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowUso(true)} title="Uso de IA" className="p-1 rounded text-zinc-600 hover:text-zinc-300">
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowModelos(true)} title="Modelos" className="p-1 rounded text-zinc-600 hover:text-zinc-300">
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button onClick={abrirNuevo} title="Nuevo escrito" className="p-1 rounded text-zinc-600 hover:text-cyan-400">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setSidebarOpen(false)} className="hidden sm:block p-1 rounded text-zinc-700 hover:text-zinc-400">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="h-7 w-full rounded-md border border-white/8 bg-white/[0.02] pl-7 pr-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none" />
          </div>
        </div>

        {/* Bandejas */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-white/5 px-3 py-2">
          {([['pendientes', 'Sin terminar'], ['presentar', 'Para presentar'], ['proveido', 'Esperando proveído'], ['cerrados', 'Con proveído'], ['todos', 'Todos']] as const).map(([b, label]) => (
            <button key={b} type="button" onClick={() => setBandeja(b)}
              className={cn('flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium',
                bandeja === b ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5')}>
              {label} <span className="tabular-nums opacity-70">{conteoBandeja(b)}</span>
            </button>
          ))}
        </div>

        {/* Filtro expediente */}
        {expedientesUnicos.length > 0 && (
          <div className="px-3 py-1.5 border-b border-white/5">
            <select value={filtroExpediente} onChange={e => setFiltroExpediente(e.target.value)}
              className="w-full h-7 rounded-md border border-white/8 bg-zinc-800 text-xs text-zinc-400 focus:outline-none">
              <option value="">Todos los expedientes</option>
              {expedientesUnicos.map(ex => <option key={ex.id} value={ex.id}>{ex.label}</option>)}
            </select>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="px-3 py-4 text-xs text-zinc-600">Cargando...</div>}
          {!isLoading && escritosFiltrados.length === 0 && (
            <div className="px-3 py-8 text-center">
              <FileText className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">No hay escritos</p>
              <button onClick={abrirNuevo} className="mt-2 text-xs text-cyan-400 hover:text-cyan-300">Crear primero</button>
            </div>
          )}
          {escritosFiltrados.map(e => (
            <button key={e.id} onClick={() => setSelectedId(e.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-white/[0.04]',
                selectedId === e.id ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500/50' : 'hover:bg-white/[0.03]'
              )}>
              <p className="text-xs font-medium text-zinc-300 truncate">{e.titulo || e.tipo}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('text-[10px] rounded-full px-1.5 py-px', ESTADO_COLORS[e.estado] ?? 'bg-zinc-500/15 text-zinc-500')}>
                  {ESTADO_LABELS[e.estado] ?? e.estado}
                </span>
                {e.expediente && <span className="text-[10px] text-zinc-600 truncate">{e.expediente.caratula ?? e.expediente.numero}</span>}
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
                  <p className={cn('mt-0.5 font-mono text-[10px]', viejo ? 'text-amber-500/90' : 'text-zinc-600')}>
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
        <div className="sm:hidden border-t border-white/5 p-3 pr-[4.75rem]">
          <button onClick={abrirNuevo}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-zinc-900">
            <Plus className="h-4 w-4" /> Nuevo escrito
          </button>
        </div>
      </div>

      {/* ── Editor principal ── */}
      <div className={cn(
        'flex-1 flex flex-col overflow-hidden bg-zinc-950',
        // Mobile: visible solo si hay selección
        !selectedId && 'hidden sm:flex',
      )}>
        {/* Sidebar toggle (desktop, cuando cerrado) */}
        {!sidebarOpen && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-600 truncate">{escritoActual?.titulo ?? ''}</span>
          </div>
        )}

        {!escritoActual && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <PenLine className="h-10 w-10 text-zinc-700 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-300 mb-2">Taller de escritos</h2>
              <p className="text-sm text-zinc-500 mb-6">Redactá con IA usando el expediente, la normativa y los fallos del estudio, o armá los de trámite con una plantilla, sin IA. Revisá con un asistente y controlá citas y forma antes de firmar.</p>
              <div className="flex flex-col gap-2 items-center">
                <button onClick={abrirNuevo}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-zinc-900">
                  <Sparkles className="h-4 w-4" /> Nuevo escrito con IA
                </button>
                <button onClick={() => setShowPerfil(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200">
                  <SlidersHorizontal className="h-4 w-4" /> Perfil de redacción
                </button>
                <button onClick={() => setShowModelos(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200">
                  <Layers className="h-4 w-4" /> Gestionar modelos
                </button>
                <button onClick={() => setShowUso(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200">
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
