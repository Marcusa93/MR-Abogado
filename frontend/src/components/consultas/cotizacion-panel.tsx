import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Layers, Loader2, Pencil, Plus, Save, Split, Trash2, Wallet, X } from 'lucide-react'
import {
  usePresupuestos, useUpsertPresupuesto, useDeletePresupuesto,
  HONORARIO_LABEL, TIPO_ASUNTO_LABEL, ARANCEL_ESCRITO, ARANCEL_VERBAL,
  type DiagnosticoModulo, type Presupuesto, type PresupuestoInput, type TipoHonorario,
} from '@/hooks/use-consultas'
import { useCotizacionConsulta, useGuardarCotizacionConsulta } from '@/hooks/use-cotizacion-consulta'
import {
  TIPO_ACTUACION_LABEL, OPCIONES_RAPIDAS,
  agruparPorArea, calcularFinanciacion, calcularTotales, describirHonorario, describirPlan,
  etiquetaArea, formatPesos, honorarioEstimado, honorarioFijo, nuevaOpcion, porcentajeResultado,
  type Cotizacion, type OpcionFinanciacion, type TipoActuacion,
} from '@/lib/consultas/cotizacion'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

// Honorarios de la consulta por procesos: cada área del conflicto (laboral,
// penal, civil...) con sus juicios, actuaciones administrativas o gestiones,
// cada uno con su honorario. Se presentan por separado o todo junto, con
// posible financiación y condiciones.

export interface PrefillProceso { area: string | null; tipo: TipoHonorario; proceso?: string }

interface Props {
  consultaId: string
  modulos: DiagnosticoModulo[]
  areasConsulta: string[]
  prefill: PrefillProceso | null
  onPrefillConsumed: () => void
}

const INPUT = 'w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'
const LABEL = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
const CHIP = (activo: boolean) => cn(
  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
  activo
    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-400 dark:hover:border-white/20',
)

const TIPOS_HONORARIO: TipoHonorario[] = ['honorario_fijo', 'cuota_litis', 'mixto', 'arancel_verbal', 'arancel_escrito']

