import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import {
  useCuentaCorriente, useCrearCargo, useEliminarCargo, useRegistrarPago, type MovimientoCC, type NuevoCargo,
} from '@/hooks/use-cuenta-corriente'
import type { MonedaCaja } from '@/hooks/use-caja'
import { DialogShell, FormRow, inputCls } from '@/components/caja/caja-dialogs'
import { SelectorExpediente, useExpedienteOpcion, type ExpedienteOpcion } from '@/components/caja/selectores'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Cuenta corriente de un cliente (todos sus expedientes y abonos) o de un
// expediente. Debe = honorarios pactados, abonos devengados, gastos
// recuperables. Haber = pagos y gastos recuperados. Saldo por moneda.

const fmt = (n: number, moneda: MonedaCaja = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(n)

const fechaCorta = (iso: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

interface Totales { saldo: number; vencido: number; cargos: number; pagos: number }

function calcularTotales(movs: MovimientoCC[], moneda: MonedaCaja): Totales {
  const hoy = hoyISO()
  const delaMoneda = movs.filter((m) => m.moneda === moneda)
  const cargos = delaMoneda.reduce((a, m) => a + m.debe, 0)
  const pagos = delaMoneda.reduce((a, m) => a + m.haber, 0)
  const cargosVencidos = delaMoneda
    .filter((m) => m.clase === 'cargo' && (m.vencimiento ?? m.fecha) <= hoy)
    .reduce((a, m) => a + m.debe, 0)
  return { saldo: cargos - pagos, vencido: Math.max(cargosVencidos - pagos, 0), cargos, pagos }
}

function Resumen({ moneda, t }: { moneda: MonedaCaja; t: Totales }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Saldo {moneda}</p>
      {t.saldo > 0 ? (
        <p className="text-lg font-semibold tabular-nums text-rose-300">Debe {fmt(t.saldo, moneda)}</p>
      ) : t.saldo < 0 ? (
        <p className="text-lg font-semibold tabular-nums text-amber-300"
          title="Hay pagos sin un cargo que los respalde: falta cargar lo pactado, o el cliente pagó de más.">
          {fmt(-t.saldo, moneda)} sin cargo registrado
        </p>
      ) : (
        <p className="text-lg font-semibold tabular-nums text-emerald-300">Al día</p>
      )}
      <p className="mt-0.5 text-[11px] text-zinc-500">
        Cargos {fmt(t.cargos, moneda)} · Pagos {fmt(t.pagos, moneda)}
        {t.vencido > 0 && <span className="ml-1 font-medium text-rose-400">· Vencido {fmt(t.vencido, moneda)}</span>}
      </p>
    </div>
  )
}

export function CuentaCorriente({ clienteId, expedienteId }: {
  /** Cliente de la cuenta (obligatorio para cargar cargos y pagos) */
  clienteId: string | null
  /** Si se pasa, solo los movimientos de ese expediente */
  expedienteId?: string
}) {
  const { data: movs = [], isLoading } = useCuentaCorriente(expedienteId ? { expedienteId } : { clienteId: clienteId ?? undefined })
  const eliminar = useEliminarCargo()
  const [dialogo, setDialogo] = useState<'cargo' | 'pago' | null>(null)
  const [borrar, setBorrar] = useState<MovimientoCC | null>(null)

  const monedas = useMemo(() => {
    const set = new Set<MonedaCaja>(movs.map((m) => m.moneda))
    if (set.size === 0) set.add('ARS')
    return (['ARS', 'USD'] as MonedaCaja[]).filter((m) => set.has(m))
  }, [movs])

  // Saldo acumulado por moneda, en orden cronológico
  const filas = useMemo(() => {
    const acumulado: Record<string, number> = {}
    return movs.map((m) => {
      acumulado[m.moneda] = (acumulado[m.moneda] ?? 0) + m.debe - m.haber
      return { ...m, saldo: acumulado[m.moneda] }
    })
  }, [movs])

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
  }

  const hoy = hoyISO()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Wallet className="h-4 w-4 text-cyan-400" />
        <h3 className="flex-1 text-sm font-semibold text-zinc-100">Cuenta corriente</h3>
        {clienteId && (
          <>
            <button type="button" onClick={() => setDialogo('cargo')}
              className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20">
              <Plus className="h-3.5 w-3.5" /> Cargar honorarios
            </button>
            <button type="button" onClick={() => setDialogo('pago')}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">
              <Receipt className="h-3.5 w-3.5" /> Registrar pago
            </button>
          </>
        )}
      </div>

      {!clienteId && (
        <p className="text-xs text-amber-400">El expediente no tiene cliente asignado: asignalo para poder cargar honorarios y pagos.</p>
      )}

      <div className={cn('grid gap-2', monedas.length > 1 ? 'sm:grid-cols-2' : '')}>
        {monedas.map((m) => <Resumen key={m} moneda={m} t={calcularTotales(movs, m)} />)}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
          Sin movimientos. Cargá lo pactado con "Cargar honorarios" y los cobros con "Registrar pago".
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Concepto</th>
                <th className="px-3 py-2 text-right">Debe</th>
                <th className="px-3 py-2 text-right">Haber</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filas.map((m) => {
                const vencida = m.clase === 'cargo' && !!m.vencimiento && m.vencimiento < hoy
                return (
                  <tr key={`${m.ref_tabla}-${m.ref_id}-${m.fecha}-${m.clase}`} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-400">{fechaCorta(m.fecha)}</td>
                    <td className="px-3 py-2 text-zinc-200">
                      {m.concepto}
                      {m.vencimiento && m.clase === 'cargo' && m.vencimiento !== m.fecha && (
                        <span className={cn('ml-1.5 text-[10px]', vencida ? 'text-rose-400' : 'text-zinc-500')}>
                          vence {fechaCorta(m.vencimiento)}
                        </span>
                      )}
                      {!expedienteId && m.expediente_id && (
                        <Link to={`/expedientes/${m.expediente_id}`} className="ml-1.5 text-[10px] text-cyan-400 hover:underline">
                          {(m.expediente_caratula ?? m.expediente_numero ?? 'Expediente').slice(0, 40)}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-rose-300">{m.debe ? fmt(m.debe, m.moneda) : ''}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-300">{m.haber ? fmt(m.haber, m.moneda) : ''}</td>
                    <td className={cn('whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums', m.saldo > 0 ? 'text-zinc-100' : 'text-zinc-500')}>
                      {fmt(m.saldo, m.moneda)}
                    </td>
                    <td className="px-2 py-2">
                      {m.ref_tabla === 'honorarios_cargos' && (
                        <button type="button" onClick={() => setBorrar(m)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar cargo">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-500">
        Los abonos se cargan solos cada mes. Los gastos marcados como recuperables se le cargan al cliente;
        al marcarlos como recuperados se descuentan. Los cobros de consulta no entran en la cuenta.
      </p>

      {dialogo === 'cargo' && clienteId && (
        <DialogCargo clienteId={clienteId} expedienteId={expedienteId} onClose={() => setDialogo(null)} />
      )}
      {dialogo === 'pago' && clienteId && (
        <DialogPago clienteId={clienteId} expedienteId={expedienteId} onClose={() => setDialogo(null)} />
      )}
      <ConfirmDialog
        open={!!borrar}
        onClose={() => setBorrar(null)}
        onConfirm={async () => {
          if (!borrar) return
          try { await eliminar.mutateAsync(borrar.ref_id); toast.success('Cargo eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo eliminar') }
          setBorrar(null)
        }}
        title="Eliminar cargo"
        description={borrar ? `¿Eliminar "${borrar.concepto}"? Queda registrado en la actividad.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}

function useExpedienteFijo(expedienteId?: string) {
  const { data } = useExpedienteOpcion(expedienteId)
  return data ?? null
}

function DialogCargo({ clienteId, expedienteId, onClose }: { clienteId: string; expedienteId?: string; onClose: () => void }) {
  const crear = useCrearCargo()
  const fijo = useExpedienteFijo(expedienteId)
  const [expediente, setExpediente] = useState<ExpedienteOpcion | null>(null)
  const [concepto, setConcepto] = useState('')
  const [tipo, setTipo] = useState<NuevoCargo['tipo']>('honorario')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<MonedaCaja>('ARS')
  const [fecha, setFecha] = useState(hoyISO())
  const [vencimiento, setVencimiento] = useState('')
  const [cuotas, setCuotas] = useState('1')

  const n = Math.max(1, Math.min(60, parseInt(cuotas || '1', 10) || 1))
  const total = parseFloat(monto)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!concepto.trim()) return toast.error('Indicá el concepto')
    if (!isFinite(total) || total <= 0) return toast.error('Monto inválido')
    if (n > 1 && !vencimiento) return toast.error('Indicá el vencimiento de la primera cuota')
    try {
      await crear.mutateAsync({
        cliente_id: clienteId,
        expediente_id: expedienteId ?? expediente?.id ?? null,
        tipo, concepto: concepto.trim(), monto: total, moneda, fecha,
        vencimiento: vencimiento || null, cuotas: n, notas: null,
      })
      toast.success(n > 1 ? `Plan de ${n} cuotas cargado` : 'Cargo registrado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Cargar honorarios" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Concepto">
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputCls}
            placeholder="Ej: Honorarios demanda laboral" required autoFocus />
        </FormRow>
        <FormRow label="Expediente">
          {expedienteId
            ? <p className="truncate rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{fijo?.label ?? 'Este expediente'}</p>
            : <SelectorExpediente value={expediente} onChange={setExpediente} clienteId={clienteId}
                placeholder="Opcional: expediente del cliente…" />}
        </FormRow>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label={n > 1 ? 'Monto total' : 'Monto'}>
              <input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0" required />
            </FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as NuevoCargo['tipo'])} className={inputCls}>
              <option value="honorario">Honorarios pactados</option>
              <option value="anticipo">Anticipo</option>
              <option value="regulacion">Regulación judicial</option>
              <option value="otro">Otro</option>
            </select>
          </FormRow>
          <FormRow label="Cuotas">
            <input type="number" min="1" max="60" value={cuotas} onChange={(e) => setCuotas(e.target.value)} className={inputCls} />
          </FormRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Fecha del pacto">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} required />
          </FormRow>
          <FormRow label={n > 1 ? 'Vence la 1ª cuota' : 'Vencimiento (opcional)'}>
            <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className={inputCls} />
          </FormRow>
        </div>
        {n > 1 && isFinite(total) && total > 0 && (
          <p className="text-[11px] text-zinc-400">
            {n} cuotas mensuales de {fmt(Math.floor((total / n) * 100) / 100, moneda)}
            {vencimiento && `, desde el ${fechaCorta(vencimiento)}`}.
          </p>
        )}
        <button type="submit" disabled={crear.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50">
          {crear.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {n > 1 ? `Cargar ${n} cuotas` : 'Cargar'}
        </button>
      </form>
    </DialogShell>
  )
}

function DialogPago({ clienteId, expedienteId, onClose }: { clienteId: string; expedienteId?: string; onClose: () => void }) {
  const registrar = useRegistrarPago()
  const fijo = useExpedienteFijo(expedienteId)
  const [expediente, setExpediente] = useState<ExpedienteOpcion | null>(null)
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<MonedaCaja>('ARS')
  const [fecha, setFecha] = useState(hoyISO())
  const [tipo, setTipo] = useState('honorario_expediente')
  const [descripcion, setDescripcion] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      await registrar.mutateAsync({
        cliente_id: clienteId,
        expediente_id: expedienteId ?? expediente?.id ?? null,
        fecha, monto: n, moneda, tipo, descripcion: descripcion.trim() || null,
      })
      toast.success('Pago registrado', 'También figura en Caja → Ingresos.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Registrar pago" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <FormRow label="Monto">
              <input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0" required autoFocus />
            </FormRow>
          </div>
          <FormRow label="Moneda">
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Fecha">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} required />
          </FormRow>
          <FormRow label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
              <option value="honorario_expediente">Honorarios</option>
              <option value="anticipo">Anticipo</option>
              <option value="pacto_quota_litis">Cuota litis</option>
              <option value="otro">Otro</option>
            </select>
          </FormRow>
        </div>
        <FormRow label="Expediente">
          {expedienteId
            ? <p className="truncate rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{fijo?.label ?? 'Este expediente'}</p>
            : <SelectorExpediente value={expediente} onChange={setExpediente} clienteId={clienteId}
                placeholder="Opcional: expediente del cliente…" />}
        </FormRow>
        <FormRow label="Descripción (opcional)">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputCls} placeholder="Ej: transferencia, cuota 2/6" />
        </FormRow>
        <button type="submit" disabled={registrar.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
          {registrar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Registrar pago
        </button>
      </form>
    </DialogShell>
  )
}
