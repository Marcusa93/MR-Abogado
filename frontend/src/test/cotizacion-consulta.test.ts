import { describe, it, expect } from 'vitest'
import {
  agruparPorArea, calcularFinanciacion, calcularTotales, describirHonorario, describirPlan,
  honorarioEstimado, honorarioFijo, nuevaOpcion, porcentajeResultado,
} from '@/lib/consultas/cotizacion'
import { ARANCEL_ESCRITO } from '@/hooks/use-consultas'

const item = (o: Record<string, unknown>) => ({
  id: String(Math.random()), tipo_honorario: 'honorario_fijo', monto_base: null, monto_fijo: null, multiplicador: 1, incluido: true, ...o,
}) as never

describe('honorario de un proceso', () => {
  it('fijo, cuota litis, mixto y arancel del Colegio', () => {
    expect(honorarioFijo(item({ monto_base: 800000 }))).toBe(800000)
    expect(honorarioFijo(item({ tipo_honorario: 'cuota_litis', multiplicador: 20, monto_base: 5000000 }))).toBe(0)
    expect(honorarioFijo(item({ tipo_honorario: 'mixto', monto_fijo: 300000, multiplicador: 15 }))).toBe(300000)
    expect(honorarioFijo(item({ tipo_honorario: 'arancel_escrito', multiplicador: 1.5 }))).toBe(ARANCEL_ESCRITO * 1.5)
  })

  it('porcentaje y estimación sobre lo reclamado', () => {
    const mixto = item({ tipo_honorario: 'mixto', monto_fijo: 300000, multiplicador: 15, monto_base: 2000000 })
    expect(porcentajeResultado(mixto)).toBe(15)
    expect(honorarioEstimado(mixto)).toBe(600000)
    expect(porcentajeResultado(item({ monto_base: 1 }))).toBeNull()
  })

  it('cómo se lee en el documento', () => {
    expect(describirHonorario(item({ tipo_honorario: 'cuota_litis', multiplicador: 20 }))).toBe('20\u00a0% de lo que se obtenga')
    expect(describirHonorario(item({ tipo_honorario: 'mixto', monto_fijo: 300000, multiplicador: 15 }))).toMatch(/300\.000 \+ 15\s% de lo que se obtenga$/)
  })
})

describe('totales por separado y todo junto', () => {
  const items = [
    item({ monto_base: 800000 }),
    item({ monto_base: 400000 }),
    item({ tipo_honorario: 'cuota_litis', multiplicador: 20 }),
    item({ monto_base: 999999, incluido: false }),
  ]

  it('por separado suma solo lo incluido y avisa del porcentaje', () => {
    const t = calcularTotales(items, { modo: 'separado', precio_conjunto: 1000000 })
    expect(t.sumaFija).toBe(1200000)
    expect(t.totalConjunto).toBe(1200000) // el precio de paquete no aplica por separado
    expect(t.hayPorcentaje).toBe(true)
  })

  it('todo junto con precio de paquete calcula la bonificación', () => {
    const t = calcularTotales(items, { modo: 'conjunto', precio_conjunto: 1000000 })
    expect(t.totalConjunto).toBe(1000000)
    expect(Math.round(t.bonificacionPct)).toBe(17)
  })
})

describe('financiación', () => {
  const items = [item({ id: 'a', monto_base: 900000 }), item({ id: 'b', monto_base: 300000 })]

  it('anticipo en % + cuotas con recargo sobre el saldo', () => {
    const plan = calcularFinanciacion(nuevaOpcion({ anticipo_tipo: 'porcentaje', anticipo: 30, cuotas: 3, recargo_pct: 10 }), items, { modo: 'separado', precio_conjunto: null })
    expect(plan.base).toBe(1200000)
    expect(plan.anticipo).toBe(360000)
    expect(plan.valorCuota).toBeCloseTo(308000)
    expect(plan.total).toBeCloseTo(1284000)
    expect(describirPlan(plan)).toMatch(/^Anticipo de .* y 3 cuotas mensuales de /)
  })

  it('sobre un solo proceso y de contado', () => {
    const plan = calcularFinanciacion(nuevaOpcion({ aplica_a: 'b', anticipo: 100, cuotas: 0 }), items, { modo: 'separado', precio_conjunto: null })
    expect(plan.base).toBe(300000)
    expect(plan.total).toBe(300000)
    expect(describirPlan(plan)).toMatch(/^Pago único de /)
  })

  it('todo junto usa el precio del paquete; el anticipo no supera la base', () => {
    const plan = calcularFinanciacion(nuevaOpcion({ anticipo_tipo: 'monto', anticipo: 5000000, cuotas: 2 }), items, { modo: 'conjunto', precio_conjunto: 1000000 })
    expect(plan.base).toBe(1000000)
    expect(plan.anticipo).toBe(1000000)
    expect(plan.valorCuota).toBe(0)
  })
})

describe('agrupar por área', () => {
  it('respeta el orden del diagnóstico y deja lo sin área al final', () => {
    const g = agruparPorArea([
      { area: 'civil', orden: 2 }, { area: null, orden: 1 }, { area: 'penal', orden: 1 }, { area: 'civil', orden: 1 },
    ], ['penal', 'civil'])
    expect(g.map((x) => x.area)).toEqual(['penal', 'civil', null])
    expect(g[1]!.items.map((i) => i.orden)).toEqual([1, 2])
    expect(g[2]!.label).toBe('General')
  })
})
