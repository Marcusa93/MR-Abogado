import { describe, expect, it } from 'vitest'
import { aplicarCambio } from '@/hooks/use-redaccion'
import { detectarCitas } from '@/lib/escritos/citas'
import type { EscritoContenido } from '@/hooks/use-escritos'

const base: EscritoContenido = {
  titulo: 'CONTESTA DEMANDA', encabezado_juez: 'SR. JUEZ', caratula: 'PEREZ JUAN c/ UBER S.A. s/ DAÑOS',
  secciones: [
    { titulo: 'OBJETO', parrafos: ['Vengo a contestar demanda.'] },
    { titulo: 'DERECHO', parrafos: ['Conforme el art. 1716 del CCyCN corresponde el rechazo.', 'Así lo resolvió la Corte en "Gonzalez c/ Banco Macro".', 'La ley 24.240 no aplica.'] },
    { titulo: 'PETITORIO', parrafos: ['Se rechace la demanda.'] },
  ],
}

describe('aplicarCambio', () => {
  it('reemplaza, inserta, elimina y agrega secciones', () => {
    let c = aplicarCambio(base, { accion: 'reemplazar', seccion: 1, parrafo: 1, texto: 'Vengo en tiempo y forma.', motivo: '' })
    expect(c.secciones[0].parrafos[0]).toBe('Vengo en tiempo y forma.')
    c = aplicarCambio(c, { accion: 'insertar_despues', seccion: 2, parrafo: 0, texto: 'Primero.\n\nSegundo.', motivo: '' })
    expect(c.secciones[1].parrafos.slice(0, 2)).toEqual(['Primero.', 'Segundo.'])
    c = aplicarCambio(c, { accion: 'eliminar', seccion: 3, parrafo: 1, motivo: '' })
    expect(c.secciones[2].parrafos).toEqual([])
    c = aplicarCambio(c, { accion: 'nueva_seccion', seccion: 2, titulo: 'PRUEBA', texto: 'Ofrezco documental.', motivo: '' })
    expect(c.secciones.map((s) => s.titulo)).toEqual(['OBJETO', 'DERECHO', 'PRUEBA', 'PETITORIO'])
    expect(base.secciones[0].parrafos[0]).toBe('Vengo a contestar demanda.')
  })
})

describe('detectarCitas', () => {
  it('marca respaldadas las que están en el corpus y el resto a verificar', () => {
    const r = detectarCitas(base, [
      { texto: 'Art. 1716 — La violación del deber de no dañar…', documento: 'Código Civil y Comercial (CCyCN)', fuente: 'normativa' },
    ])
    const art = r.find((x) => x.texto.toLowerCase().includes('1716'))
    expect(art?.respaldada).toBe(true)
    const fallo = r.find((x) => x.tipo === 'fallo')
    expect(fallo?.texto).toContain('Gonzalez')
    expect(fallo?.respaldada).toBe(false)
    expect(r.some((x) => x.texto.toLowerCase().includes('24.240') && !x.respaldada)).toBe(true)
  })
})
