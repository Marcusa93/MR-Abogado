import { describe, it, expect } from 'vitest'
import { calcularSemaforo, calcularSemaforoKanban } from '@/lib/utils/semaforo'

describe('calcularSemaforo', () => {
  const base = {
    estado_interno: 'INICIADO',
    audiencias: [] as { id: string; estado: string; fecha: string }[],
    tareas: [] as { id: string; estado: string }[],
  }

  it('returns rojo for NO_VIABLE_RECHAZADO', () => {
    expect(calcularSemaforo({ ...base, estado_interno: 'NO_VIABLE_RECHAZADO' })).toBe('rojo')
  })

  it('returns rojo for FINALIZADO', () => {
    expect(calcularSemaforo({ ...base, estado_interno: 'FINALIZADO' })).toBe('rojo')
  })

  it('returns verde when there is an active audiencia', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const result = calcularSemaforo({
      ...base,
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: tomorrow.toISOString().slice(0, 10) }],
    })
    expect(result).toBe('verde')
  })

  it('returns amarillo when there are pending tareas', () => {
    const result = calcularSemaforo({
      ...base,
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })
    expect(result).toBe('amarillo')
  })

  it('returns amarillo for EN_PROGRESO tareas', () => {
    const result = calcularSemaforo({
      ...base,
      tareas: [{ id: '1', estado: 'EN_PROGRESO' }],
    })
    expect(result).toBe('amarillo')
  })

  it('returns gris when no action needed', () => {
    expect(calcularSemaforo(base)).toBe('gris')
  })

  it('returns gris for completed tareas only', () => {
    const result = calcularSemaforo({
      ...base,
      tareas: [{ id: '1', estado: 'COMPLETADA' }],
    })
    expect(result).toBe('gris')
  })

  it('verde takes priority over amarillo', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const result = calcularSemaforo({
      ...base,
      audiencias: [{ id: '1', estado: 'CONFIRMADA', fecha: tomorrow.toISOString().slice(0, 10) }],
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })
    expect(result).toBe('verde')
  })

  it('rojo takes priority over everything', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const result = calcularSemaforo({
      ...base,
      estado_interno: 'NO_VIABLE_RECHAZADO',
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: tomorrow.toISOString().slice(0, 10) }],
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })
    expect(result).toBe('rojo')
  })

  it('ignores past audiencias', () => {
    const result = calcularSemaforo({
      ...base,
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: '2020-01-01' }],
    })
    expect(result).toBe('gris')
  })
})

describe('calcularSemaforoKanban', () => {
  it('returns rojo for NO_VIABLE_RECHAZADO', () => {
    expect(calcularSemaforoKanban({ estado_interno: 'NO_VIABLE_RECHAZADO' })).toBe('rojo')
  })

  it('returns verde when proxima_fecha_audiencia is future', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(calcularSemaforoKanban({
      estado_interno: 'INICIADO',
      proxima_fecha_audiencia: tomorrow.toISOString().slice(0, 10),
    })).toBe('verde')
  })

  it('returns amarillo when tareas_pendientes_count > 0', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'INICIADO',
      tareas_pendientes_count: 3,
    })).toBe('amarillo')
  })

  it('returns gris otherwise', () => {
    expect(calcularSemaforoKanban({ estado_interno: 'INICIADO' })).toBe('gris')
  })
})
