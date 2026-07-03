import { useState } from 'react'
import { Wallet, Plus, Loader2, TrendingUp, TrendingDown, Lock, Coins, Pencil, Trash2 } from 'lucide-react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { useCajaPorExpediente, type CajaPorExpedienteGasto, type CajaPorExpedienteIngreso } from '@/hooks/use-caja-expediente'
import {
  useTieneAccesoCaja, useCreateGasto, useCreateIngreso,
  useUpdateGasto, useUpdateIngreso, useDeleteGasto, useDeleteIngreso,
  GASTO_CATEGORIAS, INGRESO_TIPOS, type MonedaCaja,
} from '@/hooks/use-caja'
import { useAuth } from '@/hooks/use-auth'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

const fmt = (n: number, moneda: MonedaCaja = 'ARS') => {
  const f = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `${moneda === 'USD' ? 'US$ ' : '$ '}${f.format(n)}`
}

const CATEGORIA_LABEL = Object.fromEntries(GASTO_CATEGORIAS.map(c => [c.value, c.label])) as Record<string, string>
const TIPO_INGRESO_LABEL = Object.fromEntries(INGRESO_TIPOS.map(t => [t.value, t.label])) as Record<string, string>

interface Props {
  expedienteId: string
}

export function TabCaja({ expedienteId }: Props) {
  const { data: tieneAcceso, isLoading: loadingAcceso } = useTieneAccesoCaja()
  const { data, isLoading, isError } = useCajaPorExpediente(expedienteId, Boolean(tieneAcceso))
  const [dialogOpen, setDialogOpen] = useState<null | 'gasto' | 'ingreso'>(null)

  if (loadingAcceso) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!tieneAcceso) {
    return (
      <Card title="Caja del expediente">
        <EmptyState
          icon={Lock}
          title="Sin acceso a Caja"
          description="No tenés permisos para ver los movimientos económicos del estudio. Pedile al administrador que active tu acceso."
        />
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card title="Caja del expediente">
        <p className="text-sm text-red-300">No se pudo cargar la información de caja.</p>
      </Card>
    )
  }

  const balanceArs = data.totales.ingresos_ars - data.totales.gastos_ars

  return (
    <Card
      title="Caja del expediente"
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialogOpen('ingreso')}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Ingreso
          </button>
          <button
            onClick={() => setDialogOpen('gasto')}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/25 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Gasto
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Totales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatMini label="Ingresos" value={fmt(data.totales.ingresos_ars)} sub={data.totales.ingresos_usd > 0 ? `+ ${fmt(data.totales.ingresos_usd, 'USD')}` : null} icon={TrendingUp} color="emerald" />
          <StatMini label="Gastos" value={fmt(data.totales.gastos_ars)} sub={data.totales.gastos_usd > 0 ? `+ ${fmt(data.totales.gastos_usd, 'USD')}` : null} icon={TrendingDown} color="rose" />
          <StatMini label="Balance" value={fmt(balanceArs)} icon={Wallet} color={balanceArs >= 0 ? 'emerald' : 'rose'} />
          {data.totales.recuperable_ars > 0 ? (
            <StatMini label="A recuperar" value={fmt(data.totales.recuperable_ars)} sub={data.totales.recuperado_ars > 0 ? `${fmt(data.totales.recuperado_ars)} ya cobrado` : 'pendiente'} icon={Coins} color="amber" />
          ) : (
            <StatMini label="Ya recuperado" value={fmt(data.totales.recuperado_ars)} icon={Coins} color="muted" />
          )}
        </div>

        {/* Listas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ListaIngresos items={data.ingresos} />
          <ListaGastos items={data.gastos} />
        </div>
      </div>

      {dialogOpen === 'ingreso' && <DialogIngresoExpediente expedienteId={expedienteId} onClose={() => setDialogOpen(null)} />}
      {dialogOpen === 'gasto' && <DialogGastoExpediente expedienteId={expedienteId} onClose={() => setDialogOpen(null)} />}
    </Card>
  )
}

function StatMini({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string | null
  icon: React.ComponentType<{ className?: string }>
  color: 'emerald'|'rose'|'amber'|'muted'
}) {
  const cls = {
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300',
    rose: 'border-rose-500/20 bg-rose-500/[0.04] text-rose-300',
    amber: 'border-amber-500/20 bg-amber-500/[0.04] text-amber-300',
    muted: 'border-white/10 bg-white/[0.02] text-zinc-400',
  }[color]
  return (
    <div className={cn('rounded-lg border px-3 py-2', cls)}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
        <Icon className="h-3 w-3 opacity-80" />
      </div>
      <p className="mt-0.5 text-sm font-bold text-zinc-50 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] opacity-70">{sub}</p>}
    </div>
  )
}

function ListaIngresos({ items }: { items: import('@/hooks/use-caja-expediente').CajaPorExpedienteIngreso[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
        <h4 className="text-xs font-semibold text-zinc-100">Ingresos ({items.length})</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-500 py-2 text-center">Sin ingresos cargados a este expediente.</p>
      ) : (
        <div className="space-y-1">
          {items.map((i) => <FilaIngreso key={i.id} i={i} />)}
        </div>
      )}
    </div>
  )
}

function FilaIngreso({ i }: { i: CajaPorExpedienteIngreso }) {
  const [editing, setEditing] = useState(false)
  const del = useDeleteIngreso()
  return (
    <>
      <div className="flex items-center gap-2 text-xs group">
        <span className="text-zinc-500 tabular-nums w-16">{formatDate(i.fecha)}</span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-300 shrink-0">
          {TIPO_INGRESO_LABEL[i.tipo] ?? i.tipo}
        </span>
        <span className="text-zinc-400 line-clamp-1 flex-1">{i.descripcion || '—'}</span>
        <span className="font-medium text-zinc-100 tabular-nums">{fmt(Number(i.monto), i.moneda)}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar"><Pencil className="h-3 w-3" /></button>
          <button onClick={() => { if (confirm('¿Borrar este ingreso?')) del.mutate(i.id) }} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Borrar"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {editing && <EditarIngresoDialog i={i} onClose={() => setEditing(false)} />}
    </>
  )
}

function ListaGastos({ items }: { items: import('@/hooks/use-caja-expediente').CajaPorExpedienteGasto[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
        <h4 className="text-xs font-semibold text-zinc-100">Gastos ({items.length})</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-500 py-2 text-center">Sin gastos cargados a este expediente.</p>
      ) : (
        <div className="space-y-1">
          {items.map((g) => <FilaGasto key={g.id} g={g} />)}
        </div>
      )}
    </div>
  )
}

function FilaGasto({ g }: { g: CajaPorExpedienteGasto }) {
  const [editing, setEditing] = useState(false)
  const del = useDeleteGasto()
  return (
    <>
      <div className="flex items-center gap-2 text-xs group">
        <span className="text-zinc-500 tabular-nums w-16">{formatDate(g.fecha)}</span>
        <span className="rounded-full bg-rose-500/10 px-1.5 py-0 text-[10px] text-rose-300 shrink-0">
          {CATEGORIA_LABEL[g.categoria] ?? g.categoria}
        </span>
        {g.recuperable && (
          <span className={cn(
            'rounded-full px-1.5 py-0 text-[10px] shrink-0',
            g.recuperado_at ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
          )}>
            {g.recuperado_at ? 'cobrado' : 'recup.'}
          </span>
        )}
        <span className="text-zinc-400 line-clamp-1 flex-1">{g.descripcion || '—'}</span>
        <span className="font-medium text-zinc-100 tabular-nums">{fmt(Number(g.monto), g.moneda)}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar"><Pencil className="h-3 w-3" /></button>
          <button onClick={() => { if (confirm('¿Borrar este gasto?')) del.mutate(g.id) }} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Borrar"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {editing && <EditarGastoDialog g={g} onClose={() => setEditing(false)} />}
    </>
  )
}

// ─── Diálogos pre-llenados con expediente_id ────────────────────────────────

const inputCls = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20'

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function DialogGastoExpediente({ expedienteId, onClose }: { expedienteId: string; onClose: () => void }) {
  const { user } = useAuth()
  const createGasto = useCreateGasto()
  const qc = useQueryClient()
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<MonedaCaja>('ARS')
  const [categoria, setCategoria] = useState('timbrado')
  const [descripcion, setDescripcion] = useState('')
  const [recuperable, setRecuperable] = useState(true)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !monto) return
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      await createGasto.mutateAsync({
        fecha, monto: n, moneda, categoria,
        expediente_id: expedienteId, descripcion: descripcion || null,
        comprobante_path: null, recuperable, cargado_por: user.id,
      })
      toast.success('Gasto cargado al expediente')
      qc.invalidateQueries({ queryKey: ['caja-por-expediente', expedienteId] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Gasto del expediente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="Monto" required autoFocus />
          </div>
          <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
          {GASTO_CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Descripción (opcional)" />
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={recuperable} onChange={e => setRecuperable(e.target.checked)} className="rounded border-white/10 bg-white/5" />
          Recuperable del cliente
        </label>
        <button type="submit" disabled={createGasto.isPending} className="w-full rounded-md bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {createGasto.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Cargar gasto
        </button>
      </form>
    </DialogShell>
  )
}

function DialogIngresoExpediente({ expedienteId, onClose }: { expedienteId: string; onClose: () => void }) {
  const { user } = useAuth()
  const createIngreso = useCreateIngreso()
  const qc = useQueryClient()
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<MonedaCaja>('ARS')
  const [tipo, setTipo] = useState('honorario_expediente')
  const [descripcion, setDescripcion] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !monto) return
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      await createIngreso.mutateAsync({
        fecha, monto: n, moneda, tipo, categoria: null,
        cliente_id: null, expediente_id: expedienteId,
        abono_id: null, periodo_year: null, periodo_month: null,
        descripcion: descripcion || null, comprobante_path: null,
        cargado_por: user.id,
      })
      toast.success('Ingreso cargado al expediente')
      qc.invalidateQueries({ queryKey: ['caja-por-expediente', expedienteId] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Ingreso del expediente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="Monto" required autoFocus />
          </div>
          <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
          {INGRESO_TIPOS.filter(t => t.value !== 'abono_mensual').map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Descripción (opcional)" />
        <button type="submit" disabled={createIngreso.isPending} className="w-full rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {createIngreso.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Cargar ingreso
        </button>
      </form>
    </DialogShell>
  )
}

// ─── Diálogos de edición ────────────────────────────────────────────────────

function EditarGastoDialog({ g, onClose }: { g: CajaPorExpedienteGasto; onClose: () => void }) {
  const update = useUpdateGasto()
  const [fecha, setFecha] = useState(g.fecha)
  const [monto, setMonto] = useState(String(g.monto))
  const [moneda, setMoneda] = useState<MonedaCaja>(g.moneda)
  const [categoria, setCategoria] = useState(g.categoria)
  const [descripcion, setDescripcion] = useState(g.descripcion ?? '')
  const [recuperable, setRecuperable] = useState(g.recuperable)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      await update.mutateAsync({ id: g.id, fecha, monto: n, moneda, categoria, descripcion: descripcion || null, recuperable })
      toast.success('Gasto actualizado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Editar gasto" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="Monto" required autoFocus />
          </div>
          <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
          {GASTO_CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Descripción / observación" />
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={recuperable} onChange={e => setRecuperable(e.target.checked)} className="rounded border-white/10 bg-white/5" />
          Recuperable del cliente
        </label>
        <button type="submit" disabled={update.isPending} className="w-full rounded-md bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar cambios
        </button>
      </form>
    </DialogShell>
  )
}

function EditarIngresoDialog({ i, onClose }: { i: CajaPorExpedienteIngreso; onClose: () => void }) {
  const update = useUpdateIngreso()
  const [fecha, setFecha] = useState(i.fecha)
  const [monto, setMonto] = useState(String(i.monto))
  const [moneda, setMoneda] = useState<MonedaCaja>(i.moneda)
  const [tipo, setTipo] = useState(i.tipo)
  const [descripcion, setDescripcion] = useState(i.descripcion ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(monto)
    if (!isFinite(n) || n <= 0) return toast.error('Monto inválido')
    try {
      await update.mutateAsync({ id: i.id, fecha, monto: n, moneda, tipo, descripcion: descripcion || null })
      toast.success('Ingreso actualizado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <DialogShell title="Editar ingreso" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} required />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} placeholder="Monto" required autoFocus />
          </div>
          <select value={moneda} onChange={e => setMoneda(e.target.value as MonedaCaja)} className={inputCls}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
          {INGRESO_TIPOS.filter(t => t.value !== 'abono_mensual').map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Descripción / observación" />
        <button type="submit" disabled={update.isPending} className="w-full rounded-md bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
          {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar cambios
        </button>
      </form>
    </DialogShell>
  )
}
