// ============================================================================
// Módulo patrimonial — incapacidad sobreviniente (art. 1746 CCyC).
// Valor presente de una renta constante no perpetua:  C = A · (1 - (1+i)^-n) / i
// Todas las fórmulas usuales (Vuoto, Marshall, Méndez, Las Heras-Requena) son
// expresiones equivalentes de esta operación: lo que cambia son los insumos.
// ============================================================================

import { MESES_POR_ANIO_DEFAULT, PRESETS_FORMULA } from './constantes'
import type { IncapacidadInput, ResultadoIncapacidad, ValoresReferencia } from './types'

/**
 * Valor presente de una renta anual constante `A` durante `n` períodos a tasa `i`.
 * Con i→0 degenera en A·n (evita división por cero).
 */
export function valorPresenteRenta(A: number, n: number, i: number): number {
  if (n <= 0) return 0
  if (i === 0) return A * n
  return A * (1 - Math.pow(1 + i, -n)) / i
}

/**
 * Capital por incapacidad permanente (art. 1746). Expone todos los insumos para
 * auditoría. El ingreso puede ser acreditado o subsidiario (SMVM).
 */
export function calcularIncapacidad1746(
  input: IncapacidadInput,
  valores?: Pick<ValoresReferencia, 'smvm'>,
): ResultadoIncapacidad {
  const preset = PRESETS_FORMULA[input.preset ?? 'vuoto_mendez']
  const mesesPorAnio = input.mesesPorAnio ?? MESES_POR_ANIO_DEFAULT
  const tasa = input.tasaDescuento ?? preset.tasa
  const n = Math.max(0, preset.topeVidaUtil - input.edad)

  // Resolver el ingreso mensual: acreditado o subsidiario (SMVM).
  const acreditado = input.ingreso.montoMensual != null && input.ingreso.fuente === 'acreditado'
  const ingresoMensual = input.ingreso.montoMensual
    ?? (input.ingreso.parametroSupletorio === 'SMVM' ? (valores?.smvm ?? 0) : 0)
  const ingresoEstimado = !acreditado

  const ingresoAnual = ingresoMensual * mesesPorAnio
  // Ajuste Méndez: proyecta la carrera con factor 60/edad (solo si el preset lo usa).
  const factorAjuste = preset.ajusteIngreso && input.edad > 0 ? 60 / input.edad : 1
  const ingresoAjustadoAnual = ingresoAnual * factorAjuste

  const perdidaAnual = ingresoAjustadoAnual * (input.porcentaje / 100)
  const capital = valorPresenteRenta(perdidaAnual, n, tasa)

  return {
    capital,
    detalle: {
      preset: input.preset ?? 'vuoto_mendez',
      edad: input.edad,
      n,
      tasa,
      ingresoMensual,
      ingresoAnual,
      factorAjuste,
      ingresoAjustadoAnual,
      porcentaje: input.porcentaje,
      perdidaAnual,
      ingresoEstimado,
    },
  }
}
