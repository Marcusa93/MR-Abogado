import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, TrendingUp, TrendingDown, Calendar, Plus, AlertTriangle,
  Loader2, X, Trash2, Lock, Users, Repeat, Pencil, ChevronLeft, ChevronRight,
  DollarSign,
} from 'lucide-react'
import {
  useTieneAccesoCaja, useCajaResumen, useGastos, useIngresos, useAbonos,
  usePagosPendientes, useCreateGasto, useCreateIngreso, useCreateAbono,
  useToggleAbono, useDeleteGasto, useDeleteIngreso, useUpdateGasto, useUpdateIngreso,
  useGastosFijos, useGastosFijosPendientes, useCreateGastoFijo, useUpdateGastoFijo,
  useToggleGastoFijo, useDeleteGastoFijo,
  GASTO_CATEGORIAS, INGRESO_TIPOS,
  type MonedaCaja, type PagoPendiente, type Gasto, type Ingreso,
  type GastoFijo, type GastoFijoPendiente,
} from '@/hooks/use-caja'
import { useClientes } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { useUsdRate, type CotizacionUSD } from '@/hooks/use-cotizacion'

type Tab = 'resumen' | 'ingresos' | 'gastos' | 'abonos' | 'gastos_fijos'

const fmt = (n: number, moneda: MonedaCaja = 'ARS') => {
  const formatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `${moneda === 'USD' ? 'US$ ' : '$ '}${formatter.format(n)}`
}

const MES_LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TIPO_INGRESO_LABEL: Record<string, string> = Object.fromEntries(INGRESO_TIPOS.map(t => [t.value, t.label]))
const CATEGORIA_GASTO_LABEL: Record<string, string> = Object.fromEntries(GASTO_CATEGORIAS.map(c => [c.value, c.label]))

