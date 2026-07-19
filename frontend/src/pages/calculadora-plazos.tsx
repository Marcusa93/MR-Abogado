import { useState, useMemo } from 'react'
import { Calculator, Copy, Check, AlertTriangle, Info, BookOpen, ChevronRight } from 'lucide-react'
import { useFeriasJudiciales } from '@/hooks/use-ferias-judiciales'
import {
  calcularVencimiento,
  isHabilDay,
  isoUTC,
  type FeriaPeriod,
} from '@/lib/utils/judicial-calendar'
import { toast } from '@/stores/toast-store'
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
    return calcularVencimiento(fecha, dias, habiles, ferias)
  }, [fecha, dias, habiles, ferias])

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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 dark:bg-amber-500/10">
          <Calculator className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Calculadora de plazos procesales
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            CPCC Tucumán — incluye ferias judiciales y feriados nacionales
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 divide-y divide-zinc-100 dark:divide-white/5">

        {/* Fecha de actuación */}
        <div className="px-5 py-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Fecha de la actuación
          </label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Firma del escrito o fecha indicada en la cédula
          </p>
        </div>

        {/* Tipo de plazo */}
        <div className="px-5 py-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Tipo de plazo
          </label>
          <select
            value={tipoId}
            onChange={e => setTipoId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Cantidad de días
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={365}
                value={diasCustom}
                onChange={e => setDiasCustom(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setHabilesCustom(true)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    habitlesCustom
                      ? 'bg-amber-500 text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'
                  )}
                >
                  Hábiles
                </button>
                <button
                  type="button"
                  onClick={() => setHabilesCustom(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    !habitlesCustom
                      ? 'bg-amber-500 text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'
                  )}
                >
                  Corridos
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resultado */}
      {feriasLoading && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-5 py-6 text-center text-sm text-zinc-500">
          Cargando calendario judicial…
        </div>
      )}

      {!feriasLoading && resultado && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5 overflow-hidden">

          {/* Fecha vencimiento — prominente */}
          <div className="px-5 py-5 border-b border-amber-500/15">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                  Vencimiento
                </p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {formatFecha(resultado.vencimiento)}
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {dias} {habiles ? 'días hábiles' : 'días corridos'}
                  {tipo.base ? ` · ${tipo.base}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {diasHastaVencimiento !== null && (
                  <span className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-semibold',
                    diasHastaVencimiento < 0
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : diasHastaVencimiento <= 3
                      ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                      : diasHastaVencimiento <= 7
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
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
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
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
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Actuación</p>
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatFechaCorta(fecha)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 -ml-1" />
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Notificación</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {formatFechaCorta(resultado.notificacion)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400 -ml-1" />
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Primer día</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {formatFechaCorta(resultado.primerDia)}
                  </p>
                </div>
              </div>
            </div>

            {/* Advertencia feria */}
            {feriasPeriodo.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
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
              <div className="flex items-start gap-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20 px-3 py-2.5">
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
      <div className="flex items-start gap-2 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
        <BookOpen className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Cálculo según CPCC Tucumán: la cédula se notifica el primer día hábil posterior a la firma,
          y el plazo comienza a correr desde el día hábil siguiente.
          Se excluyen sábados, domingos, feriados nacionales y ferias judiciales registradas.
        </p>
      </div>

    </div>
  )
}
