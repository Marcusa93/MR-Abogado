import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'
import { Card } from './detail-helpers'
import { useUpdateExpediente } from '@/hooks/use-expedientes'
import {
  useTiposProceso,
  useEtapasProceso,
  useSentencias,
  useCreateSentencia,
  useDeleteSentencia,
  usePruebaInformativa,
  useCreateOficio,
  useUpdateOficio,
  useDeleteOficio,
  type Sentencia,
  type PruebaInformativa,
} from '@/hooks/use-proceso'
import {
  Scale,
  User,
  Building2,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  ChevronRight,
  AlertCircle,
  Loader2,
  Gavel,
  FileText,
  X,
  Pencil,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function daysFrom(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / 86_400_000)
}

const TIPO_COLORS: Record<string, string> = {
  FAVORABLE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  DESFAVORABLE: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  PARCIAL: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  HOMOLOGACION: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  RECHAZO: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

const TIPO_LABELS: Record<string, string> = {
  FAVORABLE: 'Favorable',
  DESFAVORABLE: 'Desfavorable',
  PARCIAL: 'Parcialmente favorable',
  HOMOLOGACION: 'Homologación',
  RECHAZO: 'Rechazo',
}

const INSTANCIA_LABELS: Record<string, string> = {
  PRIMERA: '1ª instancia',
  SEGUNDA: '2ª instancia (Cámara)',
  CASACION: 'Casación',
  CORTE: 'Corte Suprema',
  ADMINISTRATIVA: 'Administrativa',
}

const OFICIO_ESTADO_CONFIG: Record<
  PruebaInformativa['estado'],
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20', icon: Clock },
  ENVIADO: { label: 'Enviado', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: ChevronRight },
  RECIBIDO: { label: 'Recibido', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  VENCIDO: { label: 'Vencido', color: 'bg-rose-500/15 text-rose-400 border-rose-500/20', icon: AlertCircle },
  DESISTIDO: { label: 'Desistido', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/10', icon: X },
}

// ---------------------------------------------------------------------------
// Inline label + input helpers
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: typeof Scale
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
    />
  )
}

function DateInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
    />
  )
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
    >
      {placeholder && (
        <option value="" className="text-zinc-400">{placeholder}</option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-100">
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Section 1: Proceso y tribunal
// ---------------------------------------------------------------------------

const MATERIAS = [
  { value: 'laboral',        label: 'Laboral' },
  { value: 'civil',          label: 'Civil y Comercial' },
  { value: 'familia',        label: 'Familia' },
  { value: 'administrativo', label: 'Contencioso Administrativo' },
  { value: 'penal',          label: 'Penal' },
  { value: 'previsional',    label: 'Previsional / Seg. Social' },
  { value: 'otro',           label: 'Otro (Consumidor, Laboral Especial…)' },
]

const OGAS = ['OGA 1', 'OGA 2', 'OGA 3', 'OGA 4']
const FUEROS_CON_OGA = new Set(['laboral', 'civil'])
const FUEROS_CON_JUZGADOS = new Set(['laboral', 'civil'])

interface ProcesoTribunalProps {
  expedienteId: string
  fueroActual: string | null
  tipoProcesoidActual: string | null
  etapaActualId: string | null
  juzgadoNumeroActual: number | null
  juezActual: string | null
  ogaActual: string | null
  terminoActual: string | null
}

function ProcesoTribunalCard({
  expedienteId,
  fueroActual,
  tipoProcesoidActual,
  juzgadoNumeroActual,
  juezActual,
  ogaActual,
  terminoActual,
}: ProcesoTribunalProps) {
  const { data: tipos = [] } = useTiposProceso()
  const updateExpediente = useUpdateExpediente()

  const [fuero, setFuero] = useState(fueroActual ?? '')
  const [tipoProcesoid, setTipoProcesoid] = useState(tipoProcesoidActual ?? '')
  const [juzgadoNumero, setJuzgadoNumero] = useState(juzgadoNumeroActual ? String(juzgadoNumeroActual) : '')
  const [juez, setJuez] = useState(juezActual ?? '')
  const [oga, setOga] = useState(ogaActual ?? '')
  const [termino, setTermino] = useState(terminoActual ?? '')
  const [dirty, setDirty] = useState(false)

  function handleChange<T>(setter: (v: T) => void, v: T) {
    setter(v)
    setDirty(true)
  }

  function handleFueroChange(v: string) {
    setFuero(v)
    setTipoProcesoid('')
    setDirty(true)
  }

  const tiposFiltered = tipos.filter(t => t.fuero === 'otro' || t.fuero === fuero)
  const tieneJuzgados = FUEROS_CON_JUZGADOS.has(fuero)
  const tieneOga = FUEROS_CON_OGA.has(fuero)

  async function save() {
    await updateExpediente.mutateAsync({
      id: expedienteId,
      fuero: fuero || null,
      tipo_proceso_id: tipoProcesoid || null,
      juzgado_numero: juzgadoNumero ? Number(juzgadoNumero) : null,
      juez: juez || null,
      oga: oga || null,
      termino_probatorio_vence: termino || null,
    } as any)
    setDirty(false)
  }

  const terminoDays = daysUntil(termino || null)
  const terminoExpired = terminoDays !== null && terminoDays < 0

  return (
    <Card
      title="Proceso y tribunal"
      headerRight={
        dirty ? (
          <button
            onClick={save}
            disabled={updateExpediente.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {updateExpediente.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* Materia */}
        <div className="sm:col-span-2">
          <FieldRow label="Materia" icon={Scale}>
            <SelectInput
              value={fuero}
              onChange={handleFueroChange}
              placeholder="Seleccioná materia"
              options={MATERIAS}
            />
          </FieldRow>
        </div>

        {/* Tipo de proceso — filtrado por materia */}
        <div className="sm:col-span-2">
          <FieldRow label="Tipo de proceso" icon={Gavel}>
            <SelectInput
              value={tipoProcesoid}
              onChange={(v) => handleChange(setTipoProcesoid, v)}
              placeholder="Sin tipo asignado"
              options={tiposFiltered.map((t) => ({ value: t.id, label: t.nombre }))}
            />
          </FieldRow>
        </div>

        {/* Juzgado N° */}
        {tieneJuzgados && (
          <FieldRow label="Juzgado N.º" icon={Building2}>
            <SelectInput
              value={juzgadoNumero}
              onChange={(v) => handleChange(setJuzgadoNumero, v)}
              placeholder="—"
              options={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: `Juzgado N.º ${i + 1}`,
              }))}
            />
          </FieldRow>
        )}

        {/* Juez/a */}
        <FieldRow label="Juez / Jueza" icon={User}>
          <TextInput
            value={juez}
            onChange={(v) => handleChange(setJuez, v)}
            placeholder="Ej.: Dra. García"
          />
        </FieldRow>

        {/* OGA */}
        {tieneOga && (
          <FieldRow label="OGA" icon={Building2}>
            <SelectInput
              value={oga}
              onChange={(v) => handleChange(setOga, v)}
              placeholder="—"
              options={OGAS.map((o) => ({ value: o, label: o }))}
            />
          </FieldRow>
        )}

        {/* Término probatorio */}
        <div className="sm:col-span-2">
          <FieldRow label="Vto. término probatorio" icon={Calendar}>
            <DateInput
              value={termino}
              onChange={(v) => handleChange(setTermino, v)}
            />
          </FieldRow>
          {termino && (
            <p
              className={cn(
                'mt-1.5 text-xs font-medium',
                terminoExpired
                  ? 'text-rose-400'
                  : terminoDays !== null && terminoDays <= 5
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              )}
            >
              {terminoExpired
                ? `Vencido hace ${Math.abs(terminoDays!)} días`
                : terminoDays === 0
                ? 'Vence hoy'
                : `${terminoDays} días restantes`}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 2: Etapas del proceso
// ---------------------------------------------------------------------------

function EtapasCard({
  expedienteId,
  tipoProcesoid,
  etapaActualId,
  etapaActualDesde,
}: {
  expedienteId: string
  tipoProcesoid: string | null
  etapaActualId: string | null
  etapaActualDesde: string | null
}) {
  const { data: etapas = [], isLoading } = useEtapasProceso(tipoProcesoid)
  const updateExpediente = useUpdateExpediente()

  if (!tipoProcesoid) {
    return (
      <Card title="Etapas del proceso">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Seleccioná el tipo de proceso para ver el diagrama de etapas.
        </p>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card title="Etapas del proceso">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      </Card>
    )
  }

  const currentIdx = etapas.findIndex((e) => e.id === etapaActualId)
  const diasEnEtapa = daysFrom(etapaActualDesde)

  async function advanceToEtapa(etapa: (typeof etapas)[0]) {
    await updateExpediente.mutateAsync({
      id: expedienteId,
      etapa_actual_id: etapa.id,
      etapa_actual_desde: new Date().toISOString(),
    } as any)
  }

  return (
    <Card title="Etapas del proceso">
      {currentIdx >= 0 && diasEnEtapa !== null && (
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          En etapa actual hace{' '}
          <span className={cn('font-semibold', diasEnEtapa > 60 ? 'text-rose-400' : 'text-amber-400')}>
            {diasEnEtapa} día{diasEnEtapa !== 1 ? 's' : ''}
          </span>
        </p>
      )}

      <div className="space-y-1.5">
        {etapas.map((etapa, idx) => {
          const isDone = currentIdx >= 0 && idx < currentIdx
          const isActive = etapa.id === etapaActualId
          const isPending = !isDone && !isActive

          return (
            <div
              key={etapa.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                isActive
                  ? 'border-amber-400/30 bg-amber-500/10'
                  : isDone
                  ? 'border-emerald-500/15 bg-emerald-500/5'
                  : 'border-white/5 bg-white/[0.02]'
              )}
            >
              {/* Step marker */}
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isActive ? (
                  <div className="h-5 w-5 rounded-full border-2 border-amber-400 bg-amber-400/20 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-white/15 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-zinc-500">{etapa.orden}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    isActive ? 'text-amber-300' : isDone ? 'text-emerald-400' : 'text-zinc-400'
                  )}
                >
                  {etapa.nombre}
                  {isActive && (
                    <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      actual
                    </span>
                  )}
                </p>
                {etapa.descripcion && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {etapa.descripcion}
                  </p>
                )}
                {etapa.plazo_dias && (
                  <p className={cn('mt-0.5 text-[11px]', etapa.plazo_es_perentorio ? 'text-rose-400' : 'text-zinc-500')}>
                    Plazo: {etapa.plazo_dias} días{etapa.plazo_es_perentorio ? ' · perentorio' : ''}
                  </p>
                )}
              </div>

              {/* Advance button */}
              {isPending && idx === (currentIdx < 0 ? 0 : currentIdx + 1) && (
                <button
                  onClick={() => advanceToEtapa(etapa)}
                  disabled={updateExpediente.isPending}
                  className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-400 transition-colors disabled:opacity-50"
                >
                  Avanzar
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 3: Prueba informativa (oficios)
// ---------------------------------------------------------------------------

const ESTADOS_OFICIO = ['PENDIENTE', 'ENVIADO', 'RECIBIDO', 'VENCIDO', 'DESISTIDO'] as const

function OficioRow({
  oficio,
  expedienteId,
}: {
  oficio: PruebaInformativa
  expedienteId: string
}) {
  const [editing, setEditing] = useState(false)
  const [estado, setEstado] = useState(oficio.estado)
  const [fechaContestado, setFechaContestado] = useState(oficio.fecha_contestado ?? '')
  const [obs, setObs] = useState(oficio.observaciones ?? '')
  const updateOficio = useUpdateOficio(expedienteId)
  const deleteOficio = useDeleteOficio(expedienteId)

  const cfg = OFICIO_ESTADO_CONFIG[oficio.estado]
  const EstadoIcon = cfg.icon

  async function saveEdit() {
    await updateOficio.mutateAsync({
      id: oficio.id,
      estado,
      fecha_contestado: fechaContestado || null,
      observaciones: obs || null,
    })
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200">{oficio.institucion}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{oficio.descripcion}</p>
          {(oficio.fecha_enviado || oficio.fecha_plazo) && (
            <div className="mt-1 flex flex-wrap gap-3">
              {oficio.fecha_enviado && (
                <span className="text-[11px] text-zinc-500">Env. {formatDate(oficio.fecha_enviado)}</span>
              )}
              {oficio.fecha_plazo && (
                <span className="text-[11px] text-zinc-500">Plazo {formatDate(oficio.fecha_plazo)}</span>
              )}
              {oficio.fecha_contestado && (
                <span className="text-[11px] text-emerald-400">Contestado {formatDate(oficio.fecha_contestado)}</span>
              )}
            </div>
          )}
          {oficio.observaciones && (
            <p className="mt-1 text-[11px] text-zinc-500">{oficio.observaciones}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', cfg.color)}>
            <EstadoIcon className="h-3 w-3" />
            {cfg.label}
          </span>
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => deleteOficio.mutate(oficio.id)}
            disabled={deleteOficio.isPending}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-white/8 pt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow label="Estado">
            <SelectInput
              value={estado}
              onChange={(v) => setEstado(v as PruebaInformativa['estado'])}
              options={ESTADOS_OFICIO.map((e) => ({ value: e, label: OFICIO_ESTADO_CONFIG[e].label }))}
            />
          </FieldRow>
          <FieldRow label="Fecha contestado">
            <DateInput value={fechaContestado} onChange={setFechaContestado} />
          </FieldRow>
          <div className="sm:col-span-2">
            <FieldRow label="Observaciones">
              <TextInput value={obs} onChange={setObs} placeholder="Notas adicionales..." />
            </FieldRow>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={saveEdit}
              disabled={updateOficio.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {updateOficio.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type NuevoOficioForm = {
  institucion: string
  descripcion: string
  fecha_enviado: string
  fecha_plazo: string
}

function PruebaInformativaCard({ expedienteId }: { expedienteId: string }) {
  const { data: oficios = [], isLoading } = usePruebaInformativa(expedienteId)
  const createOficio = useCreateOficio()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NuevoOficioForm>({
    institucion: '',
    descripcion: '',
    fecha_enviado: '',
    fecha_plazo: '',
  })

  async function submit() {
    if (!form.institucion.trim() || !form.descripcion.trim()) return
    await createOficio.mutateAsync({
      expediente_id: expedienteId,
      institucion: form.institucion.trim(),
      descripcion: form.descripcion.trim(),
      fecha_enviado: form.fecha_enviado || null,
      fecha_plazo: form.fecha_plazo || null,
      fecha_contestado: null,
      estado: 'PENDIENTE',
      observaciones: null,
    })
    setForm({ institucion: '', descripcion: '', fecha_enviado: '', fecha_plazo: '' })
    setShowForm(false)
  }

  const pendientes = oficios.filter((o) => o.estado === 'PENDIENTE' || o.estado === 'ENVIADO').length
  const recibidos = oficios.filter((o) => o.estado === 'RECIBIDO').length

  return (
    <Card
      title="Prueba informativa — Oficios"
      headerRight={
        <div className="flex items-center gap-3">
          {oficios.length > 0 && (
            <span className="text-xs text-zinc-500">
              {recibidos}/{oficios.length} respondidos
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-amber-400/30 hover:text-amber-400 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar oficio
          </button>
        </div>
      }
    >
      {showForm && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-400">Nuevo oficio</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldRow label="Institución / Organismo">
                <TextInput
                  value={form.institucion}
                  onChange={(v) => setForm((f) => ({ ...f, institucion: v }))}
                  placeholder="Ej.: ANSES, AFIP, Hospital Padilla..."
                />
              </FieldRow>
            </div>
            <div className="sm:col-span-2">
              <FieldRow label="Qué se solicita">
                <TextInput
                  value={form.descripcion}
                  onChange={(v) => setForm((f) => ({ ...f, descripcion: v }))}
                  placeholder="Ej.: Informe de aportes previsionales período 2018-2020"
                />
              </FieldRow>
            </div>
            <FieldRow label="Fecha enviado">
              <DateInput value={form.fecha_enviado} onChange={(v) => setForm((f) => ({ ...f, fecha_enviado: v }))} />
            </FieldRow>
            <FieldRow label="Fecha plazo respuesta">
              <DateInput value={form.fecha_plazo} onChange={(v) => setForm((f) => ({ ...f, fecha_plazo: v }))} />
            </FieldRow>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={createOficio.isPending || !form.institucion.trim() || !form.descripcion.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {createOficio.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Agregar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : oficios.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No hay oficios de prueba informativa registrados.
        </p>
      ) : (
        <div className="space-y-2">
          {pendientes > 0 && (
            <div className="flex items-center gap-1.5 mb-3">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium">
                {pendientes} oficio{pendientes !== 1 ? 's' : ''} pendiente{pendientes !== 1 ? 's' : ''} de respuesta
              </span>
            </div>
          )}
          {oficios.map((oficio) => (
            <OficioRow key={oficio.id} oficio={oficio} expedienteId={expedienteId} />
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 4: Sentencias y resoluciones
// ---------------------------------------------------------------------------

type NuevaSentenciaForm = {
  tipo: Sentencia['tipo']
  instancia: Sentencia['instancia']
  fecha: string
  resumen: string
  apelada: boolean
  apelante: string
  resultado_apelacion: string
}

function SentenciasCard({ expedienteId }: { expedienteId: string }) {
  const { data: sentencias = [], isLoading } = useSentencias(expedienteId)
  const createSentencia = useCreateSentencia()
  const deleteSentencia = useDeleteSentencia(expedienteId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NuevaSentenciaForm>({
    tipo: 'FAVORABLE',
    instancia: 'PRIMERA',
    fecha: '',
    resumen: '',
    apelada: false,
    apelante: '',
    resultado_apelacion: '',
  })

  async function submit() {
    if (!form.fecha) return
    await createSentencia.mutateAsync({
      expediente_id: expedienteId,
      tipo: form.tipo,
      instancia: form.instancia,
      fecha: form.fecha,
      resumen: form.resumen.trim() || null,
      apelada: form.apelada,
      apelante: (form.apelada && form.apelante) ? (form.apelante as Sentencia['apelante']) : null,
      resultado_apelacion: (form.apelada && form.resultado_apelacion.trim()) ? form.resultado_apelacion.trim() : null,
    })
    setForm({ tipo: 'FAVORABLE', instancia: 'PRIMERA', fecha: '', resumen: '', apelada: false, apelante: '', resultado_apelacion: '' })
    setShowForm(false)
  }

  return (
    <Card
      title="Sentencias y resoluciones"
      headerRight={
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-amber-400/30 hover:text-amber-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Registrar sentencia
        </button>
      }
    >
      {showForm && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-400">Nueva sentencia</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldRow label="Resultado">
              <SelectInput
                value={form.tipo}
                onChange={(v) => setForm((f) => ({ ...f, tipo: v as Sentencia['tipo'] }))}
                options={[
                  { value: 'FAVORABLE', label: 'Favorable' },
                  { value: 'DESFAVORABLE', label: 'Desfavorable' },
                  { value: 'PARCIAL', label: 'Parcialmente favorable' },
                  { value: 'HOMOLOGACION', label: 'Homologación' },
                  { value: 'RECHAZO', label: 'Rechazo' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Instancia">
              <SelectInput
                value={form.instancia}
                onChange={(v) => setForm((f) => ({ ...f, instancia: v as Sentencia['instancia'] }))}
                options={[
                  { value: 'PRIMERA', label: '1ª instancia' },
                  { value: 'SEGUNDA', label: '2ª instancia (Cámara)' },
                  { value: 'CASACION', label: 'Casación (CSJT)' },
                  { value: 'CORTE', label: 'Corte Suprema (CSJN)' },
                  { value: 'ADMINISTRATIVA', label: 'Administrativa' },
                ]}
              />
            </FieldRow>
            <div className="sm:col-span-2">
              <FieldRow label="Fecha de sentencia">
                <DateInput value={form.fecha} onChange={(v) => setForm((f) => ({ ...f, fecha: v }))} />
              </FieldRow>
            </div>
            <div className="sm:col-span-2">
              <FieldRow label="Resumen (opcional)">
                <TextInput
                  value={form.resumen}
                  onChange={(v) => setForm((f) => ({ ...f, resumen: v }))}
                  placeholder="Ej.: Se hace lugar a la demanda por la suma de $1.200.000..."
                />
              </FieldRow>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="apelada"
                checked={form.apelada}
                onChange={(e) => setForm((f) => ({ ...f, apelada: e.target.checked }))}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-400"
              />
              <label htmlFor="apelada" className="text-sm text-zinc-300">
                Fue apelada
              </label>
            </div>
            {form.apelada && (
              <>
                <FieldRow label="Apelante">
                  <SelectInput
                    value={form.apelante}
                    onChange={(v) => setForm((f) => ({ ...f, apelante: v }))}
                    placeholder="Seleccioná..."
                    options={[
                      { value: 'ACTORA', label: 'Actora' },
                      { value: 'DEMANDADA', label: 'Demandada' },
                      { value: 'AMBAS', label: 'Ambas partes' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Resultado apelación">
                  <TextInput
                    value={form.resultado_apelacion}
                    onChange={(v) => setForm((f) => ({ ...f, resultado_apelacion: v }))}
                    placeholder="Ej.: Cámara confirmó la sentencia de grado"
                  />
                </FieldRow>
              </>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={createSentencia.isPending || !form.fecha}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {createSentencia.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Registrar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : sentencias.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No hay sentencias registradas para este expediente.
        </p>
      ) : (
        <div className="space-y-3">
          {sentencias.map((s) => (
            <div
              key={s.id}
              className={cn(
                'rounded-xl border p-4',
                s.tipo === 'FAVORABLE'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : s.tipo === 'DESFAVORABLE'
                  ? 'border-rose-500/20 bg-rose-500/5'
                  : 'border-white/8 bg-white/[0.02]'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', TIPO_COLORS[s.tipo])}>
                      {TIPO_LABELS[s.tipo]}
                    </span>
                    <span className="text-xs text-zinc-500">{INSTANCIA_LABELS[s.instancia]}</span>
                    <span className="text-xs text-zinc-500">{formatDate(s.fecha)}</span>
                  </div>
                  {s.resumen && (
                    <p className="mt-2 text-sm text-zinc-300">{s.resumen}</p>
                  )}
                  {s.apelada && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                      <FileText className="h-3.5 w-3.5" />
                      <span>
                        Apelada por {s.apelante?.toLowerCase() ?? '—'}
                        {s.resultado_apelacion ? ` · ${s.resultado_apelacion}` : ' · en trámite'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteSentencia.mutate(s.id)}
                  disabled={deleteSentencia.isPending}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// TabProceso — main export
// ---------------------------------------------------------------------------

interface TabProcesoProps {
  expedienteId: string
  expediente: {
    fuero?: string | null
    tipo_proceso_id?: string | null
    etapa_actual_id?: string | null
    etapa_actual_desde?: string | null
    juzgado_numero?: number | null
    juez?: string | null
    oga?: string | null
    termino_probatorio_vence?: string | null
  }
}

export function TabProceso({ expedienteId, expediente }: TabProcesoProps) {
  const tipoProcesoid = (expediente as any).tipo_proceso_id ?? null
  const etapaActualId = (expediente as any).etapa_actual_id ?? null
  const etapaActualDesde = (expediente as any).etapa_actual_desde ?? null

  return (
    <div className="space-y-4">
      <ProcesoTribunalCard
        expedienteId={expedienteId}
        fueroActual={(expediente as any).fuero ?? null}
        tipoProcesoidActual={tipoProcesoid}
        etapaActualId={etapaActualId}
        juzgadoNumeroActual={(expediente as any).juzgado_numero ?? null}
        juezActual={(expediente as any).juez ?? null}
        ogaActual={(expediente as any).oga ?? null}
        terminoActual={(expediente as any).termino_probatorio_vence ?? null}
      />

      <EtapasCard
        expedienteId={expedienteId}
        tipoProcesoid={tipoProcesoid}
        etapaActualId={etapaActualId}
        etapaActualDesde={etapaActualDesde}
      />

      <PruebaInformativaCard expedienteId={expedienteId} />

      <SentenciasCard expedienteId={expedienteId} />
    </div>
  )
}
