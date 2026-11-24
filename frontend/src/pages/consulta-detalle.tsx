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

// Mismos tonos que la lista de Consultas: pastilla con borde
const ESTADO_STYLE: Record<ConsultaEstado, string> = {
  pendiente: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  en_proceso: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  presupuestada: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  con_claudio: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  requiere_info: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  redactando: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300',
  convertida: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  resuelta: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  descartada: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
}

const CHANCES_STYLE = {
  alta: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  media: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  baja: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  sin_datos: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
}

const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'
const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400'
const CARD_TITLE = 'text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white'
/** Opción elegible tipo tarjeta (tipo de honorario, tipo de intimación). */
const OPCION = 'rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors'
const OPCION_ACTIVA = 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
const OPCION_INACTIVA = 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-400 dark:hover:border-white/20'

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
    <div className="app-card space-y-4 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--brand-accent)]" />
          <h2 className={CARD_TITLE}>Intimación fehaciente</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">¿Requiere intimación?</span>
          <button
            type="button"
            onClick={() => setActiva(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
              activa ? 'bg-[var(--brand-accent)]' : 'bg-zinc-300 dark:bg-white/15',
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
                className={cn(OPCION, tipo === t ? OPCION_ACTIVA : OPCION_INACTIVA)}
              >
                {t === 'carta_documento' ? (
                  <>
                    <div className="font-bold">Carta Documento</div>
                    <div className="mt-0.5 text-[10.5px] font-medium opacity-70">Correo Argentino · Formato extendido</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold">Telegrama Ley</div>
                    <div className="mt-0.5 text-[10.5px] font-medium opacity-70">Art. 243 LCT · Texto breve · Uso laboral</div>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Destinatario */}
          <div className="space-y-2">
            <div className="eyebrow">Destinatario</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nombre / Razón social</label>
                <input
                  type="text"
                  value={destNombre}
                  onChange={e => setDestNombre(e.target.value)}
                  placeholder="Ej: Juan García / Empresa S.A."
                  className="field"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Domicilio</label>
                <input
                  type="text"
                  value={destDomicilio}
                  onChange={e => setDestDomicilio(e.target.value)}
                  placeholder="Calle y número, ciudad"
                  className="field"
                />
              </div>
            </div>
          </div>

          {/* Remitente */}
          <div className="space-y-2">
            <div className="eyebrow">Remitente (quién envía)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nombre completo</label>
                <input
                  type="text"
                  value={remNombre}
                  onChange={e => setRemNombre(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">D.N.I.</label>
                <input
                  type="text"
                  value={remDni}
                  onChange={e => setRemDni(e.target.value)}
                  placeholder="12.345.678"
                  className="field"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Domicilio del remitente</label>
              <input
                type="text"
                value={remDomicilio}
                onChange={e => setRemDomicilio(e.target.value)}
                placeholder="Calle y número, ciudad"
                className="field"
              />
            </div>
          </div>

          {/* Texto */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                {tipo === 'carta_documento' ? 'Cuerpo de la carta documento' : 'Texto del telegrama'}
              </label>
              <button
                type="button"
                onClick={handleGenerar}
                disabled={generando || !destNombre.trim()}
                className="btn btn-primary btn-sm"
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
              className="field resize-y py-3"
            />
            {tipo === 'telegrama_ley' && cuerpo.trim() && (
              <div className="mt-1 text-right text-[10.5px] font-medium tabular-nums text-zinc-500">
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
              className="btn btn-ghost btn-sm"
            >
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={handleImprimir}
              disabled={!cuerpo.trim() || !destNombre.trim() || !remNombre.trim()}
              className="btn btn-ghost btn-sm"
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
          className="field w-auto px-2.5 text-xs font-semibold"
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
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!texto.trim() || addActividad.isPending}
          className="btn btn-primary btn-icon shrink-0 text-base"
        >
          +
        </button>
      </div>

      {/* Lista */}
      {actividad?.length ? (
        <div className="space-y-1.5">
          {actividad.map(a => (
            <div key={a.id} className="flex gap-2.5 text-sm">
              <div className="mt-0.5 shrink-0 text-[var(--brand-accent)]">
                {TIPO_ACTIVIDAD_ICON[a.tipo]}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-zinc-800 dark:text-zinc-200">{a.descripcion}</span>
                <div className="mt-0.5 text-[11px] font-medium text-zinc-500">
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
        <p className="text-xs font-medium text-zinc-500">Sin actividad registrada todavía.</p>
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
    <div className={cn('dashboard-panel-muted space-y-3 rounded-2xl p-4', !incluido && 'opacity-60')}>
      {/* Header del módulo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tag-mono uppercase tracking-[0.08em]">
            {areaLabel || 'Sin área'}
          </span>
          <span className={cn(TAG, 'px-2.5 py-0.5 text-[11px]', CHANCES_STYLE[modulo.chances_estimadas])}>
            {CHANCES_LABEL[modulo.chances_estimadas]}
          </span>
          {!incluido && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Fuera del documento</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCrearHonorario(modulo.area, modulo.tipo_honorario_sugerido)}
            className="btn btn-secondary btn-sm"
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
              className="btn btn-ghost btn-sm"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="btn btn-ghost btn-sm"
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
              <label className={LABEL}>Fuero</label>
              <input
                type="text"
                value={editLocal.fuero}
                onChange={e => setEditLocal(prev => ({ ...prev, fuero: e.target.value }))}
                className="field"
              />
            </div>
            <div>
              <label className={LABEL}>Pretensión</label>
              <input
                type="text"
                value={editLocal.pretension}
                onChange={e => setEditLocal(prev => ({ ...prev, pretension: e.target.value }))}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Probabilidad</label>
            <select
              value={editLocal.chances_estimadas}
              onChange={e => setEditLocal(prev => ({ ...prev, chances_estimadas: e.target.value as DiagnosticoModulo['chances_estimadas'] }))}
              className="field w-auto"
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="sin_datos">Sin datos</option>
            </select>
          </div>

          <div>
            <label className={LABEL}>Análisis</label>
            <textarea
              rows={4}
              value={editLocal.observaciones}
              onChange={e => setEditLocal(prev => ({ ...prev, observaciones: e.target.value }))}
              className="field resize-y"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
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
                    className="field min-w-0 flex-1 py-1.5"
                  />
                  <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, acciones_recomendadas: prev.acciones_recomendadas.filter((_, j) => j !== i) }))} className="btn btn-icon h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, acciones_recomendadas: [...prev.acciones_recomendadas, ''] }))} className="dashboard-link flex items-center gap-1 text-xs">
                <Plus className="h-3 w-3" /> Agregar acción
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
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
                    className="field min-w-0 flex-1 py-1.5"
                  />
                  <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, riesgos: (prev.riesgos ?? []).filter((_, j) => j !== i) }))} className="btn btn-icon h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setEditLocal(prev => ({ ...prev, riesgos: [...(prev.riesgos ?? []), ''] }))} className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400">
                <Plus className="h-3 w-3" /> Agregar riesgo
              </button>
            </div>
          </div>

          <div>
            <label className={LABEL}>Nota sobre honorarios</label>
            <textarea
              rows={2}
              value={editLocal.descripcion_honorarios ?? ''}
              onChange={e => setEditLocal(prev => ({ ...prev, descripcion_honorarios: e.target.value }))}
              className="field resize-y"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveModulo}
            disabled={update.isPending}
            className="btn btn-primary w-full"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar módulo
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="eyebrow mb-1">Fuero</div>
              <div className="text-zinc-800 dark:text-zinc-200">{modulo.fuero}</div>
            </div>
            <div>
              <div className="eyebrow mb-1">Pretensión</div>
              <div className="text-zinc-800 dark:text-zinc-200">{modulo.pretension}</div>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-1">Análisis</div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{modulo.observaciones}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="eyebrow mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Acciones recomendadas
              </div>
              <ol className="text-sm space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
                {modulo.acciones_recomendadas.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
            {modulo.riesgos && modulo.riesgos.length > 0 && (
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Riesgos
                </div>
                <ul className="text-sm space-y-1.5 list-disc list-inside text-zinc-700 dark:text-zinc-300">
                  {modulo.riesgos.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>

          {modulo.descripcion_honorarios && (
            <div className="dashboard-panel-muted px-3 py-2 text-[11.5px] text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Honorarios sugeridos:</span> {modulo.descripcion_honorarios}
            </div>
          )}

          {modulo.checklist_cliente && modulo.checklist_cliente.length > 0 && (
            <div className="border-t border-zinc-200/70 dark:border-white/[0.06] pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="eyebrow flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  Documentación a solicitar
                </div>
                <button
                  type="button"
                  onClick={handleAgregarChecklistAlSeguimiento}
                  className="btn btn-ghost btn-sm"
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
                      className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 accent-cyan-600 dark:border-zinc-600"
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
  PENDIENTE: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  EN_PROGRESO: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  COMPLETADA: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CANCELADA: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
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
            ? 'flex items-center justify-center border-emerald-500 bg-emerald-500'
            : 'border-zinc-300 hover:border-emerald-500 dark:border-white/20',
        )}
        title={completada ? 'Completada' : 'Marcar como completada'}
      >
        {completada && <Check className="h-2.5 w-2.5 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-sm font-semibold text-zinc-800 dark:text-zinc-100', completada && 'line-through')}>
            {tarea.titulo}
          </span>
          <span className={cn(TAG, ESTADO_TAREA_STYLE[tarea.estado] ?? ESTADO_TAREA_STYLE.PENDIENTE)}>
            {ESTADO_TAREA_LABEL[tarea.estado] ?? tarea.estado}
          </span>
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORIDAD_DOT[tarea.prioridad] ?? PRIORIDAD_DOT.MEDIA)} title={tarea.prioridad} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium tabular-nums text-zinc-500">
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
              className="dashboard-link inline-flex items-center gap-0.5"
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
    <div className="app-card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-[var(--brand-accent)]" />
          <h2 className={CARD_TITLE}>Tareas</h2>
          {tareas.length > 0 && (
            <span className="tag-mono">
              {tareas.filter(t => t.estado !== 'COMPLETADA').length} pendientes
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="btn btn-ghost btn-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </button>
      </div>

      {isLoading && <div className="h-8 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.05]" />}

      {!isLoading && tareas.length === 0 && (
        <p className="text-xs font-medium text-zinc-500">Sin tareas vinculadas a esta consulta.</p>
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
      {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-zinc-100 dark:bg-white/[0.05]" />)}
    </div>
  )
  if (error || !consulta) return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm font-medium text-red-700 dark:text-red-300">
        No se pudo cargar la consulta.
      </div>
    </div>
  )

  const diag = consulta.diagnostico_ia
  const hasModulos = !!(diag?.modulos && diag.modulos.length > 0)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
        <Link to="/consultas" className="dashboard-link flex shrink-0 items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Consultas
        </Link>
        <span className="text-zinc-400 dark:text-zinc-600">/</span>
        <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">{nombreCliente || 'Consulta'}</span>
      </div>


      {/* Header */}
      <div className="app-card p-5">
        {editandoDatos ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Nombre *</label>
                <input
                  type="text"
                  value={datosEdit.nombre}
                  onChange={e => setDatosEdit(f => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                  className="field"
                />
              </div>
              <div>
                <label className={LABEL}>Apellido</label>
                <input
                  type="text"
                  value={datosEdit.apellido}
                  onChange={e => setDatosEdit(f => ({ ...f, apellido: e.target.value }))}
                  className="field"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Teléfono</label>
                <input
                  type="tel"
                  value={datosEdit.telefono}
                  onChange={e => setDatosEdit(f => ({ ...f, telefono: e.target.value }))}
                  className="field"
                />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input
                  type="email"
                  value={datosEdit.email}
                  onChange={e => setDatosEdit(f => ({ ...f, email: e.target.value }))}
                  className="field"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Cómo llegó</label>
                <select
                  value={datosEdit.canal}
                  onChange={e => setDatosEdit(f => ({ ...f, canal: e.target.value as ConsultaCanal }))}
                  className="field"
                >
                  {Object.entries(CANAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Tipo de asunto</label>
                <select
                  value={datosEdit.tipo_asunto}
                  onChange={e => setDatosEdit(f => ({ ...f, tipo_asunto: e.target.value as ConsultaTipoAsunto }))}
                  className="field"
                >
                  {Object.entries(TIPO_ASUNTO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditandoDatos(false)}
                className="btn btn-ghost border-transparent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDatos}
                disabled={update.isPending}
                className="btn btn-primary"
              >
                {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="page-title break-words text-xl sm:text-[1.4rem]">{nombreCliente || consulta.nombre}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>{TIPO_ASUNTO_LABEL[consulta.tipo_asunto]}</span>
                <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>·</span>
                <span>{CANAL_LABEL[consulta.canal]}</span>
                {consulta.telefono && <><span className="text-zinc-400 dark:text-zinc-600" aria-hidden>·</span><span className="flex items-center gap-1 tabular-nums"><Phone className="h-3.5 w-3.5" />{consulta.telefono}</span></>}
                {consulta.email && <><span className="text-zinc-400 dark:text-zinc-600" aria-hidden>·</span><span className="flex min-w-0 items-center gap-1 break-all"><Mail className="h-3.5 w-3.5 shrink-0" />{consulta.email}</span></>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Estado badge (solo lectura — el pipeline maneja transiciones) */}
              <span className={cn(TAG, 'px-2.5 py-0.5 text-[11px]', ESTADO_STYLE[consulta.estado])}>
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
                className="btn btn-ghost btn-icon h-8 w-8"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {/* Eliminar consulta */}
              <button
                type="button"
                title="Eliminar consulta"
                onClick={handleDelete}
                disabled={deleteConsulta.isPending}
                className="btn btn-ghost btn-icon h-8 w-8 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
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
      <div className="app-card space-y-3 p-5">
        <div>
          <h2 className={CARD_TITLE}>1. Entrevista</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Transcribí la charla con el cliente o cargá apuntes. Al terminar, lo nuevo se incorpora a los hechos del caso.</p>
        </div>
        <ConsultaContextos consultaId={consulta.id} onIncorporar={(texto, marcas) => setIncorporar({ texto, marcas })} />
      </div>

      {/* 2. Hechos del caso */}
      <div className="app-card space-y-3 p-5">
        <h2 className={CARD_TITLE}>2. Hechos del caso</h2>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Describí los hechos del caso: qué pasó, cuándo, quiénes están involucrados, qué quiere el cliente, montos si aplica… (lo que surja de la entrevista se agrega acá)"
          rows={8}
          className="field resize-y py-3"
        />

        {/* Selector de áreas del derecho */}
        <div className="border-t border-zinc-200/70 dark:border-white/[0.06] pt-3">
          <div className="eyebrow mb-2">Áreas del derecho involucradas</div>
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
                  aria-pressed={activa}
                  className="chip"
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
            className="btn btn-ghost btn-sm"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar notas
          </button>
          <button
            type="button"
            onClick={handleOrdenarHechos}
            disabled={ordenarHechos.isPending || (!notas.trim() && !hayEntrevista)}
            className="btn btn-primary"
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
              className="btn btn-primary"
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
      <div className="app-card space-y-3 p-5">
        <h2 className={CARD_TITLE}>3. Documentación</h2>
        <div>
          <h3 className="eyebrow mb-2">Documentos adjuntos</h3>
          <ConsultaAdjuntos consultaId={consulta.id} />
        </div>
        <div className="border-t border-zinc-200/70 dark:border-white/[0.06] pt-3">
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
        <div className="app-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className={CARD_TITLE}>Diagnóstico jurídico</h2>
            {hasModulos && !isSecretaria && (
              <AgregarArea excluidas={diag.modulos!.map(m => m.area)} onElegir={a => { void handleAgregarArea(a) }} disabled={update.isPending} />
            )}
            {/* Botón editar solo para diagnósticos legacy (sin módulos) */}
            {!hasModulos && (
              <div className="flex items-center gap-2">
                {!editandoDiag ? (
                  <>
                    <span className={cn(TAG, 'px-2.5 py-0.5 text-[11px]', CHANCES_STYLE[diag.chances_estimadas ?? 'sin_datos'])}>
                      {CHANCES_LABEL[diag.chances_estimadas ?? 'sin_datos']}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setDiagEdit({ ...diag }); setEditandoDiag(true) }}
                      className="btn btn-ghost btn-sm"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditandoDiag(false); setDiagEdit(null) }}
                    className="btn btn-ghost btn-sm"
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
                  <label className={LABEL}>Fuero</label>
                  <input
                    type="text"
                    value={diagEdit.fuero ?? ''}
                    onChange={e => setDiagEdit(prev => prev ? { ...prev, fuero: e.target.value } : prev)}
                    className="field"
                  />
                </div>
                <div>
                  <label className={LABEL}>Pretensión</label>
                  <input
                    type="text"
                    value={diagEdit.pretension ?? ''}
                    onChange={e => setDiagEdit(prev => prev ? { ...prev, pretension: e.target.value } : prev)}
                    className="field"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Probabilidad</label>
                <select
                  value={diagEdit.chances_estimadas}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, chances_estimadas: e.target.value as DiagnosticoIA['chances_estimadas'] } : prev)}
                  className="field w-auto"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                  <option value="sin_datos">Sin datos</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Análisis</label>
                <textarea
                  rows={5}
                  value={diagEdit.observaciones ?? ''}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, observaciones: e.target.value } : prev)}
                  className="field resize-y"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
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
                        className="field min-w-0 flex-1 py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => setDiagEdit(prev => prev ? { ...prev, acciones_recomendadas: (prev.acciones_recomendadas ?? []).filter((_, j) => j !== i) } : prev)}
                        className="btn btn-icon h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiagEdit(prev => prev ? { ...prev, acciones_recomendadas: [...(prev.acciones_recomendadas ?? []), ''] } : prev)}
                    className="dashboard-link flex items-center gap-1 text-xs"
                  >
                    <Plus className="h-3 w-3" /> Agregar acción
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
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
                        className="field min-w-0 flex-1 py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => setDiagEdit(prev => prev ? { ...prev, riesgos: (prev.riesgos ?? []).filter((_, j) => j !== i) } : prev)}
                        className="btn btn-icon h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiagEdit(prev => prev ? { ...prev, riesgos: [...(prev.riesgos ?? []), ''] } : prev)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
                  >
                    <Plus className="h-3 w-3" /> Agregar riesgo
                  </button>
                </div>
              </div>

              <div>
                <label className={LABEL}>Nota sobre honorarios</label>
                <textarea
                  rows={2}
                  value={diagEdit.descripcion_honorarios ?? ''}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, descripcion_honorarios: e.target.value } : prev)}
                  className="field resize-y"
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
                className="btn btn-primary w-full"
              >
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar diagnóstico
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="eyebrow mb-1">Fuero</div>
                  <div className="text-zinc-800 dark:text-zinc-200">{diag.fuero ?? '—'}</div>
                </div>
                <div>
                  <div className="eyebrow mb-1">Pretensión</div>
                  <div className="text-zinc-800 dark:text-zinc-200">{diag.pretension ?? '—'}</div>
                </div>
              </div>

              <div>
                <div className="eyebrow mb-1">Análisis</div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{diag.observaciones ?? ''}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="eyebrow mb-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Acciones recomendadas
                  </div>
                  <ol className="text-sm space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
                    {(diag.acciones_recomendadas ?? []).map((a, i) => <li key={i}>{a}</li>)}
                  </ol>
                </div>
                {(diag.riesgos?.length ?? 0) > 0 && (
                  <div>
                    <div className="eyebrow mb-2 flex items-center gap-1">
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
                <div className="dashboard-panel-muted px-3 py-2 text-[11.5px] text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium">Honorarios sugeridos:</span> {diag.descripcion_honorarios}
                </div>
              )}

              {diag.checklist_cliente && diag.checklist_cliente.length > 0 && (
                <div className="border-t border-zinc-200/70 dark:border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="eyebrow flex items-center gap-1.5">
                      <ListChecks className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      Documentación / información a solicitar al cliente
                    </div>
                    <button
                      type="button"
                      onClick={handleAgregarChecklistAlSeguimiento}
                      className="btn btn-ghost btn-sm"
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
                          className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 accent-cyan-600 dark:border-zinc-600"
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
        <div className="app-card space-y-3 p-5">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-[var(--brand-accent)]" />
            <h2 className={CARD_TITLE}>Observaciones del abogado</h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Agregá todo lo que el diagnóstico IA omitió o que querés dejar asentado: daño punitivo, defensa del empleador, etc.
          </p>
          <textarea
            value={notasAbogado}
            onChange={e => setNotasAbogado(e.target.value)}
            placeholder="Ej: agregar daño punitivo — el empleador ya fue condenado antes. Considerar art. 80 LCT por falta de entrega de documentación…"
            rows={5}
            className="field resize-y py-3"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveNotasAbogado}
              disabled={update.isPending || notasAbogado === (consulta.notas_abogado ?? '')}
              className="btn btn-ghost btn-sm"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar observaciones
            </button>
            <button
              type="button"
              onClick={handleEnriquecerConIA}
              disabled={enriqueciendo || !notasAbogado.trim()}
              className="btn btn-primary btn-sm"
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
        <div ref={presupuestoSectionRef} className="app-card scroll-mt-4 space-y-4 p-5">
          <div>
            <h2 className={CARD_TITLE}>Honorarios</h2>
            <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Cada juicio, actuación administrativa o gestión con su honorario, agrupados por área.</p>
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
          <div className="app-card space-y-3 p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-500" />
              <h2 className={CARD_TITLE}>Documento para el cliente</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {modos.length > 1 && (
                <div className="segmented" role="group" aria-label="Qué incluye el documento">
                  {modos.map(m => (
                    <button key={m.id} type="button" onClick={() => setDocModo(m.id)} aria-pressed={modoEfectivo === m.id}
                      className="px-3 text-xs font-semibold">
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              {areasDoc.length > 1 && (
                <select value={docArea} onChange={e => setDocArea(e.target.value)} aria-label="Alcance del documento"
                  className="field h-9 w-auto py-0 text-xs">
                  <option value="">Todas las áreas</option>
                  {areasDoc.map(a => <option key={a} value={a}>Solo {etiquetaArea(a).toLowerCase()}</option>)}
                </select>
              )}
              <button type="button" onClick={() => { if (docModo !== modoEfectivo) setDocModo(modoEfectivo); void handleImprimirDocumento() }} disabled={imprimiendo}
                className="btn btn-primary ml-auto">
                {imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Imprimir o guardar PDF
              </button>
            </div>
            <p className="text-[11px] font-medium text-zinc-500">
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
            className="btn btn-primary"
          >
            <FolderPlus className="h-4 w-4" />
            Convertir a expediente
          </button>
        </div>
      )}

      {/* Tareas vinculadas */}
      <TareasConsultaSection consultaId={consulta.id} />

      {/* Actividad / Seguimiento */}
      <div className="app-card space-y-3 p-5">
        <h2 className={CARD_TITLE}>Seguimiento administrativo</h2>
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
