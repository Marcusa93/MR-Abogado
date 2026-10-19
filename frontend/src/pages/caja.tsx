import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, TrendingUp, TrendingDown, Calendar, Plus, AlertTriangle,
  Loader2, Trash2, Lock, Users, Repeat, Pencil, ChevronLeft, ChevronRight,
  DollarSign, Search, RotateCcw, CheckCircle2, Sparkles, Send,
} from 'lucide-react'
import {
  useTieneAccesoCaja, useCajaResumen, useGastos, useIngresos, useAbonos,
  usePagosPendientes, useCreateGasto, useCreateIngreso,
  useToggleAbono, useDeleteGasto, useDeleteIngreso,
  useGastosFijosPendientes, useGastosFijos, useGastosRecuperablesPendientes, useMarcarGastoRecuperado,
  useEnviarResumenTelegram,
  GASTO_CATEGORIAS, INGRESO_TIPOS,
  type GastoFilter, type MonedaCaja, type PagoPendiente, type Gasto, type Ingreso,
  type GastoFijo,
} from '@/hooks/use-caja'
import {
  DialogGasto, DialogIngreso, DialogAbono, DialogGastoFijo, Loader,
} from '@/components/caja/caja-dialogs'
import { GastosFijosCard, TabGastosFijos } from '@/components/caja/tab-gastos-fijos'
import { TabCajaIA } from '@/components/caja/tab-caja-ia'
import { useCajaIaObservaciones } from '@/hooks/use-caja-ia'
import { useClientes } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { useUsdRate, type CotizacionUSD } from '@/hooks/use-cotizacion'
import { useCuentasSaldos } from '@/hooks/use-cuenta-corriente'

