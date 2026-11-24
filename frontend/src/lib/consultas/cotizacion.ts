// Cotización de una consulta por procesos.
//
// Un mismo cliente puede tener un conflicto con varias áreas (laboral, penal,
// civil...) y cada juicio, actuación administrativa o gestión extrajudicial
// lleva su propio honorario (una fila de `presupuestos`). La tabla
// `cotizaciones` define cómo se presenta: por separado (el cliente elige qué
// contrata) o todo junto (un solo honorario, con precio de paquete opcional),
// más la posible financiación y las condiciones.

import { ARANCEL_ESCRITO, ARANCEL_VERBAL, TIPO_ASUNTO_LABEL, type ConsultaTipoAsunto, type Presupuesto } from '@/hooks/use-consultas'

export type TipoActuacion = 'judicial' | 'administrativa' | 'extrajudicial' | 'consulta' | 'otra'
export type ModoCotizacion = 'separado' | 'conjunto'

export const TIPO_ACTUACION_LABEL: Record<TipoActuacion, string> = {
  judicial: 'Proceso judicial',
  administrativa: 'Actuación administrativa',
  extrajudicial: 'Gestión extrajudicial',
  consulta: 'Consulta',
  otra: 'Otra',
}

export interface OpcionFinanciacion {
  id: string
  titulo: string
  /** 'total' o el id de un proceso (fila de presupuestos) */
  aplica_a: string
  anticipo_tipo: 'porcentaje' | 'monto'
  anticipo: number
  cuotas: number
  /** Recargo sobre el saldo financiado, en % */
  recargo_pct: number
  nota?: string
}

export interface Cotizacion {
  consulta_id: string
  modo: ModoCotizacion
  precio_conjunto: number | null
  financiacion: OpcionFinanciacion[]
  condiciones: string | null
  validez_dias: number | null
}

export const COTIZACION_VACIA = (consultaId: string): Cotizacion => ({
  consulta_id: consultaId,
  modo: 'separado',
  precio_conjunto: null,
  financiacion: [],
  condiciones: null,
  validez_dias: 15,
})

export function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.round(n))
}

