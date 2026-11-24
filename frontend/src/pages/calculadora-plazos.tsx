import { useState, useMemo } from 'react'
import { Copy, Check, AlertTriangle, Info, BookOpen, ChevronRight } from 'lucide-react'
import { useFeriasJudiciales } from '@/hooks/use-ferias-judiciales'
import { useCalendarioJudicial } from '@/hooks/use-calendario-judicial'
import { CalendarioInhabiles } from '@/components/plazos/calendario-inhabiles'
import {
  calcularVencimiento,
  isHabilDay,
  isoUTC,
  type FeriaPeriod,
} from '@/lib/utils/judicial-calendar'
import { toast } from '@/stores/toast-store'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Tipos de plazo predefinidos (CPCC Tucumán)
// ---------------------------------------------------------------------------

interface TipoPlazo {
  id: string
  label: string
  dias: number | null
  habiles: boolean
  base: string | null
}

const TIPOS_PLAZO: TipoPlazo[] = [
  { id: 'traslado_demanda',   label: 'Traslado de demanda',       dias: 15, habiles: true,  base: 'Art. 338 CPCC' },
  { id: 'traslado_excepcion', label: 'Traslado de excepción',     dias: 5,  habiles: true,  base: 'Art. 347 CPCC' },
  { id: 'intimacion_pago',    label: 'Intimación de pago',        dias: 5,  habiles: true,  base: 'Art. 509 CPCC' },
  { id: 'citacion_audiencia', label: 'Citación a audiencia',      dias: 7,  habiles: true,  base: 'CPCC' },
  { id: 'ofrecimiento_prueba',label: 'Ofrecimiento de prueba',    dias: 10, habiles: true,  base: 'Art. 367 CPCC' },
  { id: 'reposicion',         label: 'Recurso de reposición',     dias: 3,  habiles: true,  base: 'Art. 240 CPCC' },
  { id: 'apelacion',          label: 'Recurso de apelación',      dias: 5,  habiles: true,  base: 'Art. 254 CPCC' },
  { id: 'oposicion',          label: 'Oposición / impugnación',   dias: 3,  habiles: true,  base: 'CPCC' },
  { id: 'cautelar',           label: 'Medida cautelar',           dias: 5,  habiles: true,  base: 'CPCC' },
  { id: 'vista_traslado',     label: 'Vista / traslado genérico', dias: 5,  habiles: true,  base: 'CPCC' },
  { id: 'corridos_5',         label: '5 días corridos',           dias: 5,  habiles: false, base: null },
  { id: 'corridos_10',        label: '10 días corridos',          dias: 10, habiles: false, base: null },
  { id: 'personalizado',      label: 'Plazo personalizado',       dias: null, habiles: true, base: null },
]

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

const DIAS_ES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_ES[date.getUTCDay()]}, ${d} de ${MESES_ES[m - 1]} de ${y}`
}

function formatFechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number]
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`
}

