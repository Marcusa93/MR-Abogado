import { describe, expect, it } from 'vitest'
import { aplicarPlantilla, aVariables, porcentajeEdicion, encabezadoDesdeSae } from '@/lib/escritos/plantillas'
import { nombreModeloCorto } from '@/lib/escritos/modelos'
import { datosPorCompletar } from '@/components/expedientes/guia-escrito'
import type { EscritoContenido } from '@/hooks/use-escritos'

const base: EscritoContenido = {
  titulo: 'SOLICITA PRONTO DESPACHO',
  encabezado_juez: '{{encabezado}}',
  caratula: '{{caratula}} - Expte. N° {{expte}}',
  secciones: [{ titulo: '', parrafos: ['Que vengo a solicitar respecto de [PRESENTACIÓN PENDIENTE].', 'Proveer de conformidad, SERÁ JUSTICIA.'] }],
}

describe('plantillas', () => {
  it('completa los datos del expediente', () => {
    const r = aplicarPlantilla(base, { encabezado: 'SR. JUEZ CIVIL', caratula: 'PEREZ C/ GOMEZ S/ DAÑOS', expte: '123/26', cliente: '' })
    expect(r.encabezado_juez).toBe('SR. JUEZ CIVIL')
    expect(r.caratula).toBe('PEREZ C/ GOMEZ S/ DAÑOS - Expte. N° 123/26')
    expect(datosPorCompletar(r)).toHaveLength(1)
  })
  it('lo que falta queda marcado para la guía', () => {
    const r = aplicarPlantilla(base, { encabezado: '', caratula: '', expte: '', cliente: '' })
    expect(r.caratula).toBe('[CARÁTULA] - Expte. N° [N° DE EXPEDIENTE]')
    expect(datosPorCompletar(r).length).toBeGreaterThanOrEqual(3)
  })
  it('reemplaza los marcadores de los modelos viejos', () => {
    const r = aplicarPlantilla({ ...base, caratula: '[CARATULA]' }, { encabezado: 'X', caratula: 'A C/ B', expte: '1/26', cliente: '' })
    expect(r.caratula).toBe('A C/ B')
  })
  it('al guardar como plantilla pasa los datos a variables', () => {
    const c = { ...base, caratula: 'PEREZ C/ GOMEZ - Expte. N° 123/26', encabezado_juez: 'SR. JUEZ CIVIL' }
    const v = aVariables(c, { caratula: 'PEREZ C/ GOMEZ', expte: '123/26', encabezado: 'SR. JUEZ CIVIL' })
    expect(v.caratula).toBe('{{caratula}} - Expte. N° {{expte}}')
    expect(v.encabezado_juez).toBe('{{encabezado}}')
  })
  it('encabezado según la oficina del SAE', () => {
    expect(encabezadoDesdeSae('Mediación', 'Mediación - Fuero Civil')).toMatch(/MEDIACI/)
    expect(encabezadoDesdeSae('Civil y Comercial Común', 'Oficina de Gestión Asociada Civil y Comercial N° 2')).toMatch(/CIVIL Y COMERCIAL COMÚN DE LA \[NÚMERO\]/)
  })
})

describe('medición', () => {
  it('0 si no cambió, 100 si no tiene nada en común', () => {
    expect(porcentajeEdicion('uno dos tres', 'uno dos tres')).toBe(0)
    expect(porcentajeEdicion('uno dos tres', 'cuatro cinco seis')).toBe(100)
  })
  it('cambio parcial', () => {
    const p = porcentajeEdicion('que vengo a solicitar se dicte sentencia', 'que vengo a pedir se dicte sentencia')
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(30)
  })
  it('nombre del modelo', () => {
    expect(nombreModeloCorto('anthropic/claude-opus-5.5')).toBe('Opus 5.5')
    expect(nombreModeloCorto('anthropic/claude-sonnet-4-6')).toBe('Sonnet 4.6')
  })
})