type Tab = 'resumen' | 'ingresos' | 'gastos' | 'cuentas' | 'abonos' | 'gastos_fijos' | 'ia'

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
  const { profile } = useAuth()
  const isDirector = profile?.rol === 'DIRECTOR'
  const { data: iaObs = [] } = useCajaIaObservaciones()

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
            { id: 'cuentas' as const, label: 'Cuentas corrientes', icon: Users },
            { id: 'abonos' as const, label: 'Abonos mensuales', icon: Repeat },
            { id: 'gastos_fijos' as const, label: 'Gastos fijos', icon: TrendingDown },
          ...(isDirector ? [{ id: 'ia' as const, label: 'Análisis IA', icon: Sparkles }] : []),
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
                {t.id === 'ia' && iaObs.length > 0 && (
                  <span className={cn(
                    'inline-flex items-center justify-center h-4 min-w-4 rounded-full px-1 text-[9px] font-bold',
                    iaObs.some(o => o.nivel === 'error')
                      ? 'bg-rose-500/20 text-rose-500'
                      : 'bg-amber-500/20 text-amber-500',
                  )}>
                    {iaObs.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTab === 'resumen' && <TabResumen onGoTab={setActiveTab} />}
      {activeTab === 'ingresos' && <TabIngresos onEdit={(i) => setEditingIngreso(i)} />}
      {activeTab === 'gastos' && <TabGastos onEdit={(g) => setEditingGasto(g)} />}
      {activeTab === 'cuentas' && <TabCuentas onIrIngresos={() => setActiveTab('ingresos')} />}
      {activeTab === 'abonos' && <TabAbonos />}
      {activeTab === 'gastos_fijos' && <TabGastosFijos onEdit={(gf) => setEditingGastoFijo(gf)} />}
      {activeTab === 'ia' && isDirector && <TabCajaIA />}

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

// ─── Gastos recuperables pendientes ──────────────────────────────────────────

function GastosRecuperablesPanel() {
  const { data: items = [], isLoading } = useGastosRecuperablesPendientes()
  const marcar = useMarcarGastoRecuperado()

  if (isLoading || items.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Gastos a recuperar</h3>
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
          {items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((g) => (
          <div
            key={g.id}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100 truncate">
                {g.descripcion || CATEGORIA_GASTO_LABEL[g.categoria] || g.categoria}
              </p>
              <p className="text-[10px] text-zinc-500">
                {formatDate(g.fecha)} · {CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-amber-300 tabular-nums">
              {fmt(Number(g.monto), g.moneda)}
            </span>
            <button
              onClick={async () => {
                try {
                  await marcar.mutateAsync(g.id)
                  toast.success('Marcado como recuperado')
                } catch {
                  toast.error('No se pudo actualizar')
                }
              }}
              disabled={marcar.isPending}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              {marcar.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Recuperado
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Resumen ────────────────────────────────────────────────────────────────

function TabResumen({ onGoTab }: { onGoTab: (t: Tab) => void }) {
  const { data: resumen, isLoading } = useCajaResumen()
  const { data: pendientes = [] } = usePagosPendientes()
  const { data: gastosFijos = [] } = useGastosFijosPendientes()
  const { data: gastosFijosActivos = [] } = useGastosFijos()
  const { data: cotizacion } = useUsdRate()
  const enviarTelegram = useEnviarResumenTelegram()

  if (isLoading) return <Loader />
  if (!resumen) return null

  const mes = resumen.mes_actual
  const balance = mes.ingresos_ars - mes.gastos_ars

  const compromisosFijosARS = gastosFijosActivos
    .filter(g => g.activo && g.moneda === 'ARS')
    .reduce((s, g) => s + Number(g.monto), 0)
  const baseAseguradaARS = Number(resumen.abonos_total_mensual_ars ?? 0)
  const delta = compromisosFijosARS - baseAseguradaARS

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
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                await enviarTelegram.mutateAsync()
                toast.success('Resumen enviado a Telegram')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'No se pudo enviar')
              }
            }}
            disabled={enviarTelegram.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {enviarTelegram.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Telegram
          </button>
          <TipoCambioWidget cotizacion={cotizacion ?? null} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Ingresos del mes" value={fmt(mes.ingresos_ars)} sub={usdSubIngreso} accent="emerald" icon={TrendingUp} onClick={() => onGoTab('ingresos')} />
        <KPICard label="Gastos del mes" value={fmt(mes.gastos_ars)} sub={usdSubGasto} accent="rose" icon={TrendingDown} onClick={() => onGoTab('gastos')} />
        <KPICard label="Balance del mes" value={fmt(balance)} accent={balance >= 0 ? 'emerald' : 'rose'} icon={Wallet} sub={balance >= 0 ? 'A favor' : 'En rojo'} onClick={() => onGoTab('ingresos')} />
        <KPICard label="Abonos activos" value={String(resumen.abonos_activos)} sub={resumen.abonos_total_mensual_ars > 0 ? `${fmt(resumen.abonos_total_mensual_ars)}/mes` : null} accent="cyan" icon={Repeat} onClick={() => onGoTab('abonos')} />
      </div>

      {/* Punto de equilibrio */}
      {(compromisosFijosARS > 0 || baseAseguradaARS > 0) && (
        <div className={cn(
          'rounded-xl border p-4',
          delta <= 0
            ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
            : 'border-amber-500/30 bg-amber-500/[0.04]'
        )}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Punto de equilibrio</h3>
            </div>
            {delta <= 0 ? (
              <span className="text-[11px] font-medium text-emerald-300">Fijos cubiertos</span>
            ) : (
              <span className="text-[11px] font-medium text-amber-300">Faltan {fmt(delta)}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-zinc-500">Base asegurada (abonos)</p>
              <p className="text-lg font-semibold tabular-nums text-cyan-300">{fmt(baseAseguradaARS)}</p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Compromisos fijos</p>
              <p className="text-lg font-semibold tabular-nums text-orange-300">{fmt(compromisosFijosARS)}</p>
            </div>
          </div>
          {delta > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              Hay que generar <span className="font-semibold">{fmt(delta)}</span> en honorarios para cubrir los gastos fijos del mes.
            </p>
          )}
          {delta <= 0 && (
            <p className="mt-2 text-xs text-emerald-400/70">
              Los abonos cubren los fijos. Margen: <span className="font-semibold text-emerald-400">{fmt(-delta)}</span>
            </p>
          )}
        </div>
      )}

      {/* Gastos fijos del mes */}
      {gastosFijos.length > 0 && <GastosFijosCard gastosFijos={gastosFijos} />}

      {/* Gastos recuperables pendientes */}
      <GastosRecuperablesPanel />

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

function YearNav({ anio, setAnio, count, noun }: { anio: number; setAnio: (y: number) => void; count: number; noun: string }) {
  const now = new Date()
  const esActual = anio === now.getFullYear()
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setAnio(anio - 1)} className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:bg-white/10" title="Año anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[80px] text-center text-sm font-medium text-zinc-200">{anio}</span>
      <button onClick={() => setAnio(anio + 1)} disabled={esActual} className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:bg-white/10 disabled:opacity-30" title="Año siguiente">
        <ChevronRight className="h-4 w-4" />
      </button>
      {!esActual && (
        <button onClick={() => setAnio(now.getFullYear())} className="ml-1 rounded-md px-2 py-1 text-[11px] text-cyan-400 hover:bg-white/5">
          Año actual
        </button>
      )}
      <span className="ml-2 text-xs text-zinc-500">{count} {noun}</span>
    </div>
  )
}

function TotalesMes({ items, tipo, label }: { items: { monto: number | string; moneda: MonedaCaja }[]; tipo: 'ingreso' | 'gasto'; label?: string }) {
  const { data: cotizacion } = useUsdRate()
  const ars = items.filter(i => i.moneda === 'ARS').reduce((s, i) => s + Number(i.monto), 0)
  const usd = items.filter(i => i.moneda === 'USD').reduce((s, i) => s + Number(i.monto), 0)
  const color = tipo === 'ingreso' ? 'text-emerald-300' : 'text-rose-300'
  if (items.length === 0) return null
  const fmtRate = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label ?? 'Total del mes'}</span>
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
  const { data: clientesResult } = useClientes({ pageSize: 500 })
  const clientes = clientesResult?.data ?? []
  const deleteIngreso = useDeleteIngreso()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const clientesMap = useMemo(
    () => new Map(clientes.map((c) => [c.id, c])),
    [clientes]
  )

  const arsEquivalente = (monto: number) =>
    cotizacion ? `≈ ${fmt(Math.round(monto * cotizacion.venta))}` : null

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
            {ingresos.map((i) => {
              const cliente = i.cliente_id ? clientesMap.get(i.cliente_id) : null
              const esPorAbono = !!i.abono_id
              const periodo = esPorAbono && i.periodo_month ? `${MES_LABELS[i.periodo_month - 1]} ${i.periodo_year}` : null
              return (
                <div key={i.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] text-zinc-500 tabular-nums">{formatDate(i.fecha)}</span>
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          {TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo}
                        </span>
                        {esPorAbono && (
                          <span className="inline-flex rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                            {periodo ?? 'abono'}
                          </span>
                        )}
                      </div>
                      {cliente && (
                        <p className="text-[11px] text-zinc-400">{cliente.apellido}, {cliente.nombre}</p>
                      )}
                      {i.descripcion && <p className="text-xs text-zinc-500 line-clamp-1">{i.descripcion}</p>}
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
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Tipo / Origen</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Descripción</th>
                  <th className="text-right px-3 py-2">Monto</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ingresos.map((i) => {
                  const cliente = i.cliente_id ? clientesMap.get(i.cliente_id) : null
                  const esPorAbono = !!i.abono_id
                  const periodo = esPorAbono && i.periodo_month ? `${MES_LABELS[i.periodo_month - 1]} ${i.periodo_year}` : null
                  return (
                    <tr key={i.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-zinc-300 tabular-nums">{formatDate(i.fecha)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                            {TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo}
                          </span>
                          {esPorAbono && (
                            <span className="inline-flex items-center rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                              {periodo ?? 'abono'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-300 text-xs">
                        {cliente ? `${cliente.apellido}, ${cliente.nombre}` : <span className="text-zinc-600">—</span>}
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
                  )
                })}
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

type ModoPeriodo = 'mes' | 'anio' | 'todo'

// ─── Promedios mensuales ────────────────────────────────────────────────────
// Solo meses cerrados (el mes en curso no cuenta hasta que termina) y sin el
// primer mes si los registros empezaron a mitad de mes: si no, el promedio
// queda subestimado. Los meses sin movimientos cuentan como cero.

type Movimiento = { fecha: string; monto: number | string; moneda: MonedaCaja }

const claveMes = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

function mesesDelPeriodo(modo: ModoPeriodo, anio: number, primeraFecha: string | null): string[] {
  if (!primeraFecha) return []
  const hoy = new Date()
  // Último mes cerrado
  let finY = hoy.getFullYear()
  let finM = hoy.getMonth() // 0 = el mes anterior a enero → diciembre del año pasado
  if (finM === 0) { finY -= 1; finM = 12 }

  // Primer mes completo con datos
  let iniY = Number(primeraFecha.slice(0, 4))
  let iniM = Number(primeraFecha.slice(5, 7))
  if (Number(primeraFecha.slice(8, 10)) > 5) { iniM += 1; if (iniM === 13) { iniM = 1; iniY += 1 } }

  if (modo === 'anio') {
    if (anio > finY) return []
    if (anio < finY) { finY = anio; finM = 12 }
    if (anio > iniY) { iniY = anio; iniM = 1 }
  } else if (modo === 'mes') {
    // Últimos 12 meses cerrados
    let y = finY, m = finM - 11
    while (m < 1) { m += 12; y -= 1 }
    if (y > iniY || (y === iniY && m > iniM)) { iniY = y; iniM = m }
  }

  const meses: string[] = []
  let y = iniY, m = iniM
  while (y < finY || (y === finY && m <= finM)) {
    meses.push(claveMes(y, m))
    m += 1
    if (m === 13) { m = 1; y += 1 }
  }
  return meses
}

function promedio(items: Movimiento[], meses: string[], moneda: MonedaCaja): number {
  if (meses.length === 0) return 0
  const set = new Set(meses)
  const total = items
    .filter((i) => i.moneda === moneda && set.has(i.fecha.slice(0, 7)))
    .reduce((acc, i) => acc + Number(i.monto), 0)
  return total / meses.length
}

function etiquetaRango(meses: string[]): string {
  if (meses.length === 0) return ''
  const label = (k: string) => `${MES_LABELS[Number(k.slice(5, 7)) - 1].slice(0, 3).toLowerCase()} ${k.slice(0, 4)}`
  const rango = meses.length === 1 ? label(meses[0]) : `${label(meses[0])} – ${label(meses[meses.length - 1])}`
  return `${rango} · ${meses.length} ${meses.length === 1 ? 'mes cerrado' : 'meses cerrados'}`
}

function PromediosMensuales({ modo, anio }: { modo: ModoPeriodo; anio: number }) {
  const { data: gastos = [], isLoading: lg } = useGastos(undefined)
  const { data: ingresos = [], isLoading: li } = useIngresos()

  const datos = useMemo(() => {
    const fechas = [...gastos, ...ingresos].map((x) => x.fecha).sort()
    const meses = mesesDelPeriodo(modo, anio, fechas[0] ?? null)
    return {
      meses,
      gastoARS: promedio(gastos, meses, 'ARS'),
      gastoUSD: promedio(gastos, meses, 'USD'),
      ingresoARS: promedio(ingresos, meses, 'ARS'),
      ingresoUSD: promedio(ingresos, meses, 'USD'),
    }
  }, [gastos, ingresos, modo, anio])

  if (lg || li) return null

  if (datos.meses.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-500">
        Promedio mensual: todavía no hay meses cerrados en este período.
      </div>
    )
  }

  const resultado = datos.ingresoARS - datos.gastoARS
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Promedio mensual</span>
        <span className="text-[11px] text-zinc-500">{etiquetaRango(datos.meses)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-zinc-500">Gasto promedio</p>
          <p className="text-sm font-semibold tabular-nums text-rose-300">{fmt(Math.round(datos.gastoARS))}</p>
          {datos.gastoUSD > 0 && <p className="text-xs tabular-nums text-rose-300/80">+ {fmt(Math.round(datos.gastoUSD), 'USD')}</p>}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Ingreso promedio</p>
          <p className="text-sm font-semibold tabular-nums text-emerald-300">{fmt(Math.round(datos.ingresoARS))}</p>
          {datos.ingresoUSD > 0 && <p className="text-xs tabular-nums text-emerald-300/80">+ {fmt(Math.round(datos.ingresoUSD), 'USD')}</p>}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Resultado promedio (ARS)</p>
          <p className={cn('text-sm font-semibold tabular-nums', resultado >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
            {resultado >= 0 ? '' : '−'}{fmt(Math.round(Math.abs(resultado)))}
          </p>
        </div>
      </div>
    </div>
  )
}

function TabGastos({ onEdit }: { onEdit: (g: Gasto) => void }) {
  const now = new Date()
  const [modo, setModo] = useState<ModoPeriodo>('mes')
  const [mes, setMes] = useState<Mes>({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [anioNav, setAnioNav] = useState(now.getFullYear())
  const [search, setSearch] = useState('')
  const deleteGasto = useDeleteGasto()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filter: GastoFilter = modo === 'mes' ? mes : modo === 'anio' ? { year: anioNav } : undefined
  const { data: gastosRaw = [], isLoading } = useGastos(filter)

  const gastos = search.trim()
    ? gastosRaw.filter((g) => {
        const q = search.toLowerCase()
        return (
          (g.descripcion ?? '').toLowerCase().includes(q) ||
          (CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria).toLowerCase().includes(q)
        )
      })
    : gastosRaw

  const countNoun = gastos.length === 1 ? 'gasto' : 'gastos'

  const categoriaTotalesARS = useMemo(() => {
    if (modo === 'mes') return []
    const map = new Map<string, number>()
    for (const g of gastos) {
      if (g.moneda === 'ARS') map.set(g.categoria, (map.get(g.categoria) ?? 0) + Number(g.monto))
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => ({ label: CATEGORIA_GASTO_LABEL[cat] ?? cat, valor: val }))
  }, [gastos, modo])

  const evolucionMensual = useMemo(() => {
    if (modo !== 'anio') return []
    const meses = Array.from<number>({ length: 12 }).fill(0)
    for (const g of gastos) {
      if (g.moneda === 'ARS') {
        const m = parseInt(g.fecha.slice(5, 7), 10) - 1
        meses[m] += Number(g.monto)
      }
    }
    return meses.map((val, i) => ({ label: MES_LABELS[i].slice(0, 3), valor: val }))
  }, [gastos, modo])

  const evolucionAnual = useMemo(() => {
    if (modo !== 'todo') return []
    const map = new Map<number, number>()
    for (const g of gastos) {
      if (g.moneda === 'ARS') {
        const y = parseInt(g.fecha.slice(0, 4), 10)
        map.set(y, (map.get(y) ?? 0) + Number(g.monto))
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, val]) => ({ label: String(year), valor: val }))
  }, [gastos, modo])

  const totalLabel = modo === 'mes' ? 'Total del mes' : modo === 'anio' ? `Total ${anioNav}` : 'Total histórico'
  const emptyTitle = modo === 'mes' ? 'Sin gastos este mes' : modo === 'anio' ? `Sin gastos en ${anioNav}` : 'Sin gastos registrados'

  if (isLoading) return <Loader />

  return (
    <div className="space-y-3">
      {/* Selector de período */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          {(['mes', 'anio', 'todo'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                modo === m ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {m === 'mes' ? 'Mes' : m === 'anio' ? 'Año' : 'Todo'}
            </button>
          ))}
        </div>

        {modo === 'mes' && <MonthNav mes={mes} setMes={setMes} count={gastos.length} noun={countNoun} />}
        {modo === 'anio' && <YearNav anio={anioNav} setAnio={setAnioNav} count={gastos.length} noun={countNoun} />}
        {modo === 'todo' && <span className="text-xs text-zinc-500">{gastos.length} {countNoun}</span>}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descripción o categoría..."
          className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            ×
          </button>
        )}
      </div>

      <TotalesMes items={gastos} tipo="gasto" label={totalLabel} />

      <PromediosMensuales modo={modo} anio={anioNav} />

      {/* Desglose por categoría para año/todo */}
      {modo !== 'mes' && categoriaTotalesARS.length > 0 && (
        <DesglosePorBucket titulo="Por categoría (ARS)" data={categoriaTotalesARS} accent="rose" />
      )}

      {/* Evolución mensual para año */}
      {modo === 'anio' && evolucionMensual.some(m => m.valor > 0) && (
        <DesglosePorBucket titulo={`Evolución mensual ${anioNav} (ARS)`} data={evolucionMensual} accent="rose" />
      )}

      {/* Evolución anual para todo */}
      {modo === 'todo' && evolucionAnual.length > 0 && (
        <DesglosePorBucket titulo="Por año (ARS)" data={evolucionAnual} accent="rose" />
      )}

      {gastos.length === 0 ? (
        <EmptyState icon={TrendingDown} title={emptyTitle} description="Registrá un gasto con el botón de arriba." />
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
                      {g.gasto_fijo_id && (
                        <span className="inline-flex rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
                          fijo
                        </span>
                      )}
                      {g.recuperable && !g.recuperado_at && (
                        <span className="inline-flex rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          a recuperar
                        </span>
                      )}
                      {g.recuperado_at && (
                        <span className="inline-flex rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 line-through">
                          recuperado
                        </span>
                      )}
                    </div>
                    {g.descripcion && <p className="text-xs text-zinc-400 line-clamp-1">{g.descripcion}</p>}
                    {g.expediente_id && (
                      <p className="text-[11px] text-violet-400/70 mt-0.5">Vinculado a expediente</p>
                    )}
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
                  <th className="text-left px-3 py-2">Categoría / Origen</th>
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
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                          {CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria}
                        </span>
                        {g.gasto_fijo_id && (
                          <span className="inline-flex items-center rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
                            fijo
                          </span>
                        )}
                        {g.recuperable && !g.recuperado_at && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            a recuperar
                          </span>
                        )}
                        {g.recuperado_at && (
                          <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                            recuperado
                          </span>
                        )}
                        {g.expediente_id && (
                          <span className="inline-flex items-center rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                            expediente
                          </span>
                        )}
                      </div>
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

// ─── Cuentas corrientes ─────────────────────────────────────────────────────

function TabCuentas({ onIrIngresos }: { onIrIngresos: () => void }) {
  const { data: saldos = [], isLoading } = useCuentasSaldos()
  // Pagos que no entran en ninguna cuenta: sin cliente ni expediente
  const { data: ingresosTodos = [] } = useIngresos()
  const sinAsignar = ingresosTodos.filter((i) => !i.cliente_id && !(i as { expediente_id?: string | null }).expediente_id && i.tipo !== 'consulta')
  const [soloDeudores, setSoloDeudores] = useState(true)

  const filas = useMemo(() => {
    const visibles = soloDeudores ? saldos.filter((s) => s.saldo_ars > 0 || s.saldo_usd > 0) : saldos.filter((s) => s.saldo_ars !== 0 || s.saldo_usd !== 0)
    return [...visibles].sort((a, b) =>
      (b.vencido_ars - a.vencido_ars) || (b.vencido_usd - a.vencido_usd) || (b.saldo_ars - a.saldo_ars))
  }, [saldos, soloDeudores])

  const totalDeuda = saldos.reduce((a, s) => a + Math.max(s.saldo_ars, 0), 0)
  const totalVencido = saldos.reduce((a, s) => a + s.vencido_ars, 0)
  const totalDeudaUsd = saldos.reduce((a, s) => a + Math.max(s.saldo_usd, 0), 0)

  if (isLoading) return <Loader />

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <KPICard label="Te deben (ARS)" value={fmt(totalDeuda)} sub={totalDeudaUsd > 0 ? `+ ${fmt(totalDeudaUsd, 'USD')}` : null} accent="rose" icon={Users} />
        <KPICard label="Vencido (ARS)" value={fmt(totalVencido)} accent="amber" icon={AlertTriangle} />
        <KPICard label="Clientes con deuda" value={String(saldos.filter((s) => s.saldo_ars > 0 || s.saldo_usd > 0).length)} accent="cyan" icon={Users} />
      </div>

      {sinAsignar.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {sinAsignar.length} {sinAsignar.length === 1 ? 'pago no tiene' : 'pagos no tienen'} cliente ni expediente, así que no
            {sinAsignar.length === 1 ? ' entra' : ' entran'} en ninguna cuenta corriente.
          </span>
          <button type="button" onClick={onIrIngresos} className="font-medium underline hover:text-amber-200">
            Asignarlos en Ingresos
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} className="rounded border-white/10 bg-white/5" />
        Solo clientes con deuda
      </label>

      {filas.length === 0 ? (
        <EmptyState icon={Users} title={soloDeudores ? 'Nadie debe nada' : 'Sin movimientos'}
          description="Cargá lo pactado desde la ficha del cliente → Cuenta corriente, o desde la solapa Caja del expediente." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Vencido</th>
                <th className="hidden px-3 py-2 text-left md:table-cell">Último pago</th>
                <th className="hidden px-3 py-2 text-left md:table-cell">Próximo vencimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filas.map((s) => (
                <tr key={s.cliente_id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <Link to={`/clientes/${s.cliente_id}?tab=cuenta`} className="text-zinc-100 hover:text-cyan-400 hover:underline">
                      {s.apellido ? `${s.apellido}, ${s.nombre ?? ''}` : (s.nombre ?? 'Cliente')}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.saldo_ars !== 0 && (
                      <span className={s.saldo_ars > 0 ? 'text-zinc-100' : 'text-amber-300'}
                        title={s.saldo_ars < 0 ? 'Pagos sin cargo registrado (falta cargar lo pactado o pagó de más)' : undefined}>
                        {s.saldo_ars < 0 ? 'sin cargo ' : ''}{fmt(Math.abs(s.saldo_ars))}
                      </span>
                    )}
                    {s.saldo_usd !== 0 && <span className="ml-2 text-zinc-300">{fmt(Math.abs(s.saldo_usd), 'USD')}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.vencido_ars > 0 && <span className="font-medium text-rose-400">{fmt(s.vencido_ars)}</span>}
                    {s.vencido_usd > 0 && <span className="ml-2 font-medium text-rose-400">{fmt(s.vencido_usd, 'USD')}</span>}
                    {s.vencido_ars <= 0 && s.vencido_usd <= 0 && <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="hidden px-3 py-2 text-zinc-400 md:table-cell">{s.ultimo_pago ? formatDate(s.ultimo_pago) : '—'}</td>
                  <td className="hidden px-3 py-2 text-zinc-400 md:table-cell">{s.proximo_vencimiento ? formatDate(s.proximo_vencimiento) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        Saldo = honorarios pactados + abonos devengados + gastos recuperables − pagos. "Sin cargo" = pagos sin un cargo que los respalde.
      </p>
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

