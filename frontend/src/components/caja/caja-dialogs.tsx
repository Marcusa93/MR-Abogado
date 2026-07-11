import { useState, useMemo } from 'react'
import { X, Loader2, Plus } from 'lucide-react'
import {
  useCreateGasto, useUpdateGasto, useCreateIngreso, useUpdateIngreso,
  useCreateAbono, useCreateGastoFijo, useUpdateGastoFijo,
  GASTO_CATEGORIAS, INGRESO_TIPOS,
  type MonedaCaja, type Gasto, type Ingreso, type GastoFijo,
} from '@/hooks/use-caja'
import { useClientes } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'

// ─── Helpers compartidos ─────────────────────────────────────────────────────

const fmt = (n: number, moneda: MonedaCaja = 'ARS') => {
  const formatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `${moneda === 'USD' ? 'US$ ' : '$ '}${formatter.format(n)}`
}

export { fmt }

const inputCls = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20'

// ─── Shell + helpers del formulario ─────────────────────────────────────────

export function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

export function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">{label}</label>
      {children}
    </div>
  )
}

// ─── DialogGasto ─────────────────────────────────────────────────────────────

export function DialogGasto({ onClose, initial }: { onClose: () => void; initial?: Gasto }) {
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

// ─── DialogIngreso ────────────────────────────────────────────────────────────

export function DialogIngreso({ onClose, initial }: { onClose: () => void; initial?: Ingreso }) {
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

// ─── DialogAbono ──────────────────────────────────────────────────────────────

export function DialogAbono({ onClose }: { onClose: () => void }) {
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

// ─── DialogGastoFijo ──────────────────────────────────────────────────────────

export function DialogGastoFijo({ onClose, initial }: { onClose: () => void; initial?: GastoFijo }) {
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

// ─── Loader ───────────────────────────────────────────────────────────────────

export function Loader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )
}