const pct = (n: number) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)}\u00a0%`

type Item = Pick<Presupuesto, 'tipo_honorario' | 'monto_base' | 'multiplicador'> & { monto_fijo?: number | null }

/** Parte cierta del honorario (lo que se cobra pase lo que pase). */
export function honorarioFijo(p: Item): number {
  switch (p.tipo_honorario) {
    case 'honorario_fijo': return p.monto_base ?? 0
    case 'arancel_verbal': return ARANCEL_VERBAL * (p.multiplicador || 1)
    case 'arancel_escrito': return ARANCEL_ESCRITO * (p.multiplicador || 1)
    case 'mixto': return p.monto_fijo ?? 0
    default: return 0
  }
}

/** Porcentaje sobre lo que se obtenga (cuota litis o parte variable del mixto). */
export function porcentajeResultado(p: Item): number | null {
  return p.tipo_honorario === 'cuota_litis' || p.tipo_honorario === 'mixto' ? (p.multiplicador ?? 0) : null
}

/** Estimación total: parte fija + porcentaje sobre el monto reclamado, si se cargó. */
export function honorarioEstimado(p: Item): number {
  const porc = porcentajeResultado(p)
  return honorarioFijo(p) + (porc !== null ? ((p.monto_base ?? 0) * porc) / 100 : 0)
}

/** Cómo se lee el honorario en el documento. */
export function describirHonorario(p: Item): string {
  const fijo = honorarioFijo(p)
  const porc = porcentajeResultado(p)
  if (p.tipo_honorario === 'cuota_litis') return `${pct(porc ?? 0)} de lo que se obtenga`
  if (p.tipo_honorario === 'mixto') return `${formatPesos(fijo)} + ${pct(porc ?? 0)} de lo que se obtenga`
  return formatPesos(fijo)
}

export function etiquetaArea(area: string | null | undefined): string {
  if (!area) return 'General'
  return TIPO_ASUNTO_LABEL[area as ConsultaTipoAsunto] ?? area
}

export interface GrupoArea<T> { area: string | null; label: string; items: T[] }

/** Agrupa los procesos por área, en el orden del diagnóstico y después el resto. */
export function agruparPorArea<T extends { area?: string | null; orden?: number; created_at?: string }>(
  items: T[], ordenAreas: string[] = [],
): GrupoArea<T>[] {
  const claves: (string | null)[] = []
  for (const a of ordenAreas) if (!claves.includes(a)) claves.push(a)
  for (const it of items) { const a = it.area ?? null; if (!claves.includes(a)) claves.push(a) }
  return claves
    .map((area) => ({
      area,
      label: etiquetaArea(area),
      items: items
        .filter((it) => (it.area ?? null) === area)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    }))
    .filter((g) => g.items.length > 0)
}

export interface Totales {
  /** Suma de las partes fijas de los procesos incluidos */
  sumaFija: number
  /** Algún proceso incluido cobra un porcentaje del resultado */
  hayPorcentaje: boolean
  /** Lo que se cobra en modo "todo junto" (precio de paquete si se fijó) */
  totalConjunto: number
  /** Bonificación del paquete respecto de la suma, en % (0 si no hay) */
  bonificacionPct: number
}

export function calcularTotales(items: (Item & { incluido?: boolean })[], cot: Pick<Cotizacion, 'modo' | 'precio_conjunto'>): Totales {
  const incluidos = items.filter((i) => i.incluido !== false)
  const sumaFija = incluidos.reduce((s, i) => s + honorarioFijo(i), 0)
  const hayPorcentaje = incluidos.some((i) => porcentajeResultado(i) !== null)
  const paquete = cot.modo === 'conjunto' && cot.precio_conjunto != null && cot.precio_conjunto > 0 ? cot.precio_conjunto : null
  const totalConjunto = paquete ?? sumaFija
  const bonificacionPct = paquete !== null && sumaFija > 0 && paquete < sumaFija ? ((sumaFija - paquete) / sumaFija) * 100 : 0
  return { sumaFija, hayPorcentaje, totalConjunto, bonificacionPct }
}

export interface PlanCalculado {
  base: number
  anticipo: number
  cuotas: number
  valorCuota: number
  total: number
}

/** Anticipo + cuotas sobre la parte fija (lo que depende del resultado no se financia). */
export function calcularFinanciacion(
  op: OpcionFinanciacion,
  items: (Item & { id: string; incluido?: boolean })[],
  cot: Pick<Cotizacion, 'modo' | 'precio_conjunto'>,
): PlanCalculado {
  let base: number
  if (op.aplica_a === 'total') {
    base = calcularTotales(items, cot).totalConjunto
  } else {
    const it = items.find((i) => i.id === op.aplica_a)
    base = it ? honorarioFijo(it) : 0
  }
  const anticipoBruto = op.anticipo_tipo === 'porcentaje' ? (base * (op.anticipo || 0)) / 100 : (op.anticipo || 0)
  const anticipo = Math.min(Math.max(anticipoBruto, 0), base)
  const cuotas = Math.max(0, Math.floor(op.cuotas || 0))
  const saldo = cuotas > 0 ? (base - anticipo) * (1 + (op.recargo_pct || 0) / 100) : 0
  const valorCuota = cuotas > 0 ? saldo / cuotas : 0
  // Sin cuotas, lo que no es anticipo se paga igual al contado
  const total = cuotas > 0 ? anticipo + saldo : base
  return { base, anticipo: cuotas > 0 ? anticipo : base, cuotas, valorCuota, total }
}

/** Texto corto del plan: "Anticipo $X + 6 cuotas de $Y" / "Contado $X". */
export function describirPlan(plan: PlanCalculado): string {
  if (plan.cuotas === 0) return `Pago único de ${formatPesos(plan.total)}`
  const cuotas = `${plan.cuotas} ${plan.cuotas === 1 ? 'cuota' : 'cuotas'} mensuales de ${formatPesos(plan.valorCuota)}`
  return plan.anticipo > 0 ? `Anticipo de ${formatPesos(plan.anticipo)} y ${cuotas}` : cuotas
}

export function nuevaOpcion(parcial: Partial<OpcionFinanciacion> = {}): OpcionFinanciacion {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
    titulo: 'En cuotas',
    aplica_a: 'total',
    anticipo_tipo: 'porcentaje',
    anticipo: 30,
    cuotas: 3,
    recargo_pct: 0,
    ...parcial,
  }
}

export const OPCIONES_RAPIDAS: { label: string; opcion: Partial<OpcionFinanciacion> }[] = [
  { label: 'Contado', opcion: { titulo: 'Contado', anticipo_tipo: 'porcentaje', anticipo: 100, cuotas: 0 } },
  { label: 'Anticipo 30 % + 3 cuotas', opcion: { titulo: 'Anticipo y cuotas', anticipo_tipo: 'porcentaje', anticipo: 30, cuotas: 3 } },
  { label: '6 cuotas', opcion: { titulo: 'En 6 cuotas', anticipo_tipo: 'porcentaje', anticipo: 0, cuotas: 6 } },
]