export default function CajaPage() {
  const [activeTab, setActiveTab] = useState<Tab>('resumen')
  const [dialogOpen, setDialogOpen] = useState<null | 'gasto' | 'ingreso' | 'abono' | 'gasto_fijo'>(null)
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null)
  const [editingIngreso, setEditingIngreso] = useState<Ingreso | null>(null)
  const [editingGastoFijo, setEditingGastoFijo] = useState<GastoFijo | null>(null)
  const { data: tieneAcceso, isLoading: loadingAcceso } = useTieneAccesoCaja()

  if (loadingAcceso) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    )
  }

  if (!tieneAcceso) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Breadcrumb items={[{ label: 'Caja' }]} />
        <EmptyState
          icon={Lock}
          title="Sin acceso a Caja"
          description="No tenés permisos para ver la caja del estudio. Pedile al administrador que active tu acceso desde Configuración."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Caja' }]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-400" />
            Caja del estudio
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Ingresos, gastos y abonos mensuales. Restringido a socios autorizados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'ingresos' || activeTab === 'resumen' ? (
            <button
              onClick={() => setDialogOpen('ingreso')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ingreso
            </button>
          ) : null}
          {activeTab === 'gastos' || activeTab === 'resumen' ? (
            <button
              onClick={() => setDialogOpen('gasto')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Gasto
            </button>
          ) : null}
          {activeTab === 'abonos' && (
            <button
              onClick={() => setDialogOpen('abono')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo abono
            </button>
          )}
          {activeTab === 'gastos_fijos' && (
            <button
              onClick={() => setDialogOpen('gasto_fijo')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo gasto fijo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-white/10">
        <nav className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
          {[
            { id: 'resumen' as const, label: 'Resumen', icon: Wallet },
            { id: 'ingresos' as const, label: 'Ingresos', icon: TrendingUp },
            { id: 'gastos' as const, label: 'Gastos', icon: TrendingDown },
            { id: 'abonos' as const, label: 'Abonos mensuales', icon: Repeat },
            { id: 'gastos_fijos' as const, label: 'Gastos fijos', icon: TrendingDown },
          ].map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTab === 'resumen' && <TabResumen onGoTab={setActiveTab} />}
      {activeTab === 'ingresos' && <TabIngresos onEdit={(i) => setEditingIngreso(i)} />}
      {activeTab === 'gastos' && <TabGastos onEdit={(g) => setEditingGasto(g)} />}
      {activeTab === 'abonos' && <TabAbonos />}
      {activeTab === 'gastos_fijos' && <TabGastosFijos onEdit={(gf) => setEditingGastoFijo(gf)} />}

      {(dialogOpen === 'gasto' || editingGasto) && (
        <DialogGasto
          initial={editingGasto ?? undefined}
          onClose={() => { setDialogOpen(null); setEditingGasto(null) }}
        />
      )}
      {(dialogOpen === 'ingreso' || editingIngreso) && (
        <DialogIngreso
          initial={editingIngreso ?? undefined}
          onClose={() => { setDialogOpen(null); setEditingIngreso(null) }}
        />
      )}
      {dialogOpen === 'abono' && <DialogAbono onClose={() => setDialogOpen(null)} />}
      {(dialogOpen === 'gasto_fijo' || editingGastoFijo) && (
        <DialogGastoFijo
          initial={editingGastoFijo ?? undefined}
          onClose={() => { setDialogOpen(null); setEditingGastoFijo(null) }}
        />
      )}
    </div>
  )
}

// ─── Resumen ────────────────────────────────────────────────────────────────

function TabResumen({ onGoTab }: { onGoTab: (t: Tab) => void }) {
  const { data: resumen, isLoading } = useCajaResumen()
  const { data: pendientes = [] } = usePagosPendientes()
  const { data: gastosFijos = [] } = useGastosFijosPendientes()
  const { data: cotizacion } = useUsdRate()

  if (isLoading) return <Loader />
  if (!resumen) return null

  const mes = resumen.mes_actual
  const balance = mes.ingresos_ars - mes.gastos_ars

  const usdSubIngreso = mes.ingresos_usd > 0
    ? cotizacion
      ? `+ ${fmt(mes.ingresos_usd, 'USD')} ≈ ${fmt(Math.round(mes.ingresos_usd * cotizacion.venta))}`
      : `+ ${fmt(mes.ingresos_usd, 'USD')}`
    : null

  const usdSubGasto = mes.gastos_usd > 0
    ? cotizacion
      ? `+ ${fmt(mes.gastos_usd, 'USD')} ≈ ${fmt(Math.round(mes.gastos_usd * cotizacion.venta))}`
      : `+ ${fmt(mes.gastos_usd, 'USD')}`
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Período: <span className="font-medium text-zinc-700 dark:text-zinc-200">{MES_LABELS[resumen.periodo.month - 1]} {resumen.periodo.year}</span>
        </p>
        <TipoCambioWidget cotizacion={cotizacion ?? null} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Ingresos del mes" value={fmt(mes.ingresos_ars)} sub={usdSubIngreso} accent="emerald" icon={TrendingUp} onClick={() => onGoTab('ingresos')} />
        <KPICard label="Gastos del mes" value={fmt(mes.gastos_ars)} sub={usdSubGasto} accent="rose" icon={TrendingDown} onClick={() => onGoTab('gastos')} />
        <KPICard label="Balance del mes" value={fmt(balance)} accent={balance >= 0 ? 'emerald' : 'rose'} icon={Wallet} sub={balance >= 0 ? 'A favor' : 'En rojo'} onClick={() => onGoTab('ingresos')} />
        <KPICard label="Abonos activos" value={String(resumen.abonos_activos)} sub={resumen.abonos_total_mensual_ars > 0 ? `${fmt(resumen.abonos_total_mensual_ars)}/mes` : null} accent="cyan" icon={Repeat} onClick={() => onGoTab('abonos')} />
      </div>

      {/* Gastos fijos del mes */}
      {gastosFijos.length > 0 && <GastosFijosCard gastosFijos={gastosFijos} />}

      {/* Pagos pendientes */}
      <PagosPendientesCard pendientes={pendientes} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DesglosePorBucket
          titulo="Ingresos por tipo"
          data={resumen.ingresos_por_tipo_mes.map(i => ({ label: TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo, valor: i.monto }))}
          accent="emerald"
        />
        <DesglosePorBucket
          titulo={`Gastos por categoría${resumen.gastos_por_categoria_mes_usd.length > 0 && cotizacion ? ' (USD convertido)' : ''}`}
          data={(() => {
            const map = new Map<string, number>()
            for (const g of resumen.gastos_por_categoria_mes) {
              map.set(g.categoria, (map.get(g.categoria) ?? 0) + g.monto)
            }
            if (cotizacion) {
              for (const g of resumen.gastos_por_categoria_mes_usd) {
                map.set(g.categoria, (map.get(g.categoria) ?? 0) + g.monto * cotizacion.venta)
              }
            }
            return Array.from(map.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, val]) => ({ label: CATEGORIA_GASTO_LABEL[cat] ?? cat, valor: Math.round(val) }))
          })()}
          accent="rose"
        />
      </div>

      {/* Año actual */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Año {resumen.periodo.year}</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-zinc-500">Ingresos</p>
            <p className="text-lg font-semibold text-emerald-300 tabular-nums">{fmt(resumen.anio_actual.ingresos_ars)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Gastos</p>
            <p className="text-lg font-semibold text-rose-300 tabular-nums">{fmt(resumen.anio_actual.gastos_ars)}</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Balance</p>
            <p className={cn(
              'text-lg font-semibold tabular-nums',
              resumen.anio_actual.ingresos_ars - resumen.anio_actual.gastos_ars >= 0
                ? 'text-emerald-300' : 'text-rose-300'
            )}>
              {fmt(resumen.anio_actual.ingresos_ars - resumen.anio_actual.gastos_ars)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function TipoCambioWidget({ cotizacion }: { cotizacion: CotizacionUSD | null }) {
  const fmtRate = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

  if (!cotizacion) return null

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1">
      <DollarSign className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="text-[11px] text-zinc-400">
        US$ 1 &rarr;{' '}
        <span className="text-amber-300 font-medium tabular-nums">$ {fmtRate(cotizacion.venta)}</span>
        <span className="text-zinc-600 ml-1">(venta) · $ {fmtRate(cotizacion.compra)} (compra)</span>
      </span>
    </div>
  )
}

function KPICard({ label, value, sub, accent, icon: Icon, onClick }: { label: string; value: string; sub?: string | null; accent: 'emerald'|'rose'|'cyan'|'amber'; icon: React.ComponentType<{ className?: string }>; onClick?: () => void }) {
  const ring = {
    emerald: 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/20',
    rose: 'from-rose-500/15 to-rose-500/5 border-rose-500/20',
    cyan: 'from-cyan-500/15 to-cyan-500/5 border-cyan-500/20',
    amber: 'from-amber-500/15 to-amber-500/5 border-amber-500/20',
  }[accent]
  const iconColor = { emerald: 'text-emerald-400', rose: 'text-rose-400', cyan: 'text-cyan-400', amber: 'text-amber-400' }[accent]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-xl border bg-gradient-to-br p-3 sm:p-4 text-left w-full',
        ring,
        onClick && 'transition-transform hover:brightness-125 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-zinc-400 leading-tight">{label}</p>
        <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0', iconColor)} />
      </div>
      <p className="mt-1 text-lg sm:text-2xl font-bold text-zinc-50 tabular-nums break-all">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] sm:text-[11px] text-zinc-500">{sub}</p>}
    </button>
  )
}

function PagosPendientesCard({ pendientes }: { pendientes: PagoPendiente[] }) {
  const noPagados = pendientes.filter(p => p.estado !== 'pagado')
  const atrasados = noPagados.filter(p => p.estado === 'atrasado')

  if (pendientes.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Repeat className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Pagos del mes</h3>
        </div>
        <p className="text-xs text-zinc-500 py-2">No hay abonos mensuales cargados todavía. Andá al tab "Abonos mensuales" para agregar el primero.</p>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-4',
      atrasados.length > 0
        ? 'border-rose-500/30 bg-rose-500/[0.04]'
        : noPagados.length > 0
          ? 'border-amber-500/30 bg-amber-500/[0.04]'
          : 'border-emerald-500/30 bg-emerald-500/[0.04]'
    )}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {atrasados.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          ) : noPagados.length > 0 ? (
            <Calendar className="h-4 w-4 text-amber-400" />
          ) : (
            <Repeat className="h-4 w-4 text-emerald-400" />
          )}
          <h3 className="text-sm font-semibold text-zinc-100">Cobranza del mes</h3>
          <span className="text-[10px] text-zinc-500">
            {pendientes.length - noPagados.length} de {pendientes.length} cobrados
          </span>
        </div>
        {atrasados.length > 0 && (
          <span className="text-[11px] font-medium text-rose-300">
            {atrasados.length} atrasado{atrasados.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {pendientes.map((p) => (
          <PagoPendienteRow key={p.abono_id} pago={p} />
        ))}
      </div>
    </div>
  )
}

function PagoPendienteRow({ pago }: { pago: PagoPendiente }) {
  const { user } = useAuth()
  const createIngreso = useCreateIngreso()
  const now = new Date()
  const periodo = { year: now.getFullYear(), month: now.getMonth() + 1 }

  const handleCobrar = async () => {
    if (!user?.id) return
    try {
      await createIngreso.mutateAsync({
        fecha: now.toISOString().slice(0, 10),
        monto: pago.monto,
        moneda: pago.moneda,
        tipo: 'abono_mensual',
        categoria: null,
        cliente_id: pago.cliente_id,
        expediente_id: null,
        abono_id: pago.abono_id,
        periodo_year: periodo.year,
        periodo_month: periodo.month,
        descripcion: `Cobro de abono mensual — ${MES_LABELS[periodo.month - 1]} ${periodo.year}`,
        comprobante_path: null,
        cargado_por: user.id,
      })
      toast.success(`Pago registrado: ${pago.cliente_apellido}, ${pago.cliente_nombre}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar')
    }
  }

  const estadoClass = {
    pagado: 'bg-emerald-500/15 text-emerald-300',
    por_vencer: 'bg-zinc-500/15 text-zinc-400',
    pendiente: 'bg-amber-500/15 text-amber-300',
    atrasado: 'bg-rose-500/15 text-rose-300',
  }[pago.estado]

  const estadoLabel = {
    pagado: '✓ Pagado',
    por_vencer: `Vence el ${pago.dia_de_cobro}`,
    pendiente: `Vence el ${pago.dia_de_cobro}`,
    atrasado: `${pago.dias_atraso}d de atraso`,
  }[pago.estado]

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md border border-white/5 px-3 py-2',
      pago.estado === 'pagado' ? 'opacity-60' : 'bg-white/[0.02]'
    )}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 truncate">
          {pago.cliente_apellido}, {pago.cliente_nombre}
        </p>
        <p className="text-[11px] text-zinc-500">
          {fmt(pago.monto, pago.moneda)}
          {pago.ultimo_pago && (
            <> · últ. pago {formatDate(pago.ultimo_pago)}</>
          )}
        </p>
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums', estadoClass)}>
        {estadoLabel}
      </span>
      {pago.estado !== 'pagado' && (
        <button
          onClick={handleCobrar}
          disabled={createIngreso.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
        >
          {createIngreso.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Cobré
        </button>
      )}
    </div>
  )
}

function DesglosePorBucket({ titulo, data, accent }: { titulo: string; data: { label: string; valor: number }[]; accent: 'emerald'|'rose' }) {
  const total = data.reduce((s, d) => s + Number(d.valor), 0)
  const color = accent === 'emerald' ? 'bg-emerald-500/60' : 'bg-rose-500/60'

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">{titulo}</h3>
        <p className="text-xs text-zinc-500 py-2">Sin movimientos este mes.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">{titulo}</h3>
      <div className="space-y-2">
        {data.map((d, i) => {
          const pct = total > 0 ? (Number(d.valor) / total) * 100 : 0
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{d.label}</span>
                <span className="text-zinc-400 tabular-nums">{fmt(Number(d.valor))}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className={color} style={{ width: `${Math.max(pct, 4)}%`, height: '100%' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Navegador de mes + totales ──────────────────────────────────────────────

type Mes = { year: number; month: number }

function MonthNav({ mes, setMes, count, noun }: { mes: Mes; setMes: (m: Mes) => void; count: number; noun: string }) {
  const now = new Date()
  const esActual = mes.year === now.getFullYear() && mes.month === now.getMonth() + 1
  const prev = () => setMes(mes.month === 1 ? { year: mes.year - 1, month: 12 } : { year: mes.year, month: mes.month - 1 })
  const next = () => setMes(mes.month === 12 ? { year: mes.year + 1, month: 1 } : { year: mes.year, month: mes.month + 1 })
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <button onClick={prev} className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:bg-white/10" title="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[140px] text-center text-sm font-medium text-zinc-200">{MES_LABELS[mes.month - 1]} {mes.year}</span>
        <button onClick={next} disabled={esActual} className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:bg-white/10 disabled:opacity-30" title="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
        {!esActual && (
          <button onClick={() => setMes({ year: now.getFullYear(), month: now.getMonth() + 1 })} className="ml-1 rounded-md px-2 py-1 text-[11px] text-cyan-400 hover:bg-white/5">
            Mes actual
          </button>
        )}
      </div>
      <span className="text-xs text-zinc-500">{count} {noun}</span>
    </div>
  )
}

function TotalesMes({ items, tipo }: { items: { monto: number | string; moneda: MonedaCaja }[]; tipo: 'ingreso' | 'gasto' }) {
  const { data: cotizacion } = useUsdRate()
  const ars = items.filter(i => i.moneda === 'ARS').reduce((s, i) => s + Number(i.monto), 0)
  const usd = items.filter(i => i.moneda === 'USD').reduce((s, i) => s + Number(i.monto), 0)
  const color = tipo === 'ingreso' ? 'text-emerald-300' : 'text-rose-300'
  if (items.length === 0) return null
  const fmtRate = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">Total del mes</span>
      <span className={cn('text-sm font-semibold tabular-nums', color)}>{fmt(ars)}</span>
      {usd > 0 && (
        <div className="flex items-center gap-1.5">
          <span className={cn('text-sm font-semibold tabular-nums', color)}>{fmt(usd, 'USD')}</span>
          {cotizacion ? (
            <span className="text-xs tabular-nums text-amber-400">
              ≈ {fmt(Math.round(usd * cotizacion.venta))}
              <span className="text-zinc-600 ml-1">(a ${fmtRate(cotizacion.venta)}/USD)</span>
            </span>
          ) : (
            <span className="text-xs text-zinc-600">(cotización no disponible)</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Ingresos ───────────────────────────────────────────────────────────────

function TabIngresos({ onEdit }: { onEdit: (i: Ingreso) => void }) {
  const now = new Date()
  const [mes, setMes] = useState<Mes>({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const { data: ingresos = [], isLoading } = useIngresos(mes)
  const { data: cotizacion } = useUsdRate()
  const deleteIngreso = useDeleteIngreso()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const arsEquivalente = (monto: number) =>
    cotizacion ? `≈ ${fmt(Math.round(monto * cotizacion.venta))}` : null

  const ingresoUSD = ingresos.filter(i => i.moneda === 'USD')
  const totalUSD = ingresoUSD.reduce((s, i) => s + Number(i.monto), 0)

  if (isLoading) return <Loader />

  return (
    <div className="space-y-3">
      <MonthNav mes={mes} setMes={setMes} count={ingresos.length} noun={ingresos.length === 1 ? 'ingreso' : 'ingresos'} />
      <TotalesMes items={ingresos} tipo="ingreso" />
      <TipoCambioWidget cotizacion={cotizacion ?? null} />

      {ingresos.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Sin ingresos este mes" description="Registrá un ingreso con el botón de arriba." />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {ingresos.map((i) => (
              <div key={i.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[10px] text-zinc-500 tabular-nums">{formatDate(i.fecha)}</span>
                      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        {TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo}
                      </span>
                    </div>
                    {i.descripcion && <p className="text-xs text-zinc-400 line-clamp-1">{i.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <div className="text-right mr-1">
                      <p className="text-sm font-semibold text-zinc-100 tabular-nums">{fmt(Number(i.monto), i.moneda)}</p>
                      {i.moneda === 'USD' && arsEquivalente(Number(i.monto)) && (
                        <p className="text-[10px] text-amber-400 tabular-nums">{arsEquivalente(Number(i.monto))}</p>
                      )}
                    </div>
                    <button onClick={() => onEdit(i)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(i.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Descripción</th>
                  <th className="text-right px-3 py-2">Monto</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ingresos.map((i) => (
                  <tr key={i.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-zinc-300 tabular-nums">{formatDate(i.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        {TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400 line-clamp-1">{i.descripcion || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <p className="font-medium text-zinc-100">{fmt(Number(i.monto), i.moneda)}</p>
                      {i.moneda === 'USD' && arsEquivalente(Number(i.monto)) && (
                        <p className="text-[10px] text-amber-400">{arsEquivalente(Number(i.monto))}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(i)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(i.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteIngreso.mutateAsync(confirmDelete); toast.success('Ingreso eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
          setConfirmDelete(null)
        }}
        title="Eliminar ingreso"
        description="¿Seguro que querés eliminar este ingreso?"
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

function TabGastos({ onEdit }: { onEdit: (g: Gasto) => void }) {
  const now = new Date()
  const [mes, setMes] = useState<Mes>({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const { data: gastos = [], isLoading } = useGastos(mes)
  const deleteGasto = useDeleteGasto()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (isLoading) return <Loader />

  return (
    <div className="space-y-3">
      <MonthNav mes={mes} setMes={setMes} count={gastos.length} noun={gastos.length === 1 ? 'gasto' : 'gastos'} />
      <TotalesMes items={gastos} tipo="gasto" />

      {gastos.length === 0 ? (
        <EmptyState icon={TrendingDown} title="Sin gastos este mes" description="Registrá un gasto con el botón de arriba." />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {gastos.map((g) => (
              <div key={g.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[10px] text-zinc-500 tabular-nums">{formatDate(g.fecha)}</span>
                      <span className="inline-flex rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                        {CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria}
                      </span>
                      {g.recuperable && (
                        <span className="inline-flex rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          recup.
                        </span>
                      )}
                    </div>
                    {g.descripcion && <p className="text-xs text-zinc-400 line-clamp-1">{g.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className="text-sm font-semibold text-zinc-100 tabular-nums mr-1">{fmt(Number(g.monto), g.moneda)}</span>
                    <button onClick={() => onEdit(g)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(g.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Categoría</th>
                  <th className="text-left px-3 py-2">Descripción</th>
                  <th className="text-right px-3 py-2">Monto</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {gastos.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-zinc-300 tabular-nums">{formatDate(g.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                        {CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria}
                      </span>
                      {g.recuperable && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          recup.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 line-clamp-1">{g.descripcion || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-100 tabular-nums">{fmt(Number(g.monto), g.moneda)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(g)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(g.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteGasto.mutateAsync(confirmDelete); toast.success('Gasto eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
          setConfirmDelete(null)
        }}
        title="Eliminar gasto"
        description="¿Seguro que querés eliminar este gasto?"
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}

// ─── Abonos ─────────────────────────────────────────────────────────────────

function TabAbonos() {
  const { data: abonos = [], isLoading } = useAbonos()
  const { data: clientesResult } = useClientes({ pageSize: 500 })
  const clientes = clientesResult?.data ?? []
  const toggle = useToggleAbono()

  if (isLoading) return <Loader />

  const clientesMap = new Map(clientes.map((c) => [c.id, c]))

  if (abonos.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin abonos mensuales"
        description="Si tenés clientes que pagan una mensualidad fija, cargalos acá. El sistema te va a avisar mes a mes quién pagó y quién no."
      />
    )
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {abonos.map((a) => {
          const c = clientesMap.get(a.cliente_id)
          return (
            <div key={a.id} className={cn('rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5', !a.activo && 'opacity-50')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {c ? (
                    <Link to={`/clientes/${c.id}`} className="text-sm font-medium text-zinc-100 hover:text-cyan-400 line-clamp-1">
                      {c.apellido}, {c.nombre}
                    </Link>
                  ) : (
                    <span className="text-sm text-zinc-500">Cliente eliminado</span>
                  )}
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Día {a.dia_de_cobro} · desde {formatDate(a.fecha_inicio)}
                    {a.fecha_fin && <> · hasta {formatDate(a.fecha_fin)}</>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-sm font-semibold text-zinc-100 tabular-nums">{fmt(Number(a.monto), a.moneda)}</span>
                  <button
                    onClick={() => toggle.mutate({ id: a.id, activo: !a.activo })}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      a.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                    )}
                  >
                    {a.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-center px-3 py-2">Día cobro</th>
              <th className="text-left px-3 py-2">Vigencia</th>
              <th className="text-center px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {abonos.map((a) => {
              const c = clientesMap.get(a.cliente_id)
              return (
                <tr key={a.id} className={cn('hover:bg-white/[0.02]', !a.activo && 'opacity-50')}>
                  <td className="px-3 py-2">
                    {c ? (
                      <Link to={`/clientes/${c.id}`} className="text-zinc-100 hover:text-cyan-400 font-medium">
                        {c.apellido}, {c.nombre}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Cliente eliminado</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-100 tabular-nums">{fmt(Number(a.monto), a.moneda)}</td>
                  <td className="px-3 py-2 text-center text-zinc-300 tabular-nums">{a.dia_de_cobro}</td>
                  <td className="px-3 py-2 text-zinc-400 text-[11px]">
                    Desde {formatDate(a.fecha_inicio)}
                    {a.fecha_fin && <> · hasta {formatDate(a.fecha_fin)}</>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggle.mutate({ id: a.id, activo: !a.activo })}
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                        a.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                      )}
                    >
                      {a.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Diálogos ───────────────────────────────────────────────────────────────

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20'

function DialogGasto({ onClose, initial }: { onClose: () => void; initial?: Gasto }) {
  const { user } = useAuth()
  const createGasto = useCreateGasto()
  const updateGasto = useUpdateGasto()
  const isEditing = Boolean(initial)
  const [fecha, setFecha] = useState(initial?.fecha ?? new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState(initial ? String(initial.monto) : '')
  const [moneda, setMoneda] = useState<MonedaCaja>(initial?.moneda ?? 'ARS')
  const [categoria, setCategoria] = useState(initial?.categoria ?? 'timbrado')
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '')
  const [recuperable, setRecuperable] = useState(initial?.recuperable ?? false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monto) return
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      if (isEditing && initial) {
        await updateGasto.mutateAsync({
          id: initial.id, fecha, monto: n, moneda, categoria,
          descripcion: descripcion || null, recuperable,
        })
        toast.success('Gasto actualizado')
      } else {
        if (!user?.id) return
        await createGasto.mutateAsync({
          fecha, monto: n, moneda, categoria,
          expediente_id: null, descripcion: descripcion || null,
          comprobante_path: null, recuperable,
          cargado_por: user.id,
        })
        toast.success('Gasto registrado')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const isPending = createGasto.isPending || updateGasto.isPending

  return (
    <DialogShell title={isEditing ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Fecha"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required /></FormRow>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label="Monto"><input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="0" required autoFocus /></FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <FormRow label="Categoría">
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
            {GASTO_CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FormRow>
        <FormRow label="Descripción (opcional)">
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Ej: cédula a Marcheton" />
        </FormRow>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={recuperable} onChange={e => setRecuperable(e.target.checked)} className="rounded border-white/10 bg-white/5" />
          Recuperable del cliente
        </label>
        <button type="submit" disabled={isPending} className="w-full rounded-md bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isEditing ? 'Guardar cambios' : 'Registrar gasto'}
        </button>
      </form>
    </DialogShell>
  )
}

function DialogIngreso({ onClose, initial }: { onClose: () => void; initial?: Ingreso }) {
  const { user } = useAuth()
  const createIngreso = useCreateIngreso()
  const updateIngreso = useUpdateIngreso()
  const isEditing = Boolean(initial)
  const { data: clientesResult } = useClientes({ pageSize: 500 })
  const clientes = clientesResult?.data ?? []
  const [fecha, setFecha] = useState(initial?.fecha ?? new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState(initial ? String(initial.monto) : '')
  const [moneda, setMoneda] = useState<MonedaCaja>(initial?.moneda ?? 'ARS')
  const [tipo, setTipo] = useState(initial?.tipo ?? 'honorario_expediente')
  const [clienteId, setClienteId] = useState<string>(initial?.cliente_id ?? '')
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '')

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => (a.apellido ?? '').localeCompare(b.apellido ?? '')),
    [clientes]
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monto) return
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      if (isEditing && initial) {
        await updateIngreso.mutateAsync({
          id: initial.id, fecha, monto: n, moneda, tipo,
          cliente_id: clienteId || null,
          descripcion: descripcion || null,
        })
        toast.success('Ingreso actualizado')
      } else {
        if (!user?.id) return
        await createIngreso.mutateAsync({
          fecha, monto: n, moneda, tipo, categoria: null,
          cliente_id: clienteId || null, expediente_id: null,
          abono_id: null, periodo_year: null, periodo_month: null,
          descripcion: descripcion || null,
          comprobante_path: null, cargado_por: user.id,
        })
        toast.success('Ingreso registrado')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const isPending = createIngreso.isPending || updateIngreso.isPending

  return (
    <DialogShell title={isEditing ? 'Editar ingreso' : 'Nuevo ingreso'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Fecha"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required /></FormRow>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label="Monto"><input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="0" required autoFocus /></FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <FormRow label="Tipo">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
            {(isEditing ? INGRESO_TIPOS : INGRESO_TIPOS.filter(t => t.value !== 'abono_mensual')).map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Cliente (opcional)">
          <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={inputCls}>
            <option value="">— sin cliente —</option>
            {clientesOrdenados.map(c => (
              <option key={c.id} value={c.id}>{c.apellido}, {c.nombre}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Descripción (opcional)">
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Ej: anticipo escrito apelación" />
        </FormRow>
        <button type="submit" disabled={isPending} className="w-full rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isEditing ? 'Guardar cambios' : 'Registrar ingreso'}
        </button>
      </form>
    </DialogShell>
  )
}

function DialogAbono({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const createAbono = useCreateAbono()
  const { data: clientesResult } = useClientes({ pageSize: 500 })
  const clientes = clientesResult?.data ?? []
  const [clienteId, setClienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<MonedaCaja>('ARS')
  const [diaDeCobro, setDiaDeCobro] = useState(10)
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10))
  const [notas, setNotas] = useState('')

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => (a.apellido ?? '').localeCompare(b.apellido ?? '')),
    [clientes]
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !monto || !clienteId) return
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    if (diaDeCobro < 1 || diaDeCobro > 28) return toast.error('Día de cobro entre 1 y 28')
    try {
      await createAbono.mutateAsync({
        cliente_id: clienteId, monto: n, moneda,
        dia_de_cobro: diaDeCobro, fecha_inicio: fechaInicio,
        fecha_fin: null, activo: true, notas: notas || null,
        created_by: user.id,
      })
      toast.success('Abono creado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Nuevo abono mensual" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Cliente">
          <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={inputCls} required autoFocus>
            <option value="">— elegí un cliente —</option>
            {clientesOrdenados.map(c => (
              <option key={c.id} value={c.id}>{c.apellido}, {c.nombre}</option>
            ))}
          </select>
        </FormRow>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label="Monto mensual"><input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="0" required /></FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Día de cobro (1-28)">
            <input type="number" min="1" max="28" value={diaDeCobro} onChange={e => setDiaDeCobro(parseInt(e.target.value) || 1)} className={inputCls} required />
          </FormRow>
          <FormRow label="Vigente desde">
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={inputCls} required />
          </FormRow>
        </div>
        <FormRow label="Notas (opcional)">
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} placeholder="Ej: incluye 3 consultas mensuales" />
        </FormRow>
        <button type="submit" disabled={createAbono.isPending} className="w-full rounded-md bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {createAbono.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Crear abono
        </button>
      </form>
    </DialogShell>
  )
}

// ─── Gastos fijos (resumen card) ────────────────────────────────────────────

function GastosFijosCard({ gastosFijos }: { gastosFijos: GastoFijoPendiente[] }) {
  const pendientes = gastosFijos.filter(g => g.estado === 'pendiente')
  const registrados = gastosFijos.filter(g => g.estado === 'registrado')

  return (
    <div className={cn(
      'rounded-xl border p-4',
      pendientes.length > 0
        ? 'border-orange-500/30 bg-orange-500/[0.04]'
        : 'border-emerald-500/30 bg-emerald-500/[0.04]'
    )}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {pendientes.length > 0
            ? <TrendingDown className="h-4 w-4 text-orange-400" />
            : <TrendingDown className="h-4 w-4 text-emerald-400" />
          }
          <h3 className="text-sm font-semibold text-zinc-100">Gastos fijos del mes</h3>
          <span className="text-[10px] text-zinc-500">
            {registrados.length} de {gastosFijos.length} registrados
          </span>
        </div>
        {pendientes.length > 0 && (
          <span className="text-[11px] font-medium text-orange-300">
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {gastosFijos.map((g) => (
          <GastoFijoPendienteRow key={g.gasto_fijo_id} gasto={g} />
        ))}
      </div>
    </div>
  )
}

function GastoFijoPendienteRow({ gasto }: { gasto: GastoFijoPendiente }) {
  const { user } = useAuth()
  const createGasto = useCreateGasto()

  const handleRegistrar = async () => {
    if (!user?.id) return
    try {
      await createGasto.mutateAsync({
        fecha: new Date().toISOString().slice(0, 10),
        monto: gasto.monto,
        moneda: gasto.moneda,
        categoria: gasto.categoria,
        expediente_id: null,
        gasto_fijo_id: gasto.gasto_fijo_id,
        descripcion: gasto.descripcion,
        comprobante_path: null,
        recuperable: false,
        cargado_por: user.id,
      })
      toast.success(`Registrado: ${gasto.descripcion}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar')
    }
  }

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md border border-white/5 px-3 py-2',
      gasto.estado === 'registrado' ? 'opacity-60' : 'bg-white/[0.02]'
    )}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 truncate">{gasto.descripcion}</p>
        <p className="text-[11px] text-zinc-500">{CATEGORIA_GASTO_LABEL[gasto.categoria] ?? gasto.categoria}</p>
      </div>
      <span className="text-sm font-semibold text-zinc-100 tabular-nums shrink-0">
        {fmt(Number(gasto.monto), gasto.moneda)}
      </span>
      {gasto.estado === 'registrado' ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 shrink-0">
          ✓ Registrado
        </span>
      ) : (
        <button
          onClick={handleRegistrar}
          disabled={createGasto.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-2 py-1 text-[11px] font-medium text-orange-300 hover:bg-orange-500/25 transition-colors disabled:opacity-50 shrink-0"
        >
          {createGasto.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Registrar
        </button>
      )}
    </div>
  )
}

// ─── Tab gastos fijos ────────────────────────────────────────────────────────

function TabGastosFijos({ onEdit }: { onEdit: (gf: GastoFijo) => void }) {
  const { data: gastosFijos = [], isLoading } = useGastosFijos()
  const toggle = useToggleGastoFijo()
  const deleteGastoFijo = useDeleteGastoFijo()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (isLoading) return <Loader />

  if (gastosFijos.length === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="Sin gastos fijos"
        description="Cargá los gastos recurrentes del estudio (alquiler, sueldos, servicios) y el sistema te va a recordar registrarlos cada mes."
      />
    )
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {gastosFijos.map((gf) => (
          <div key={gf.id} className={cn('rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5', !gf.activo && 'opacity-50')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 truncate">{gf.descripcion}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {CATEGORIA_GASTO_LABEL[gf.categoria] ?? gf.categoria}
                  {' · '}desde {formatDate(gf.fecha_inicio)}
                  {gf.fecha_fin && <> · hasta {formatDate(gf.fecha_fin)}</>}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-sm font-semibold text-zinc-100 tabular-nums">{fmt(Number(gf.monto), gf.moneda)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle.mutate({ id: gf.id, activo: !gf.activo })}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      gf.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                    )}
                  >
                    {gf.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => onEdit(gf)} className="rounded p-1 text-zinc-500 hover:text-cyan-400">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(gf.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2">Descripción</th>
              <th className="text-left px-3 py-2">Categoría</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Vigencia</th>
              <th className="text-center px-3 py-2">Estado</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {gastosFijos.map((gf) => (
              <tr key={gf.id} className={cn('hover:bg-white/[0.02]', !gf.activo && 'opacity-50')}>
                <td className="px-3 py-2 font-medium text-zinc-100">{gf.descripcion}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                    {CATEGORIA_GASTO_LABEL[gf.categoria] ?? gf.categoria}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-zinc-100 tabular-nums">{fmt(Number(gf.monto), gf.moneda)}</td>
                <td className="px-3 py-2 text-zinc-400 text-[11px]">
                  Desde {formatDate(gf.fecha_inicio)}
                  {gf.fecha_fin && <> · hasta {formatDate(gf.fecha_fin)}</>}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggle.mutate({ id: gf.id, activo: !gf.activo })}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      gf.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                    )}
                  >
                    {gf.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEdit(gf)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(gf.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteGastoFijo.mutateAsync(confirmDelete); toast.success('Gasto fijo eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
          setConfirmDelete(null)
        }}
        title="Eliminar gasto fijo"
        description="¿Seguro que querés eliminar este gasto fijo? Los gastos ya registrados no se modifican."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </>
  )
}

// ─── Dialog gasto fijo ───────────────────────────────────────────────────────

function DialogGastoFijo({ onClose, initial }: { onClose: () => void; initial?: GastoFijo }) {
  const { user } = useAuth()
  const createGastoFijo = useCreateGastoFijo()
  const updateGastoFijo = useUpdateGastoFijo()
  const isEditing = Boolean(initial)

  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '')
  const [monto, setMonto] = useState(initial ? String(initial.monto) : '')
  const [moneda, setMoneda] = useState<MonedaCaja>(initial?.moneda ?? 'ARS')
  const [categoria, setCategoria] = useState(initial?.categoria ?? 'otro')
  const [fechaInicio, setFechaInicio] = useState(initial?.fecha_inicio ?? new Date().toISOString().slice(0, 10))
  const [fechaFin, setFechaFin] = useState(initial?.fecha_fin ?? '')
  const [notas, setNotas] = useState(initial?.notas ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    if (!descripcion.trim()) return toast.error('Ingresá una descripción')
    try {
      if (isEditing && initial) {
        await updateGastoFijo.mutateAsync({
          id: initial.id,
          descripcion: descripcion.trim(),
          monto: n, moneda, categoria,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin || null,
          notas: notas || null,
        })
        toast.success('Gasto fijo actualizado')
      } else {
        if (!user?.id) return
        await createGastoFijo.mutateAsync({
          descripcion: descripcion.trim(),
          monto: n, moneda, categoria,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin || null,
          activo: true,
          notas: notas || null,
          created_by: user.id,
        })
        toast.success('Gasto fijo creado')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const isPending = createGastoFijo.isPending || updateGastoFijo.isPending

  return (
    <DialogShell title={isEditing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Descripción">
          <input
            type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className={inputCls} placeholder="Ej: Alquiler + expensas" required autoFocus
          />
        </FormRow>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label="Monto">
              <input
                type="number" step="0.01" min="0" value={monto}
                onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="0" required
              />
            </FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <FormRow label="Categoría">
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
            {GASTO_CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FormRow>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Vigente desde">
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={inputCls} required />
          </FormRow>
          <FormRow label="Hasta (opcional)">
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className={inputCls} />
          </FormRow>
        </div>
        <FormRow label="Notas (opcional)">
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} placeholder="Ej: incluye expensas" />
        </FormRow>
        <button
          type="submit" disabled={isPending}
          className="w-full rounded-md bg-orange-500/15 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isEditing ? 'Guardar cambios' : 'Crear gasto fijo'}
        </button>
      </form>
    </DialogShell>
  )
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )
}
