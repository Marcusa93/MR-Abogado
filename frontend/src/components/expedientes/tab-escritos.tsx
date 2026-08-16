import { useMemo, useRef, useState, useEffect } from 'react'
import { useModalHistory } from '@/hooks/use-modal-history'
import { Link } from 'react-router-dom'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  PenLine, Plus, Loader2, FileText, Trash2, Printer, X, Sparkles, FileSearch,
  AlertCircle, Pencil, Check, Upload, Send, ExternalLink, ShieldCheck, Gavel,
  Mic, Square, Wand2,
} from 'lucide-react'
import { SugerirJurisprudenciaDialog } from './sugerir-jurisprudencia-dialog'
import { useAuth } from '@/hooks/use-auth'
import {
  useEscritos, useEscritoTiposPrevios, useGenerateEscrito,
  useDeleteEscrito, useUpdateEscrito, useEscritoTemplates,
  useAttachSignedPdf, usePresentarEscrito, useFetchPortalCategorias,
  useTranscribirAudio, useRefinarEscrito,
  type Escrito, type EscritoContenido, type PortalFormInfo,
} from '@/hooks/use-escritos'
import { useSaeMovements } from '@/hooks/use-sae'
import { useCreateTarea } from '@/hooks/use-tareas'
import { useEscritoIntent } from '@/stores/escrito-intent-store'
import { EscritoPreview, type EscritoEncabezadoAbogado } from './escrito-preview'
import { DiagnosticoModal } from './diagnostico-modal'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

interface Props {
  expedienteId: string
}

// Tipos sugeridos por defecto (el usuario puede escribir cualquier otro)
const TIPOS_SUGERIDOS = [
  'Contestación de demanda',
  'Contestación de traslado',
  'Alegato',
  'Recurso de apelación',
  'Recurso de reposición',
  'Pronto despacho',
  'Ofrecimiento de prueba',
  'Oficio',
  'Memorial',
  'Expresión de agravios',
]

// Presets de trámite: los escritos cotidianos, de un click. Pre-cargan tipo +
// una instrucción base. La IA los completa con el contexto real del expediente.
const TRAMITE_PRESETS: { label: string; tipo: string; instr: string }[] = [
  { label: 'Adjunta bono', tipo: 'Adjunta bono de movilidad', instr: 'Acompañar el bono de movilidad y solicitar se tenga por cumplido a fin de notificar / diligenciar lo ordenado.' },
  { label: 'Acompaña documental', tipo: 'Acompaña documental', instr: 'Acompañar la documental que se individualiza y solicitar se tenga presente y por agregada.' },
  { label: 'Constituye domicilio electrónico', tipo: 'Constituye domicilio electrónico', instr: 'Constituir domicilio electrónico y denunciar el real, solicitando se tenga presente.' },
  { label: 'Libramiento de cédula', tipo: 'Solicita libramiento de cédula', instr: 'Solicitar se libre cédula de notificación conforme lo ordenado, con los recaudos de estilo.' },
  { label: 'Libramiento de oficio', tipo: 'Solicita libramiento de oficio', instr: 'Solicitar se libre oficio conforme lo ordenado, autorizando su diligenciamiento.' },
  { label: 'Toma vista', tipo: 'Toma vista de las actuaciones', instr: 'Solicitar vista de las actuaciones por el plazo de ley.' },
  { label: 'Pronto despacho', tipo: 'Pronto despacho', instr: 'Solicitar pronto despacho de lo peticionado, atento el tiempo transcurrido.' },
  { label: 'Denuncia domicilio', tipo: 'Denuncia domicilio', instr: 'Denunciar el domicilio real de la contraria / del tercero para su notificación.' },
]

// Mismas reglas que tab-actuaciones-claves para mostrar el preview de claves
const KEY_TYPES = new Set(['sentencia','audiencia','intimacion','embargo','traslado','decreto','cedula'])
// Tipos de providencia a los que típicamente se "contesta"/da cumplimiento.
const RESPONDIBLE_TYPES = new Set(['decreto','traslado','intimacion','cedula','sentencia','providencia','resolucion','auto'])

