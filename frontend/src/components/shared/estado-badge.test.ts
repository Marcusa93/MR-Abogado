import { describe, it, expect } from 'vitest'
import { getEstadoConfig, ESTADOS_INTERNOS } from './estado-badge'

describe('getEstadoConfig', () => {
  it('returns config for all known estados', () => {
    for (const estado of ESTADOS_INTERNOS) {
      const config = getEstadoConfig(estado)
      expect(config.label).toBeTruthy()
      expect(config.bg).toBeTruthy()
      expect(config.text).toBeTruthy()
      expect(config.dot).toBeTruthy()
    }
  })

  it('returns fallback for unknown estado', () => {
    const config = getEstadoConfig('UNKNOWN_STATE')
    expect(config.label).toBe('Desconocido')
  })

  it('all 11 estados are defined', () => {
    expect(ESTADOS_INTERNOS).toHaveLength(11)
  })

  it('labels are human readable (not snake_case)', () => {
    for (const estado of ESTADOS_INTERNOS) {
      const config = getEstadoConfig(estado)
      expect(config.label).not.toContain('_')
    }
  })
})
