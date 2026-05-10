import { describe, it, expect } from 'vitest'
import { calcularSemaforo, calcularSemaforoKanban } from '../semaforo'

describe('calcularSemaforo', () => {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  it('returns rojo for NO_VIABLE_RECHAZADO', () => {
    expect(calcularSemaforo({
      estado_interno: 'NO_VIABLE_RECHAZADO',
    })).toBe('rojo')
  })

  it('returns rojo for FINALIZADO', () => {
    expect(calcularSemaforo({
      estado_interno: 'FINALIZADO',
    })).toBe('rojo')
  })

  it('returns verde when there is an active audiencia (future date)', () => {
    expect(calcularSemaforo({
      estado_interno: 'INICIADO',
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: tomorrow }],
    })).toBe('verde')
  })

  it('returns verde when audiencia is CONFIRMADA today', () => {
    expect(calcularSemaforo({
      estado_interno: 'INICIADO',
      audiencias: [{ id: '1', estado: 'CONFIRMADA', fecha: today }],
    })).toBe('verde')
  })

  it('does NOT return verde for past audiencia', () => {
    expect(calcularSemaforo({
      estado_interno: 'INICIADO',
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: yesterday }],
    })).not.toBe('verde')
  })

  it('returns amarillo when there are pending tareas', () => {
    expect(calcularSemaforo({
      estado_interno: 'PARA_INICIAR',
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })).toBe('amarillo')
  })

  it('returns amarillo for EN_PROGRESO tareas', () => {
    expect(calcularSemaforo({
      estado_interno: 'PARA_INICIAR',
      tareas: [{ id: '1', estado: 'EN_PROGRESO' }],
    })).toBe('amarillo')
  })

  it('returns gris when no tareas/audiencias and non-terminal estado', () => {
    expect(calcularSemaforo({
      estado_interno: 'NUEVA_CONSULTA',
      audiencias: [],
      tareas: [],
    })).toBe('gris')
  })

  it('returns gris when only completed tareas', () => {
    expect(calcularSemaforo({
      estado_interno: 'INICIADO',
      tareas: [{ id: '1', estado: 'COMPLETADA' }],
    })).toBe('gris')
  })

  it('rojo takes priority over verde', () => {
    expect(calcularSemaforo({
      estado_interno: 'NO_VIABLE_RECHAZADO',
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: tomorrow }],
    })).toBe('rojo')
  })

  it('verde takes priority over amarillo', () => {
    expect(calcularSemaforo({
      estado_interno: 'INICIADO',
      audiencias: [{ id: '1', estado: 'PENDIENTE', fecha: tomorrow }],
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })).toBe('verde')
  })
})

describe('calcularSemaforoKanban', () => {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  it('returns rojo for rechazado', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'NO_VIABLE_RECHAZADO',
    })).toBe('rojo')
  })

  it('returns verde when has future proxima_fecha_audiencia', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'INICIADO',
      proxima_fecha_audiencia: tomorrow,
    })).toBe('verde')
  })

  it('returns amarillo when has pending tareas', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'PARA_INICIAR',
      tareas_pendientes_count: 3,
    })).toBe('amarillo')
  })

  it('returns gris when nothing pending', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'NUEVA_CONSULTA',
      tareas_pendientes_count: 0,
      proxima_fecha_audiencia: null,
    })).toBe('gris')
  })

  it('returns gris when proxima_fecha_audiencia is today (boundary)', () => {
    expect(calcularSemaforoKanban({
      estado_interno: 'INICIADO',
      proxima_fecha_audiencia: today,
    })).toBe('verde')
  })
})
