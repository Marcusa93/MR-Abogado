import { useState, useEffect, useRef } from 'react'
import { useNavigate, useBlocker, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useCreateExpediente } from '@/hooks/use-expedientes'
import { useTiposProceso } from '@/hooks/use-proceso'
import { toast } from '@/stores/toast-store'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS, ESTADO_INTERNO_VALUES, ESTADO_INTERNO_LABELS, type EstadoInterno } from '@/types/enums'
import type { Prioridad } from '@/types/enums'
import { createClient } from '@/lib/supabase/client'

const ESTADOS_CREACION: { value: string; label: string }[] = ESTADO_INTERNO_VALUES.map(
  (v) => ({ value: v, label: ESTADO_INTERNO_LABELS[v] })
)
import { ArrowLeft, Loader2, Save, UserPlus, ArrowRightCircle } from 'lucide-react'

import { ClienteCombobox } from '@/components/clientes/cliente-combobox'

// ---------------------------------------------------------------------------
// Fueros
// ---------------------------------------------------------------------------

const FUERO_OPTIONS: { value: string; label: string }[] = [
  { value: 'civil',                 label: 'Civil' },
  { value: 'laboral',               label: 'Laboral' },
  { value: 'penal',                 label: 'Penal' },
  { value: 'familia',               label: 'Familia' },
  { value: 'administrativo',        label: 'Administrativo' },
  { value: 'comercial',             label: 'Comercial' },
  { value: 'previsional',           label: 'Previsional' },
  { value: 'documentos_locaciones', label: 'Documentos y Locaciones' },
  { value: 'mediacion',             label: 'Mediación' },
  { value: 'otro',                  label: 'Otro' },
]

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300'
const errorClass = 'mt-1 text-xs text-rose-500'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TIPO_ASUNTO_TO_FUERO: Record<string, string> = {
  laboral_trabajador: 'laboral',
  laboral_empleador:  'laboral',
  civil:              'civil',
  familia:            'familia',
  previsional:        'previsional',
  penal:              'penal',
}

export default function NuevoExpedientePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const desdeConsultaId = searchParams.get('desde_consulta')
  const createExpediente = useCreateExpediente()
  const { data: tiposProceso = [] } = useTiposProceso()

  const [clienteId, setClienteId] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('MEDIA')
  const [estadoInicial, setEstadoInicial] = useState('NUEVA_CONSULTA')
  const [fuero, setFuero] = useState('')
  const [tipoProcesoid, setTipoProcesoid] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [consultaBanner, setConsultaBanner] = useState<{ label: string } | null>(null)

  useEffect(() => {
    if (!desdeConsultaId) return
    const sb = createClient() as any
    sb.from('consultas')
      .select('nombre, apellido, tipo_asunto, prioridad')
      .eq('id', desdeConsultaId)
      .single()
      .then(({ data }: any) => {
        if (!data) return
        const label = data.apellido ? `${data.apellido}, ${data.nombre}` : data.nombre
        setConsultaBanner({ label })
        if (data.prioridad) setPrioridad(data.prioridad as Prioridad)
        const fueroMapped = TIPO_ASUNTO_TO_FUERO[data.tipo_asunto]
        if (fueroMapped) setFuero(fueroMapped)
      })
  }, [desdeConsultaId])

  // Materias del fuero seleccionado
  const materias = fuero ? tiposProceso.filter((t) => t.fuero === fuero) : []

  // Reset materia al cambiar fuero
  useEffect(() => {
    setTipoProcesoid('')
  }, [fuero])

  const isDirty = !submitted && (clienteId.length > 0 || observaciones.trim().length > 0)

  const blocker = useBlocker(isDirty)
  const proceedingRef = useRef(false)

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const isValid = clienteId.length > 0

  const handleSubmit = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      setSubmitted(true)
      const result = await createExpediente.mutateAsync({
        cliente_id: clienteId,
        prioridad,
        estado_interno: estadoInicial as EstadoInterno,
        observaciones: observaciones.trim() || null,
        fuero: fuero || null,
        tipo_proceso_id: tipoProcesoid || null,
      })

      const newId: string | null =
        result && typeof result === 'object' && 'id' in result
          ? (result as any).id
          : typeof result === 'string' ? result : null

      if (desdeConsultaId && newId) {
        const sb = createClient() as any
        await sb
          .from('consultas')
          .update({
            convertida_expediente_id: newId,
            estado: 'convertida',
            updated_at: new Date().toISOString(),
          })
          .eq('id', desdeConsultaId)
      }

      toast.success('Expediente creado correctamente')
      navigate(newId ? `/expedientes/${newId}` : '/expedientes')
    } catch {
      setSubmitted(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Back + Title */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Nuevo Expediente
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          El número de expediente se genera automáticamente (EXP-{new Date().getFullYear()}-XXXX).
        </p>
        {consultaBanner && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/10 px-3 py-2">
            <ArrowRightCircle className="h-4 w-4 shrink-0 text-purple-500" />
            <span className="text-sm text-purple-700 dark:text-purple-300">
              Convirtiendo consulta de <strong>{consultaBanner.label}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="glass-card rounded-xl p-6">
        <div className="space-y-5">
          {/* Cliente */}
          <div>
            <label className={labelClass}>Cliente *</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <ClienteCombobox value={clienteId} onChange={setClienteId} />
              </div>
              <button
                type="button"
                onClick={() => navigate('/clientes/nuevo')}
                className="flex h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-white/5"
                title="Crear cliente nuevo"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {touched && !clienteId && (
              <p className={errorClass}>Seleccioná un cliente</p>
            )}
          </div>

          {/* Fuero + Materia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fuero</label>
              <select
                value={fuero}
                onChange={(e) => setFuero(e.target.value)}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {FUERO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Materia</label>
              <select
                value={tipoProcesoid}
                onChange={(e) => setTipoProcesoid(e.target.value)}
                disabled={!fuero || materias.length === 0}
                className={inputClass}
              >
                <option value="">{fuero && materias.length > 0 ? 'Sin especificar' : '— Seleccioná un fuero —'}</option>
                {materias.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Prioridad + Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                className={inputClass}
              >
                {PRIORIDAD_VALUES.map((p) => (
                  <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estado inicial</label>
              <p className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-400">Si el trámite ya fue iniciado, seleccioná el estado actual</p>
              <select
                value={estadoInicial}
                onChange={(e) => setEstadoInicial(e.target.value)}
                className={inputClass}
              >
                {ESTADOS_CREACION.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/5 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createExpediente.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-5 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createExpediente.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Crear expediente
          </button>
        </div>
      </div>

      {/* Unsaved changes warning */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => { if (!proceedingRef.current) blocker.reset?.() }}
        onConfirm={() => { proceedingRef.current = true; blocker.proceed?.() }}
        title="¿Descartar cambios?"
        description="Tenés cambios sin guardar en este formulario. Si salís ahora, se perderán."
        confirmLabel="Salir sin guardar"
        variant="danger"
      />
    </div>
  )
}
