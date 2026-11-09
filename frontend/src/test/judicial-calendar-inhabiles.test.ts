import { describe, expect, it } from 'vitest'
import { calcularVencimiento, isHabilDay } from '@/lib/utils/judicial-calendar'

const d = (iso: string) => new Date(iso + 'T12:00:00Z')

describe('calendario judicial con días de la base', () => {
  const inhabiles = { fechas: new Set(['2026-11-02', '2026-11-09', '2026-11-23']), anios: new Set([2026]) }

  it('descuenta los días cargados (inhábil judicial y feriado por decreto)', () => {
    expect(isHabilDay(d('2026-11-02'), [], inhabiles)).toBe(false)
    expect(isHabilDay(d('2026-11-09'), [], inhabiles)).toBe(false)
  })

  it('para los años cubiertos no usa la lista fija (20/11 trasladado al 23/11 es hábil)', () => {
    expect(isHabilDay(d('2026-11-20'), [], inhabiles)).toBe(true)
    expect(isHabilDay(d('2026-11-20'), [])).toBe(false) // lista fija: lo contaba como feriado
  })

  it('el vencimiento salta los inhábiles cargados', () => {
    // Firma vie 30/10 → notificación mar 3/11 (lun 2/11 inhábil) → día 1 mié 4/11; 5 hábiles: 4,5,6,10,11
    expect(calcularVencimiento('2026-10-30', 5, true, [], inhabiles)?.vencimiento).toBe('2026-11-11')
  })
})
