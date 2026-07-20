import { describe, it, expect } from 'vitest'
import { evaluarProcedencia, cuantificarPunitivo } from '@/lib/danos/punitivo'
import { PUNITIVO_TECHO_CBT } from '@/lib/danos/constantes'

const CBT = 1_610_772.48

describe('evaluarProcedencia', () => {
  it('el incumplimiento simple NO habilita la multa', () => {
    const r = evaluarProcedencia({})
    expect(r.procede).toBe(false)
  })

  it('un agravante fuerte habilita el análisis', () => {
    expect(evaluarProcedencia({ riesgoSalud: true }).procede).toBe(true)
    expect(evaluarProcedencia({ tratoIndigno: true }).procede).toBe(true)
  })

  it('la vulnerabilidad sola no alcanza el umbral', () => {
    expect(evaluarProcedencia({ vulnerabilidad: true }).procede).toBe(false)
  })
})

describe('cuantificarPunitivo — canastas', () => {
  it('nivel medio → 2 a 10 CBT', () => {
    const r = cuantificarPunitivo({ metodo: 'canastas', nivel: 'media' }, { cbtHogar3: CBT }, true)
    expect(r.montoMin).toBeCloseTo(2 * CBT, 2)
    expect(r.montoMax).toBeCloseTo(10 * CBT, 2)
  })

  it('cantidad de canastas manual', () => {
    const r = cuantificarPunitivo({ metodo: 'canastas', canastasManual: 15 }, { cbtHogar3: CBT }, true)
    expect(r.montoMin).toBeCloseTo(15 * CBT, 2)
    expect(r.montoMax).toBeCloseTo(15 * CBT, 2)
  })

  it('respeta el tope legal de 2100 CBT', () => {
    const r = cuantificarPunitivo({ metodo: 'canastas', canastasManual: 5000 }, { cbtHogar3: CBT }, true)
    expect(r.topeExcedido).toBe(true)
    expect(r.montoMax).toBeCloseTo(PUNITIVO_TECHO_CBT * CBT, 2)
  })

  it('no cuantifica si no procede', () => {
    const r = cuantificarPunitivo({ metodo: 'canastas', nivel: 'media' }, { cbtHogar3: CBT }, false)
    expect(r.montoMin).toBe(0)
    expect(r.montoMax).toBe(0)
    expect(r.procede).toBe(false)
  })
})

describe('cuantificarPunitivo — Irigoyen Testa', () => {
  // Tabla de sensibilidad del informe: D/C = (1 - Pc) / (Pc · Pd)
  const casos: Array<[number, number, number]> = [
    [0.9, 0.9, 0.12],
    [0.5, 0.5, 2.0],
    [0.3, 0.7, 3.33],
    [0.1, 0.9, 10.0],
    [0.1, 0.5, 18.0],
  ]
  it.each(casos)('Pc=%s Pd=%s → D/C≈%s', (Pc, Pd, mult) => {
    const r = cuantificarPunitivo(
      { metodo: 'irigoyen_testa', compensatorio: 1_000_000, probCondenaCompensatoria: Pc, probCondenaPunitiva: Pd },
      { cbtHogar3: CBT }, true,
    )
    expect(r.multiploDC).toBeCloseTo(mult, 1)
    // Consistencia: monto = C · (D/C), sin arrastrar el redondeo de la tabla.
    expect(r.montoMin).toBeCloseTo(1_000_000 * (r.multiploDC ?? 0), 0)
  })

  it('sin compensatorio C no es aplicable', () => {
    const r = cuantificarPunitivo(
      { metodo: 'irigoyen_testa', compensatorio: 0, probCondenaCompensatoria: 0.5, probCondenaPunitiva: 0.5 },
      { cbtHogar3: CBT }, true,
    )
    expect(r.montoMin).toBe(0)
    expect(r.advertencias.some(a => /compensatoria/i.test(a))).toBe(true)
  })

  it('rechaza Pc/Pd fuera de (0,1]', () => {
    const r = cuantificarPunitivo(
      { metodo: 'irigoyen_testa', compensatorio: 1_000_000, probCondenaCompensatoria: 0, probCondenaPunitiva: 0.5 },
      { cbtHogar3: CBT }, true,
    )
    expect(r.montoMin).toBe(0)
  })
})

describe('cuantificarPunitivo — beneficio ilícito', () => {
  it('neutraliza la rentabilidad: D = beneficio / probSancion', () => {
    const r = cuantificarPunitivo(
      { metodo: 'beneficio_ilicito', beneficioIlicito: 1_000_000, probSancion: 0.1 },
      { cbtHogar3: CBT }, true,
    )
    expect(r.montoMin).toBeCloseTo(10_000_000, 0)
  })
})