function buildAbogadoFromProfile(profile: ReturnType<typeof useAuth>['profile']): EscritoEncabezadoAbogado | null {
  if (!profile) return null
  const p = profile as typeof profile & {
    matricula?: string | null
    matricula_libro?: string | null
    matricula_folio?: string | null
    domicilio_legal?: string | null
    casillero_notif?: string | null
    cuit?: string | null
  }
  return {
    nombreCompleto: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim().toUpperCase(),
    matricula: p.matricula ?? null,
    matriculaLibro: p.matricula_libro ?? null,
    matriculaFolio: p.matricula_folio ?? null,
    domicilioLegal: p.domicilio_legal ?? null,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    casilleroNotif: p.casillero_notif ?? null,
    cuit: p.cuit ?? null,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog: Nuevo escrito
// ────────────────────────────────────────────────────────────────────────────

function NuevoEscritoDialog({
  open, onClose, expedienteId, clavesCount, onGenerated, initialRespondeA,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string
  clavesCount: number
  onGenerated: (escritoId: string) => void
  initialRespondeA?: string | null
}) {
  const [modo, setModo] = useState<'tipo' | 'idea'>('tipo')
  const [tipo, setTipo] = useState('')
  const [idea, setIdea] = useState('')
  const [respondeA, setRespondeA] = useState('')
  const [titulo, setTitulo] = useState('')
  const [instrucciones, setInstrucciones] = useState('')
  // Modelo de estilo: '' = ninguno, 'NUEVO' = pegar uno nuevo, otro = id de template guardado
  const [modeloSel, setModeloSel] = useState('')
  const [estiloTexto, setEstiloTexto] = useState('')
  const [guardarComo, setGuardarComo] = useState('')
  const [contraparteTexto, setContraparteTexto] = useState('')
  const [showContraparte, setShowContraparte] = useState(false)
  const { data: tiposPrevios = [] } = useEscritoTiposPrevios()
  const { data: templates = [] } = useEscritoTemplates()
  const { data: movimientos = [] } = useSaeMovements(expedienteId)
  const generate = useGenerateEscrito()
  const { profile } = useAuth()
  const crearTarea = useCreateTarea()

  // Audio → texto para el modo idea libre
  const transcribir = useTranscribirAudio()
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioFileRef = useRef<HTMLInputElement>(null)

  const volcarTranscripcion = async (blob: Blob) => {
    try {
      const texto = await transcribir.mutateAsync(blob)
      setIdea((prev) => (prev.trim() ? `${prev.trim()}\n${texto}` : texto))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo transcribir el audio')
    }
  }

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        void volcarTranscripcion(blob)
      }
      mr.start(); mediaRef.current = mr
      setElapsed(0); setRecording(true)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono. Revisá los permisos.')
    }
  }
  const stopRec = () => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }

  const sugerencias = useMemo(() => {
    const merged = new Set<string>([...tiposPrevios, ...TIPOS_SUGERIDOS])
    return Array.from(merged).sort()
  }, [tiposPrevios])

  // Todas las actuaciones disponibles para seleccionar como "responde a".
  // Se incluyen tanto providencias como escritos de la contraparte.
  const providencias = useMemo(() => movimientos.slice(0, 80), [movimientos])

  // Al elegir una providencia, pre-cargar tipo/instrucciones o idea desde su acción sugerida.
  const onSelectProvidencia = (id: string) => {
    setRespondeA(id)
    const m = movimientos.find(mv => mv.id === id)
    const acc = m?.ai_suggested_action
    if (!acc) return
    const desc = [acc.titulo, acc.descripcion].filter(Boolean).join(' — ')
    if (modo === 'idea') {
      if (!idea.trim()) setIdea(desc)
    } else {
      if (!tipo.trim() && acc.titulo) setTipo(acc.titulo)
      if (!instrucciones.trim() && desc) setInstrucciones(desc)
    }
  }

  const aplicarPreset = (p: { tipo: string; instr: string }) => {
    setModo('tipo')
    setTipo(p.tipo)
    setInstrucciones(p.instr)
  }

  // Pre-seleccionar la providencia si se abrió desde "Redactar respuesta".
  const appliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) { appliedRef.current = null; return }
    if (initialRespondeA && movimientos.length && appliedRef.current !== initialRespondeA) {
      appliedRef.current = initialRespondeA
      onSelectProvidencia(initialRespondeA)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRespondeA, movimientos.length])

  const reset = () => {
    setModo('tipo'); setTipo(''); setIdea(''); setRespondeA('')
    setTitulo(''); setInstrucciones('')
    setModeloSel(''); setEstiloTexto(''); setGuardarComo('')
    setContraparteTexto(''); setShowContraparte(false)
    generate.reset()
  }

  const handleClose = () => { reset(); onClose() }

  const puedeGenerar = modo === 'idea' ? idea.trim().length > 3 : tipo.trim().length > 0

  const handleGenerate = () => {
    if (!puedeGenerar) {
      toast.error(modo === 'idea' ? 'Contá qué hay que presentar' : 'Indicá el tipo de escrito')
      return
    }
    generate.mutate(
      {
        expediente_id: expedienteId,
        tipo: modo === 'idea' ? '' : tipo.trim(),
        idea_libre: modo === 'idea' ? idea.trim() : undefined,
        responde_a_movimiento_id: respondeA || undefined,
        escrito_contraparte_texto: contraparteTexto.trim() || undefined,
        titulo: titulo.trim() || undefined,
        instrucciones: instrucciones.trim() || undefined,
        ...(modeloSel === 'NUEVO'
          ? {
              estilo_texto: estiloTexto.trim() || undefined,
              guardar_como: guardarComo.trim() || undefined,
            }
          : modeloSel
            ? { template_id: modeloSel }
            : {}),
      },
      {
        onSuccess: (data) => {
          toast.success(`Escrito generado (${data.claves_usadas} claves usadas)`)
          // Si responde a una providencia, dejar una tarea de presentación (no queda suelto).
          if (respondeA && profile?.id) {
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
            } as never, {
              onSuccess: () => toast.success('Tarea de presentación creada'),
            })
          }
          onGenerated(data.escrito_id)
          handleClose()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo generar'),
      }
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={generate.isPending ? undefined : handleClose} />

      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-white dark:bg-zinc-900/80 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-white dark:bg-zinc-900/80">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Nuevo escrito
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Se redactará usando el contexto del expediente y {clavesCount} {clavesCount === 1 ? 'actuación clave' : 'actuaciones claves'}.
            </p>
          </div>
          <button onClick={handleClose} disabled={generate.isPending} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {clavesCount === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Este expediente no tiene actuaciones claves todavía. El escrito se generará sin ese contexto.
                Marcá actuaciones con la estrella desde el tab <strong>SAE</strong> o <strong>Claves</strong>.
              </div>
            </div>
          )}

          {/* Modo: por tipo (con presets) o idea libre */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setModo('tipo')}
              disabled={generate.isPending}
              className={cn('flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                modo === 'tipo' ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10')}
            >
              Por tipo
            </button>
            <button
              type="button"
              onClick={() => setModo('idea')}
              disabled={generate.isPending}
              className={cn('flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                modo === 'idea' ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10')}
            >
              Idea libre
            </button>
          </div>

          {/* Actuación o escrito de contraparte al que responde (opcional, ambos modos) */}
          {providencias.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Actuación o escrito de contraparte al que respondés (opcional)
              </label>
              <select
                value={respondeA}
                onChange={(e) => onSelectProvidencia(e.target.value)}
                disabled={generate.isPending}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              >
                <option value="">— Sin actuación de referencia —</option>
                {providencias.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.fecha} · {m.tipo_movimiento}{m.titulo ? ` · ${m.titulo.slice(0, 55)}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Podés elegir una providencia, un traslado, o el escrito de la contraparte (ej: expresión de agravios del Dr. Seidan).
              </p>
            </div>
          )}

          {/* Texto del escrito de la contraparte — para rebatir punto por punto */}
          <div>
            <button
              type="button"
              onClick={() => setShowContraparte(v => !v)}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <FileSearch className="h-3.5 w-3.5" />
              {showContraparte ? 'Ocultar texto de la contraparte' : 'Agregar texto de la contraparte para rebatir'}
            </button>
            {showContraparte && (
              <div className="mt-2">
                <textarea
                  value={contraparteTexto}
                  onChange={e => setContraparteTexto(e.target.value)}
                  placeholder={`Pegá los fragmentos del escrito de la contraparte (del PDF de SAE) que querés rebatir.\nLa IA va a argumentar en contra punto por punto.\n\nEj: el Dr. Seidan sostiene que... / la sentencia de primera instancia resolvió que...`}
                  rows={6}
                  disabled={generate.isPending}
                  className="w-full rounded-lg border border-rose-500/20 bg-rose-950/10 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-rose-500/40 focus:outline-none focus:ring-2 focus:ring-rose-500/15 resize-y"
                />
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  No hace falta pegar todo: con los argumentos principales alcanza. Se usa solo para guiar la respuesta.
                </p>
              </div>
            )}
          </div>

          {modo === 'idea' ? (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Contá qué hay que presentar *
                </label>
                {/* Audio → texto */}
                <div className="flex items-center gap-1.5">
                  <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void volcarTranscripcion(f); e.target.value = '' }} />
                  {transcribir.isPending ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> transcribiendo…</span>
                  ) : recording ? (
                    <button type="button" onClick={stopRec}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-rose-300 animate-pulse">
                      <Square className="h-3 w-3" fill="currentColor" /> {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')} — detener
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={startRec} disabled={generate.isPending}
                        className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50" title="Grabar la idea por voz">
                        <Mic className="h-3.5 w-3.5" /> Grabar
                      </button>
                      <button type="button" onClick={() => audioFileRef.current?.click()} disabled={generate.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/10 disabled:opacity-50" title="Subir un audio (ej. de WhatsApp)">
                        <Upload className="h-3.5 w-3.5" /> Audio
                      </button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Pegá la idea tal cual te la mandaron (ej: 'che, presentá que adjuntamos el bono y pedí que se libre la cédula al domicilio de la demandada'). La IA infiere el tipo y lo redacta bien."
                rows={5}
                disabled={generate.isPending}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Ideal para trámite: escribís la idea suelta y sale formal, con hilo lógico-jurídico y datos reales del expediente.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Tipo de escrito *
              </label>
              {/* Chips de trámite */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TRAMITE_PRESETS.map(p => (
                  <button
                    key={p.tipo}
                    type="button"
                    onClick={() => aplicarPreset(p)}
                    disabled={generate.isPending}
                    className={cn('rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                      tipo === p.tipo ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                list="tipos-escrito"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                placeholder="ej: Contestación de demanda"
                disabled={generate.isPending}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
              <datalist id="tipos-escrito">
                {sugerencias.map(s => <option key={s} value={s} />)}
              </datalist>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Tocá un trámite frecuente, o escribí cualquier tipo.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Título sugerido (opcional)
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Si lo dejás vacío, la IA decide el título"
              disabled={generate.isPending}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Instrucciones puntuales (opcional)
            </label>
            <textarea
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              placeholder="ej: contestar negando todos los hechos y oponiendo prescripción"
              rows={4}
              disabled={generate.isPending}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>

          {/* Modelo de estilo: usar uno guardado o pegar uno nuevo */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Modelo / estilo (opcional)
            </label>
            <select
              value={modeloSel}
              onChange={(e) => setModeloSel(e.target.value)}
              disabled={generate.isPending}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            >
              <option value="">Sin modelo — estilo por defecto</option>
              {templates.length > 0 && (
                <optgroup label="Modelos guardados">
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}{t.tipo ? ` · ${t.tipo}` : ''}</option>
                  ))}
                </optgroup>
              )}
              <option value="NUEVO">+ Pegar un modelo nuevo…</option>
            </select>
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              La IA imita la estructura y el tono del modelo, pero usa los datos reales del expediente. Útil para escritos de trámite (ej: adjuntar bono de movilidad).
            </p>

            {modeloSel === 'NUEVO' && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={estiloTexto}
                  onChange={(e) => setEstiloTexto(e.target.value)}
                  placeholder="Pegá acá un escrito de ejemplo cuyo estilo y estructura querés imitar…"
                  rows={6}
                  disabled={generate.isPending}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                />
                <input
                  value={guardarComo}
                  onChange={(e) => setGuardarComo(e.target.value)}
                  placeholder="Guardar este modelo como… (opcional, ej: Adjunta bono de movilidad)"
                  disabled={generate.isPending}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                />
                {guardarComo.trim() && (
                  <p className="text-[10px] text-emerald-400/80">
                    Se guardará como modelo reutilizable y quedará disponible en esta lista.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={generate.isPending}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={generate.isPending || !puedeGenerar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generate.isPending ? 'Redactando…' : 'Generar escrito'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog: presentar al SAE
// ────────────────────────────────────────────────────────────────────────────

function PresentarSaeDialog({
  escrito, onClose, onSuccess,
}: {
  escrito: Escrito
  onClose: () => void
  onSuccess: (nroComprobante: string | null | undefined) => void
}) {
  const fetchCategorias = useFetchPortalCategorias()
  const presentar = usePresentarEscrito()
  const [portalInfo, setPortalInfo] = useState<PortalFormInfo | null>(null)
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [presentaDoc, setPresentaDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir, intenta traer categorías reales del portal
  useMemo(() => {
    fetchCategorias.mutate(escrito.id, {
      onSuccess: (data) => setPortalInfo(data),
      onError: (err) => setError(err.message),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = () => {
    setError(null)
    presentar.mutate(
      {
        escrito_id: escrito.id,
        expediente_id: escrito.expediente_id,
        categoria: categoria.trim(),
        descripcion: descripcion.trim(),
        presenta_documentacion: presentaDoc,
      },
      {
        onSuccess: (res) => onSuccess(res.nro_comprobante),
        onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo presentar'),
      }
    )
  }

  const isLoading = presentar.isPending || fetchCategorias.isPending

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={isLoading ? undefined : onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-white dark:bg-zinc-900/80 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-white dark:bg-zinc-900/80">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            Presentar al portal del SAE
          </h2>
          <button onClick={onClose} disabled={isLoading} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {fetchCategorias.isPending && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Conectando con el portal del SAE…
            </div>
          )}

          {portalInfo && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs">
              <p className="text-emerald-300 font-medium">Conectado al portal</p>
              {portalInfo.expediente.caratula && (
                <p className="mt-1 text-zinc-400 truncate">{portalInfo.expediente.caratula}</p>
              )}
              {portalInfo.expediente.oficina && (
                <p className="text-zinc-500 dark:text-zinc-400 truncate">{portalInfo.expediente.oficina}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Categoría *</label>
            <input
              list="categorias-portal"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder={portalInfo?.categorias.length ? 'Elegí una categoría' : 'Cargando…'}
              disabled={isLoading || !portalInfo}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
            <datalist id="categorias-portal">
              {portalInfo?.categorias.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
            {portalInfo && portalInfo.categorias.length === 0 && (
              <p className="mt-1 text-[10px] text-amber-400">
                No pude detectar categorías automáticamente. Escribí el nombre tal como aparece en el portal.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Descripción *</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Texto de referencia que aparece en el portal"
              disabled={isLoading}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={presentaDoc}
              onChange={(e) => setPresentaDoc(e.target.checked)}
              disabled={isLoading}
              className="rounded border-white/20 bg-white/5"
            />
            Presento documentación original junto con este escrito
          </label>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 flex items-start gap-2 text-xs text-rose-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-[10px] text-amber-200/80">
            ⚠ Esta acción presenta el escrito a la oficina judicial. Asegurate de que el PDF firmado sea el correcto. La presentación no se puede deshacer desde nuestra app.
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={isLoading} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isLoading || !categoria.trim() || !descripcion.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
          >
            {presentar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Presentar al SAE
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Workflow bar: Firmar → Presentar → Comprobante
// ────────────────────────────────────────────────────────────────────────────

function WorkflowBar({ escrito }: { escrito: Escrito }) {
  const attach = useAttachSignedPdf()
  const fileRef = useRef<HTMLInputElement>(null)
  const [openPresentar, setOpenPresentar] = useState(false)

  const handleFile = (file: File) => {
    attach.mutate(
      { escrito_id: escrito.id, expediente_id: escrito.expediente_id, file },
      {
        onSuccess: ({ hasSignature }) => {
          if (hasSignature) toast.success('PDF firmado adjuntado')
          else toast.success('PDF adjuntado (no detecté firma embebida — verificá que esté correctamente firmado)')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo adjuntar'),
      }
    )
  }

  const isFirmado = escrito.estado === 'firmado' || escrito.estado === 'presentado_sae'
  const isPresentado = escrito.estado === 'presentado_sae'
  const comprobante = escrito.presentacion_sae?.nro_comprobante

  return (
    <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3 flex items-center gap-3 text-xs">
      {/* Paso 1: Firmar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        isFirmado ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-white/10 text-zinc-400'
      )}>
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-medium">
          {isFirmado ? 'Firmado' : '1. Firmar'}
        </span>
        {escrito.pdf_firmado_at && (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            · {new Date(escrito.pdf_firmado_at).toLocaleDateString('es-AR')}
          </span>
        )}
      </div>

      {!isFirmado && (
        <a
          href="https://firmar.gob.ar/firmador/"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-300"
        >
          firmar.gob.ar <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      {!isPresentado && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={attach.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10 disabled:opacity-30"
          title={isFirmado ? 'Reemplazar PDF firmado' : 'Adjuntar PDF firmado'}
        >
          {attach.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {isFirmado ? 'Reemplazar firmado' : 'Adjuntar firmado'}
        </button>
      )}

      <span className="text-zinc-700 dark:text-zinc-200">→</span>

      {/* Paso 2: Presentar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        isPresentado ? 'border-violet-500/30 bg-violet-500/5 text-violet-300'
                     : isFirmado ? 'border-white/10 text-zinc-300'
                     : 'border-white/10 text-zinc-600 dark:text-zinc-300',
      )}>
        <Send className="h-3.5 w-3.5" />
        <span className="font-medium">
          {isPresentado ? 'Presentado' : '2. Presentar al SAE'}
        </span>
        {isPresentado && comprobante && (
          <span className="text-[10px] font-mono">· {comprobante}</span>
        )}
      </div>

      {isFirmado && !isPresentado && (
        <button
          onClick={() => setOpenPresentar(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/25"
        >
          <Send className="h-3 w-3" />
          Presentar ahora
        </button>
      )}

      {openPresentar && (
        <PresentarSaeDialog
          escrito={escrito}
          onClose={() => setOpenPresentar(false)}
          onSuccess={(nro) => {
            setOpenPresentar(false)
            toast.success(nro ? `Presentado · Comprobante ${nro}` : 'Presentado al SAE')
          }}
        />
      )}
    </div>
  )
}

// Separador clickeable entre párrafos para insertar uno nuevo con IA
function InsertDivider({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <div className="group/div flex items-center gap-1 py-0.5">
      <div className={cn('flex-1 h-px transition-colors', active ? 'bg-violet-500/30' : 'bg-white/5 group-hover/div:bg-violet-500/15')} />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-full h-4 w-4 transition-all',
          active
            ? 'text-violet-300 bg-violet-500/20 opacity-100'
            : 'text-zinc-600 hover:text-violet-300 hover:bg-violet-500/10 opacity-0 group-hover/div:opacity-100',
        )}
        title="Insertar párrafo con IA"
      >
        <Plus className="h-2.5 w-2.5" />
      </button>
      <div className={cn('flex-1 h-px transition-colors', active ? 'bg-violet-500/30' : 'bg-white/5 group-hover/div:bg-violet-500/15')} />
    </div>
  )
}

// Panel de inserción de párrafo nuevo con IA
function InsertPanel({ aiInstruccion, setAiInstruccion, isPending, onSubmit, onCancel }: {
  aiInstruccion: string
  setAiInstruccion: (v: string) => void
  isPending: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-2.5 space-y-2">
      <div className="flex flex-wrap gap-1">
        {AI_CHIPS.map(c => (
          <button key={c.label} type="button" onClick={() => setAiInstruccion(c.text)}
            className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25 transition-colors">
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        value={aiInstruccion}
        onChange={e => setAiInstruccion(e.target.value)}
        placeholder="Describí el párrafo a insertar. Ej: Agregar argumento sobre la carga de la prueba..."
        rows={2}
        autoFocus
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none resize-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSubmit}
          disabled={!aiInstruccion.trim() || isPending}
          className="flex items-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Insertar
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-300">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Chips de acciones rápidas para los paneles IA (sección y párrafo)
const AI_CHIPS = [
  { label: 'Profundizar', text: 'Profundizar el argumento con mayor desarrollo jurídico.' },
  { label: 'Más formal', text: 'Reformular con tono más formal y contundente.' },
  { label: 'Reducir', text: 'Reducir la extensión manteniendo el argumento central.' },
  { label: 'Reformular', text: 'Reformular completamente, conservando el contenido esencial.' },
  { label: 'Agregar norma', text: 'Agregar referencia a norma o jurisprudencia aplicable.' },
]

// ────────────────────────────────────────────────────────────────────────────
// Editor de escrito (full-screen modal)
// ────────────────────────────────────────────────────────────────────────────

function EscritoEditorModal({
  escrito, onClose, abogado, onRequestDelete,
}: {
  escrito: Escrito
  onClose: () => void
  abogado: EscritoEncabezadoAbogado
  onRequestDelete: () => void
}) {
  useModalHistory(onClose)

  const update = useUpdateEscrito()
  const [contenido, setContenido] = useState<EscritoContenido>(escrito.contenido)
  const [titulo, setTitulo] = useState(escrito.titulo)
  const [estado, setEstado] = useState<Escrito['estado']>(escrito.estado)
  const [dirty, setDirty] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  // Tracking del párrafo donde insertar citas. Si no hay foco activo, va al
  // último párrafo no vacío.
  const [activeParrafo, setActiveParrafo] = useState<{ si: number; pi: number } | null>(null)
  const [sugerirOpen, setSugerirOpen] = useState(false)

  // IA inline: refinar sección o párrafo
  const refinar = useRefinarEscrito()
  const [sectionAiPanel, setSectionAiPanel] = useState<number | null>(null)
  const [parrafoAiPanel, setParrafoAiPanel] = useState<{ si: number; pi: number } | null>(null)
  const [aiInstruccion, setAiInstruccion] = useState('')
  // Draft de sección: propuesta IA pendiente de aceptar/descartar (editable)
  const [sectionDraft, setSectionDraft] = useState<{ si: number; parrafos: string[] } | null>(null)
  // Panel de inserción: posición donde insertar un párrafo nuevo con IA
  const [insertPanel, setInsertPanel] = useState<{ si: number; afterPi: number } | null>(null)
  // Undo: último reemplazo IA (párrafo o sección) para poder revertir
  const [lastUndo, setLastUndo] = useState<{
    type: 'parrafo' | 'seccion'; si: number; pi?: number; prev: string | string[]
  } | null>(null)

  const handleRefinarSeccion = async (si: number) => {
    const sec = contenido.secciones[si]
    const textoActual = sec.parrafos.join('\n\n')
    try {
      const { resultado } = await refinar.mutateAsync({
        expediente_id: escrito.expediente_id,
        escrito_titulo: titulo,
        registro_tonal: escrito.registro_tonal,
        titulo_seccion: sec.titulo,
        texto_actual: textoActual,
        instruccion: aiInstruccion,
        alcance: 'seccion',
      })
      const nuevos = resultado.split('\n\n').map(p => p.trim()).filter(Boolean)
      setSectionDraft({ si, parrafos: nuevos })
      setSectionAiPanel(null)
      setAiInstruccion('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo refinar')
    }
  }

  const handleAplicarDraft = (si: number) => {
    if (!sectionDraft || sectionDraft.si !== si) return
    setLastUndo({ type: 'seccion', si, prev: contenido.secciones[si].parrafos })
    updateSeccion(si, { parrafos: sectionDraft.parrafos })
    setSectionDraft(null)
    toast.success('Sección actualizada')
  }

  const handleRefinarParrafo = async (si: number, pi: number) => {
    const sec = contenido.secciones[si]
    const textoActual = sec.parrafos[pi]
    try {
      const { resultado } = await refinar.mutateAsync({
        expediente_id: escrito.expediente_id,
        escrito_titulo: titulo,
        registro_tonal: escrito.registro_tonal,
        titulo_seccion: sec.titulo,
        texto_actual: textoActual,
        instruccion: aiInstruccion,
        alcance: 'parrafo',
      })
      setLastUndo({ type: 'parrafo', si, pi, prev: textoActual })
      updateParrafo(si, pi, resultado.trim())
      setParrafoAiPanel(null)
      setAiInstruccion('')
      toast.success('Párrafo actualizado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo refinar')
    }
  }

  const handleUndo = () => {
    if (!lastUndo) return
    if (lastUndo.type === 'parrafo' && lastUndo.pi !== undefined) {
      updateParrafo(lastUndo.si, lastUndo.pi, lastUndo.prev as string)
    } else if (lastUndo.type === 'seccion') {
      updateSeccion(lastUndo.si, { parrafos: lastUndo.prev as string[] })
    }
    setLastUndo(null)
  }

  const handleInsertarParrafo = async (si: number, afterPi: number) => {
    const sec = contenido.secciones[si]
    const prev = afterPi >= 0 ? sec.parrafos[afterPi] : null
    const next = afterPi + 1 < sec.parrafos.length ? sec.parrafos[afterPi + 1] : null
    const contexto = [
      prev ? `[Párrafo anterior]:\n${prev}` : null,
      next ? `[Párrafo siguiente]:\n${next}` : null,
    ].filter(Boolean).join('\n\n') || `[Sección: ${sec.titulo}]`
    try {
      const { resultado } = await refinar.mutateAsync({
        expediente_id: escrito.expediente_id,
        escrito_titulo: titulo,
        registro_tonal: escrito.registro_tonal,
        titulo_seccion: sec.titulo,
        texto_actual: contexto,
        instruccion: aiInstruccion,
        alcance: 'insertar',
      })
      setContenido(c => ({
        ...c,
        secciones: c.secciones.map((s, idx) => idx !== si ? s : {
          ...s,
          parrafos: [
            ...s.parrafos.slice(0, afterPi + 1),
            resultado.trim(),
            ...s.parrafos.slice(afterPi + 1),
          ],
        }),
      }))
      setDirty(true)
      setInsertPanel(null)
      setAiInstruccion('')
      toast.success('Párrafo insertado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo insertar el párrafo')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sugerirOpen && sectionAiPanel === null && parrafoAiPanel === null && insertPanel === null && !sectionDraft) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, sugerirOpen, sectionAiPanel, parrafoAiPanel, insertPanel, sectionDraft])

  // Texto que pre-llena la búsqueda de jurisprudencia: párrafo activo o último
  const defaultQuery = (() => {
    if (activeParrafo) {
      return contenido.secciones?.[activeParrafo.si]?.parrafos?.[activeParrafo.pi] ?? ''
    }
    for (let si = (contenido.secciones?.length ?? 0) - 1; si >= 0; si--) {
      const sec = contenido.secciones[si]
      for (let pi = (sec.parrafos?.length ?? 0) - 1; pi >= 0; pi--) {
        const p = sec.parrafos[pi]?.trim() ?? ''
        if (p.length >= 20) return p
      }
    }
    return ''
  })()

  const insertarEnParrafoActivo = (texto: string) => {
    // Si no hay activo, agarro la última sección y agrego al último párrafo
    let si = activeParrafo?.si ?? -1
    let pi = activeParrafo?.pi ?? -1
    if (si < 0 || pi < 0) {
      si = (contenido.secciones?.length ?? 1) - 1
      pi = (contenido.secciones?.[si]?.parrafos?.length ?? 1) - 1
    }
    if (si < 0 || pi < 0) return
    setContenido(c => ({
      ...c,
      secciones: c.secciones.map((s, i) => i !== si ? s : {
        ...s,
        parrafos: s.parrafos.map((p, j) => j !== pi ? p : `${p.trimEnd()}${texto}`),
      }),
    }))
    setDirty(true)
  }

  const handleSave = () => {
    update.mutate(
      { id: escrito.id, expediente_id: escrito.expediente_id, patch: { titulo, contenido, estado } },
      {
        onSuccess: () => { setDirty(false); toast.success('Escrito guardado') },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
      }
    )
  }

  // Cambio de estado: se guarda solo (no requiere apretar "Guardar")
  const handleChangeEstado = (nuevo: Escrito['estado']) => {
    setEstado(nuevo)
    update.mutate(
      { id: escrito.id, expediente_id: escrito.expediente_id, patch: { estado: nuevo } },
      {
        onSuccess: () => {
          const labels: Record<Escrito['estado'], string> = {
            borrador: 'Marcado como borrador',
            final: 'Marcado como final',
            firmado: 'Marcado como firmado',
            presentado_sae: 'Marcado como presentado al SAE',
            presentado: 'Marcado como presentado',
          }
          toast.success(labels[nuevo])
        },
        onError: (err) => {
          setEstado(escrito.estado) // rollback local
          toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
        },
      }
    )
  }

  const handlePrint = () => {
    if (!previewRef.current) return
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) {
      toast.error('Tu navegador bloqueó la ventana de impresión')
      return
    }
    const html = previewRef.current.outerHTML
    printWindow.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .escrito-doc { box-shadow: none !important; }
  @media print {
    .escrito-doc { width: 21cm !important; min-height: 29.7cm !important; padding: 2.5cm !important; }
  }
</style>
</head>
<body>${html}
<script>window.addEventListener('load', () => { setTimeout(() => { window.print() }, 200) })</script>
</body></html>`)
    printWindow.document.close()
    printWindow.onafterprint = () => printWindow.close()
  }

  const updateSeccion = (i: number, patch: Partial<EscritoContenido['secciones'][0]>) => {
    setContenido(c => ({
      ...c,
      secciones: c.secciones.map((s, idx) => idx === i ? { ...s, ...patch } : s),
    }))
    setDirty(true)
  }

  const updateParrafo = (si: number, pi: number, value: string) => {
    setContenido(c => ({
      ...c,
      secciones: c.secciones.map((s, idx) => idx === si
        ? { ...s, parrafos: s.parrafos.map((p, j) => j === pi ? value : p) }
        : s,
      ),
    }))
    setDirty(true)
  }

  const [viewTab, setViewTab] = useState<'editor' | 'preview'>('editor')

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header mobile: 2 filas. Desktop: 1 fila */}
      <div className="border-b border-white/10">
        {/* Fila 1: cerrar + título + estado */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/5" title="Cerrar">
            <X className="h-4 w-4" />
          </button>
          <input
            value={titulo}
            onChange={(e) => { setTitulo(e.target.value); setDirty(true) }}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-zinc-900 dark:text-zinc-50 focus:outline-none border-b border-transparent focus:border-amber-500/40"
          />
          <select
            value={estado}
            onChange={(e) => handleChangeEstado(e.target.value as Escrito['estado'])}
            disabled={update.isPending || estado === 'firmado' || estado === 'presentado_sae'}
            className={cn(
              'h-7 shrink-0 rounded-lg border bg-white dark:bg-zinc-900/80 px-1.5 text-[11px] font-medium focus:outline-none transition-colors',
              estado === 'borrador'  && 'border-zinc-600/50 text-zinc-300',
              estado === 'final'     && 'border-emerald-500/40 text-emerald-300',
              estado === 'firmado'   && 'border-cyan-500/40 text-cyan-300',
              estado === 'presentado_sae' && 'border-violet-500/40 text-violet-300',
              estado === 'presentado' && 'border-violet-500/40 text-violet-300',
            )}
            title={estado === 'firmado' || estado === 'presentado_sae' ? 'Estado controlado por el workflow' : 'Estado del escrito'}
          >
            <option value="borrador">Borrador</option>
            <option value="final">Final</option>
            {estado === 'firmado' && <option value="firmado">Firmado</option>}
            {estado === 'presentado_sae' && <option value="presentado_sae">Pres. SAE</option>}
            <option value="presentado">Presentado</option>
          </select>
        </div>
        {/* Fila 2: acciones */}
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {dirty && <span className="text-[10px] text-amber-400 mr-auto">sin guardar</span>}
          <button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30"
            title="Guardar"
          >
            {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
          <button
            onClick={() => setSugerirOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20"
            title="Buscar jurisprudencia"
          >
            <Gavel className="h-3 w-3" />
            <span className="hidden sm:inline">Jurisprudencia</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
            title="Imprimir / PDF"
          >
            <Printer className="h-3 w-3" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={onRequestDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      </div>

      {/* Workflow: Firmar → Presentar */}
      <WorkflowBar escrito={escrito} />

      {/* Toggle editor/preview — solo visible en mobile */}
      <div className="flex lg:hidden border-b border-white/10 bg-slate-950">
        <button
          onClick={() => setViewTab('editor')}
          className={cn('flex-1 py-2 text-xs font-medium transition-colors',
            viewTab === 'editor' ? 'text-violet-300 border-b-2 border-violet-400' : 'text-zinc-500 hover:text-zinc-300')}
        >
          Editar
        </button>
        <button
          onClick={() => setViewTab('preview')}
          className={cn('flex-1 py-2 text-xs font-medium transition-colors',
            viewTab === 'preview' ? 'text-cyan-300 border-b-2 border-cyan-400' : 'text-zinc-500 hover:text-zinc-300')}
        >
          Vista previa
        </button>
        <button
          onClick={() => setSugerirOpen(true)}
          className="px-4 py-2 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
          title="Buscar jurisprudencia"
        >
          <Gavel className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Split: editor + preview */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Editor */}
        <div className={cn('overflow-y-auto border-r border-white/10 p-4 sm:p-5 space-y-4', viewTab === 'preview' && 'hidden lg:block')}>
          <div className="grid grid-cols-1 gap-2">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Encabezado al juez</label>
            <input
              value={contenido.encabezado_juez}
              onChange={(e) => { setContenido(c => ({ ...c, encabezado_juez: e.target.value })); setDirty(true) }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            />
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">Carátula</label>
            <input
              value={contenido.caratula}
              onChange={(e) => { setContenido(c => ({ ...c, caratula: e.target.value })); setDirty(true) }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          {contenido.secciones?.map((sec, si) => (
            <div key={si} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              {/* Título de sección + botón IA sección */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={sec.titulo}
                  onChange={(e) => updateSeccion(si, { titulo: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-zinc-200 focus:outline-none border-b border-transparent focus:border-amber-500/40"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (sectionAiPanel === si) { setSectionAiPanel(null) } else {
                      setSectionAiPanel(si); setSectionDraft(null); setParrafoAiPanel(null); setAiInstruccion('')
                    }
                  }}
                  className={cn(
                    'shrink-0 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                    sectionAiPanel === si
                      ? 'bg-violet-500/30 text-violet-200'
                      : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20',
                  )}
                  title="Refinar esta sección con IA"
                >
                  <Wand2 className="h-3 w-3" />
                  IA
                </button>
              </div>

              {/* Panel IA de sección */}
              {sectionAiPanel === si && (
                <div className="mb-3 rounded-lg border border-violet-500/20 bg-violet-950/20 p-2.5 space-y-2">
                  {/* Chips de acciones rápidas */}
                  <div className="flex flex-wrap gap-1">
                    {AI_CHIPS.map(c => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setAiInstruccion(c.text)}
                        className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25 transition-colors"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={aiInstruccion}
                    onChange={e => setAiInstruccion(e.target.value)}
                    placeholder="Ej: Profundizar el argumento de prescripción. Agregar referencia al art. 2560 CCyCN..."
                    rows={2}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setSectionAiPanel(null) } }}
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRefinarSeccion(si)}
                      disabled={!aiInstruccion.trim() || refinar.isPending}
                      className="flex items-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      {refinar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Generar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSectionAiPanel(null); setAiInstruccion('') }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Draft view — propuesta IA editable antes de aplicar */}
              {sectionDraft?.si === si && (
                <div className="mb-3 rounded-lg border border-violet-400/30 bg-violet-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-violet-300">
                    <Wand2 className="h-3 w-3" />
                    Propuesta IA — editá si hace falta y aplicá
                  </div>
                  <div className="space-y-2 mb-3">
                    {sectionDraft.parrafos.map((dp, dpi) => (
                      <textarea
                        key={dpi}
                        value={dp}
                        onChange={e => setSectionDraft(d => d ? {
                          ...d,
                          parrafos: d.parrafos.map((p, j) => j === dpi ? e.target.value : p),
                        } : null)}
                        rows={Math.max(2, Math.ceil(dp.length / 80))}
                        className="w-full rounded border border-violet-500/20 bg-violet-950/20 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-400/50 focus:outline-none resize-none"
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAplicarDraft(si)}
                      className="flex items-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                    >
                      <Check className="h-3 w-3" />
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectionDraft(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}

              {/* Deshacer último cambio IA en esta sección */}
              {lastUndo?.type === 'seccion' && lastUndo.si === si && !sectionDraft && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="mb-2 flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  ↩ Deshacer cambio IA en sección
                </button>
              )}

              {/* Párrafos con separadores de inserción */}
              <div className="space-y-1">
                {/* Separador antes del primer párrafo */}
                <InsertDivider
                  active={insertPanel?.si === si && insertPanel.afterPi === -1}
                  onClick={() => {
                    setInsertPanel({ si, afterPi: -1 }); setSectionAiPanel(null); setParrafoAiPanel(null); setAiInstruccion('')
                  }}
                />
                {insertPanel?.si === si && insertPanel.afterPi === -1 && (
                  <InsertPanel
                    aiInstruccion={aiInstruccion}
                    setAiInstruccion={setAiInstruccion}
                    isPending={refinar.isPending}
                    onSubmit={() => handleInsertarParrafo(si, -1)}
                    onCancel={() => { setInsertPanel(null); setAiInstruccion('') }}
                  />
                )}

                {sec.parrafos?.map((p, pi) => (
                  <div key={pi}>
                    <div className="relative">
                      <textarea
                        value={p}
                        onChange={(e) => updateParrafo(si, pi, e.target.value)}
                        onFocus={() => { setActiveParrafo({ si, pi }); setParrafoAiPanel(null) }}
                        rows={Math.max(2, Math.ceil(p.length / 80))}
                        className={cn(
                          'w-full rounded border bg-white/5 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500/40 focus:outline-none resize-none',
                          activeParrafo?.si === si && activeParrafo?.pi === pi
                            ? 'border-amber-500/50'
                            : 'border-white/10'
                        )}
                      />
                      {/* Botón IA párrafo — solo visible cuando está activo */}
                      {activeParrafo?.si === si && activeParrafo?.pi === pi && (
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            if (parrafoAiPanel?.si === si && parrafoAiPanel?.pi === pi) {
                              setParrafoAiPanel(null)
                            } else {
                              setParrafoAiPanel({ si, pi }); setSectionAiPanel(null); setInsertPanel(null); setAiInstruccion('')
                            }
                          }}
                          className={cn(
                            'absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                            parrafoAiPanel?.si === si && parrafoAiPanel?.pi === pi
                              ? 'bg-violet-500/30 text-violet-200'
                              : 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25',
                          )}
                          title="Refinar este párrafo con IA"
                        >
                          <Wand2 className="h-3 w-3" />
                          IA
                        </button>
                      )}
                    </div>

                    {/* Panel IA de párrafo */}
                    {parrafoAiPanel?.si === si && parrafoAiPanel?.pi === pi && (
                      <div className="mt-1 rounded-lg border border-violet-500/20 bg-violet-950/20 p-2.5 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {AI_CHIPS.map(c => (
                            <button key={c.label} type="button" onClick={() => setAiInstruccion(c.text)}
                              className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25 transition-colors">
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={aiInstruccion}
                          onChange={e => setAiInstruccion(e.target.value)}
                          placeholder="Ej: Ampliar este argumento. Reformular con más contundencia..."
                          rows={2}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setParrafoAiPanel(null) } }}
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleRefinarParrafo(si, pi)}
                            disabled={!aiInstruccion.trim() || refinar.isPending}
                            className="flex items-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50">
                            {refinar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                            Aplicar
                          </button>
                          <button type="button" onClick={() => { setParrafoAiPanel(null); setAiInstruccion('') }}
                            className="text-xs text-zinc-500 hover:text-zinc-300">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Deshacer último cambio IA en este párrafo */}
                    {lastUndo?.type === 'parrafo' && lastUndo.si === si && lastUndo.pi === pi && (
                      <button type="button" onClick={handleUndo}
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors">
                        ↩ Deshacer cambio IA
                      </button>
                    )}

                    {/* Separador de inserción después de este párrafo */}
                    <InsertDivider
                      active={insertPanel?.si === si && insertPanel.afterPi === pi}
                      onClick={() => {
                        setInsertPanel({ si, afterPi: pi }); setSectionAiPanel(null); setParrafoAiPanel(null); setAiInstruccion('')
                      }}
                    />
                    {insertPanel?.si === si && insertPanel.afterPi === pi && (
                      <InsertPanel
                        aiInstruccion={aiInstruccion}
                        setAiInstruccion={setAiInstruccion}
                        isPending={refinar.isPending}
                        onSubmit={() => handleInsertarParrafo(si, pi)}
                        onCancel={() => { setInsertPanel(null); setAiInstruccion('') }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className={cn('overflow-y-auto bg-zinc-100 p-3 sm:p-5', viewTab === 'editor' && 'hidden lg:block')}>
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
            <EscritoPreview ref={previewRef} contenido={contenido} abogado={{ ...abogado, nombreCompleto: abogado.nombreCompleto || '—' }} />
          </div>
        </div>
      </div>

      <SugerirJurisprudenciaDialog
        open={sugerirOpen}
        onClose={() => setSugerirOpen(false)}
        defaultQuery={defaultQuery}
        onInsertar={insertarEnParrafoActivo}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Tab Escritos (main)
// ────────────────────────────────────────────────────────────────────────────

export function TabEscritos({ expedienteId }: Props) {
  const { profile } = useAuth()
  const abogado = buildAbogadoFromProfile(profile)
  const profileIncompleto = !abogado?.matricula || !abogado?.domicilioLegal || !abogado?.cuit

  const { data: escritos = [], isLoading } = useEscritos(expedienteId)
  const { data: movements = [] } = useSaeMovements(expedienteId)
  const deleteMut = useDeleteEscrito()

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [initialRespondeA, setInitialRespondeA] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Escrito | null>(null)
  const [diagnosticando, setDiagnosticando] = useState<Escrito | null>(null)

  // "Redactar respuesta" desde una actuación: abre el generador apuntado a esa providencia.
  const respondeAPending = useEscritoIntent((s) => s.respondeA)
  const consumirRespondeA = useEscritoIntent((s) => s.consumirRespondeA)
  useEffect(() => {
    if (respondeAPending) {
      setInitialRespondeA(consumirRespondeA())
      setNuevoOpen(true)
    }
  }, [respondeAPending, consumirRespondeA])

  const clavesCount = useMemo(() => {
    return movements.filter(m => {
      if (m.is_key === true) return true
      if (m.is_key === false) return false
      return KEY_TYPES.has(m.tipo_movimiento) || Boolean(m.ai_suggested_action)
    }).length
  }, [movements])

  const editing = editingId ? escritos.find(e => e.id === editingId) : null

  if (profileIncompleto) {
    return (
      <Card title="Escritos">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-200">Completá tus datos profesionales</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Para generar escritos necesitamos tu matrícula, domicilio legal y CUIT. Se cargan una sola vez y se usan en el encabezado de cada escrito.
            </p>
            <Link
              to="/configuracion"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Ir a Configuración
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        title="Escritos"
        headerRight={
          <button
            onClick={() => setNuevoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            Nuevo escrito
          </button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400" />
          </div>
        ) : escritos.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="Todavía no hay escritos"
            description={`Generá el primero. Usaremos el contexto del expediente y ${clavesCount} actuaciones claves. La IA produce el formato pixel-perfect con tu logo y Times New Roman.`}
            actionLabel="Nuevo escrito"
            onAction={() => setNuevoOpen(true)}
          />
        ) : (
          <div className="space-y-2">
            {escritos.map(esc => (
              <div
                key={esc.id}
                className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <FileText className="h-4 w-4 text-violet-400 shrink-0" />
                <button
                  onClick={() => setEditingId(esc.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{esc.titulo}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {esc.tipo}
                    {esc.registro_tonal && <span className="ml-2 text-zinc-600 dark:text-zinc-300">· {esc.registro_tonal === 'retorico' ? 'retórico' : 'procesal'}</span>}
                    <span className="ml-2 text-zinc-600 dark:text-zinc-300">· {new Date(esc.created_at).toLocaleDateString('es-AR')}</span>
                  </p>
                </button>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  esc.estado === 'borrador' ? 'bg-zinc-700/30 text-zinc-400' :
                  esc.estado === 'final' ? 'bg-emerald-700/30 text-emerald-400' :
                  'bg-violet-700/30 text-violet-400',
                )}>
                  {esc.estado}
                </span>
                <button
                  onClick={() => setDiagnosticando(esc)}
                  className="shrink-0 inline-flex items-center gap-1 rounded p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  title="Diagnosticar con skill jurídico argentino"
                >
                  <FileSearch className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setConfirmDelete(esc)}
                  className="shrink-0 rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-rose-400 hover:bg-white/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-600 dark:text-zinc-300">
          Cada escrito se genera usando solo las actuaciones marcadas como claves (nunca todo el historial).
        </p>
      </Card>

      <NuevoEscritoDialog
        open={nuevoOpen}
        onClose={() => { setNuevoOpen(false); setInitialRespondeA(null) }}
        expedienteId={expedienteId}
        clavesCount={clavesCount}
        initialRespondeA={initialRespondeA}
        onGenerated={(id) => setEditingId(id)}
      />

      {editing && abogado && (
        <EscritoEditorModal
          escrito={editing}
          abogado={abogado}
          onClose={() => setEditingId(null)}
          onRequestDelete={() => setConfirmDelete(editing)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          deleteMut.mutate(
            { id: confirmDelete.id, expediente_id: confirmDelete.expediente_id },
            {
              onSuccess: () => {
                toast.success('Escrito eliminado')
                setConfirmDelete(null)
                if (editingId === confirmDelete.id) setEditingId(null)
              },
              onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo eliminar'),
            }
          )
        }}
        title="Eliminar escrito"
        description={`¿Eliminar "${confirmDelete?.titulo}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMut.isPending}
      />

      {diagnosticando && (
        <DiagnosticoModal
          input={{
            escrito_id: diagnosticando.id,
            titulo: diagnosticando.titulo,
            tipo: diagnosticando.tipo,
          }}
          onClose={() => setDiagnosticando(null)}
        />
      )}
    </>
  )
}
