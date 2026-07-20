// ============================================================================
// Módulo no patrimonial (art. 1741 CCyC).
// Matriz de gravedad + comparación con precedentes. NUNCA un % del daño material
// (la función ni siquiera recibe el monto material). El resultado es un RANGO
// que ordena la deliberación; la fundamentación final es humana.
// ============================================================================

import { MATRIZ_GRAVEDAD } from './constantes'
import type {
  GravedadNivel, NoPatrimonialInput, ResultadoNoPatrimonial, NivelConfianza,
} from './types'

const ORDEN: GravedadNivel[] = ['bajo', 'medio', 'alto', 'muy_alto', 'extremo']

/**
 * Infiere el nivel de gravedad a partir de indicadores objetivos.
 * Es una guía interna, no una tarifa: el nivel puede overridearse manualmente.
 */
export function inferirGravedad(input: NoPatrimonialInput): { nivel: GravedadNivel; factores: string[] } {
  if (input.nivelManual) {
    return { nivel: input.nivelManual, factores: ['Nivel fijado manualmente'] }
  }
  let score = 0
  const factores: string[] = []

  const meses = input.duracionMeses ?? 0
  if (meses >= 12) { score += 2; factores.push('Padecimiento prolongado (≥12 meses)') }
  else if (meses >= 3) { score += 1; factores.push('Padecimiento sostenido (≥3 meses)') }

  if (input.afectacionSalud) { score += 2; factores.push('Afectación de la salud') }
  if (input.reiteracion) { score += 1; factores.push('Incumplimientos reiterados') }

  switch (input.vulnerabilidad) {
    case 'hipervulnerable': score += 3; factores.push('Hipervulnerabilidad'); break
    case 'alta': score += 2; factores.push('Vulnerabilidad alta'); break
    case 'media': score += 1; factores.push('Vulnerabilidad media'); break
    default: break
  }

  // score → nivel
  let nivel: GravedadNivel
  if (score >= 7) nivel = 'extremo'
  else if (score >= 5) nivel = 'muy_alto'
  else if (score >= 3) nivel = 'alto'
  else if (score >= 1) nivel = 'medio'
  else nivel = 'bajo'

  if (factores.length === 0) factores.push('Sin indicadores agravantes cargados')
  return { nivel, factores }
}

export function calcularNoPatrimonial(input: NoPatrimonialInput): ResultadoNoPatrimonial {
  const { nivel, factores } = inferirGravedad(input)
  const rango = MATRIZ_GRAVEDAD[nivel]
  const base = input.baseComparable

  const montoMin = base * rango.min
  const montoMax = base * rango.max

  // Confianza: alta si la base viene de comparables reales y hay indicadores;
  // baja si la base es estimada o no hay indicadores.
  let confianza: NivelConfianza = 'medio'
  if (input.baseEstimada) confianza = 'bajo'
  else if (ORDEN.indexOf(nivel) >= 2 && !input.nivelManual) confianza = 'alto'

  return {
    nivel,
    montoMin,
    montoMax,
    multiplicadorMin: rango.min,
    multiplicadorMax: rango.max,
    baseComparable: base,
    confianza,
    factores,
  }
}
