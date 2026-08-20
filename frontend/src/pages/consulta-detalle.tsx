import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  useConsulta, useUpdateConsulta, useDeleteConsulta,
  usePresupuestos, useUpsertPresupuesto, useDeletePresupuesto,
  useConsultaActividad, useAddConsultaActividad, useOrdenarHechos,
  calcularHonorarios, ARANCEL_VERBAL, ARANCEL_ESCRITO,
  TIPO_ASUNTO_LABEL, CANAL_LABEL, ESTADO_LABEL, HONORARIO_LABEL,
  type ConsultaEstado, type ConsultaTipoAsunto, type ConsultaCanal, type TipoHonorario,
  type Presupuesto, type DiagnosticoIA, type DiagnosticoModulo, type IntimacionDoc,
} from '@/hooks/use-consultas'
import { useAuthStore } from '@/stores/auth-store'
import { ConsultaPdfPreview } from '@/components/consultas/consulta-pdf-preview'
import { IntimacionPdfPreview } from '@/components/consultas/intimacion-pdf-preview'
import type { TipoIntimacion } from '@/components/consultas/intimacion-pdf-preview'
import { ConsultaAnclasPanel } from '@/components/consultas/consulta-anclas-panel'
import { DanosCalculosPanel } from '@/components/danos/danos-calculos-panel'
import { ConsultaContextos } from '@/components/consultas/consulta-contextos'
import { ConsultaHechosOrdenados } from '@/components/consultas/consulta-hechos-ordenados'
import { ConsultaSolicitudDocs } from '@/components/consultas/consulta-solicitud-docs'
import { ConsultaPipeline } from '@/components/consultas/consulta-pipeline'
import { ConsultaAdjuntos } from '@/components/consultas/consulta-adjuntos'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import {
  ArrowLeft, Sparkles, FolderPlus,
  Phone, Mail, Calendar, MessageSquare,
  CheckCircle2, AlertTriangle, Save,
  Loader2, Download, FileText, NotebookPen, Wand2, ListChecks,
  Pencil, Trash2, Plus, X,
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

function formatPesos(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

const TIPO_ACTIVIDAD_ICON: Record<string, React.ReactNode> = {
  nota: <MessageSquare className="h-3.5 w-3.5" />,
  llamada: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  reunion: <Calendar className="h-3.5 w-3.5" />,
  cambio_estado: <CheckCircle2 className="h-3.5 w-3.5" />,
}

// ── Presupuesto section (solo abogados) ────────────────────────────────────

function PresupuestoItemForm({
  presupuesto,
  consultaId,
  deletable,
  onSaved,
  onCancel,
  prefillTipo,
  prefillConcepto,
}: {
  presupuesto: Presupuesto | null
  consultaId: string
  deletable?: boolean
  onSaved?: () => void
  onCancel?: () => void
  prefillTipo?: TipoHonorario
  prefillConcepto?: string
}) {
  const upsert = useUpsertPresupuesto()
  const del = useDeletePresupuesto()
  const isNew = !presupuesto

  const [tipo, setTipo] = useState<TipoHonorario>(prefillTipo ?? presupuesto?.tipo_honorario ?? 'arancel_verbal')
  const [montoBase, setMontoBase] = useState(presupuesto?.monto_base?.toString() ?? '')
  const [porcentaje, setPorcentaje] = useState(
    presupuesto?.tipo_honorario === 'cuota_litis'
      ? presupuesto.multiplicador?.toString() ?? '20'
      : '20'
  )
  const [multiplicador, setMultiplicador] = useState(
    presupuesto && presupuesto.tipo_honorario !== 'cuota_litis'
      ? presupuesto.multiplicador?.toString() ?? '1'
      : '1'
  )
  const [concepto, setConcepto] = useState(prefillConcepto ?? presupuesto?.notas ?? '')

  function handleTipoChange(v: TipoHonorario) {
    setTipo(v)
    if (v === 'cuota_litis') setPorcentaje('20')
    else setMultiplicador('1')
  }

  const montoN = parseFloat(montoBase.replace(/\./g, '').replace(',', '.')) || 0
  const pctN = parseFloat(porcentaje.replace(',', '.')) || 20
  const multN = parseFloat(multiplicador.replace(',', '.')) || 1
  const actMultiplicador = tipo === 'cuota_litis' ? pctN : multN
  const calculado = calcularHonorarios(tipo, montoN, actMultiplicador)

  async function handleSave() {
    try {
      await upsert.mutateAsync({
        id: presupuesto?.id,
        consulta_id: consultaId,
        expediente_id: null,
        tipo_honorario: tipo,
        monto_base: montoN || null,
        multiplicador: actMultiplicador,
        honorarios_calculados: calculado,
        descripcion_ia: presupuesto?.descripcion_ia ?? null,
        estado: presupuesto?.estado ?? 'borrador',
        notas: concepto.trim() || null,
      })
      toast.success(isNew ? 'Honorario agregado' : 'Honorario guardado')
      if (isNew && onSaved) onSaved()
    } catch {
      toast.error('No se pudo guardar')
    }
  }

  async function handleDelete() {
    if (!presupuesto) return
    if (!window.confirm('¿Eliminar este honorario?')) return
    try {
      await del.mutateAsync({ id: presupuesto.id, consulta_id: consultaId })
      toast.success('Honorario eliminado')
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Concepto</label>
        <input
          type="text"
          value={concepto}
          onChange={e => setConcepto(e.target.value)}
          placeholder="Ej: Parte laboral, consulta penal…"
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Tipo de honorario</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(HONORARIO_LABEL) as [TipoHonorario, string][]).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => handleTipoChange(v)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-medium text-left transition-all border',
                tipo === v
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300',
              )}
            >
              {l}
              {v === 'arancel_verbal' && <span className="block text-[10px] opacity-70">{formatPesos(ARANCEL_VERBAL)} base</span>}
              {v === 'arancel_escrito' && <span className="block text-[10px] opacity-70">{formatPesos(ARANCEL_ESCRITO)} base</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tipo === 'cuota_litis' && (
          <>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Monto reclamado ($)</label>
              <input
                type="text"
                inputMode="numeric"
                value={montoBase}
                onChange={e => setMontoBase(e.target.value)}
                placeholder="Ej: 5000000"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Porcentaje (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={porcentaje}
                onChange={e => setPorcentaje(e.target.value)}
                placeholder="20"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}
        {tipo === 'honorario_fijo' && (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Honorario fijo ($)</label>
            <input
              type="text"
              inputMode="numeric"
              value={montoBase}
              onChange={e => setMontoBase(e.target.value)}
              placeholder="Ej: 500000"
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        {(tipo === 'arancel_verbal' || tipo === 'arancel_escrito') && (
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Multiplicador</label>
            <select
              value={multiplicador}
              onChange={e => setMultiplicador(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['0.5', '1', '1.2', '1.5', '2', '2.5', '3'].map(v => (
                <option key={v} value={v}>{v}×</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={cn(
        'rounded-xl p-3 flex items-center justify-between',
        calculado > 0
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : 'bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10',
      )}>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Honorarios estimados</span>
        <span className={cn('text-lg font-bold', calculado > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-400')}>
          {calculado > 0 ? formatPesos(calculado) : '—'}
        </span>
      </div>

      <div className="flex gap-2">
        {isNew && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending || calculado <= 0}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? 'Agregar' : 'Guardar'}
        </button>
        {!isNew && deletable && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.isPending}
            className="px-3 py-2 text-sm border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

function PresupuestoSection({
  consultaId,
  prefill,
  onPrefillConsumed,
}: {
  consultaId: string
  prefill?: { tipo: TipoHonorario; concepto: string } | null
  onPrefillConsumed?: () => void
}) {
  const { data: presupuestos = [], isLoading } = usePresupuestos(consultaId)
  const [addingNew, setAddingNew] = useState(false)
  const [newTipoPrefill, setNewTipoPrefill] = useState<TipoHonorario | undefined>()
  const [newConceptoPrefill, setNewConceptoPrefill] = useState<string | undefined>()

  useEffect(() => {
    if (!prefill) return
    setNewTipoPrefill(prefill.tipo)
    setNewConceptoPrefill(prefill.concepto)
    setAddingNew(true)
    onPrefillConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  if (isLoading) return <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />

  const total = presupuestos.reduce((acc, p) => acc + p.honorarios_calculados, 0)

  return (
    <div className="space-y-4">
      {presupuestos.map((p, idx) => (
        <div key={p.id}>
          {idx > 0 && <div className="border-t border-zinc-100 dark:border-white/5 my-4" />}
          {presupuestos.length > 1 && (
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Honorario {idx + 1}{p.notas ? ` — ${p.notas}` : ''}
            </div>
          )}
          <PresupuestoItemForm
            presupuesto={p}
            consultaId={consultaId}
            deletable={presupuestos.length > 1}
          />
        </div>
      ))}

      {presupuestos.length > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 dark:border-white/10 pt-3">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Total honorarios</span>
          <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatPesos(total)}</span>
        </div>
      )}

      {addingNew ? (
        <div className="border border-dashed border-blue-300 dark:border-blue-900/60 rounded-xl p-4">
          <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3">
            Nuevo honorario
          </div>
          <PresupuestoItemForm
            presupuesto={null}
            consultaId={consultaId}
            prefillTipo={newTipoPrefill}
            prefillConcepto={newConceptoPrefill}
            onSaved={() => { setAddingNew(false); setNewTipoPrefill(undefined); setNewConceptoPrefill(undefined) }}
            onCancel={() => { setAddingNew(false); setNewTipoPrefill(undefined); setNewConceptoPrefill(undefined) }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/25 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Agregar otro honorario
        </button>
      )}
    </div>
  )
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
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Domicilio</label>
                <input
                  type="text"
                  value={destDomicilio}
                  onChange={e => setDestDomicilio(e.target.value)}
                  placeholder="Calle y número, ciudad"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">D.N.I.</label>
                <input
                  type="text"
                  value={remDni}
                  onChange={e => setRemDni(e.target.value)}
                  placeholder="12.345.678"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-lg disabled:opacity-50 transition-all"
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
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
          className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-2 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

function ModuloDiagnostico({
  modulo,
  idx,
  total,
  consultaId,
  diagModulos,
  onCrearHonorario,
}: {
  modulo: DiagnosticoModulo
  idx: number
  total: number
  consultaId: string
  diagModulos: DiagnosticoModulo[]
  onCrearHonorario: (tipo: TipoHonorario, concepto: string) => void
}) {
  const update = useUpdateConsulta()
  const addActividad = useAddConsultaActividad()
  const [editando, setEditando] = useState(false)
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
    <div className="border border-zinc-100 dark:border-white/5 rounded-xl p-4 space-y-3">
      {/* Header del módulo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {total > 1 && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 rounded-full px-2.5 py-0.5">
              {areaLabel}
            </span>
          )}
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', CHANCES_STYLE[modulo.chances_estimadas])}>
            {CHANCES_LABEL[modulo.chances_estimadas]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCrearHonorario(modulo.tipo_honorario_sugerido, areaLabel)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
          >
            <Plus className="h-3 w-3" /> Crear honorario
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Fuero</label>
              <input
                type="text"
                value={editLocal.fuero}
                onChange={e => setEditLocal(prev => ({ ...prev, fuero: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Pretensión</label>
              <input
                type="text"
                value={editLocal.pretension}
                onChange={e => setEditLocal(prev => ({ ...prev, pretension: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Probabilidad</label>
            <select
              value={editLocal.chances_estimadas}
              onChange={e => setEditLocal(prev => ({ ...prev, chances_estimadas: e.target.value as DiagnosticoModulo['chances_estimadas'] }))}
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveModulo}
            disabled={update.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
                      className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
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
  const [prefilledPresupuesto, setPrefilledPresupuesto] = useState<{ tipo: TipoHonorario; concepto: string } | null>(null)
  const pdfDiagRef = useRef<HTMLDivElement>(null)
  const pdfPresupuestoRef = useRef<HTMLDivElement>(null)
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
    if (!id || !notas.trim()) {
      toast.error('Escribí los hechos del caso primero')
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
      await ordenarHechos.mutateAsync(id)
      toast.success('Hechos ordenados. La consulta fue asignada a Claudio para revisión.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo ordenar los hechos')
    }
  }, [id, notas, consulta, areasActivas, update, ordenarHechos])

  const handleGenerarDiagnostico = useCallback(async () => {
    if (!consulta || !notas.trim()) {
      toast.error('Escribí los hechos del caso primero')
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
  }, [consulta, notas, supabase, update])

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

  const openPrint = useCallback((ref: React.RefObject<HTMLDivElement | null>, title: string) => {
    const content = ref.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: white; }
        .consulta-pdf-doc { width: 21cm; margin: 0; }
        .consulta-pdf-cover { page-break-after: always; }
        .consulta-pdf-content { page-break-before: always; }
        @media print {
          html, body { width: 21cm; }
          .consulta-pdf-cover { height: 29.7cm; page-break-after: always; }
        }
      </style>
    </head><body>${content}</body></html>`)
    w.document.close()
    w.onafterprint = () => w.close()
    setTimeout(() => { w.focus(); w.print(); }, 300)
  }, [])

  const nombreCliente = [consulta?.apellido, consulta?.nombre].filter(Boolean).join(', ')
  const handlePrintDiagnostico = useCallback(() => {
    openPrint(pdfDiagRef, `Diagnóstico — ${nombreCliente}`)
  }, [openPrint, pdfDiagRef, nombreCliente])

  const handlePrintPresupuesto = useCallback(() => {
    openPrint(pdfPresupuestoRef, `Presupuesto — ${nombreCliente}`)
  }, [openPrint, pdfPresupuestoRef, nombreCliente])

  const handleConvertir = useCallback(async () => {
    if (!consulta) return
    const nombre = consulta.nombre
    const apellido = consulta.apellido ?? ''
    navigate(`/expedientes/nuevo?consulta_id=${consulta.id}&nombre=${encodeURIComponent(nombre)}&apellido=${encodeURIComponent(apellido)}&tipo_asunto=${consulta.tipo_asunto}`)
  }, [consulta, navigate])

  const handleCrearHonorario = useCallback((tipo: TipoHonorario, concepto: string) => {
    setPrefilledPresupuesto({ tipo, concepto })
    setTimeout(() => presupuestoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [])

  const handlePrefillConsumed = useCallback(() => setPrefilledPresupuesto(null), [])

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
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5">
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Apellido</label>
                <input
                  type="text"
                  value={datosEdit.apellido}
                  onChange={e => setDatosEdit(f => ({ ...f, apellido: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={datosEdit.email}
                  onChange={e => setDatosEdit(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cómo llegó</label>
                <select
                  value={datosEdit.canal}
                  onChange={e => setDatosEdit(f => ({ ...f, canal: e.target.value as ConsultaCanal }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(CANAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tipo de asunto</label>
                <select
                  value={datosEdit.tipo_asunto}
                  onChange={e => setDatosEdit(f => ({ ...f, tipo_asunto: e.target.value as ConsultaTipoAsunto }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
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

      {/* Hechos del caso */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Hechos del caso</h2>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Describí los hechos del caso: qué pasó, cuándo, quiénes están involucrados, qué quiere el cliente, montos si aplica…"
          rows={8}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />

        {/* Grabaciones, documentos y apuntes adicionales */}
        <div className="border-t border-zinc-100 dark:border-white/5 pt-3">
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Contexto adicional (grabaciones, documentos, apuntes)</h3>
          <ConsultaContextos consultaId={consulta.id} />
        </div>

        {/* Documentos adjuntos (PDF / imágenes) */}
        <div className="border-t border-zinc-100 dark:border-white/5 pt-3">
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Documentos adjuntos</h3>
          <ConsultaAdjuntos consultaId={consulta.id} />
        </div>

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
            disabled={ordenarHechos.isPending || !notas.trim()}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg transition-all disabled:opacity-50 shadow-sm"
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
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-lg transition-all disabled:opacity-50 shadow-sm"
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

      {/* Hechos ordenados con IA */}
      {consulta.hechos_ordenados && (
        <ConsultaHechosOrdenados
          consultaId={consulta.id}
          hechosOrdenados={consulta.hechos_ordenados}
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

      {/* Diagnóstico IA */}
      {diag && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Diagnóstico jurídico</h2>
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
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Pretensión</label>
                  <input
                    type="text"
                    value={diagEdit.pretension ?? ''}
                    onChange={e => setDiagEdit(prev => prev ? { ...prev, pretension: e.target.value } : prev)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Probabilidad</label>
                <select
                  value={diagEdit.chances_estimadas}
                  onChange={e => setDiagEdit(prev => prev ? { ...prev, chances_estimadas: e.target.value as DiagnosticoIA['chances_estimadas'] } : prev)}
                  className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
                        className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
                          className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
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
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
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
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
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

      {/* Presupuesto — solo abogados */}
      {!isSecretaria && diag && (
        <div ref={presupuestoSectionRef} className="rounded-xl border border-violet-200 dark:border-violet-900/30 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Presupuesto de honorarios</h2>
          <PresupuestoSection
            consultaId={consulta.id}
            prefill={prefilledPresupuesto}
            onPrefillConsumed={handlePrefillConsumed}
          />
        </div>
      )}

      {/* Acciones */}
      {(diag || (!isSecretaria && consulta.estado !== 'descartada')) && (
        <div className="flex flex-wrap gap-3">
          {diag && (
            <>
              <button
                type="button"
                onClick={handlePrintDiagnostico}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-200 dark:border-white/10 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Diagnóstico PDF
              </button>
              {presupuestos.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrintPresupuesto}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-violet-300 dark:border-violet-700 hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg text-violet-700 dark:text-violet-300 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Presupuesto PDF
                </button>
              )}
            </>
          )}
          {consulta.estado !== 'convertida' && consulta.estado !== 'descartada' && (
            <button
              type="button"
              onClick={handleConvertir}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <FolderPlus className="h-4 w-4" />
              Convertir a expediente
            </button>
          )}
        </div>
      )}

      {/* Actividad / Seguimiento */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Seguimiento administrativo</h2>
        <ActividadSection consultaId={consulta.id} />
      </div>

      {/* PDFs invisibles — solo para impresión */}
      <div className="sr-only">
        <ConsultaPdfPreview
          ref={pdfDiagRef}
          consulta={{ ...consulta, notas_libres: notas }}
          presupuestos={presupuestos}
          abogadoNombre="Dr. Marco Rossi"
          mode="diagnostico"
          notasAbogado={notasAbogado || null}
        />
        <ConsultaPdfPreview
          ref={pdfPresupuestoRef}
          consulta={{ ...consulta, notas_libres: notas }}
          presupuestos={presupuestos}
          abogadoNombre="Dr. Marco Rossi"
          mode="presupuesto"
        />
      </div>
    </div>
  )
}
