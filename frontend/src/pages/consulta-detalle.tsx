import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  useConsulta, useUpdateConsulta, useDeleteConsulta,
  usePresupuestos,
  useConsultaActividad, useAddConsultaActividad, useOrdenarHechos,
  TIPO_ASUNTO_LABEL, CANAL_LABEL, ESTADO_LABEL,
  type ConsultaEstado, type ConsultaTipoAsunto, type ConsultaCanal, type TipoHonorario,
  type DiagnosticoIA, type DiagnosticoModulo, type IntimacionDoc,
} from '@/hooks/use-consultas'
import { useCotizacionConsulta } from '@/hooks/use-cotizacion-consulta'
import { CotizacionPanel, type PrefillProceso } from '@/components/consultas/cotizacion-panel'
import { imprimirDocumento } from '@/lib/consultas/imprimir-documento'
import { etiquetaArea } from '@/lib/consultas/cotizacion'
import { useTareasConsulta, useCompletarTarea, type TareaConsultaRow } from '@/hooks/use-tareas'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { useAuthStore } from '@/stores/auth-store'
import { ConsultaPdfPreview, type ModoDocumento } from '@/components/consultas/consulta-pdf-preview'
import { IntimacionPdfPreview } from '@/components/consultas/intimacion-pdf-preview'
import type { TipoIntimacion } from '@/components/consultas/intimacion-pdf-preview'
import { ConsultaAnclasPanel } from '@/components/consultas/consulta-anclas-panel'
import { DanosCalculosPanel } from '@/components/danos/danos-calculos-panel'
import { ConsultaContextos } from '@/components/consultas/consulta-contextos'
import { IncorporarEntrevista } from '@/components/consultas/incorporar-entrevista'
import { useConsultaContextos } from '@/hooks/use-consulta-contextos'
import { ConsultaHechosOrdenados } from '@/components/consultas/consulta-hechos-ordenados'
import { ConsultaSolicitudDocs } from '@/components/consultas/consulta-solicitud-docs'
import { ConsultaPipeline } from '@/components/consultas/consulta-pipeline'
import { ConsultaAdjuntos } from '@/components/consultas/consulta-adjuntos'
import { DocumentacionRequerida } from '@/components/shared/documentacion-requerida'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import {
  ArrowLeft, Sparkles, FolderPlus,
  Phone, Mail, Calendar, MessageSquare,
  CheckCircle2, AlertTriangle, Save,
  Loader2, Download, FileText, NotebookPen, Wand2, ListChecks,
  Pencil, Trash2, Plus, X, ListTodo, Check, ExternalLink, Eye, EyeOff, Printer,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils/date-helpers'

// ── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<ConsultaEstado, string> = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  en_proceso: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  presupuestada: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  con_claudio: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  requiere_info: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  redactando: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  convertida: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  resuelta: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  descartada: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

const CHANCES_STYLE = {
  alta: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  media: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  baja: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  sin_datos: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

const CHANCES_LABEL = {
  alta: 'Probabilidad alta',
  media: 'Probabilidad media',
  baja: 'Probabilidad baja',
  sin_datos: 'Sin datos suficientes',
}

const TIPO_ACTIVIDAD_ICON: Record<string, React.ReactNode> = {
  nota: <MessageSquare className="h-3.5 w-3.5" />,
  llamada: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  reunion: <Calendar className="h-3.5 w-3.5" />,
  cambio_estado: <CheckCircle2 className="h-3.5 w-3.5" />,
}

// ── Intimación fehaciente section ───────────────────────────────────────────

function IntimacionSection({ consulta }: { consulta: { id: string; nombre: string; apellido: string | null; intimacion: IntimacionDoc | null } }) {
  const update = useUpdateConsulta()
  const supabase = createClient()
  const pdfRef = useRef<HTMLDivElement>(null)

  const existing = consulta.intimacion
  const [activa, setActiva] = useState(!!existing)
  const [tipo, setTipo] = useState<TipoIntimacion>(existing?.tipo ?? 'carta_documento')
  const [destNombre, setDestNombre] = useState(existing?.destinatario_nombre ?? '')
  const [destDomicilio, setDestDomicilio] = useState(existing?.destinatario_domicilio ?? '')
  const [remNombre, setRemNombre] = useState(
    existing?.remitente_nombre ??
    [consulta.nombre, consulta.apellido].filter(Boolean).join(' ')
  )
  const [remDomicilio, setRemDomicilio] = useState(existing?.remitente_domicilio ?? '')
  const [remDni, setRemDni] = useState(existing?.remitente_dni ?? '')
  const [cuerpo, setCuerpo] = useState(existing?.cuerpo ?? '')
  const [generando, setGenerando] = useState(false)

  async function handleGenerar() {
    if (!destNombre.trim()) {
      toast.error('Indicá el nombre del destinatario primero')
      return
    }
    setGenerando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/consulta-intimacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          consulta_id: consulta.id,
          tipo,
          destinatario_nombre: destNombre,
          destinatario_domicilio: destDomicilio,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al generar')
      setCuerpo(data.cuerpo)
      toast.success('Texto redactado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo redactar')
    } finally {
      setGenerando(false)
    }
  }

  async function handleGuardar() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.mutateAsync({ id: consulta.id, intimacion: activa ? {
        tipo,
        destinatario_nombre: destNombre.trim(),
        destinatario_domicilio: destDomicilio.trim(),
        remitente_nombre: remNombre.trim(),
        remitente_domicilio: remDomicilio.trim(),
        remitente_dni: remDni.trim() || undefined,
        cuerpo,
        generado_at: new Date().toISOString(),
      } : null } as any)
      toast.success(activa ? 'Intimación guardada' : 'Intimación eliminada')
    } catch {
      toast.error('No se pudo guardar')
    }
  }

  function handleImprimir() {
    const content = pdfRef.current?.innerHTML
    if (!content) return
    const title = tipo === 'carta_documento'
      ? `Carta Documento — ${destNombre}`
      : `Telegrama Ley — ${destNombre}`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: white; }
        @media print { html, body { width: 21cm; } }
      </style>
    </head><body>${content}</body></html>`)
    w.document.close()
    w.onafterprint = () => w.close()
    setTimeout(() => { w.focus(); w.print(); }, 300)
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Intimación fehaciente</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">¿Requiere intimación?</span>
          <button
            type="button"
            onClick={() => setActiva(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
              activa ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600',
            )}
          >
            <span className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
              activa ? 'translate-x-4' : 'translate-x-1',
            )} />
          </button>
        </div>
      </div>

      {activa && (
        <>
          {/* Tipo de documento */}
          <div className="grid grid-cols-2 gap-2">
            {(['carta_documento', 'telegrama_ley'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-xs font-medium text-left transition-all border',
                  tipo === t
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300',
                )}
              >
                {t === 'carta_documento' ? (
                  <>
                    <div className="font-semibold">Carta Documento</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Correo Argentino · Formato extendido</div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold">Telegrama Ley</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Art. 243 LCT · Texto breve · Uso laboral</div>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Destinatario */}
          <div className="space-y-2">
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">Destinatario</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Nombre / Razón social</label>
                <input
                  type="text"
                  value={destNombre}
                  onChange={e => setDestNombre(e.target.value)}
                  placeholder="Ej: Juan García / Empresa S.A."
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Domicilio</label>
                <input
                  type="text"
                  value={destDomicilio}
                  onChange={e => setDestDomicilio(e.target.value)}
                  placeholder="Calle y número, ciudad"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
            </div>
          </div>

          {/* Remitente */}
          <div className="space-y-2">
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">Remitente (quién envía)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={remNombre}
                  onChange={e => setRemNombre(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">D.N.I.</label>
                <input
                  type="text"
                  value={remDni}
                  onChange={e => setRemDni(e.target.value)}
                  placeholder="12.345.678"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Domicilio del remitente</label>
              <input
                type="text"
                value={remDomicilio}
                onChange={e => setRemDomicilio(e.target.value)}
                placeholder="Calle y número, ciudad"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          </div>

          {/* Texto */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {tipo === 'carta_documento' ? 'Cuerpo de la carta documento' : 'Texto del telegrama'}
              </label>
              <button
                type="button"
                onClick={handleGenerar}
                disabled={generando || !destNombre.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 hover:from-blue-700 hover:to-violet-700 text-white dark:bg-white dark:text-zinc-900 rounded-lg disabled:opacity-50 transition-all"
              >
                {generando
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Redactando…</>
                  : <><Sparkles className="h-3.5 w-3.5" />Redactar con IA</>
                }
              </button>
            </div>
            <textarea
              value={cuerpo}
              onChange={e => setCuerpo(e.target.value)}
              rows={tipo === 'telegrama_ley' ? 6 : 10}
              placeholder={tipo === 'carta_documento'
                ? 'Por la presente me dirijo a Ud. a fin de INTIMARLE a que…'
                : 'Usá el botón para redactar con IA o escribí directamente…'
              }
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
            />
            {tipo === 'telegrama_ley' && cuerpo.trim() && (
              <div className="text-right text-[10px] text-zinc-400 mt-1">
                {cuerpo.trim().split(/\s+/).filter(Boolean).length} palabras
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGuardar}
              disabled={update.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 rounded-lg transition-colors disabled:opacity-40"
            >
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={handleImprimir}
              disabled={!cuerpo.trim() || !destNombre.trim() || !remNombre.trim()}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium border border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              {tipo === 'carta_documento' ? 'Imprimir CD' : 'Imprimir Telegrama'}
            </button>
          </div>
        </>
      )}

      {/* PDF oculto para impresión */}
      <div className="sr-only">
        <IntimacionPdfPreview
          ref={pdfRef}
          tipo={tipo}
          destNombre={destNombre || '—'}
          destDomicilio={destDomicilio || '—'}
          remNombre={remNombre || '—'}
          remDomicilio={remDomicilio || '—'}
          remDni={remDni || undefined}
          cuerpo={cuerpo}
          abogadoNombre="Dr. Marco Rossi"
        />
      </div>
    </div>
  )
}

// ── Actividad section ───────────────────────────────────────────────────────

function ActividadSection({ consultaId }: { consultaId: string }) {
  const { data: actividad } = useConsultaActividad(consultaId)
  const addActividad = useAddConsultaActividad()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<'nota' | 'llamada' | 'email' | 'reunion'>('nota')

  async function handleAdd() {
    if (!texto.trim()) return
    try {
      await addActividad.mutateAsync({ consulta_id: consultaId, tipo, descripcion: texto.trim() })
      setTexto('')
      toast.success('Actividad registrada')
    } catch {
      toast.error('No se pudo registrar la actividad')
    }
  }

  return (
    <div className="space-y-3">
      {/* Input nueva actividad */}
      <div className="flex gap-2">
        <select
          value={tipo}
          onChange={e => setTipo(e.target.value as typeof tipo)}
          className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-2 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        >
          <option value="nota">Nota</option>
          <option value="llamada">Llamada</option>
          <option value="email">Email</option>
          <option value="reunion">Reunión</option>
        </select>
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Registrar seguimiento…"
          className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!texto.trim() || addActividad.isPending}
          className="px-3 py-2 text-sm font-medium bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          +
        </button>
      </div>

      {/* Lista */}
      {actividad?.length ? (
        <div className="space-y-1.5">
          {actividad.map(a => (
            <div key={a.id} className="flex gap-2.5 text-sm">
              <div className="mt-0.5 shrink-0 text-zinc-400">
                {TIPO_ACTIVIDAD_ICON[a.tipo]}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-zinc-800 dark:text-zinc-200">{a.descripcion}</span>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {a.created_profile
                    ? `${a.created_profile.nombre} ${a.created_profile.apellido} · `
                    : ''}
                  {timeAgo(a.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 italic">Sin actividad registrada todavía.</p>
      )}
    </div>
  )
}

// ── Módulo de diagnóstico por área ─────────────────────────────────────────

function AgregarArea({ excluidas, onElegir, disabled }: { excluidas: string[]; onElegir: (area: string) => void; disabled?: boolean }) {
  const disponibles = (Object.keys(TIPO_ASUNTO_LABEL) as ConsultaTipoAsunto[]).filter(a => !excluidas.includes(a))
  if (!disponibles.length) return null
  return (
    <select
      value=""
      disabled={disabled}
      onChange={e => { if (e.target.value) onElegir(e.target.value) }}
      className="rounded-lg border border-dashed border-zinc-300 dark:border-white/15 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 focus:outline-none"
      aria-label="Agregar un área al diagnóstico"
    >
      <option value="">+ Agregar área…</option>
      {disponibles.map(a => <option key={a} value={a}>{TIPO_ASUNTO_LABEL[a]}</option>)}
    </select>
  )
}

function moduloVacio(area: string): DiagnosticoModulo {
  return {
    area, fuero: '', pretension: '', chances_estimadas: 'sin_datos', acciones_recomendadas: [], riesgos: [],
    observaciones: '', checklist_cliente: [], tipo_honorario_sugerido: 'honorario_fijo', descripcion_honorarios: '',
  }
}

function ModuloDiagnostico({
  modulo,
  idx,
  total,
  consultaId,
  diagModulos,
  onCrearHonorario,
  editarAlAbrir,
}: {
  modulo: DiagnosticoModulo
  idx: number
  total: number
  consultaId: string
  diagModulos: DiagnosticoModulo[]
  onCrearHonorario: (area: string, tipo: TipoHonorario) => void
  editarAlAbrir?: boolean
}) {
  const update = useUpdateConsulta()
  const addActividad = useAddConsultaActividad()
  const [editando, setEditando] = useState(!!editarAlAbrir)
  const [editLocal, setEditLocal] = useState<DiagnosticoModulo>({ ...modulo })
  const [checklistEstado, setChecklistEstado] = useState<Record<number, boolean>>({})

  const areaLabel = TIPO_ASUNTO_LABEL[modulo.area as ConsultaTipoAsunto] ?? modulo.area

  async function handleSaveModulo() {
    const newModulos = diagModulos.map((m, i) => (i === idx ? editLocal : m))
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.mutateAsync({ id: consultaId, diagnostico_ia: { modulos: newModulos } } as any)
      setEditando(false)
      toast.success('Módulo actualizado')
    } catch {
      toast.error('No se pudo guardar el módulo')
    }
  }

  async function guardarModulos(nuevos: DiagnosticoModulo[], ok: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.mutateAsync({ id: consultaId, diagnostico_ia: { modulos: nuevos } } as any)
      toast.success(ok)
    } catch {
      toast.error('No se pudo actualizar el diagnóstico')
    }
  }

  const incluido = modulo.incluir !== false
  const alternarIncluir = () => guardarModulos(
    diagModulos.map((m, i) => (i === idx ? { ...m, incluir: !incluido } : m)),
    incluido ? 'El área no va a figurar en el documento' : 'El área vuelve a figurar en el documento')
  const quitarModulo = () => {
    if (!window.confirm(`¿Quitar ${areaLabel} del diagnóstico? Se borra su análisis. Si solo querés que no figure en el documento, usá el ojo.`)) return
    void guardarModulos(diagModulos.filter((_, i) => i !== idx), `${areaLabel} quitada del diagnóstico`)
  }

  async function handleAgregarChecklistAlSeguimiento() {
    const items = modulo.checklist_cliente ?? []
    const pendientes = items.filter((_, i) => !checklistEstado[i])
    if (!pendientes.length) { toast.error('Todos los ítems ya están tildados'); return }
    try {
      for (const item of pendientes) {
        await addActividad.mutateAsync({ consulta_id: consultaId, tipo: 'nota', descripcion: `Pendiente: ${item}` })
      }
      toast.success(`${pendientes.length} ítem${pendientes.length > 1 ? 's' : ''} agregado${pendientes.length > 1 ? 's' : ''} al seguimiento`)
    } catch {
      toast.error('No se pudo agregar al seguimiento')
    }
  }

  return (
    <div className={cn('border border-zinc-100 dark:border-white/5 rounded-xl p-4 space-y-3', !incluido && 'opacity-60')}>
      {/* Header del módulo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 rounded-full px-2.5 py-0.5">
            {areaLabel || 'Sin área'}
          </span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', CHANCES_STYLE[modulo.chances_estimadas])}>
            {CHANCES_LABEL[modulo.chances_estimadas]}
          </span>
          {!incluido && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Fuera del documento</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCrearHonorario(modulo.area, modulo.tipo_honorario_sugerido)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
          >
            <Plus className="h-3 w-3" /> Cotizar
          </button>
          <button type="button" onClick={alternarIncluir} disabled={update.isPending}
            title={incluido ? 'Sacar del documento (no se borra)' : 'Volver a incluir en el documento'}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {incluido ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={quitarModulo} disabled={update.isPending} title="Quitar esta área del diagnóstico"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {!editando ? (
            <button
              type="button"
              onClick={() => { setEditLocal({ ...modulo }); setEditando(true) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          )}
        </div>
      </div>

      {editando ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Área</label>
            <select
              value={editLocal.area}
              onChange={e => setEditLocal(prev => ({ ...prev, area: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {(Object.keys(TIPO_ASUNTO_LABEL) as ConsultaTipoAsunto[]).map(a => <option key={a} value={a}>{TIPO_ASUNTO_LABEL[a]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Fuero</label>
              <input
                type="text"
                value={editLocal.fuero}
                onChange={e => setEditLocal(prev => ({ ...prev, fuero: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Pretensión</label>
              <input
                type="text"
                value={editLocal.pretension}
                onChange={e => setEditLocal(prev => ({ ...prev, pretension: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Probabilidad</label>
            <select
              value={editLocal.chances_estimadas}
              onChange={e => setEditLocal(prev => ({ ...prev, chances_estimadas: e.target.value as DiagnosticoModulo['chances_estimadas'] }))}
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="sin_datos">Sin datos</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Análisis</label>
            <textarea
              rows={4}
              value={editLocal.observaciones}
              onChange={e => setEditLocal(prev => ({ ...prev, observaciones: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" /> Acciones recomendadas
            </label>
            <div className="space-y-1.5">
              {editLocal.acciones_recomendadas.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={a}
                    onChange={e => setEditLocal(prev => {
                      const arr = [...prev.acciones_recomendadas]; arr[i] = e.target.value
                      return { ...prev, acciones_recomendadas: arr }
                    })}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                  <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, acciones_recomendadas: prev.acciones_recomendadas.filter((_, j) => j !== i) }))} className="px-2 py-1 text-red-500 hover:text-red-600 rounded transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, acciones_recomendadas: [...prev.acciones_recomendadas, ''] }))} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Agregar acción
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Riesgos
            </label>
            <div className="space-y-1.5">
              {(editLocal.riesgos ?? []).map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={r}
                    onChange={e => setEditLocal(prev => {
                      const arr = [...(prev.riesgos ?? [])]; arr[i] = e.target.value
                      return { ...prev, riesgos: arr }
                    })}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                  <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, riesgos: (prev.riesgos ?? []).filter((_, j) => j !== i) }))} className="px-2 py-1 text-red-500 hover:text-red-600 rounded transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, riesgos: [...(prev.riesgos ?? []), ''] }))} className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Agregar riesgo
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Nota sobre honorarios</label>
            <textarea
              rows={2}
              value={editLocal.descripcion_honorarios ?? ''}
              onChange={e => setEditLocal(prev => ({ ...prev, descripcion_honorarios: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveModulo}
            disabled={update.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 rounded-lg transition-colors disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar módulo
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Fuero</div>
              <div className="text-zinc-800 dark:text-zinc-200">{modulo.fuero}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Pretensión</div>
              <div className="text-zinc-800 dark:text-zinc-200">{modulo.pretension}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Análisis</div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{modulo.observaciones}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Acciones recomendadas
              </div>
              <ol className="text-sm space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
                {modulo.acciones_recomendadas.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
            {modulo.riesgos && modulo.riesgos.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Riesgos
                </div>
                <ul className="text-sm space-y-1.5 list-disc list-inside text-zinc-700 dark:text-zinc-300">
                  {modulo.riesgos.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>

          {modulo.descripcion_honorarios && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
              <span className="font-medium">Honorarios sugeridos:</span> {modulo.descripcion_honorarios}
            </div>
          )}

          {modulo.checklist_cliente && modulo.checklist_cliente.length > 0 && (
            <div className="border-t border-zinc-100 dark:border-white/5 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                  <ListChecks className="h-3.5 w-3.5 text-blue-500" />
                  Documentación a solicitar
                </div>
                <button
                  type="button"
                  onClick={handleAgregarChecklistAlSeguimiento}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Agregar al seguimiento
                </button>
              </div>
              <ul className="space-y-1.5">
                {modulo.checklist_cliente.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!checklistEstado[i]}
                      onChange={e => setChecklistEstado(prev => ({ ...prev, [i]: e.target.checked }))}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-cyan-500/30"
                    />
                    <span className={cn('text-zinc-700 dark:text-zinc-300 leading-snug', checklistEstado[i] && 'line-through text-zinc-400 dark:text-zinc-500')}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Tareas vinculadas a la consulta ────────────────────────────────────────

const ESTADO_TAREA_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
}
const ESTADO_TAREA_STYLE: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  EN_PROGRESO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  COMPLETADA: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  CANCELADA: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}
const PRIORIDAD_DOT: Record<string, string> = {
  URGENTE: 'bg-red-500',
  ALTA: 'bg-orange-500',
  MEDIA: 'bg-amber-500',
  BAJA: 'bg-zinc-400',
}

function TareaConsultaItem({ tarea, onCompleted }: { tarea: TareaConsultaRow; onCompleted: () => void }) {
  const completar = useCompletarTarea()
  const completada = tarea.estado === 'COMPLETADA'
  const asignadoNombre = tarea.asignado
    ? [tarea.asignado.nombre, tarea.asignado.apellido].filter(Boolean).join(' ')
    : '—'

  return (
    <div className={cn(
      'flex items-start gap-3 py-2.5 border-b border-zinc-100 dark:border-white/5 last:border-0',
      completada && 'opacity-60',
    )}>
      <button
        type="button"
        onClick={() => { if (!completada) completar.mutate(tarea.id, { onSuccess: onCompleted }) }}
        disabled={completada || completar.isPending}
        className={cn(
          'mt-0.5 shrink-0 h-4 w-4 rounded border transition-colors',
          completada
            ? 'border-green-500 bg-green-500 flex items-center justify-center'
            : 'border-zinc-300 dark:border-zinc-600 hover:border-green-500',
        )}
        title={completada ? 'Completada' : 'Marcar como completada'}
      >
        {completada && <Check className="h-2.5 w-2.5 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-sm text-zinc-800 dark:text-zinc-200', completada && 'line-through')}>
            {tarea.titulo}
          </span>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', ESTADO_TAREA_STYLE[tarea.estado] ?? ESTADO_TAREA_STYLE.PENDIENTE)}>
            {ESTADO_TAREA_LABEL[tarea.estado] ?? tarea.estado}
          </span>
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORIDAD_DOT[tarea.prioridad] ?? PRIORIDAD_DOT.MEDIA)} title={tarea.prioridad} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-400">
          <span>{asignadoNombre}</span>
          {tarea.fecha_vencimiento && (
            <span className={cn(
              tarea.fecha_vencimiento < new Date().toISOString().split('T')[0] && !completada
                ? 'text-red-500'
                : '',
            )}>
              {new Date(tarea.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
          {tarea.sae_movement_id && tarea.expediente_id && (
            <Link
              to={`/expedientes/${tarea.expediente_id}?tab=actuaciones&mid=${tarea.sae_movement_id}`}
              className="inline-flex items-center gap-0.5 text-amber-500/70 hover:text-amber-400 transition-colors"
              title="Ver actuación vinculada"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Ver actuación</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function TareasConsultaSection({ consultaId }: { consultaId: string }) {
  const { data: tareas = [], isLoading, refetch } = useTareasConsulta(consultaId)
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Tareas</h2>
          {tareas.length > 0 && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {tareas.filter(t => t.estado !== 'COMPLETADA').length} pendientes
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-amber-400 hover:text-amber-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </button>
      </div>

      {isLoading && <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />}

      {!isLoading && tareas.length === 0 && (
        <p className="text-xs text-zinc-400 italic">Sin tareas vinculadas a esta consulta.</p>
      )}

      {tareas.length > 0 && (
        <div>
          {tareas.map(t => (
            <TareaConsultaItem key={t.id} tarea={t} onCompleted={() => refetch()} />
          ))}
        </div>
      )}

      <CrearTareaDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        consultaId={consultaId}
      />
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

export default function ConsultaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)
  const supabase = createClient()

  const qc = useQueryClient()
  const { data: consulta, isLoading, error } = useConsulta(id)
  const { data: presupuestos = [] } = usePresupuestos(id)
  const update = useUpdateConsulta()
  const deleteConsulta = useDeleteConsulta()
  const addActividad = useAddConsultaActividad()

  const [editandoDatos, setEditandoDatos] = useState(false)
  const [datosEdit, setDatosEdit] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    email: '',
    canal: 'presencial' as ConsultaCanal,
    tipo_asunto: 'civil' as ConsultaTipoAsunto,
  })

  const [notas, setNotas] = useState('')
  const [notasInitialized, setNotasInitialized] = useState(false)
  const [notasAbogado, setNotasAbogado] = useState('')
  const [notasAbogadoInitialized, setNotasAbogadoInitialized] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [enriqueciendo, setEnriqueciendo] = useState(false)
  const ordenarHechos = useOrdenarHechos()
  const [checklistEstado, setChecklistEstado] = useState<Record<number, boolean>>({})
  const [editandoDiag, setEditandoDiag] = useState(false)
  const [diagEdit, setDiagEdit] = useState<DiagnosticoIA | null>(null)
  const [areasActivas, setAreasActivas] = useState<string[]>([])
  const [areasInitialized, setAreasInitialized] = useState(false)
  const [incorporar, setIncorporar] = useState<{ texto: string; marcas: string[] } | null>(null)
  const { data: contextosConsulta = [] } = useConsultaContextos(id ?? '')
  const hayEntrevista = contextosConsulta.length > 0
  const [prefilledPresupuesto, setPrefilledPresupuesto] = useState<PrefillProceso | null>(null)
  const { data: cotizacion = null } = useCotizacionConsulta(id)
  const [docModo, setDocModo] = useState<ModoDocumento>('completo')
  const [docArea, setDocArea] = useState<string>('')
  const [imprimiendo, setImprimiendo] = useState(false)
  const pdfDocRef = useRef<HTMLDivElement>(null)
  const presupuestoSectionRef = useRef<HTMLDivElement>(null)

  const isSecretaria = profile?.rol === 'SECRETARIA'

  if (!notasInitialized && consulta) {
    setNotas(consulta.notas_libres ?? '')
    setNotasInitialized(true)
  }
  if (!notasAbogadoInitialized && consulta) {
    setNotasAbogado(consulta.notas_abogado ?? '')
    setNotasAbogadoInitialized(true)
  }
  if (!areasInitialized && consulta) {
    const areas = consulta.areas_derecho?.length
      ? consulta.areas_derecho
      : [consulta.tipo_asunto as string]
    setAreasActivas(areas)
    setAreasInitialized(true)
  }

  const handleSaveDatos = useCallback(async () => {
    if (!id) return
    if (!datosEdit.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    try {
      await update.mutateAsync({
        id,
        nombre: datosEdit.nombre.trim(),
        apellido: datosEdit.apellido.trim() || null,
        telefono: datosEdit.telefono.trim() || null,
        email: datosEdit.email.trim() || null,
        canal: datosEdit.canal,
        tipo_asunto: datosEdit.tipo_asunto,
      } as any)
      setEditandoDatos(false)
      toast.success('Datos actualizados')
    } catch {
      toast.error('No se pudo guardar')
    }
  }, [id, datosEdit, update])

  const handleDelete = useCallback(async () => {
    if (!id) return
    const nombre = consulta ? [consulta.apellido, consulta.nombre].filter(Boolean).join(', ') : 'este consultante'
    if (!window.confirm(`¿Eliminar la consulta de ${nombre}? Esta acción no se puede deshacer.`)) return
    try {
      await deleteConsulta.mutateAsync(id)
      toast.success('Consulta eliminada')
      navigate('/consultas')
    } catch {
      toast.error('No se pudo eliminar la consulta')
    }
  }, [id, consulta, deleteConsulta, navigate])

  const handleSaveNotas = useCallback(async () => {
    if (!id) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.mutateAsync({ id, notas_libres: notas, areas_derecho: areasActivas } as any)
      toast.success('Notas guardadas')
    } catch {
      toast.error('No se pudieron guardar las notas')
    }
  }, [id, notas, areasActivas, update])

  const handleOrdenarHechos = useCallback(async () => {
    if (!id || (!notas.trim() && !hayEntrevista)) {
      toast.error('Escribí los hechos del caso o transcribí la entrevista primero')
      return
    }
    // Guardar notas antes de ordenar si hay cambios sin guardar
    if (notas !== (consulta?.notas_libres ?? '')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await update.mutateAsync({ id, notas_libres: notas, areas_derecho: areasActivas } as any)
      } catch {
        toast.error('No se pudieron guardar las notas antes de ordenar')
        return
      }
    }
    try {
      const r = await ordenarHechos.mutateAsync(id)
      toast.success(r.assigned_to ? 'Hechos ordenados. La consulta fue asignada a Claudio para revisión.' : 'Hechos ordenados.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo ordenar los hechos')
    }
  }, [id, notas, consulta, areasActivas, update, ordenarHechos, hayEntrevista])

  const handleGenerarDiagnostico = useCallback(async () => {
    if (!consulta || !notas.trim()) {
      toast.error(hayEntrevista ? 'Primero incorporá la entrevista a los hechos del caso' : 'Escribí los hechos del caso primero')
      return
    }
    setGenerando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/consulta-diagnostico`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          consulta_id: consulta.id,
          nombre: consulta.nombre,
          apellido: consulta.apellido,
          tipo_asunto: consulta.tipo_asunto,
          areas_derecho: areasActivas.length ? areasActivas : [consulta.tipo_asunto],
          notas_libres: notas,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error en el diagnóstico')
      toast.success('Diagnóstico generado')
      // Forzar refetch
      update.mutate({ id: consulta.id, updated_at: new Date().toISOString() })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el diagnóstico')
    } finally {
      setGenerando(false)
    }
  }, [consulta, notas, supabase, update, hayEntrevista])

  const handleSaveNotasAbogado = useCallback(async () => {
    if (!id) return
    try {
      await update.mutateAsync({ id, notas_abogado: notasAbogado } as any)
      toast.success('Observaciones guardadas')
    } catch {
      toast.error('No se pudieron guardar las observaciones')
    }
  }, [id, notasAbogado, update])

  const handleEnriquecerConIA = useCallback(async () => {
    if (!consulta || !notasAbogado.trim()) {
      toast.error('Escribí las observaciones primero')
      return
    }
    setEnriqueciendo(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/consulta-enrich-notas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          consulta_id: consulta.id,
          notas_raw: notasAbogado,
          diagnostico_observaciones: consulta.diagnostico_ia?.observaciones ?? '',
          nombre: consulta.nombre,
          apellido: consulta.apellido,
          tipo_asunto: consulta.tipo_asunto,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al enriquecer')
      setNotasAbogado(data.texto_enriquecido)
      // La edge function ya guardó en DB; refrescamos para sincronizar el estado local
      qc.invalidateQueries({ queryKey: ['consulta', consulta.id] })
      toast.success('Observaciones formalizadas con IA')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enriquecer')
    } finally {
      setEnriqueciendo(false)
    }
  }, [consulta, notasAbogado, supabase, qc])

  const handleAgregarChecklistAlSeguimiento = useCallback(async () => {
    if (!consulta?.diagnostico_ia?.checklist_cliente?.length) return
    const items = consulta.diagnostico_ia.checklist_cliente
    const pendientes = items.filter((_, i) => !checklistEstado[i])
    if (!pendientes.length) { toast.error('Todos los ítems ya están tildados'); return }
    try {
      for (const item of pendientes) {
        await addActividad.mutateAsync({
          consulta_id: consulta.id,
          tipo: 'nota',
          descripcion: `Pendiente: ${item}`,
        })
      }
      toast.success(`${pendientes.length} ítems agregados al seguimiento`)
    } catch {
      toast.error('No se pudo agregar al seguimiento')
    }
  }, [consulta, checklistEstado, addActividad])

  const nombreCliente = [consulta?.apellido, consulta?.nombre].filter(Boolean).join(', ')
  const handleImprimirDocumento = useCallback(async () => {
    const titulo = { diagnostico: 'Diagnóstico', presupuesto: 'Honorarios', completo: 'Diagnóstico y honorarios' }[docModo]
    setImprimiendo(true)
    // Un cuadro para que React pinte el documento con el modo y el alcance elegidos
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const ok = await imprimirDocumento(pdfDocRef.current, `${titulo} — ${nombreCliente}${docArea ? ` — ${etiquetaArea(docArea)}` : ''}`)
    setImprimiendo(false)
    if (!ok) toast.error('El navegador bloqueó la ventana del documento. Permití las ventanas emergentes para este sitio.')
  }, [docModo, docArea, nombreCliente])

  const handleConvertir = useCallback(async () => {
    if (!consulta) return
    const nombre = consulta.nombre
    const apellido = consulta.apellido ?? ''
    navigate(`/expedientes/nuevo?consulta_id=${consulta.id}&nombre=${encodeURIComponent(nombre)}&apellido=${encodeURIComponent(apellido)}&tipo_asunto=${consulta.tipo_asunto}`)
  }, [consulta, navigate])

  const handleCrearHonorario = useCallback((area: string, tipo: TipoHonorario) => {
    setPrefilledPresupuesto({ area: area || null, tipo })
    setTimeout(() => presupuestoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [])

  const handlePrefillConsumed = useCallback(() => setPrefilledPresupuesto(null), [])

  const [moduloNuevo, setModuloNuevo] = useState<number | null>(null)
  const handleAgregarArea = useCallback(async (area: string) => {
    if (!consulta) return
    const d = consulta.diagnostico_ia
    // Un diagnóstico del formato anterior pasa a ser el primer módulo
    const base: DiagnosticoModulo[] = d?.modulos?.length ? d.modulos
      : d && (d.fuero || d.observaciones) ? [{
        ...moduloVacio(consulta.tipo_asunto), fuero: d.fuero ?? '', pretension: d.pretension ?? '',
        chances_estimadas: d.chances_estimadas ?? 'sin_datos', acciones_recomendadas: d.acciones_recomendadas ?? [],
        riesgos: d.riesgos ?? [], observaciones: d.observaciones ?? '', checklist_cliente: d.checklist_cliente ?? [],
        tipo_honorario_sugerido: d.tipo_honorario_sugerido ?? 'honorario_fijo', descripcion_honorarios: d.descripcion_honorarios ?? '',
      }] : []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.mutateAsync({ id: consulta.id, diagnostico_ia: { modulos: [...base, moduloVacio(area)] } } as any)
      setModuloNuevo(base.length)
    } catch {
      toast.error('No se pudo agregar el área')
    }
  }, [consulta, update])

  if (isLoading) return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
    </div>
  )
  if (error || !consulta) return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 p-6 text-sm text-red-700 dark:text-red-400">
        No se pudo cargar la consulta.
      </div>
    </div>
  )

  const diag = consulta.diagnostico_ia
  const hasModulos = !!(diag?.modulos && diag.modulos.length > 0)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Link to="/consultas" className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Consultas
        </Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-200 font-medium">{nombreCliente || 'Consulta'}</span>
      </div>


      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5">
        {editandoDatos ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={datosEdit.nombre}
                  onChange={e => setDatosEdit(f => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Apellido</label>
                <input
                  type="text"
                  value={datosEdit.apellido}
                  onChange={e => setDatosEdit(f => ({ ...f, apellido: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={datosEdit.telefono}
                  onChange={e => setDatosEdit(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={datosEdit.email}
                  onChange={e => setDatosEdit(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cómo llegó</label>
                <select
                  value={datosEdit.canal}
                  onChange={e => setDatosEdit(f => ({ ...f, canal: e.target.value as ConsultaCanal }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  {Object.entries(CANAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tipo de asunto</label>
                <select
                  value={datosEdit.tipo_asunto}
                  onChange={e => setDatosEdit(f => ({ ...f, tipo_asunto: e.target.value as ConsultaTipoAsunto }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  {Object.entries(TIPO_ASUNTO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditandoDatos(false)}
                className="px-4 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDatos}
                disabled={update.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 rounded-lg transition-colors disabled:opacity-50"
              >
                {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{nombreCliente || consulta.nombre}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                <span>{TIPO_ASUNTO_LABEL[consulta.tipo_asunto]}</span>
                <span>·</span>
                <span>{CANAL_LABEL[consulta.canal]}</span>
                {consulta.telefono && <><span>·</span><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{consulta.telefono}</span></>}
                {consulta.email && <><span>·</span><span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{consulta.email}</span></>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Estado badge (solo lectura — el pipeline maneja transiciones) */}
              <span className={cn('rounded-full px-3 py-1 text-xs font-medium', ESTADO_STYLE[consulta.estado])}>
                {ESTADO_LABEL[consulta.estado]}
              </span>
              {/* Editar datos */}
              <button
                type="button"
                title="Editar datos de la consulta"
                onClick={() => {
                  setDatosEdit({
                    nombre: consulta.nombre,
                    apellido: consulta.apellido ?? '',
                    telefono: consulta.telefono ?? '',
                    email: consulta.email ?? '',
                    canal: consulta.canal,
                    tipo_asunto: consulta.tipo_asunto,
                  })
                  setEditandoDatos(true)
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {/* Eliminar consulta */}
              <button
                type="button"
                title="Eliminar consulta"
                onClick={handleDelete}
                disabled={deleteConsulta.isPending}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
              >
                {deleteConsulta.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline de estados */}
      {profile && (
        <ConsultaPipeline
          consulta={consulta}
          profile={profile}
          onConvertir={handleConvertir}
        />
      )}

      {/* 1. Entrevista y apuntes: lo primero cuando el cliente está presente */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">1. Entrevista</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Transcribí la charla con el cliente o cargá apuntes. Al terminar, lo nuevo se incorpora a los hechos del caso.</p>
        </div>
        <ConsultaContextos consultaId={consulta.id} onIncorporar={(texto, marcas) => setIncorporar({ texto, marcas })} />
      </div>

      {/* 2. Hechos del caso */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">2. Hechos del caso</h2>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Describí los hechos del caso: qué pasó, cuándo, quiénes están involucrados, qué quiere el cliente, montos si aplica… (lo que surja de la entrevista se agrega acá)"
          rows={8}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
        />

        {/* Selector de áreas del derecho */}
        <div className="border-t border-zinc-100 dark:border-white/5 pt-3">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Áreas del derecho involucradas</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(TIPO_ASUNTO_LABEL) as [ConsultaTipoAsunto, string][]).map(([value, label]) => {
              const activa = areasActivas.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAreasActivas(prev =>
                    prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value]
                  )}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors',
                    activa
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSaveNotas}
            disabled={update.isPending || (notas === consulta.notas_libres && JSON.stringify(areasActivas) === JSON.stringify(consulta.areas_derecho ?? []))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 rounded-lg transition-colors disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar notas
          </button>
          <button
            type="button"
            onClick={handleOrdenarHechos}
            disabled={ordenarHechos.isPending || (!notas.trim() && !hayEntrevista)}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-zinc-900 hover:from-amber-600 hover:to-orange-600 text-white dark:bg-white dark:text-zinc-900 rounded-lg transition-all disabled:opacity-50 shadow-sm"
          >
            {ordenarHechos.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Ordenando…</>
            ) : (
              <><ListChecks className="h-4 w-4" />Ordenar hechos con IA</>
            )}
          </button>
          {!isSecretaria && (
            <button
              type="button"
              onClick={handleGenerarDiagnostico}
              disabled={generando || !notas.trim()}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-zinc-900 hover:from-blue-700 hover:to-violet-700 text-white dark:bg-white dark:text-zinc-900 rounded-lg transition-all disabled:opacity-50 shadow-sm"
            >
              {generando ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Analizando…</>
              ) : (
                <><Sparkles className="h-4 w-4" />{diag ? 'Regenerar diagnóstico' : 'Generar diagnóstico y presupuesto'}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 3. Documentación del cliente */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">3. Documentación</h2>
        <div>
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Documentos adjuntos</h3>
          <ConsultaAdjuntos consultaId={consulta.id} />
        </div>
        <div className="border-t border-zinc-100 dark:border-white/5 pt-3">
          <DocumentacionRequerida caso={{ consultaId: consulta.id }} clienteNombre={consulta.nombre} clienteTelefono={consulta.telefono} />
        </div>
      </div>

      {incorporar && (
        <IncorporarEntrevista
          consulta={consulta}
          transcripcion={incorporar.texto}
          marcas={incorporar.marcas}
          notas={notas}
          areas={areasActivas}
          onAplicado={({ notas: n, areas: a }) => { setNotas(n); setAreasActivas(a) }}
          onCerrar={() => setIncorporar(null)}
          onOrdenar={() => { void handleOrdenarHechos() }}
        />
      )}

      {/* Hechos ordenados con IA */}
      {(consulta.hechos_ordenados || (consulta.preguntas_sugeridas?.length ?? 0) > 0) && (
        <ConsultaHechosOrdenados
          consultaId={consulta.id}
          hechosOrdenados={consulta.hechos_ordenados ?? ''}
          preguntasSugeridas={consulta.preguntas_sugeridas ?? []}
          hechosOrdenadosAt={consulta.hechos_ordenados_at}
        />
      )}

      {/* Solicitud de documentación */}
      {(consulta.hechos_ordenados || !isSecretaria) && (
        <ConsultaSolicitudDocs consultaId={consulta.id} />
      )}

      {/* Normativa y jurisprudencia de referencia */}
      <ConsultaAnclasPanel consultaId={consulta.id} />

      <DanosCalculosPanel consultaId={consulta.id} />

      {/* Sin diagnóstico todavía: se puede armar a mano, área por área */}
      {!diag && !isSecretaria && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 p-4">
          <p className="text-sm text-zinc-500">Sin diagnóstico todavía. Generalo con IA desde los hechos o armalo a mano por área.</p>
          <AgregarArea excluidas={[]} onElegir={a => { void handleAgregarArea(a) }} disabled={update.isPending} />
        </div>
      )}

      {/* Diagnóstico IA */}
      {diag && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Diagnóstico jurídico</h2>
            {hasModulos && !isSecretaria && (
              <AgregarArea excluidas={diag.modulos!.map(m => m.area)} onElegir={a => { void handleAgregarArea(a) }} disabled={update.isPending} />
            )}
            {/* Botón editar solo para diagnósticos legacy (sin módulos) */}
            {!hasModulos && (
              <div className="flex items-center gap-2">
                {!editandoDiag ? (
                  <>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', CHANCES_STYLE[diag.chances_estimadas ?? 'sin_datos'])}>
                      {CHANCES_LABEL[diag.chances_estimadas ?? 'sin_datos']}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setDiagEdit({ ...diag }); setEditandoDiag(true) }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditandoDiag(false); setDiagEdit(null) }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Vista multi-módulo (nuevos diagnósticos) */}
          {hasModulos ? (
            <div className="space-y-3">
              {diag.modulos!.map((modulo, idx) => (
                <ModuloDiagnostico
                  key={`${modulo.area}-${idx}`}
                  modulo={modulo}
                  idx={idx}
                  total={diag.modulos!.length}
                  consultaId={consulta.id}
                  diagModulos={diag.modulos!}
                  onCrearHonorario={handleCrearHonorario}
                  editarAlAbrir={moduloNuevo === idx}
                />
              ))}
            </div>
          ) : editandoDiag && diagEdit ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Fuero</label>
                  <input
                    type="text"
                    value={diagEdit.fuero ?? ''}
                    onChange={e => setDiagEdit(prev => prev ? { ...prev, fuero: e.target.value } : prev)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Pretensión</label>
                  <input
                    type="text"
                    value={diagEdit.pretension ?? ''}
                    onChange={e => setDiagEdit(prev => prev ? { ...prev, pretension: e.target.value } : prev)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Probabilidad</label>
                <select
                  value={diagEdit.chances_estimadas}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, chances_estimadas: e.target.value as DiagnosticoIA['chances_estimadas'] } : prev)}
                  className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                  <option value="sin_datos">Sin datos</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Análisis</label>
                <textarea
                  rows={5}
                  value={diagEdit.observaciones ?? ''}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, observaciones: e.target.value } : prev)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" /> Acciones recomendadas
                </label>
                <div className="space-y-1.5">
                  {(diagEdit.acciones_recomendadas ?? []).map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={a}
                        onChange={e => setDiagEdit(prev => {
                          if (!prev) return prev
                          const arr = [...(prev.acciones_recomendadas ?? [])]
                          arr[i] = e.target.value
                          return { ...prev, acciones_recomendadas: arr }
                        })}
                        className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                      />
                      <button
                        type="button"
                        onClick={() => setDiagEdit(prev => prev ? { ...prev, acciones_recomendadas: (prev.acciones_recomendadas ?? []).filter((_, j) => j !== i) } : prev)}
                        className="px-2 py-1 text-red-500 hover:text-red-600 rounded transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiagEdit(prev => prev ? { ...prev, acciones_recomendadas: [...(prev.acciones_recomendadas ?? []), ''] } : prev)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Agregar acción
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Riesgos
                </label>
                <div className="space-y-1.5">
                  {(diagEdit.riesgos ?? []).map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={r}
                        onChange={e => setDiagEdit(prev => {
                          if (!prev) return prev
                          const arr = [...(prev.riesgos ?? [])]
                          arr[i] = e.target.value
                          return { ...prev, riesgos: arr }
                        })}
                        className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                      />
                      <button
                        type="button"
                        onClick={() => setDiagEdit(prev => prev ? { ...prev, riesgos: (prev.riesgos ?? []).filter((_, j) => j !== i) } : prev)}
                        className="px-2 py-1 text-red-500 hover:text-red-600 rounded transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiagEdit(prev => prev ? { ...prev, riesgos: [...(prev.riesgos ?? []), ''] } : prev)}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Agregar riesgo
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Nota sobre honorarios</label>
                <textarea
                  rows={2}
                  value={diagEdit.descripcion_honorarios ?? ''}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, descripcion_honorarios: e.target.value } : prev)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
                />
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!id || !diagEdit) return
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await update.mutateAsync({ id, diagnostico_ia: diagEdit } as any)
                    setEditandoDiag(false)
                    setDiagEdit(null)
                    toast.success('Diagnóstico actualizado')
                  } catch {
                    toast.error('No se pudo guardar el diagnóstico')
                  }
                }}
                disabled={update.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 rounded-lg transition-colors disabled:opacity-50"
              >
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar diagnóstico
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Fuero</div>
                  <div className="text-zinc-800 dark:text-zinc-200">{diag.fuero ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Pretensión</div>
                  <div className="text-zinc-800 dark:text-zinc-200">{diag.pretension ?? '—'}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Análisis</div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{diag.observaciones ?? ''}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Acciones recomendadas
                  </div>
                  <ol className="text-sm space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
                    {(diag.acciones_recomendadas ?? []).map((a, i) => <li key={i}>{a}</li>)}
                  </ol>
                </div>
                {(diag.riesgos?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      Riesgos
                    </div>
                    <ul className="text-sm space-y-1.5 list-disc list-inside text-zinc-700 dark:text-zinc-300">
                      {(diag.riesgos ?? []).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {diag.descripcion_honorarios && (
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                  <span className="font-medium">Honorarios sugeridos:</span> {diag.descripcion_honorarios}
                </div>
              )}

              {diag.checklist_cliente && diag.checklist_cliente.length > 0 && (
                <div className="border-t border-zinc-100 dark:border-white/5 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                      <ListChecks className="h-3.5 w-3.5 text-blue-500" />
                      Documentación / información a solicitar al cliente
                    </div>
                    <button
                      type="button"
                      onClick={handleAgregarChecklistAlSeguimiento}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Agregar al seguimiento
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {diag.checklist_cliente.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!checklistEstado[i]}
                          onChange={e => setChecklistEstado(prev => ({ ...prev, [i]: e.target.checked }))}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-cyan-500/30"
                        />
                        <span className={cn(
                          'text-zinc-700 dark:text-zinc-300 leading-snug',
                          checklistEstado[i] && 'line-through text-zinc-400 dark:text-zinc-500'
                        )}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Notas del abogado sobre el diagnóstico */}
      {diag && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Observaciones del abogado</h2>
          </div>
          <p className="text-[11px] text-zinc-500">
            Agregá todo lo que el diagnóstico IA omitió o que querés dejar asentado: daño punitivo, defensa del empleador, etc.
          </p>
          <textarea
            value={notasAbogado}
            onChange={e => setNotasAbogado(e.target.value)}
            placeholder="Ej: agregar daño punitivo — el empleador ya fue condenado antes. Considerar art. 80 LCT por falta de entrega de documentación…"
            rows={5}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveNotasAbogado}
              disabled={update.isPending || notasAbogado === (consulta.notas_abogado ?? '')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:border-violet-400 hover:text-violet-600 rounded-lg transition-colors disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar observaciones
            </button>
            <button
              type="button"
              onClick={handleEnriquecerConIA}
              disabled={enriqueciendo || !notasAbogado.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {enriqueciendo ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Formalizando…</>
              ) : (
                <><Wand2 className="h-3.5 w-3.5" />Formalizar con IA</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Intimación fehaciente — solo abogados */}
      {!isSecretaria && (
        <IntimacionSection consulta={consulta} />
      )}

      {/* Honorarios por proceso — solo abogados */}
      {!isSecretaria && (
        <div ref={presupuestoSectionRef} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Honorarios</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Cada juicio, actuación administrativa o gestión con su honorario, agrupados por área.</p>
          </div>
          <CotizacionPanel
            key={consulta.id}
            consultaId={consulta.id}
            modulos={diag?.modulos ?? []}
            areasConsulta={consulta.areas_derecho?.length ? consulta.areas_derecho : [consulta.tipo_asunto]}
            prefill={prefilledPresupuesto}
            onPrefillConsumed={handlePrefillConsumed}
          />
        </div>
      )}

      {/* Documento para el cliente */}
      {(diag || (!isSecretaria && presupuestos.length > 0)) && (() => {
        const modos: { id: ModoDocumento; label: string }[] = isSecretaria
          ? [{ id: 'diagnostico', label: 'Diagnóstico' }]
          : [{ id: 'completo', label: 'Completo' }, { id: 'diagnostico', label: 'Diagnóstico' }, { id: 'presupuesto', label: 'Honorarios' }]
        const modoEfectivo = modos.some(m => m.id === docModo) ? docModo : modos[0]!.id
        const areasDoc: string[] = []
        for (const a of [...(diag?.modulos ?? []).filter(m => m.incluir !== false).map(m => m.area), ...presupuestos.filter(p => p.incluido).map(p => p.area ?? '')]) {
          if (a && !areasDoc.includes(a)) areasDoc.push(a)
        }
        return (
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Documento para el cliente</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {modos.length > 1 && (
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-500/10 p-1">
                  {modos.map(m => (
                    <button key={m.id} type="button" onClick={() => setDocModo(m.id)}
                      className={cn('min-h-8 rounded-lg px-3 text-xs font-medium',
                        modoEfectivo === m.id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              {areasDoc.length > 1 && (
                <select value={docArea} onChange={e => setDocArea(e.target.value)} aria-label="Alcance del documento"
                  className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none">
                  <option value="">Todas las áreas</option>
                  {areasDoc.map(a => <option key={a} value={a}>Solo {etiquetaArea(a).toLowerCase()}</option>)}
                </select>
              )}
              <button type="button" onClick={() => { if (docModo !== modoEfectivo) setDocModo(modoEfectivo); void handleImprimirDocumento() }} disabled={imprimiendo}
                className="ml-auto flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
                {imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Imprimir o guardar PDF
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Tapa con la identidad del estudio y el cuerpo con el formato de los escritos (Times 12, interlineado 1,5). Las áreas y procesos marcados con el ojo tachado no salen.
            </p>
          </div>
        )
      })()}

      {/* Acciones */}
      {!isSecretaria && consulta.estado !== 'convertida' && consulta.estado !== 'descartada' && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleConvertir}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            Convertir a expediente
          </button>
        </div>
      )}

      {/* Tareas vinculadas */}
      <TareasConsultaSection consultaId={consulta.id} />

      {/* Actividad / Seguimiento */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Seguimiento administrativo</h2>
        <ActividadSection consultaId={consulta.id} />
      </div>

      {/* Documento invisible — se copia a una ventana aparte para imprimir */}
      <div className="sr-only" aria-hidden>
        <ConsultaPdfPreview
          ref={pdfDocRef}
          consulta={{ ...consulta, notas_libres: notas }}
          presupuestos={isSecretaria ? [] : presupuestos}
          cotizacion={isSecretaria ? null : cotizacion}
          mode={isSecretaria ? 'diagnostico' : docModo}
          area={docArea || null}
          abogadoNombre="Dr. Marco Rossi"
          notasAbogado={notasAbogado || null}
        />
      </div>
    </div>
  )
}
