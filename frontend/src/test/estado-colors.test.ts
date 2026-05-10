import { describe, it, expect } from 'vitest'
import { getExpedienteRowClass, getSemaforoRowClass, getEstadoRowClass, getEstadoBorderClass } from '@/lib/utils/estado-colors'

describe('getExpedienteRowClass', () => {
  it('returns rojo classes for terminal estado NO_VIABLE_RECHAZADO', () => {
    const result = getExpedienteRowClass({
      estado_interno: 'NO_VIABLE_RECHAZADO',
      audiencias: [],
      tareas: [],
    })
    expect(result).toContain('bg-red-500')
    expect(result).toContain('border-l-red-500')
  })

  it('returns amarillo classes when pending tareas', () => {
    const result = getExpedienteRowClass({
      estado_interno: 'INICIADO',
      audiencias: [],
      tareas: [{ id: '1', estado: 'PENDIENTE' }],
    })
    expect(result).toContain('bg-amber-400')
    expect(result).toContain('border-l-amber-400')
  })

  it('returns gris classes for idle expediente', () => {
    const result = getExpedienteRowClass({
      estado_interno: 'INICIADO',
      audiencias: [],
      tareas: [],
    })
    expect(result).toContain('bg-slate-400')
    expect(result).toContain('border-l-slate-500')
  })
})

describe('getSemaforoRowClass', () => {
  it('returns correct classes for each color', () => {
    expect(getSemaforoRowClass('rojo')).toContain('border-l-red-500')
    expect(getSemaforoRowClass('verde')).toContain('border-l-emerald-500')
    expect(getSemaforoRowClass('amarillo')).toContain('border-l-amber-400')
    expect(getSemaforoRowClass('gris')).toContain('border-l-slate-500')
  })
})

describe('getEstadoRowClass (fallback)', () => {
  it('returns border for known estado', () => {
    expect(getEstadoRowClass('PARA_INICIAR')).toContain('border-l-violet-500')
    expect(getEstadoRowClass('NO_VIABLE_RECHAZADO')).toContain('border-l-rose-500')
  })

  it('returns slate fallback for unknown estado', () => {
    expect(getEstadoRowClass('UNKNOWN')).toContain('border-l-slate-500')
  })
})

describe('getEstadoBorderClass', () => {
  it('returns correct border class', () => {
    expect(getEstadoBorderClass('INICIADO')).toBe('border-l-blue-500')
    expect(getEstadoBorderClass('FINALIZADO')).toBe('border-l-emerald-500')
  })

  it('returns slate fallback for unknown', () => {
    expect(getEstadoBorderClass('NOPE')).toBe('border-l-slate-500')
  })
})
