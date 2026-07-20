import { describe, it, expect } from 'vitest'
import { calcularDanos } from '@/lib/danos/escenarios'
import type { CalculoDanosInput, ValoresReferencia } from '@/lib/danos/types'

const valores: ValoresReferencia = { cbtHogar3: 1_610_772.48, smvm: 300_000 }

describe('calcularDanos (orquestador)', () => {
  it('produce 3 escenarios y el rango crece conservador → expansivo', () => {
    const input: CalculoDanosInput = {
      fechaValuacion: '2026-07-20',
      relacionConsumo: true,
      rubros: ['incapacidad', 'no_patrimonial', 'punitivo'],
      incapacidad: {
        edad: 40, porcentaje: 30,
        ingreso: { montoMensual: 200_000, fuente: 'acreditado' },
      },
      noPatrimonial: { baseComparable: 1_000_000, nivelManual: 'alto' },
      procedencia: { tratoIndigno: true, riesgoSalud: true },
      punitivo: { metodo: 'canastas', nivel: 'media' },
    }
    const r = calcularDanos(input, valores)
    expect(r.escenarios.conservador.total).toBeLessThanOrEqual(r.escenarios.razonable.total)
    expect(r.escenarios.razonable.total).toBeLessThanOrEqual(r.escenarios.expansivo.total)
    expect(r.escenarios.razonable.rubros.length).toBe(3)
  })

  it('el punitivo no procede sin relación de consumo y emite alerta', () => {
    const input: CalculoDanosInput = {
      fechaValuacion: '2026-07-20',
      relacionConsumo: false,
      rubros: ['punitivo'],
      procedencia: { tratoIndigno: true },
      punitivo: { metodo: 'canastas', nivel: 'media' },
    }
    const r = calcularDanos(input, valores)
    expect(r.escenarios.razonable.total).toBe(0)
    expect(r.auditoria.alertas.some(a => a.codigo === 'punitivo_sin_consumo')).toBe(true)
    expect(r.auditoria.nivelConfianza).toBe('bajo')
  })

  it('marca el ingreso subsidiario como variable estimada', () => {
    const input: CalculoDanosInput = {
      fechaValuacion: '2026-07-20',
      relacionConsumo: false,
      rubros: ['incapacidad'],
      incapacidad: {
        edad: 35, porcentaje: 40,
        ingreso: { montoMensual: null, fuente: 'no_acreditado', parametroSupletorio: 'SMVM' },
      },
    }
    const r = calcularDanos(input, valores)
    expect(r.auditoria.variablesEstimadas.some(v => /SMVM|subsidiario/i.test(v))).toBe(true)
    expect(r.escenarios.expansivo.total).toBeGreaterThan(0)
  })

  it('el punitivo por canastas escala con el escenario', () => {
    const input: CalculoDanosInput = {
      fechaValuacion: '2026-07-20',
      relacionConsumo: true,
      rubros: ['punitivo'],
      procedencia: { riesgoSalud: true },
      punitivo: { metodo: 'canastas', nivel: 'media' },
    }
    const r = calcularDanos(input, valores)
    // media = 2 a 10 CBT → conservador=2 CBT, expansivo=10 CBT
    expect(r.escenarios.conservador.total).toBeCloseTo(2 * valores.cbtHogar3, 0)
    expect(r.escenarios.expansivo.total).toBeCloseTo(10 * valores.cbtHogar3, 0)
  })
})