function parseMonto(v: string): number {
  const limpio = v.replace(/\s|\$/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}
const mostrarMonto = (n: number | null | undefined) => (n ? new Intl.NumberFormat('es-AR').format(n) : '')

function aInput(p: Presupuesto): PresupuestoInput {
  return {
    id: p.id, consulta_id: p.consulta_id, expediente_id: p.expediente_id,
    tipo_honorario: p.tipo_honorario, monto_base: p.monto_base, multiplicador: p.multiplicador,
    honorarios_calculados: p.honorarios_calculados, descripcion_ia: p.descripcion_ia, estado: p.estado, notas: p.notas,
    area: p.area, proceso: p.proceso, tipo_actuacion: p.tipo_actuacion, detalle: p.detalle,
    monto_fijo: p.monto_fijo, orden: p.orden, incluido: p.incluido,
  }
}

// ── Formulario de un proceso ────────────────────────────────────────────────

function ProcesoForm({
  consultaId, inicial, areas, accionesPorArea, ordenNuevo, onListo,
}: {
  consultaId: string
  inicial: Partial<Presupuesto>
  areas: string[]
  accionesPorArea: Record<string, string[]>
  ordenNuevo: number
  onListo: () => void
}) {
  const upsert = useUpsertPresupuesto()
  const [area, setArea] = useState<string>(inicial.area ?? areas[0] ?? '')
  const [proceso, setProceso] = useState(inicial.proceso ?? '')
  const [tipoActuacion, setTipoActuacion] = useState<TipoActuacion>(inicial.tipo_actuacion ?? 'judicial')
  const [detalle, setDetalle] = useState(inicial.detalle ?? '')
  const [tipo, setTipo] = useState<TipoHonorario>(inicial.tipo_honorario ?? 'honorario_fijo')
  const [montoBase, setMontoBase] = useState(mostrarMonto(inicial.monto_base))
  const [montoFijo, setMontoFijo] = useState(mostrarMonto(inicial.monto_fijo))
  const [porcentaje, setPorcentaje] = useState(
    inicial.tipo_honorario === 'cuota_litis' || inicial.tipo_honorario === 'mixto' ? String(inicial.multiplicador ?? 20) : '20')
  const [multiplicador, setMultiplicador] = useState(
    inicial.tipo_honorario === 'arancel_verbal' || inicial.tipo_honorario === 'arancel_escrito' ? String(inicial.multiplicador ?? 1) : '1')

  const conPorcentaje = tipo === 'cuota_litis' || tipo === 'mixto'
  const item = {
    tipo_honorario: tipo,
    monto_base: parseMonto(montoBase) || null,
    monto_fijo: tipo === 'mixto' ? parseMonto(montoFijo) || null : null,
    multiplicador: conPorcentaje ? parseFloat(porcentaje.replace(',', '.')) || 0
      : tipo === 'arancel_verbal' || tipo === 'arancel_escrito' ? parseFloat(multiplicador) || 1 : 1,
  }
  const valido = proceso.trim().length > 0 && (
    tipo === 'honorario_fijo' ? (item.monto_base ?? 0) > 0
      : conPorcentaje ? item.multiplicador > 0 && (tipo !== 'mixto' || (item.monto_fijo ?? 0) > 0)
        : true)
  const acciones = accionesPorArea[area] ?? []

  function cambiarTipo(t: TipoHonorario) {
    setTipo(t)
    if (t === 'arancel_verbal' || t === 'arancel_escrito') setTipoActuacion('consulta')
    else if (tipoActuacion === 'consulta') setTipoActuacion('judicial')
  }

  async function guardar() {
    const payload: PresupuestoInput = {
      id: inicial.id,
      consulta_id: consultaId,
      expediente_id: inicial.expediente_id ?? null,
      area: area || null,
      proceso: proceso.trim(),
      tipo_actuacion: tipoActuacion,
      detalle: detalle.trim() || null,
      tipo_honorario: tipo,
      monto_base: tipo === 'arancel_verbal' || tipo === 'arancel_escrito' ? null : item.monto_base,
      monto_fijo: item.monto_fijo,
      multiplicador: item.multiplicador,
      honorarios_calculados: honorarioEstimado(item),
      descripcion_ia: inicial.descripcion_ia ?? null,
      estado: inicial.estado ?? 'borrador',
      notas: inicial.notas ?? null,
      orden: inicial.orden ?? ordenNuevo,
      incluido: inicial.incluido ?? true,
    }
    try {
      await upsert.mutateAsync(payload)
      toast.success(inicial.id ? 'Proceso guardado' : 'Proceso agregado')
      onListo()
    } catch {
      toast.error('No se pudo guardar el proceso')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-white/15">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <label className={LABEL}>Área</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={INPUT}>
            {areas.map((a) => <option key={a} value={a}>{etiquetaArea(a)}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Proceso o actuación</label>
          <input value={proceso} onChange={(e) => setProceso(e.target.value)} list={`acciones-${area}`} autoFocus
            placeholder="Ej.: Demanda por despido, denuncia penal, reclamo ante ANSES…" className={INPUT} />
          <datalist id={`acciones-${area}`}>
            {acciones.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>

      <div>
        <label className={LABEL}>Tipo de actuación</label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TIPO_ACTUACION_LABEL) as TipoActuacion[]).map((t) => (
            <button key={t} type="button" onClick={() => setTipoActuacion(t)} className={CHIP(tipoActuacion === t)}>
              {TIPO_ACTUACION_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL}>Alcance (opcional)</label>
        <textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)}
          placeholder="Qué incluye y qué no. Ej.: hasta sentencia de primera instancia; no incluye apelación."
          className={cn(INPUT, 'resize-y')} />
      </div>

      <div>
        <label className={LABEL}>Honorario</label>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS_HONORARIO.map((t) => (
            <button key={t} type="button" onClick={() => cambiarTipo(t)} className={CHIP(tipo === t)}>
              {HONORARIO_LABEL[t]}
              {t === 'arancel_verbal' && <span className="ml-1 opacity-60">{formatPesos(ARANCEL_VERBAL)}</span>}
              {t === 'arancel_escrito' && <span className="ml-1 opacity-60">{formatPesos(ARANCEL_ESCRITO)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {tipo === 'honorario_fijo' && (
          <div className="sm:col-span-2">
            <label className={LABEL}>Monto ($)</label>
            <input inputMode="numeric" value={montoBase} onChange={(e) => setMontoBase(e.target.value)} placeholder="Ej.: 800.000" className={INPUT} />
          </div>
        )}
        {tipo === 'mixto' && (
          <div>
            <label className={LABEL}>Parte fija ($)</label>
            <input inputMode="numeric" value={montoFijo} onChange={(e) => setMontoFijo(e.target.value)} placeholder="Ej.: 300.000" className={INPUT} />
          </div>
        )}
        {conPorcentaje && (
          <>
            <div>
              <label className={LABEL}>Porcentaje del resultado (%)</label>
              <input inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="20" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Monto reclamado (para estimar)</label>
              <input inputMode="numeric" value={montoBase} onChange={(e) => setMontoBase(e.target.value)} placeholder="Opcional" className={INPUT} />
            </div>
          </>
        )}
        {(tipo === 'arancel_verbal' || tipo === 'arancel_escrito') && (
          <div>
            <label className={LABEL}>Multiplicador</label>
            <select value={multiplicador} onChange={(e) => setMultiplicador(e.target.value)} className={INPUT}>
              {['0.5', '1', '1.2', '1.5', '2', '2.5', '3'].map((v) => <option key={v} value={v}>{v.replace('.', ',')}×</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="text-xs text-zinc-500">En el documento:</span>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {describirHonorario(item)}
          {conPorcentaje && (item.monto_base ?? 0) > 0 && (
            <span className="ml-2 text-xs font-normal text-zinc-500">≈ {formatPesos(honorarioEstimado(item))} sobre lo reclamado</span>
          )}
        </span>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onListo}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={!valido || upsert.isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {inicial.id ? 'Guardar' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

// ── Un proceso ya cargado ───────────────────────────────────────────────────

function ProcesoFila({ p, onEditar }: { p: Presupuesto; onEditar: () => void }) {
  const upsert = useUpsertPresupuesto()
  const del = useDeletePresupuesto()
  const porc = porcentajeResultado(p)

  async function alternarIncluido() {
    try {
      await upsert.mutateAsync({ ...aInput(p), incluido: !p.incluido })
    } catch {
      toast.error('No se pudo actualizar')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Quitar "${p.proceso || 'este proceso'}" de los honorarios?`)) return
    try {
      await del.mutateAsync({ id: p.id, consulta_id: p.consulta_id! })
    } catch {
      toast.error('No se pudo quitar')
    }
  }

  return (
    <div className={cn('flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10', !p.incluido && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.proceso || HONORARIO_LABEL[p.tipo_honorario]}</span>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-white/10">
            {TIPO_ACTUACION_LABEL[p.tipo_actuacion] ?? p.tipo_actuacion}
          </span>
          {!p.incluido && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Fuera del documento</span>}
        </div>
        {p.detalle && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{p.detalle}</p>}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{describirHonorario(p)}</div>
        {porc !== null && (p.monto_base ?? 0) > 0 && (
          <div className="text-[11px] text-zinc-500">≈ {formatPesos(honorarioEstimado(p))}</div>
        )}
        <div className="mt-1.5 flex justify-end gap-1">
          <button type="button" onClick={alternarIncluido} title={p.incluido ? 'Sacar del documento' : 'Volver a incluir'}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5">
            {p.incluido ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onEditar} title="Editar" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={borrar} title="Quitar" className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Opción de financiación ──────────────────────────────────────────────────

function OpcionPago({
  op, items, cot, onCambiar, onQuitar,
}: {
  op: OpcionFinanciacion
  items: Presupuesto[]
  cot: Cotizacion
  onCambiar: (o: OpcionFinanciacion) => void
  onQuitar: () => void
}) {
  const plan = calcularFinanciacion(op, items, cot)
  const financiables = items.filter((i) => i.incluido && honorarioFijo(i) > 0)
  const num = (v: string) => parseFloat(v.replace(',', '.')) || 0
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
      <div className="flex gap-2">
        <input value={op.titulo} onChange={(e) => onCambiar({ ...op, titulo: e.target.value })} placeholder="Nombre de la opción" className={cn(INPUT, 'font-medium')} />
        <button type="button" onClick={onQuitar} title="Quitar opción" className="rounded-md px-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <label className={LABEL}>Sobre</label>
          <select value={op.aplica_a} onChange={(e) => onCambiar({ ...op, aplica_a: e.target.value })} className={INPUT}>
            <option value="total">{cot.modo === 'conjunto' ? 'El total (todo junto)' : 'El total, si contrata todo'}</option>
            {financiables.map((i) => <option key={i.id} value={i.id}>{i.proceso || HONORARIO_LABEL[i.tipo_honorario]} — {formatPesos(honorarioFijo(i))}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Anticipo</label>
          <div className="flex gap-1.5">
            <select value={op.anticipo_tipo} onChange={(e) => onCambiar({ ...op, anticipo_tipo: e.target.value as OpcionFinanciacion['anticipo_tipo'] })}
              className={cn(INPUT, 'w-20 shrink-0 px-2')}>
              <option value="porcentaje">%</option>
              <option value="monto">$</option>
            </select>
            <input inputMode="decimal" value={op.anticipo_tipo === 'monto' ? mostrarMonto(op.anticipo) : String(op.anticipo || '')}
              onChange={(e) => onCambiar({ ...op, anticipo: op.anticipo_tipo === 'monto' ? parseMonto(e.target.value) : num(e.target.value) })}
              placeholder="0" className={INPUT} />
          </div>
        </div>
        <div>
          <label className={LABEL}>Cuotas</label>
          <input inputMode="numeric" value={op.cuotas || ''} onChange={(e) => onCambiar({ ...op, cuotas: Math.floor(num(e.target.value)) })} placeholder="0" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Recargo (%)</label>
          <input inputMode="decimal" value={op.recargo_pct || ''} onChange={(e) => onCambiar({ ...op, recargo_pct: num(e.target.value) })} placeholder="0" className={INPUT} />
        </div>
        <div className="sm:col-span-4">
          <label className={LABEL}>Aclaración (opcional)</label>
          <input value={op.nota ?? ''} onChange={(e) => onCambiar({ ...op, nota: e.target.value })}
            placeholder="Ej.: cuotas ajustables por IPC; transferencia o efectivo" className={INPUT} />
        </div>
      </div>
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:bg-white/[0.03] dark:text-zinc-200">
        {plan.base > 0 ? <>{describirPlan(plan)}{plan.cuotas > 0 && <span className="text-zinc-500"> · total {formatPesos(plan.total)}</span>}</>
          : <span className="text-zinc-500">No hay una parte fija para financiar (lo que depende del resultado no se financia).</span>}
      </p>
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function CotizacionPanel({ consultaId, modulos, areasConsulta, prefill, onPrefillConsumed }: Props) {
  const { data: items = [], isLoading } = usePresupuestos(consultaId)
  const { data: cotGuardada } = useCotizacionConsulta(consultaId)
  const guardarCot = useGuardarCotizacionConsulta()

  const [editando, setEditando] = useState<{ inicial: Partial<Presupuesto> } | null>(null)
  const [cot, setCot] = useState<Cotizacion | null>(null)
  const [estadoGuardado, setEstadoGuardado] = useState<'ok' | 'guardando' | 'pendiente' | 'error'>('ok')
  const listo = useRef(false)
  const temporizador = useRef<number | null>(null)

  // Borrador local de la presentación; se guarda solo, con una pausa
  useEffect(() => {
    if (cotGuardada && !listo.current) { setCot(cotGuardada); listo.current = true }
  }, [cotGuardada])

  function cambiarCot(c: Cotizacion) {
    setCot(c)
    setEstadoGuardado('pendiente')
    if (temporizador.current) window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(async () => {
      setEstadoGuardado('guardando')
      try { await guardarCot.mutateAsync(c); setEstadoGuardado('ok') } catch { setEstadoGuardado('error') }
    }, 700)
  }
  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current) }, [])

  // Áreas posibles: las del diagnóstico, las de la consulta y las que ya tienen procesos
  const modulosVisibles = modulos.filter((m) => m.incluir !== false)
  const ordenAreas = useMemo(() => {
    const out: string[] = []
    for (const a of [...modulos.map((m) => m.area), ...areasConsulta]) if (a && !out.includes(a)) out.push(a)
    return out
  }, [modulos, areasConsulta])
  const areasSelect = useMemo(() => {
    const out = [...ordenAreas]
    for (const a of Object.keys(TIPO_ASUNTO_LABEL)) if (!out.includes(a)) out.push(a)
    for (const i of items) if (i.area && !out.includes(i.area)) out.push(i.area)
    return out
  }, [ordenAreas, items])
  const accionesPorArea = useMemo(() => {
    const r: Record<string, string[]> = {}
    for (const m of modulos) r[m.area] = [...(r[m.area] ?? []), ...(m.acciones_recomendadas ?? [])].filter(Boolean)
    return r
  }, [modulos])

  const grupos = agruparPorArea(items, ordenAreas)
  const ordenNuevo = items.reduce((m, i) => Math.max(m, i.orden ?? 0), 0) + 1
  const sinCotizar = modulosVisibles.filter((m) => !items.some((i) => i.area === m.area))

  // Botón "Cotizar" de un módulo del diagnóstico
  useEffect(() => {
    if (!prefill) return
    setEditando({ inicial: { area: prefill.area, tipo_honorario: prefill.tipo, proceso: prefill.proceso ?? '', tipo_actuacion: prefill.tipo === 'arancel_verbal' || prefill.tipo === 'arancel_escrito' ? 'consulta' : 'judicial' } })
    onPrefillConsumed()
  }, [prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !cot) return <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />

  const totales = calcularTotales(items, cot)
  const hayIncluidos = items.some((i) => i.incluido)

  const nuevoEn = (area: string | null, proceso = '', tipo?: TipoHonorario) =>
    setEditando({ inicial: { area, proceso, tipo_honorario: tipo ?? 'honorario_fijo', tipo_actuacion: 'judicial' } })

  return (
    <div className="space-y-5">
      {/* Modo de presentación */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-500/10 p-1">
          {([
            { id: 'separado', label: 'Por separado', icon: Split },
            { id: 'conjunto', label: 'Todo junto', icon: Layers },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => cambiarCot({ ...cot, modo: id })}
              className={cn('flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium',
                cot.modo === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {cot.modo === 'separado'
            ? 'Cada proceso con su honorario: el cliente puede contratar uno, varios o todos.'
            : 'Un solo honorario por todo lo que se cotiza. Podés fijar un precio por el paquete.'}
        </p>
      </div>

      {/* Procesos por área */}
      {grupos.map((g) => (
        <div key={g.area ?? 'general'} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{g.label}</h3>
            <button type="button" onClick={() => nuevoEn(g.area)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5">
              <Plus className="h-3.5 w-3.5" /> Agregar en {g.label.toLowerCase()}
            </button>
          </div>
          {g.items.map((p) => editando?.inicial.id === p.id ? (
            <ProcesoForm key={p.id} consultaId={consultaId} inicial={p} areas={areasSelect} accionesPorArea={accionesPorArea}
              ordenNuevo={ordenNuevo} onListo={() => setEditando(null)} />
          ) : (
            <ProcesoFila key={p.id} p={p} onEditar={() => setEditando({ inicial: p })} />
          ))}
        </div>
      ))}

      {/* Áreas del diagnóstico todavía sin honorarios: sugerencias desde las acciones recomendadas */}
      {sinCotizar.length > 0 && !editando && (
        <div className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-white/15">
          <p className="text-xs text-zinc-500">Áreas del diagnóstico sin honorarios todavía:</p>
          {sinCotizar.map((m) => (
            <div key={m.area} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{etiquetaArea(m.area)}</span>
              {(m.acciones_recomendadas ?? []).slice(0, 4).map((a) => (
                <button key={a} type="button" onClick={() => nuevoEn(m.area, a, m.tipo_honorario_sugerido)} title={a}
                  className="max-w-[16rem] truncate rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-600 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-400">
                  + {a}
                </button>
              ))}
              <button type="button" onClick={() => nuevoEn(m.area, '', m.tipo_honorario_sugerido)}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-400">
                + Otro
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Proceso nuevo */}
      {editando && !editando.inicial.id ? (
        <ProcesoForm consultaId={consultaId} inicial={editando.inicial} areas={areasSelect} accionesPorArea={accionesPorArea}
          ordenNuevo={ordenNuevo} onListo={() => setEditando(null)} />
      ) : !editando && (
        <button type="button" onClick={() => nuevoEn(ordenAreas[0] ?? null)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 hover:border-zinc-400 dark:border-white/15 dark:text-zinc-400">
          <Plus className="h-4 w-4" /> Agregar proceso o actuación
        </button>
      )}

      {/* Totales */}
      {hayIncluidos && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          {cot.modo === 'separado' ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Si contrata todo</span>
              <span className="text-right text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {formatPesos(totales.sumaFija)}
                {totales.hayPorcentaje && <span className="block text-xs font-normal text-zinc-500">más el porcentaje del resultado donde corresponde</span>}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Suma de los procesos</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{formatPesos(totales.sumaFija)}</span>
              </div>
              <div>
                <label className={LABEL}>Precio por todo junto (opcional)</label>
                <input inputMode="numeric" value={mostrarMonto(cot.precio_conjunto)}
                  onChange={(e) => cambiarCot({ ...cot, precio_conjunto: parseMonto(e.target.value) || null })}
                  placeholder={`Vacío = ${formatPesos(totales.sumaFija)}`} className={INPUT} />
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-white/10">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Total{totales.bonificacionPct > 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">bonificación {Math.round(totales.bonificacionPct)} %</span>}
                </span>
                <span className="text-right text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {formatPesos(totales.totalConjunto)}
                  {totales.hayPorcentaje && <span className="block text-xs font-normal text-zinc-500">más el porcentaje del resultado donde corresponde</span>}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Financiación */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-zinc-500" />
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Posible financiación</h3>
        </div>
        {cot.financiacion.map((op) => (
          <OpcionPago key={op.id} op={op} items={items} cot={cot}
            onCambiar={(o) => cambiarCot({ ...cot, financiacion: cot.financiacion.map((x) => (x.id === o.id ? o : x)) })}
            onQuitar={() => cambiarCot({ ...cot, financiacion: cot.financiacion.filter((x) => x.id !== op.id) })} />
        ))}
        <div className="flex flex-wrap gap-1.5">
          {OPCIONES_RAPIDAS.map((r) => (
            <button key={r.label} type="button" onClick={() => cambiarCot({ ...cot, financiacion: [...cot.financiacion, nuevaOpcion(r.opcion)] })}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-400">
              + {r.label}
            </button>
          ))}
          <button type="button" onClick={() => cambiarCot({ ...cot, financiacion: [...cot.financiacion, nuevaOpcion({ titulo: 'Opción de pago', anticipo: 0, cuotas: 1 })] })}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-400">
            + Otra
          </button>
        </div>
      </div>

      {/* Condiciones */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div>
          <label className={LABEL}>Condiciones (opcional)</label>
          <textarea rows={3} value={cot.condiciones ?? ''} onChange={(e) => cambiarCot({ ...cot, condiciones: e.target.value })}
            placeholder="Ej.: No incluye tasa de justicia, aportes, peritos ni gastos de diligenciamiento."
            className={cn(INPUT, 'resize-y')} />
        </div>
        <div>
          <label className={LABEL}>Validez (días)</label>
          <input inputMode="numeric" value={cot.validez_dias ?? ''} onChange={(e) => cambiarCot({ ...cot, validez_dias: parseInt(e.target.value, 10) || null })}
            placeholder="15" className={INPUT} />
        </div>
      </div>

      <p className="flex items-center justify-end gap-1.5 text-[11px] text-zinc-500">
        {estadoGuardado === 'guardando' || estadoGuardado === 'pendiente' ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</>
          : estadoGuardado === 'error' ? <span className="text-red-600">No se pudo guardar la presentación. Revisá la conexión.</span>
            : <><Check className="h-3 w-3" /> Presentación guardada</>}
      </p>
    </div>
  )
}
