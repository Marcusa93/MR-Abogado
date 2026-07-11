import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import {
  useConsulta, useUpdateConsulta,
  usePresupuesto, useUpsertPresupuesto,
  useConsultaActividad, useAddConsultaActividad,
  calcularHonorarios, ARANCEL_VERBAL, ARANCEL_ESCRITO,
  TIPO_ASUNTO_LABEL, CANAL_LABEL, ESTADO_LABEL, HONORARIO_LABEL,
  type ConsultaEstado, type ConsultaTipoAsunto, type ConsultaCanal, type TipoHonorario,
} from '@/hooks/use-consultas'
import { useAuthStore } from '@/stores/auth-store'
import { ConsultaPdfPreview } from '@/components/consultas/consulta-pdf-preview'
import { ConsultaAnclasPanel } from '@/components/consultas/consulta-anclas-panel'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import {
  ArrowLeft, Sparkles, FolderPlus,
  Phone, Mail, Calendar, MessageSquare,
  CheckCircle2, AlertTriangle, ChevronDown, Save,
  Loader2, Download, FileText, NotebookPen,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils/date-helpers'

// ── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<ConsultaEstado, string> = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  en_proceso: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  presupuestada: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  convertida: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
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

function PresupuestoSection({ consultaId }: { consultaId: string }) {
  const { data: presupuesto, isLoading } = usePresupuesto(consultaId)
  const upsert = useUpsertPresupuesto()

  const [tipo, setTipo] = useState<TipoHonorario>(() => presupuesto?.tipo_honorario ?? 'arancel_verbal')
  const [montoBase, setMontoBase] = useState(() => presupuesto?.monto_base?.toString() ?? '')
  const [multiplicador, setMultiplicador] = useState(() => presupuesto?.multiplicador?.toString() ?? '1')
  const [notas, setNotas] = useState(() => presupuesto?.notas ?? '')
  const [initialized, setInitialized] = useState(false)

  // Sincronizar cuando llega el presupuesto existente
  if (!initialized && presupuesto && !isLoading) {
    setTipo(presupuesto.tipo_honorario)
    setMontoBase(presupuesto.monto_base?.toString() ?? '')
    setMultiplicador(presupuesto.multiplicador?.toString() ?? '1')
    setNotas(presupuesto.notas ?? '')
    setInitialized(true)
  }

  const montoN = parseFloat(montoBase.replace(/\./g, '').replace(',', '.')) || 0
  const multN = parseFloat(multiplicador.replace(',', '.')) || 1
  const calculado = calcularHonorarios(tipo, montoN, multN)

  async function handleSave() {
    try {
      await upsert.mutateAsync({
        id: presupuesto?.id,
        consulta_id: consultaId,
        expediente_id: null,
        tipo_honorario: tipo,
        monto_base: montoN || null,
        multiplicador: multN,
        honorarios_calculados: calculado,
        descripcion_ia: presupuesto?.descripcion_ia ?? null,
        estado: presupuesto?.estado ?? 'borrador',
        notas: notas || null,
      })
      toast.success('Presupuesto guardado')
    } catch {
      toast.error('No se pudo guardar el presupuesto')
    }
  }

  if (isLoading) return <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />

  return (
    <div className="space-y-4">
      {/* Tipo de honorario */}
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Tipo de honorario</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(HONORARIO_LABEL) as [TipoHonorario, string][]).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTipo(v)}
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
              {v === 'cuota_litis' && <span className="block text-[10px] opacity-70">20% del monto reclamado</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs según tipo */}
      <div className="grid grid-cols-2 gap-3">
        {tipo === 'cuota_litis' || tipo === 'honorario_fijo' ? (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              {tipo === 'cuota_litis' ? 'Monto reclamado estimado ($)' : 'Honorario fijo ($)'}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={montoBase}
              onChange={e => setMontoBase(e.target.value)}
              placeholder="Ej: 5000000"
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ) : (
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
        <div className={tipo === 'cuota_litis' || tipo === 'honorario_fijo' ? 'col-span-2' : ''}>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notas</label>
          <input
            type="text"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Aclaraciones, condiciones de pago…"
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Resultado */}
      <div className={cn(
        'rounded-xl p-4 flex items-center justify-between',
        calculado > 0
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : 'bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10',
      )}>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Honorarios estimados</span>
        <span className={cn(
          'text-xl font-bold',
          calculado > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-400',
        )}>
          {calculado > 0 ? formatPesos(calculado) : '—'}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={upsert.isPending || calculado <= 0}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar presupuesto
      </button>
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

// ── Página principal ────────────────────────────────────────────────────────

export default function ConsultaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)
  const supabase = createClient()

  const { data: consulta, isLoading, error } = useConsulta(id)
  const { data: presupuesto } = usePresupuesto(id)
  const update = useUpdateConsulta()

  const [notas, setNotas] = useState('')
  const [notasInitialized, setNotasInitialized] = useState(false)
  const [notasAbogado, setNotasAbogado] = useState('')
  const [notasAbogadoInitialized, setNotasAbogadoInitialized] = useState(false)
  const [generando, setGenerando] = useState(false)
  const pdfDiagRef = useRef<HTMLDivElement>(null)
  const pdfPresupuestoRef = useRef<HTMLDivElement>(null)

  const isSecretaria = profile?.rol === 'SECRETARIA'

  if (!notasInitialized && consulta) {
    setNotas(consulta.notas_libres ?? '')
    setNotasInitialized(true)
  }
  if (!notasAbogadoInitialized && consulta) {
    setNotasAbogado(consulta.notas_abogado ?? '')
    setNotasAbogadoInitialized(true)
  }

  const handleSaveNotas = useCallback(async () => {
    if (!id) return
    try {
      await update.mutateAsync({ id, notas_libres: notas })
      toast.success('Notas guardadas')
    } catch {
      toast.error('No se pudieron guardar las notas')
    }
  }, [id, notas, update])

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

  const handleEstado = useCallback(async (nuevoEstado: ConsultaEstado) => {
    if (!id) return
    try {
      await update.mutateAsync({ id, estado: nuevoEstado })
      toast.success(`Estado actualizado a "${ESTADO_LABEL[nuevoEstado]}"`)
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }, [id, update])

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
          {/* Estado selector */}
          <div className="relative group shrink-0">
            <button
              type="button"
              className={cn('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all', ESTADO_STYLE[consulta.estado])}
            >
              {ESTADO_LABEL[consulta.estado]}
              <ChevronDown className="h-3 w-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-lg z-10 hidden group-hover:block">
              {(['pendiente', 'en_proceso', 'presupuestada', 'convertida', 'descartada'] as ConsultaEstado[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleEstado(s)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 first:rounded-t-xl last:rounded-b-xl"
                >
                  {ESTADO_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveNotas}
            disabled={update.isPending || notas === consulta.notas_libres}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 rounded-lg transition-colors disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar notas
          </button>
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
        </div>
      </div>

      {/* Normativa y jurisprudencia de referencia */}
      <ConsultaAnclasPanel consultaId={consulta.id} />

      {/* Diagnóstico IA */}
      {diag && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Diagnóstico jurídico</h2>
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', CHANCES_STYLE[diag.chances_estimadas])}>
              {CHANCES_LABEL[diag.chances_estimadas]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Fuero</div>
              <div className="text-zinc-800 dark:text-zinc-200">{diag.fuero}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Pretensión</div>
              <div className="text-zinc-800 dark:text-zinc-200">{diag.pretension}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Análisis</div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{diag.observaciones}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Acciones recomendadas
              </div>
              <ol className="text-sm space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
                {diag.acciones_recomendadas.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
            {diag.riesgos?.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Riesgos
                </div>
                <ul className="text-sm space-y-1.5 list-disc list-inside text-zinc-700 dark:text-zinc-300">
                  {diag.riesgos.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>

          {diag.descripcion_honorarios && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
              <span className="font-medium">Honorarios sugeridos:</span> {diag.descripcion_honorarios}
            </div>
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
          <button
            type="button"
            onClick={handleSaveNotasAbogado}
            disabled={update.isPending || notasAbogado === (consulta.notas_abogado ?? '')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:border-violet-400 hover:text-violet-600 rounded-lg transition-colors disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar observaciones
          </button>
        </div>
      )}

      {/* Presupuesto — solo abogados */}
      {!isSecretaria && diag && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/30 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Presupuesto de honorarios</h2>
          <PresupuestoSection consultaId={consulta.id} />
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
              {presupuesto && (
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
          presupuesto={presupuesto}
          abogadoNombre="Dr. Marco Rossi"
          mode="diagnostico"
          notasAbogado={notasAbogado || null}
        />
        <ConsultaPdfPreview
          ref={pdfPresupuestoRef}
          consulta={{ ...consulta, notas_libres: notas }}
          presupuesto={presupuesto}
          abogadoNombre="Dr. Marco Rossi"
          mode="presupuesto"
        />
      </div>
    </div>
  )
}
