import { Link } from 'react-router-dom'
import { Wallet, AlertTriangle, Calendar, ChevronRight, TrendingUp } from 'lucide-react'
import { useTieneAccesoCaja, useCajaResumen, usePagosPendientes } from '@/hooks/use-caja'
import { cn } from '@/lib/utils'

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmt = (n: number) => `$ ${nf.format(n)}`
const fmtUsd = (n: number) => `US$ ${nf.format(n)}`

export function CajaWidget() {
  const { data: tieneAcceso } = useTieneAccesoCaja()
  const { data: resumen } = useCajaResumen()
  const { data: pendientes = [] } = usePagosPendientes()

  if (!tieneAcceso) return null

  const noPagados = pendientes.filter(p => p.estado !== 'pagado')
  const atrasados = noPagados.filter(p => p.estado === 'atrasado')

  const mes = resumen?.mes_actual
  const balance = mes ? mes.ingresos_ars - mes.gastos_ars : 0
  const balanceUsd = mes ? mes.ingresos_usd - mes.gastos_usd : 0
  const hayUsd = !!mes && (mes.ingresos_usd > 0 || mes.gastos_usd > 0)

  return (
    <Link
      to="/caja"
      className={cn(
        'group block rounded-xl border p-4 transition-colors',
        atrasados.length > 0
          ? 'border-rose-500/30 bg-rose-500/[0.04] hover:bg-rose-500/[0.06]'
          : 'border-emerald-500/20 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.05]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Caja del estudio</h3>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
      </div>

      {mes && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Ingresos mes</p>
              <p className="text-lg font-semibold text-emerald-300 tabular-nums">{fmt(mes.ingresos_ars)}</p>
              {mes.ingresos_usd > 0 && <p className="text-[11px] font-medium text-emerald-400/80 tabular-nums">{fmtUsd(mes.ingresos_usd)}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Gastos mes</p>
              <p className="text-lg font-semibold text-rose-300 tabular-nums">{fmt(mes.gastos_ars)}</p>
              {mes.gastos_usd > 0 && <p className="text-[11px] font-medium text-rose-400/80 tabular-nums">{fmtUsd(mes.gastos_usd)}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Balance</p>
              <p className={cn('text-lg font-semibold tabular-nums', balance >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                {fmt(balance)}
              </p>
              {hayUsd && <p className={cn('text-[11px] font-medium tabular-nums', balanceUsd >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80')}>{fmtUsd(balanceUsd)}</p>}
            </div>
          </div>
          {hayUsd && (
            <p className="mt-2 text-[10px] text-zinc-500">Montos en dólares se muestran aparte — no se convierten a pesos.</p>
          )}
        </>
      )}

      {noPagados.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {atrasados.length > 0 ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <p className="text-rose-300">
                <span className="font-semibold">{atrasados.length}</span> {atrasados.length === 1 ? 'pago atrasado' : 'pagos atrasados'}
                {noPagados.length > atrasados.length && ` · ${noPagados.length - atrasados.length} pendientes`}
              </p>
            </>
          ) : (
            <>
              <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-amber-300">
                <span className="font-semibold">{noPagados.length}</span> {noPagados.length === 1 ? 'cobro pendiente' : 'cobros pendientes'} este mes
              </p>
            </>
          )}
        </div>
      )}

      {noPagados.length === 0 && resumen && resumen.abonos_activos > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          Todos los abonos del mes están cobrados
        </div>
      )}
    </Link>
  )
}
