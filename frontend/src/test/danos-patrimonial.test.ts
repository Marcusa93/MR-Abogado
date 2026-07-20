import { describe, it, expect } from 'vitest'
import { valorPresenteRenta, calcularIncapacidad1746 } from '@/lib/danos/patrimonial'
import type { IncapacidadInput } from '@/lib/danos/types'

describe('valorPresenteRenta', () => {
  it('renta constante estándar (A=100k, n=10, i=5%)', () => {
    // 100000 · (1 - 1.05^-10) / 0.05
    expect(valorPresenteRenta(100_000, 10, 0.05)).toBeCloseTo(772_173.49, 1)
  })

  it('con tasa 0 degenera en A·n', () => {
    expect(valorPresenteRenta(100_000, 10, 0)).toBe(1_000_000)
  })

  it('n<=0 devuelve 0 (sin horizonte resarcitorio)', () => {
    expect(valorPresenteRenta(100_000, 0, 0.06)).toBe(0)
    expect(valorPresenteRenta(100_000, -5, 0.06)).toBe(0)
  })
})

describe('calcularIncapacidad1746', () => {
  const base: IncapacidadInput = {
    edad: 40,
    porcentaje: 50,
    ingreso: { montoMensual: 100_000, fuente: 'acreditado' },
    mesesPorAnio: 13,
  }

  it('preset clásico (65/6%, sin ajuste de ingreso)', () => {
    const r = calcularIncapacidad1746({ ...base, preset: 'clasico' })
    expect(r.detalle.n).toBe(25)
    expect(r.detalle.tasa).toBe(0.06)
    expect(r.detalle.factorAjuste).toBe(1)
    expect(r.detalle.perdidaAnual).toBe(650_000)
    // 650000 · (1 - 1.06^-25) / 0.06 ≈ 8,309,182
    expect(r.capital).toBeGreaterThan(8_300_000)
    expect(r.capital).toBeLessThan(8_320_000)
  })

  it('preset Vuoto/Méndez (75/4%, ajuste 60/edad)', () => {
    const r = calcularIncapacidad1746({ ...base, preset: 'vuoto_mendez' })
    expect(r.detalle.n).toBe(35)
    expect(r.detalle.tasa).toBe(0.04)
    expect(r.detalle.factorAjuste).toBeCloseTo(1.5, 5) // 60/40
    expect(r.detalle.perdidaAnual).toBe(975_000)        // 1.3M · 1.5 · 0.5
    expect(r.capital).toBeGreaterThan(18_100_000)
    expect(r.capital).toBeLessThan(18_300_000)
  })

  it('Méndez es más expansivo que el clásico para la misma persona', () => {
    const clasico = calcularIncapacidad1746({ ...base, preset: 'clasico' }).capital
    const mendez = calcularIncapacidad1746({ ...base, preset: 'vuoto_mendez' }).capital
    expect(mendez).toBeGreaterThan(clasico)
  })

  it('usa SMVM subsidiario cuando el ingreso no está acreditado', () => {
    const r = calcularIncapacidad1746(
      {
        edad: 30, porcentaje: 20, preset: 'clasico',
        ingreso: { montoMensual: null, fuente: 'no_acreditado', parametroSupletorio: 'SMVM' },
      },
      { smvm: 300_000 },
    )
    expect(r.detalle.ingresoMensual).toBe(300_000)
    expect(r.detalle.ingresoEstimado).toBe(true)
    expect(r.capital).toBeGreaterThan(0)
  })

  it('edad por encima del horizonte de vida útil da capital 0', () => {
    const r = calcularIncapacidad1746({ ...base, edad: 80, preset: 'clasico' })
    expect(r.detalle.n).toBe(0)
    expect(r.capital).toBe(0)
  })

  it('porcentaje 0 da capital 0', () => {
    const r = calcularIncapacidad1746({ ...base, porcentaje: 0 })
    expect(r.capital).toBe(0)
  })
})