function diffDias(desde: string, hasta: string): number {
  const a = new Date(desde + 'T12:00:00Z')
  const b = new Date(hasta + 'T12:00:00Z')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function todayISO(): string {
  const d = new Date()
  return isoUTC(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
}

function feriaEnPeriodo(desde: string, hasta: string, periods: FeriaPeriod[]): FeriaPeriod[] {
  return periods.filter(p => p.fin >= desde && p.inicio <= hasta)
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function CalculadoraPlazos() {
  const { data: ferias = [], isLoading: feriasLoading } = useFeriasJudiciales()
  const { inhabiles, isLoading: inhabilesLoading } = useCalendarioJudicial()

  const [fecha, setFecha] = useState(todayISO())
  const [tipoId, setTipoId] = useState('traslado_demanda')
  const [diasCustom, setDiasCustom] = useState(5)
  const [habitlesCustom, setHabilesCustom] = useState(true)
  const [copied, setCopied] = useState(false)

  const tipo = TIPOS_PLAZO.find(t => t.id === tipoId)!
  const dias = tipo.dias ?? diasCustom
  const habiles = tipo.id === 'personalizado' ? habitlesCustom : tipo.habiles

  const resultado = useMemo(() => {
    if (!fecha || !dias) return null
    return calcularVencimiento(fecha, dias, habiles, ferias, inhabiles)
  }, [fecha, dias, habiles, ferias, inhabiles])

  const today = todayISO()

  const diasHastaVencimiento = resultado
    ? diffDias(today, resultado.vencimiento)
    : null

  const feriasPeriodo = resultado
    ? feriaEnPeriodo(fecha, resultado.vencimiento, ferias)
    : []

  const venDow = resultado
    ? new Date(resultado.vencimiento + 'T12:00:00Z').getUTCDay()
    : null

  function handleCopy() {
    if (!resultado) return
    const texto = `Actuación: ${formatFechaCorta(fecha)}\nNotificación: ${formatFechaCorta(resultado.notificacion)}\nPrimer día: ${formatFechaCorta(resultado.primerDia)}\nVencimiento (${dias}${habiles ? ' días hábiles' : ' días corridos'}: ${formatFecha(resultado.vencimiento)}`
    navigator.clipboard.writeText(texto).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Copiado al portapapeles')
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Header */}
      <PageHeader
        title="Calculadora de plazos procesales"
        subtitle="CPCC Tucumán — descuenta ferias, feriados nacionales y provinciales y días inhábiles judiciales"
      />

      {/* Formulario */}
      <div className="app-card divide-y divide-zinc-100 dark:divide-white/[0.06]">

        {/* Fecha de actuación */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Fecha de la actuación
          </label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="field h-10"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Firma del escrito o fecha indicada en la cédula
          </p>
        </div>

        {/* Tipo de plazo */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Tipo de plazo
          </label>
          <select
            value={tipoId}
            onChange={e => setTipoId(e.target.value)}
            className="field h-10"
          >
            {TIPOS_PLAZO.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.dias !== null ? ` — ${t.dias} días ${t.habiles ? 'hábiles' : 'corridos'}` : ''}
                {t.base ? ` (${t.base})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Personalizado */}
        {tipoId === 'personalizado' && (
          <div className="px-5 py-4">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Cantidad de días
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={365}
                value={diasCustom}
                onChange={e => setDiasCustom(Math.max(1, parseInt(e.target.value) || 1))}
                className="field h-10 w-24 tabular-nums"
              />
              <div className="segmented" role="group" aria-label="Tipo de días">
                <button
                  type="button"
                  onClick={() => setHabilesCustom(true)}
                  aria-pressed={habitlesCustom}
                  className="px-3 text-xs font-semibold"
                >
                  Hábiles
                </button>
                <button
                  type="button"
                  onClick={() => setHabilesCustom(false)}
                  aria-pressed={!habitlesCustom}
                  className="px-3 text-xs font-semibold"
                >
                  Corridos
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resultado */}
      {(feriasLoading || inhabilesLoading) && (
        <div className="app-card px-5 py-6 text-center text-sm text-zinc-500">
          Cargando calendario judicial…
        </div>
      )}

      {!feriasLoading && !inhabilesLoading && resultado && (
        <div className="app-card !border-[var(--brand-accent)]/40">

          {/* Fecha vencimiento — prominente */}
          <div className="border-b border-zinc-100 px-5 py-5 dark:border-white/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-1.5">
                  Vencimiento
                </p>
                <p className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {formatFecha(resultado.vencimiento)}
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {dias} {habiles ? 'días hábiles' : 'días corridos'}
                  {tipo.base ? ` · ${tipo.base}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {diasHastaVencimiento !== null && (
                  <span className={cn(
                    'rounded-full border px-3 py-1 text-[13px] font-bold tabular-nums',
                    diasHastaVencimiento < 0
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : diasHastaVencimiento <= 3
                      ? 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                      : diasHastaVencimiento <= 7
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  )}>
                    {diasHastaVencimiento < 0
                      ? `Venció hace ${Math.abs(diasHastaVencimiento)} días`
                      : diasHastaVencimiento === 0
                      ? 'Vence hoy'
                      : `En ${diasHastaVencimiento} días`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn btn-ghost btn-sm"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>

          {/* Detalle de cálculo */}
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Actuación</p>
                <p className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {formatFechaCorta(fecha)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 -ml-1" />
                <div>
                  <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Notificación</p>
                  <p className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {formatFechaCorta(resultado.notificacion)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 -ml-1" />
                <div>
                  <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Primer día</p>
                  <p className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {formatFechaCorta(resultado.primerDia)}
                  </p>
                </div>
              </div>
            </div>

            {/* Advertencia feria */}
            {feriasPeriodo.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-semibold mb-0.5">Período de feria judicial en el rango</p>
                  {feriasPeriodo.map(f => (
                    <p key={f.inicio}>
                      {formatFechaCorta(f.inicio)} al {formatFechaCorta(f.fin)}
                    </p>
                  ))}
                  <p className="mt-1 font-normal opacity-80">Los días de feria no cuentan como hábiles.</p>
                </div>
              </div>
            )}

            {/* Advertencia vencimiento en fin de semana (no debería pasar con habiles, pero sí con corridos) */}
            {venDow !== null && (venDow === 0 || venDow === 6) && !habiles && (
              <div className="dashboard-panel-muted flex items-start gap-2 px-3 py-2.5">
                <Info className="h-4 w-4 text-zinc-500 dark:text-zinc-400 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  El vencimiento cae en {venDow === 6 ? 'sábado' : 'domingo'}.
                  En días corridos, el plazo se extiende al siguiente hábil.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nota informativa */}
      <div className="dashboard-panel-muted flex items-start gap-2 px-4 py-3">
        <BookOpen className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Cálculo según CPCC Tucumán: la cédula se notifica el primer día hábil posterior a la firma,
          y el plazo comienza a correr desde el día hábil siguiente.
          Se excluyen sábados, domingos, ferias y los días inhábiles de la lista de abajo.
        </p>
      </div>

      <CalendarioInhabiles />
    </div>
  )
}
