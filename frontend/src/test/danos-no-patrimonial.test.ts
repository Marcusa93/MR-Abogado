import { describe, it, expect } from 'vitest'
import { inferirGravedad, calcularNoPatrimonial } from '@/lib/danos/no-patrimonial'
import type { NoPatrimonialInput } from '@/lib/danos/types'

describe('inferirGravedad', () => {
  it('sin indicadores → bajo', () => {
    expect(inferirGravedad({ baseComparable: 1 }).nivel).toBe('bajo')
  })

  it('caso agravado → extremo', () => {
    const r = inferirGravedad({
      baseComparable: 1,
      duracionMeses: 12,
      afectacionSalud: true,
      reiteracion: true,
      vulnerabilidad: 'hipervulnerable',
    })
    expect(r.nivel).toBe('extremo')
    expect(r.factores.length).toBeGreaterThan(0)
  })

  it('respeta el nivel manual', () => {
    expect(inferirGravedad({ baseComparable: 1, nivelManual: 'alto' }).nivel).toBe('alto')
  })
})

describe('calcularNoPatrimonial', () => {
  it('aplica el rango de multiplicadores de la matriz sobre la base comparable', () => {
    const input: NoPatrimonialInput = { baseComparable: 1_000_000, nivelManual: 'alto' }
    const r = calcularNoPatrimonial(input)
    // alto = 3 a 6 × base
    expect(r.montoMin).toBe(3_000_000)
    expect(r.montoMax).toBe(6_000_000)
    expect(r.multiplicadorMin).toBe(3)
    expect(r.multiplicadorMax).toBe(6)
  })

  it('base estimada baja la confianza', () => {
    const r = calcularNoPatrimonial({ baseComparable: 1_000_000, nivelManual: 'muy_alto', baseEstimada: true })
    expect(r.confianza).toBe('bajo')
  })

  it('nivel extremo llega hasta 15× la base', () => {
    const r = calcularNoPatrimonial({ baseComparable: 500_000, nivelManual: 'extremo' })
    expect(r.montoMax).toBe(7_500_000)
  })
})
