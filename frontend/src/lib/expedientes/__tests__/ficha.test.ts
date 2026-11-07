import { describe, it, expect } from 'vitest'
import { aplicarCambios, fichaVacia, conteoPrueba, siguienteEstado, ordenarResoluciones, type Ficha } from '../ficha'

function base(): Ficha {
  return {
    ...fichaVacia('e1'),
    resumen: 'Reclamo por despido.',
    contestacion: 'Contestó X el 10/03/2026.',
    completar: { contestacion: '¿Qué defensas opuso?' },
    prueba: [{ id: 'p1', medio: 'Pericial contable (actora)', detalle: '', estado: 'ofrecida' }],
    resoluciones: [{ id: 'r1', fecha: '20/05/2026', texto: 'Abre a prueba.' }],
  }
}

describe('aplicarCambios', () => {
  it('agrega texto al final y reemplaza cuando se pide', () => {
    const { ficha } = aplicarCambios(base(), [
      { campo: 'resumen', modo: 'agregar', texto: 'Se abrió a prueba.' },
      { campo: 'proximo_paso', modo: 'reemplazar', texto: 'Esperar la pericia.' },
    ])
    expect(ficha.resumen).toBe('Reclamo por despido.\nSe abrió a prueba.')
    expect(ficha.proximo_paso).toBe('Esperar la pericia.')
  })

  it('quita la pregunta pendiente cuando se completa el campo', () => {
    const { ficha } = aplicarCambios(base(), [{ campo: 'contestacion', modo: 'agregar', texto: 'Negó la relación laboral.' }])
    expect(ficha.completar.contestacion).toBeUndefined()
  })

  it('actualiza un medio de prueba existente y suma uno nuevo', () => {
    const { ficha } = aplicarCambios(base(), [
      { campo: 'prueba', medio: 'Pericial contable (actora)', detalle: 'Dictamen presentado.', estado: 'producida', prueba_id: 'p1' },
      { campo: 'prueba', medio: 'Testimonial (demandada)', detalle: '', estado: 'ofrecida' },
    ])
    expect(ficha.prueba).toHaveLength(2)
    expect(ficha.prueba[0]).toMatchObject({ id: 'p1', estado: 'producida', detalle: 'Dictamen presentado.' })
  })

  it('ordena las resoluciones y no duplica', () => {
    const { ficha } = aplicarCambios(base(), [
      { campo: 'resolucion', fecha: '01/02/2026', texto: 'Cautelar.' },
      { campo: 'resolucion', fecha: '20/05/2026', texto: 'Abre a prueba.' },
    ])
    expect(ficha.resoluciones.map((r) => r.fecha)).toEqual(['01/02/2026', '20/05/2026'])
  })

  it('devuelve la etapa sin tocar la ficha original', () => {
    const original = base()
    const { etapa } = aplicarCambios(original, [{ campo: 'etapa', texto: 'Etapa probatoria' }, { campo: 'resumen', modo: 'reemplazar', texto: 'Otro.' }])
    expect(etapa).toBe('Etapa probatoria')
    expect(original.resumen).toBe('Reclamo por despido.')
  })
})

describe('auxiliares', () => {
  it('cuenta la prueba por estado', () => {
    expect(conteoPrueba([
      { id: 'a', medio: 'x', detalle: '', estado: 'producida' },
      { id: 'b', medio: 'y', detalle: '', estado: 'producida' },
      { id: 'c', medio: 'z', detalle: '', estado: 'pendiente' },
    ])).toEqual([{ estado: 'pendiente', n: 1 }, { estado: 'producida', n: 2 }])
  })
  it('rota el estado de la prueba', () => {
    expect(siguienteEstado('desistida')).toBe('ofrecida')
  })
  it('manda al final las fechas no reconocidas', () => {
    expect(ordenarResoluciones([{ id: '1', fecha: '', texto: 'a' }, { id: '2', fecha: '3/4/2025', texto: 'b' }])[0]!.id).toBe('2')
  })
})
