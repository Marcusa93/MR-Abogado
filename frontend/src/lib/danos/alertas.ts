// ============================================================================
// Alertas automáticas del estimador (informe, "Alertas imprescindibles").
// Detectan duplicaciones, cálculos jurídicamente frágiles y variables sin
// fundar. No bloquean: advierten para revisión humana.
// ============================================================================

import type { Alerta, CalculoDanosInput } from './types'

export function generarAlertas(input: CalculoDanosInput): Alerta[] {
  const a: Alerta[] = []
  const tiene = (k: string) => input.rubros.includes(k)

  // Duplicación daño psíquico / incapacidad.
  if (input.incluyeDanoPsiquico && tiene('incapacidad')
      && (input.incapacidad?.tipo === 'psiquica' || input.incapacidad?.tipo === 'ambas')) {
    a.push({
      severidad: 'warning', codigo: 'dup_psiquico_incapacidad',
      mensaje: 'Posible duplicación: daño psíquico e incapacidad psíquica. En Tucumán el daño psíquico no siempre es autónomo — exige justificación diferenciada.',
    })
  }

  // Punitivo sin relación de consumo.
  if (tiene('punitivo') && !input.relacionConsumo) {
    a.push({
      severidad: 'error', codigo: 'punitivo_sin_consumo',
      mensaje: 'El daño punitivo (art. 52 bis LDC) requiere relación de consumo.',
    })
  }

  // Punitivo cargado pero procedencia no evaluada / no supera umbral.
  if (tiene('punitivo') && !input.procedencia) {
    a.push({
      severidad: 'warning', codigo: 'punitivo_sin_procedencia',
      mensaje: 'Falta evaluar la matriz de procedencia del daño punitivo antes de cuantificar.',
    })
  }

  // Ingreso subsidiario no marcado como acreditado.
  if (tiene('incapacidad') && input.incapacidad
      && input.incapacidad.ingreso.fuente !== 'acreditado') {
    a.push({
      severidad: 'info', codigo: 'ingreso_estimado',
      mensaje: 'El ingreso no está acreditado: se usa un parámetro subsidiario (SMVM u otro), marcado como variable estimada.',
    })
  }

  // Renta futura para daño que parece íntegramente pasado.
  if (tiene('incapacidad') && input.incapacidad && input.incapacidad.edad >= 75) {
    a.push({
      severidad: 'info', codigo: 'sin_horizonte',
      mensaje: 'La edad supera el horizonte de vida útil del preset: el capital por incapacidad futura tiende a cero. Verifique si corresponde otro rubro.',
    })
  }

  // Montos sin fecha de valuación.
  if (!input.fechaValuacion) {
    a.push({
      severidad: 'warning', codigo: 'sin_fecha_valuacion',
      mensaje: 'Falta la fecha de valuación: los montos quedan sin anclaje temporal.',
    })
  }

  return a
}
