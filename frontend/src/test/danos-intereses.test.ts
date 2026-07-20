import { describe, it, expect } from 'vitest'
import { diasEntre, calcularIntereses } from '@/lib/danos/intereses'

describe('diasEntre', () => {
  it('cuenta días entre fechas ISO', () => {
    expect(diasEntre('2025-01-01', '2025-01-31')).toBe(30)
    expect(diasEntre('2025-01-01', '2026-01-01')).toBe(365)
  })
  it('no negativo si la fecha final es anterior', () => {
    expect(diasEntre('2025-02-01', '2025-01-01')).toBe(0)
  })
})

describe('calcularIntereses', () => {
  it('deuda de valor: segmenta tramo puro y tramo activo', () => {
    const r = calcularIntereses({
      capital: 1_000_000,
      tipoRubro: 'deuda_de_valor',
      fechaInicio: '2025-01-01',   // años no bisiestos → 365 días exactos
      fechaValuacion: '2026-01-01',
      fechaPago: '2027-01-01',
      tasaPura: 0.06,
      tasaActiva: 0.90,
    })
    // tramo puro: 1M · 0.06 · 365/365 = 60.000
    expect(r.tramoPuro).toBeCloseTo(60_000, 0)
    // tramo activo: 1M · 0.90 · 365/365 = 900.000
    expect(r.tramoActivo).toBeCloseTo(900_000, 0)
    expect(r.total).toBeCloseTo(960_000, 0)
  })

  it('punitivo: no aplica tramo puro pre-valuación', () => {
    const r = calcularIntereses({
      capital: 1_000_000,
      tipoRubro: 'punitivo',
      fechaInicio: '2025-01-01',
      fechaValuacion: '2025-01-01',
      fechaPago: '2026-01-01',
      tasaActiva: 0.90,
    })
    expect(r.tramoPuro).toBe(0)
    expect(r.tramoActivo).toBeCloseTo(900_000, 0)
  })
})
