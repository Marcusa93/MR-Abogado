import { describe, it, expect } from 'vitest'
import { calcularSemaforo, calcularSemaforoKanban } from './semaforo'

describe('calcularSemaforo', () => {
  const base = {
    estado_interno: 'INICIADO',
    audiencias: [] as { id: string; estado: string; fecha: string }[],
    tareas: [] as { id: string; estado: string }[],
  }

  it('returns rojo when estado is NO_VIABLE_RECHAZADO', () => {
    expect(calcularSemaforo({ ...base, estado_interno: 'NO_VIABLE_RECHAZADO' })).toBe('rojo')
  })

  it('returns rojo when estado is FINALIZADO', () => {
    expect(calcularSemaforo({ ...base, estado_interno: 'FINALIZADO' })).toBe('rojo')
  })

  it('returns verde when has active audiencia with future date', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(
      calcularSemaforo({
        ...base,
        audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: futureDate }],
      })
    ).toBe('verde')
  })

  it('returns amarillo when has pending tareas', () => {
    expect(
      calcularSemaforo({
        ...base,
        tareas: [{ id: '1', estado: 'PENDIENTE' }],
      })
    ).toBe('amarillo')
  })

  it('returns amarillo for EN_PROGRESO tareas', () => {
    expect(
      calcularSemaforo({
        ...base,
        tareas: [{ id: '1', estado: 'EN_PROGRESO' }],
      })
    ).toBe('amarillo')
  })

  it('returns gris when no actions pending', () => {
    expect(calcularSemaforo(base)).toBe('gris')
  })

  it('returns gris when tareas are all completed', () => {
    expect(
      calcularSemaforo({
        ...base,
        tareas: [{ id: '1', estado: 'COMPLETADA' }],
      })
    ).toBe('gris')
  })

  it('verde takes priority over amarillo', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(
      calcularSemaforo({
        ...base,
        audiencias: [{ id: '1', estado: 'CONFIRMADA', fecha: futureDate }],
        tareas: [{ id: '1', estado: 'PENDIENTE' }],
      })
    ).toBe('verde')
  })

  it('rojo takes priority over everything', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(
      calcularSemaforo({
        ...base,
        estado_interno: 'NO_VIABLE_RECHAZADO',
        audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: futureDate }],
        tareas: [{ id: '1', estado: 'PENDIENTE' }],
      })
    ).toBe('rojo')
  })
})

describe('calcularSemaforoKanban', () => {
  it('returns rojo for NO_VIABLE_RECHAZADO', () => {
    expect(calcularSemaforoKanban({ estado_interno: 'NO_VIABLE_RECHAZADO' })).toBe('rojo')
  })

  it('returns verde when proxima_fecha_audiencia is future', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(
      calcularSemaforoKanban({
        estado_interno: 'INICIADO',
        proxima_fecha_audiencia: futureDate,
      })
    ).toBe('verde')
  })

  it('returns amarillo when tareas_pendientes_count > 0', () => {
    expect(
      calcularSemaforoKanban({
        estado_interno: 'INICIADO',
        tareas_pendientes_count: 3,
      })
    ).toBe('amarillo')
  })

  it('returns gris by default', () => {
    expect(
      calcularSemaforoKanban({ estado_interno: 'NUEVA_CONSULTA' })
    ).toBe('gris')
  })
})
