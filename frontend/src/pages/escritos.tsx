import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PenLine, Plus, Search, X, Loader2, FileText, Trash2, Printer,
  Sparkles, Pencil, Check, ChevronDown, ChevronUp, FolderOpen,
  Save, Upload, Wand2, Mic, Square, Layers, BookOpen, Gavel,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  ArrowLeft, Link2, ExternalLink, Copy, ClipboardCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useAllEscritos, useEscritoModelos, useGenerateEscrito, useUpdateEscrito,
  useDeleteEscrito, useRefinarEscrito, useAttachSignedPdf,
  useCrearModelo, useExtraerModelo, useTranscribirAudio, useEscritoTemplates,
  useFetchReferencia,
  type Escrito, type EscritoContenido, type EscritoConExpediente,
  type EscritoTemplate, type ReferenciaExterna,
} from '@/hooks/use-escritos'
import { useSearchNormativaByText, type NormativaDocumento } from '@/hooks/use-normativa'
import {
  useSearchJurisprudenciaByText, useBuscarJurisprudenciaAfin,
  type JurisprudenciaDocumento,
} from '@/hooks/use-jurisprudencia'
import { EscritoPreview, type EscritoEncabezadoAbogado } from '@/components/expedientes/escrito-preview'
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

// ─── NuevoEscritoDialog ───────────────────────────────────────────────────────

function NuevoEscritoDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [tipo, setTipo] = useState('')
  const [ideaLibre, setIdeaLibre] = useState('')
  const [instrucciones, setInstrucciones] = useState('')
  const [expedienteId, setExpedienteId] = useState('')
  const [expedienteQuery, setExpedienteQuery] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [mediaRec, setMediaRec] = useState<MediaRecorder | null>(null)
  const { data: modelos = [] } = useEscritoModelos()
  const { data: templates = [] } = useEscritoTemplates()
  const generate = useGenerateEscrito()
  const transcribir = useTranscribirAudio()
  const [expedientes, setExpedientes] = useState<Array<{ id: string; label: string }>>([])
  const supabase = createClient()

  const buscarExpedientes = useCallback(async (q: string) => {
    if (q.length < 2) return
    const { data } = await (supabase as any)
      .from('expedientes').select('id, numero, caratula').ilike('caratula', `%${q}%`).limit(20)
    setExpedientes((data ?? []).map((e: { id: string; numero: string; caratula: string | null }) => ({
      id: e.id, label: e.caratula ? `${e.caratula} (${e.numero})` : e.numero,
    })))
  }, [supabase])

  const toggleGrabar = async () => {
    if (grabando && mediaRec) { mediaRec.stop(); setGrabando(false); return }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) { toast.error('No se pudo acceder al micrófono'); return }
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      stream.getTracks().forEach(t => t.stop())
      try {
        const texto = await transcribir.mutateAsync(blob)
        setInstrucciones(prev => prev ? `${prev}\n${texto}` : texto)
      } catch { toast.error('No se pudo transcribir el audio') }
    }
    setMediaRec(rec)
    rec.start()
    setGrabando(true)
  }

  const selectedModelo = modelos.find(m => m.id === modeloId)

  const handleGenerar = async () => {
    if (!tipo && !ideaLibre.trim()) { toast.error('Describí lo que querés redactar o indicá el tipo'); return }
    try {
      const result = await generate.mutateAsync({
        expediente_id: expedienteId || null,
        tipo: tipo || '',
        idea_libre: ideaLibre.trim() || null,
        instrucciones: instrucciones.trim() || undefined,
        template_id: templateId || null,
        modelo_id: modeloId || null,
        borrador_previo: selectedModelo?.contenido_modelo ?? undefined,
      })
      onCreated(result.escrito_id)
    } catch (err) {
      toast.error('Error al generar', err instanceof Error ? err.message : '')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Nuevo escrito</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Describí lo que necesitás o elegí el tipo</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Describí lo que querés redactar <span className="text-zinc-500 font-normal">(o usá el tipo abajo)</span>
            </label>
            <textarea
              value={ideaLibre} onChange={e => setIdeaLibre(e.target.value)}
              placeholder="Ej: Necesito contestar el traslado de demanda laboral de Juan García, reconviniendo por preaviso..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Tipo <span className="text-zinc-500 font-normal">(opcional)</span>
            </label>
            <input
              type="text" list="escritos-tipos" value={tipo} onChange={e => setTipo(e.target.value)}
              placeholder="Contestación de traslado, Demanda, Recurso..."
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
            />
            <datalist id="escritos-tipos">{TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">Instrucciones adicionales</label>
              <button type="button" onClick={toggleGrabar}
                className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
                  grabando ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' : 'text-zinc-500 hover:text-zinc-300'
                )}>
                {grabando ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                {grabando ? 'Detener' : 'Dictar'}
              </button>
            </div>
            <textarea
              value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
              placeholder="Tono, puntos a destacar, normativa a citar..."
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">Expediente <span className="text-zinc-500 font-normal">(opcional)</span></label>
            <input
              type="text" list="escritos-expedientes" value={expedienteQuery}
              onChange={e => {
                const val = e.target.value
                setExpedienteQuery(val)
                const match = expedientes.find(ex => ex.label === val)
                setExpedienteId(match?.id ?? '')
                buscarExpedientes(val)
              }}
              placeholder="Buscar por carátula..."
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
            />
            <datalist id="escritos-expedientes">
              {expedientes.map(ex => <option key={ex.id} value={ex.label} />)}
            </datalist>
          </div>

          {modelos.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Modelo estructural <span className="text-zinc-500 font-normal">(base del escrito)</span></label>
              <select value={modeloId} onChange={e => setModeloId(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none">
                <option value="">Sin modelo (generación libre)</option>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.nombre} — {m.tipo}</option>)}
              </select>
            </div>
          )}

          {templates.filter(t => t.categoria === 'estilo').length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Template de estilo</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/10 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none">
                <option value="">Sin template</option>
                {templates.filter(t => t.categoria === 'estilo').map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/5">
          <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg">Cancelar</button>
          <button onClick={handleGenerar} disabled={generate.isPending || transcribir.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generate.isPending ? 'Generando...' : 'Generar con IA'}
          </button>
        </div>
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
      <div className="w-full sm:max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-amber-400" />
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
                modo === tab ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-200'
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
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300">
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
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
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
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
    <div className="flex flex-col h-full bg-zinc-900/80 border-l border-white/5">
      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {([
          { key: 'jurisprudencia', label: 'Fallos', icon: Gavel },
          { key: 'normativa', label: 'Normativa', icon: BookOpen },
          { key: 'citar', label: 'Citar URL', icon: Link2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              tab === key ? 'border-amber-500 text-amber-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'
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
                className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30"
              />
              <button onClick={handleSearchJuris} disabled={searchJurisprudenciaText.isPending || buscarJurisprudenciaSemantica.isPending}
                className="h-8 px-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 disabled:opacity-50 inline-flex items-center gap-1">
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
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-amber-300">{p.label}</p>
                      <p className="text-[10px] text-zinc-600">{p.desc}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-amber-400" />
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
                className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30"
              />
              <button onClick={handleSearchNorm} disabled={searchNormativa.isPending}
                className="h-8 px-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 disabled:opacity-50 inline-flex items-center gap-1">
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
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-500/15">
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
                  <p className="text-xs font-medium text-zinc-300 group-hover:text-amber-300">SAIJ / Infojus</p>
                  <p className="text-[10px] text-zinc-600">Sistema Argentino de Información Jurídica</p>
                </div>
                <ExternalLink className="h-3 w-3 text-zinc-600 group-hover:text-amber-400" />
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
                  className="flex-1 h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30"
                />
                <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetchReferencia.isPending}
                  className="h-8 px-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 disabled:opacity-50 inline-flex items-center gap-1">
                  {fetchReferencia.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {fetchReferencia.isPending ? 'Extrayendo...' : 'Extraer'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Pegá la URL de cualquier portal jurídico. La IA extrae el tribunal, fecha y cita formal.</p>
            </div>

            {citaExtraida && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-semibold',
                    citaExtraida.tipo === 'fallo' ? 'bg-sky-500/15 text-sky-400' :
                    citaExtraida.tipo === 'normativa' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-zinc-500/15 text-zinc-400'
                  )}>
                    {citaExtraida.tipo}
                  </span>
                  <a href={citaExtraida.fuente_url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-amber-400/60 hover:text-amber-400 flex items-center gap-0.5">
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
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 py-1.5 text-xs text-amber-300 hover:bg-amber-500/25">
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
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-500/15">
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
  onUpdate: (patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>) => Promise<void>
  onDelete: () => void
  onBack?: () => void
  refsOpen: boolean
  onToggleRefs: () => void
}) {
  const [vista, setVista] = useState<'editar' | 'preview'>('editar')
  const [contenido, setContenido] = useState<EscritoContenido>(escrito.contenido)
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [tituloLocal, setTituloLocal] = useState(escrito.titulo)
  const [dirty, setDirty] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [refinarTarget, setRefinarTarget] = useState<{ si: number; pi?: number } | null>(null)
  const [refinarInstr, setRefinarInstr] = useState('')
  const refinarEscrito = useRefinarEscrito()
  const attachPdf = useAttachSignedPdf()
  const printRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincronizar si cambia el escrito desde fuera (otra sesión, etc.)
  useEffect(() => {
    setContenido(escrito.contenido)
    setTituloLocal(escrito.titulo)
    setDirty(false)
  }, [escrito.id])

  const doGuardar = useCallback(async (c: EscritoContenido, t: string) => {
    setGuardando(true)
    try {
      await onUpdate({ contenido: c, titulo: t })
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
    saveTimerRef.current = setTimeout(() => doGuardar(c, tituloLocal), 2500)
  }

  // Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) doGuardar(contenido, tituloLocal)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dirty, contenido, tituloLocal, doGuardar])

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

  const handleRefinar = async (si: number, pi?: number) => {
    if (!refinarInstr.trim()) return
    const seccion = contenido.secciones[si]
    const textoActual = pi !== undefined ? seccion.parrafos[pi] : seccion.parrafos.join('\n\n')
    try {
      const result = await refinarEscrito.mutateAsync({
        expediente_id: escrito.expediente_id, escrito_titulo: contenido.titulo,
        registro_tonal: escrito.registro_tonal, titulo_seccion: seccion.titulo,
        texto_actual: textoActual, instruccion: refinarInstr,
        alcance: pi !== undefined ? 'parrafo' : 'seccion',
      })
      const nuevo = contenido.secciones.map((s, idx) => {
        if (idx !== si) return s
        if (pi !== undefined) return { ...s, parrafos: s.parrafos.map((p, pidx) => pidx === pi ? result.resultado : p) }
        return { ...s, parrafos: result.resultado.split('\n\n').filter(Boolean) }
      })
      updateContenido({ ...contenido, secciones: nuevo })
      setRefinarTarget(null); setRefinarInstr('')
    } catch (err) { toast.error('Error al refinar', err instanceof Error ? err.message : '') }
  }

  const handleAttachPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { hasSignature } = await attachPdf.mutateAsync({ escrito_id: escrito.id, expediente_id: escrito.expediente_id, file })
      await onUpdate({ estado: 'firmado' })
      toast.success(hasSignature ? 'PDF con firma digital adjuntado' : 'PDF adjuntado')
    } catch (err) { toast.error('Error al adjuntar', err instanceof Error ? err.message : '') }
    e.target.value = ''
  }

  const addSeccion = () => updateContenido({ ...contenido, secciones: [...contenido.secciones, { titulo: 'Nueva sección', parrafos: [''] }] })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button onClick={onBack} className="sm:hidden p-1 rounded text-zinc-500 hover:text-zinc-200 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {editandoTitulo ? (
            <input autoFocus value={tituloLocal}
              onChange={e => { setTituloLocal(e.target.value); setDirty(true) }}
              onBlur={() => setEditandoTitulo(false)}
              onKeyDown={e => e.key === 'Enter' && setEditandoTitulo(false)}
              className="flex-1 min-w-0 rounded-md border border-amber-500/40 bg-white/5 px-2 py-1 text-sm font-semibold text-zinc-100 focus:outline-none"
            />
          ) : (
            <button onClick={() => setEditandoTitulo(true)}
              className="text-sm font-semibold text-zinc-100 hover:text-amber-300 truncate max-w-[180px] sm:max-w-xs text-left flex items-center gap-1">
              <span className="truncate">{tituloLocal || escrito.tipo}</span>
              <Pencil className="h-3 w-3 text-zinc-600 shrink-0" />
            </button>
          )}
          <span className={cn('hidden sm:inline shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', ESTADO_COLORS[escrito.estado] ?? 'bg-zinc-500/15 text-zinc-400')}>
            {ESTADO_LABELS[escrito.estado] ?? escrito.estado}
          </span>
          {escrito.expediente && (
            <Link to={`/expedientes/${escrito.expediente_id}`}
              className="hidden sm:inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-300 truncate max-w-[120px]">
              <FolderOpen className="h-3 w-3" />
              <span className="truncate">{escrito.expediente.caratula ?? escrito.expediente.numero}</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Vista toggle */}
          <div className="hidden sm:flex rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setVista('editar')}
              className={cn('px-2.5 py-1 text-xs font-medium', vista === 'editar' ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300')}>
              Editar
            </button>
            <button onClick={() => setVista('preview')}
              className={cn('px-2.5 py-1 text-xs font-medium', vista === 'preview' ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300')}>
              Vista
            </button>
          </div>

          {/* Autosave indicator */}
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500 shrink-0" />}
          {!guardando && dirty && (
            <button onClick={() => doGuardar(contenido, tituloLocal)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600/80 px-2 py-1 text-xs font-medium text-white hover:bg-sky-600">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          {!guardando && !dirty && savedAt && (
            <span className="hidden sm:inline text-[10px] text-zinc-600">
              Guardado {savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button onClick={handleImprimir} title="Imprimir" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5">
            <Printer className="h-4 w-4" />
          </button>
          <label className="cursor-pointer p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5" title="Adjuntar PDF firmado">
            <Upload className="h-4 w-4" />
            <input type="file" accept="application/pdf" className="hidden" onChange={handleAttachPdf} />
          </label>
          <button onClick={onToggleRefs} title={refsOpen ? 'Cerrar referencias' : 'Referencias y citas'}
            className={cn('p-1.5 rounded-lg hover:bg-white/5', refsOpen ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200')}>
            {refsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          <button onClick={() => setConfirmarEliminar(true)} className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body (editor + refs panel) */}
      <div className="flex-1 overflow-hidden flex">
        {/* Editor / Preview */}
        <div className="flex-1 overflow-y-auto">
          {vista === 'editar' && (
            <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 max-w-3xl mx-auto">
              {/* Encabezado y carátula */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Encabezado</label>
                  <input value={contenido.encabezado_juez}
                    onChange={e => updateContenido({ ...contenido, encabezado_juez: e.target.value })}
                    className="h-8 w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 text-xs text-zinc-300 focus:border-sky-500/30 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Carátula</label>
                  <input value={contenido.caratula}
                    onChange={e => updateContenido({ ...contenido, caratula: e.target.value })}
                    className="h-8 w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 text-xs text-zinc-300 focus:border-sky-500/30 focus:outline-none" />
                </div>
              </div>

              {contenido.presentacion !== undefined && (
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Presentación</label>
                  <textarea value={contenido.presentacion ?? ''} rows={2}
                    onChange={e => updateContenido({ ...contenido, presentacion: e.target.value })}
                    className="w-full rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5 text-xs text-zinc-300 focus:outline-none resize-none" />
                </div>
              )}

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
                  onRefinar={pi => setRefinarTarget({ si, pi })}
                  refinarTarget={refinarTarget} refinarInstr={refinarInstr}
                  setRefinarInstr={setRefinarInstr} onApplyRefinar={handleRefinar}
                  isRefining={refinarEscrito.isPending}
                  onCloseRefinar={() => { setRefinarTarget(null); setRefinarInstr('') }}
                />
              ))}

              <button onClick={addSeccion}
                className="w-full rounded-lg border border-dashed border-white/10 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/20 flex items-center justify-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar sección
              </button>
            </div>
          )}

          {vista === 'preview' && abogado && (
            <div className="bg-zinc-800/30 p-4 flex justify-center min-h-full">
              <div ref={printRef} className="w-full max-w-[800px]">
                <EscritoPreview contenido={contenido} abogado={abogado} />
              </div>
            </div>
          )}
          {vista === 'preview' && !abogado && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm p-4 text-center">
              Completá tus datos profesionales en Configuración para ver la vista previa A4
            </div>
          )}
        </div>

        {/* Panel referencias — solo visible en desktop cuando abierto */}
        {refsOpen && (
          <div className="hidden sm:flex w-72 xl:w-80 shrink-0 flex-col overflow-hidden border-l border-white/5">
            <ReferenciasPanel onInsertarReferencia={handleInsertarReferencia} />
          </div>
        )}
      </div>

      {/* Mobile: refs como bottom sheet */}
      {refsOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onToggleRefs}>
          <div className="rounded-t-2xl bg-zinc-900 border-t border-white/10 h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <span className="text-sm font-semibold text-zinc-200">Referencias y citas</span>
              <button onClick={onToggleRefs} className="text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ReferenciasPanel onInsertarReferencia={(t) => { handleInsertarReferencia(t); onToggleRefs() }} />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmarEliminar} title="Eliminar escrito"
        description="Esta acción no se puede deshacer. El escrito se eliminará permanentemente."
        confirmLabel="Eliminar"
        onConfirm={() => { setConfirmarEliminar(false); onDelete() }}
        onClose={() => setConfirmarEliminar(false)} variant="danger" />
    </div>
  )
}

// ─── SeccionEditor ─────────────────────────────────────────────────────────────

function SeccionEditor({ seccion, si, onUpdateTitulo, onUpdateParrafo, onAddParrafo, onRemoveParrafo, onRemove, onRefinar,
  refinarTarget, refinarInstr, setRefinarInstr, onApplyRefinar, isRefining, onCloseRefinar }: {
  seccion: { titulo: string; parrafos: string[] }; si: number
  onUpdateTitulo: (v: string) => void
  onUpdateParrafo: (pi: number, v: string) => void
  onAddParrafo: () => void; onRemoveParrafo: (pi: number) => void; onRemove: () => void
  onRefinar: (pi?: number) => void
  refinarTarget: { si: number; pi?: number } | null
  refinarInstr: string; setRefinarInstr: (v: string) => void
  onApplyRefinar: (si: number, pi?: number) => void
  isRefining: boolean; onCloseRefinar: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const isRefiningSection = refinarTarget?.si === si && refinarTarget.pi === undefined

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03]">
        <button onClick={() => setCollapsed(c => !c)} className="text-zinc-600 hover:text-zinc-300">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <input value={seccion.titulo} onChange={e => onUpdateTitulo(e.target.value)}
          className="flex-1 bg-transparent text-xs font-semibold text-zinc-300 uppercase tracking-wide focus:outline-none" />
        <button onClick={() => onRefinar(undefined)} title="Refinar sección con IA"
          className={cn('p-1 rounded hover:bg-white/10', isRefiningSection ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400')}>
          <Wand2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="p-1 rounded text-zinc-700 hover:text-rose-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {seccion.parrafos.map((parrafo, pi) => {
            const isRefiningThis = refinarTarget?.si === si && refinarTarget.pi === pi
            return (
              <div key={pi} className="group relative">
                <textarea value={parrafo} onChange={e => onUpdateParrafo(pi, e.target.value)}
                  rows={Math.max(2, Math.ceil(parrafo.length / 80))}
                  className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-xs text-zinc-300 leading-relaxed placeholder:text-zinc-700 focus:border-sky-500/20 focus:bg-white/[0.03] focus:outline-none resize-none"
                  placeholder="Párrafo..." />
                <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onRefinar(pi)} title="Refinar con IA"
                    className={cn('p-1 rounded bg-zinc-800 border border-white/8', isRefiningThis ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400')}>
                    <Wand2 className="h-3 w-3" />
                  </button>
                  <button onClick={() => onRemoveParrafo(pi)} className="p-1 rounded bg-zinc-800 border border-white/8 text-zinc-600 hover:text-rose-400">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {isRefiningThis && (
                  <div className="mt-1.5 flex gap-2 items-start">
                    <textarea autoFocus value={refinarInstr} onChange={e => setRefinarInstr(e.target.value)}
                      placeholder="Indicación para la IA..."
                      rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onApplyRefinar(si, pi) } }}
                      className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none" />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => onApplyRefinar(si, pi)} disabled={isRefining || !refinarInstr.trim()}
                        className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-1.5 text-xs text-amber-300 disabled:opacity-50 inline-flex items-center gap-1">
                        {isRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        OK
                      </button>
                      <button onClick={onCloseRefinar} className="text-zinc-600 hover:text-zinc-400 p-1"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {isRefiningSection && (
            <div className="flex gap-2 items-start mt-1">
              <textarea autoFocus value={refinarInstr} onChange={e => setRefinarInstr(e.target.value)}
                placeholder="Indicación para refinar la sección completa..."
                rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onApplyRefinar(si) } }}
                className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none" />
              <div className="flex flex-col gap-1">
                <button onClick={() => onApplyRefinar(si)} disabled={isRefining || !refinarInstr.trim()}
                  className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-1.5 text-xs text-amber-300 disabled:opacity-50 inline-flex items-center gap-1">
                  {isRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} OK
                </button>
                <button onClick={onCloseRefinar} className="text-zinc-600 hover:text-zinc-400 p-1"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}

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
  const [refsOpen, setRefsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filtroExpediente, setFiltroExpediente] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNuevo, setShowNuevo] = useState(false)
  const [showModelos, setShowModelos] = useState(false)

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

  const escritosFiltrados = useMemo(() => {
    let list = escritos as EscritoConExpediente[]
    if (filtroExpediente) list = list.filter(e => e.expediente_id === filtroExpediente)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.titulo.toLowerCase().includes(q) || e.tipo.toLowerCase().includes(q) ||
        (e.expediente?.caratula ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [escritos, search, filtroExpediente])

  const handleCreated = (escritoId: string) => {
    setShowNuevo(false)
    setSelectedId(escritoId)
  }

  const handleUpdate = async (patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>) => {
    if (!escritoActual) return
    await updateEscrito.mutateAsync({ id: escritoActual.id, expediente_id: escritoActual.expediente_id, patch })
  }

  const handleDelete = async () => {
    if (!escritoActual) return
    await deleteEscrito.mutateAsync({ id: escritoActual.id, expediente_id: escritoActual.expediente_id })
    setSelectedId(null)
    toast.success('Escrito eliminado')
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
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
            <PenLine className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Escritos</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowModelos(true)} title="Modelos" className="p-1 rounded text-zinc-600 hover:text-zinc-300">
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowNuevo(true)} title="Nuevo escrito" className="p-1 rounded text-zinc-600 hover:text-amber-400">
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
              <button onClick={() => setShowNuevo(true)} className="mt-2 text-xs text-amber-400 hover:text-amber-300">Crear primero</button>
            </div>
          )}
          {escritosFiltrados.map(e => (
            <button key={e.id} onClick={() => setSelectedId(e.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-white/[0.04]',
                selectedId === e.id ? 'bg-amber-500/10 border-l-2 border-l-amber-500/50' : 'hover:bg-white/[0.03]'
              )}>
              <p className="text-xs font-medium text-zinc-300 truncate">{e.titulo || e.tipo}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('text-[10px] rounded-full px-1.5 py-px', ESTADO_COLORS[e.estado] ?? 'bg-zinc-500/15 text-zinc-500')}>
                  {ESTADO_LABELS[e.estado] ?? e.estado}
                </span>
                {e.expediente && <span className="text-[10px] text-zinc-600 truncate">{e.expediente.caratula ?? e.expediente.numero}</span>}
              </div>
              <p className="text-[10px] text-zinc-700 mt-0.5">
                {new Date(e.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </p>
            </button>
          ))}
        </div>

        {/* FAB móvil */}
        <div className="sm:hidden border-t border-white/5 p-3">
          <button onClick={() => setShowNuevo(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 active:bg-amber-600">
            <Sparkles className="h-4 w-4" /> Nuevo escrito con IA
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
              <p className="text-sm text-zinc-500 mb-6">Redactá con IA, citá jurisprudencia y normativa, usá modelos del estudio. Reemplazá el flujo de Word + Claude.</p>
              <div className="flex flex-col gap-2 items-center">
                <button onClick={() => setShowNuevo(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-400">
                  <Sparkles className="h-4 w-4" /> Nuevo escrito con IA
                </button>
                <button onClick={() => setShowModelos(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200">
                  <Layers className="h-4 w-4" /> Gestionar modelos
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

      {showNuevo && <NuevoEscritoDialog onClose={() => setShowNuevo(false)} onCreated={handleCreated} />}
      {showModelos && <ModelosPanel onClose={() => setShowModelos(false)} />}
    </div>
  )
}
