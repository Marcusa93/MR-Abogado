import { describe, it, expect } from 'vitest'
import { getExpedienteRowClass, getSemaforoRowClass, getEstadoRowClass, getEstadoBorderClass } from '../estado-colors'

describe('getExpedienteRowClass', () => {
  it('returns rojo styles for rechazado', () => {
    const cls = getExpedienteRowClass({
      estado_interno: 'NO_VIABLE_RECHAZADO',
    })
    expect(cls).toContain('border-l-red-500')
    expect(cls).toContain('bg-red-500')
  })

  it('returns amarillo styles when tareas pending', () => {
    const cls = getExpedienteRowClass({
      estado_interno: 'INICIADO',
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })
    expect(cls).toContain('border-l-amber')
    expect(cls).toContain('bg-amber')
  })

  it('returns gris styles when nothing pending', () => {
    const cls = getExpedienteRowClass({
      estado_interno: 'NUEVA_CONSULTA',
      audiencias: [],
      tareas: [],
    })
    expect(cls).toContain('border-l-slate')
  })
})

describe('getSemaforoRowClass', () => {
  it('returns correct styles for each color', () => {
    expect(getSemaforoRowClass('rojo')).toContain('bg-red-500')
    expect(getSemaforoRowClass('verde')).toContain('bg-emerald-500')
    expect(getSemaforoRowClass('verde_terminal')).toContain('bg-emerald-500')
    expect(getSemaforoRowClass('verde_terminal')).toContain('border-l-emerald-400')
    expect(getSemaforoRowClass('amarillo')).toContain('bg-amber')
    expect(getSemaforoRowClass('gris')).toContain('bg-slate')
  })
})

describe('getEstadoRowClass (fallback)', () => {
  it('returns border for known estado', () => {
    expect(getEstadoRowClass('PARA_INICIAR')).toContain('border-l-violet-500')
    expect(getEstadoRowClass('NO_VIABLE_RECHAZADO')).toContain('border-l-rose-500')
  })

  it('returns slate border for unknown estado', () => {
    expect(getEstadoRowClass('UNKNOWN')).toContain('border-l-slate-500')
  })
})

describe('getEstadoBorderClass', () => {
  it('returns correct border classes', () => {
    expect(getEstadoBorderClass('INICIADO')).toBe('border-l-blue-500')
    expect(getEstadoBorderClass('FINALIZADO')).toBe('border-l-emerald-500')
    expect(getEstadoBorderClass('UNKNOWN')).toBe('border-l-slate-500')
  })
})
