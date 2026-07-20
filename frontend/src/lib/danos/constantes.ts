// ============================================================================
// Estimador de daños — constantes de dominio (fórmulas, matrices, labels).
// Todo lo cuantitativo es auditable y trazable a fuente jurídica.
// ============================================================================

import type {
  GravedadNivel, PresetFormula, PunitivoNivel, MetodoPunitivo,
} from './types'

// ── Presets de fórmula de renta capitalizada (art. 1746) ─────────────────────
export const PRESETS_FORMULA: Record<PresetFormula, {
  label: string
  topeVidaUtil: number
  tasa: number
  /** Ajuste de ingreso por proyección de carrera (Méndez: 60/edad). */
  ajusteIngreso: boolean
  descripcion: string
}> = {
  vuoto_mendez: {
    label: 'Vuoto II / Méndez',
    topeVidaUtil: 75,
    tasa: 0.04,
    ajusteIngreso: true,
    descripcion: 'Vida útil hasta 75 años, tasa 4%, ingreso ajustado × 60/edad. Versión expansiva usada en Tucumán.',
  },
  clasico: {
    label: 'Vuoto clásico',
    topeVidaUtil: 65,
    tasa: 0.06,
    ajusteIngreso: false,
    descripcion: 'Vida útil hasta 65 años, tasa 6%, sin ajuste de ingreso. Versión histórica más conservadora.',
  },
}

// ── Matriz de gravedad — consecuencias no patrimoniales (art. 1741) ──────────
// Multiplicadores sobre la base comparable. NO es tarifa: ordena la deliberación.
export const MATRIZ_GRAVEDAD: Record<GravedadNivel, {
  label: string
  min: number
  max: number
  indicadores: string
}> = {
  bajo: {
    label: 'Bajo',
    min: 1, max: 1,
    indicadores: 'Molestias acotadas, corta duración, un solo reclamo, sin vulnerabilidad.',
  },
  medio: {
    label: 'Medio',
    min: 1.5, max: 3,
    indicadores: 'Padecimiento sostenido, múltiples gestiones, trato poco diligente.',
  },
  alto: {
    label: 'Alto',
    min: 3, max: 6,
    indicadores: 'Afectación de salud, incertidumbre prolongada, reiterados incumplimientos, persona vulnerable.',
  },
  muy_alto: {
    label: 'Muy alto',
    min: 6, max: 10,
    indicadores: 'Afectación del proyecto de vida o autonomía, salud comprometida, especial exposición o humillación.',
  },
  extremo: {
    label: 'Extremo',
    min: 10, max: 15,
    indicadores: 'Riesgo o lesión severa de salud/vida, humillación intensa, hipervulnerabilidad. Fundamentación reforzada.',
  },
}

// ── Escala de cuantificación del daño punitivo por canastas (CBT Hogar 3) ────
// Fuente: informe (art. 47 inc. b + 52 bis LDC). No reemplaza la fundamentación.
export const ESCALA_PUNITIVO: Record<PunitivoNivel, {
  label: string
  min: number // canastas
  max: number // canastas
}> = {
  leve:        { label: 'Leve',        min: 0.5, max: 2 },
  media:       { label: 'Media',       min: 2,   max: 10 },
  alta:        { label: 'Alta',        min: 10,  max: 50 },
  muy_alta:    { label: 'Muy alta',    min: 50,  max: 200 },
  excepcional: { label: 'Excepcional', min: 200, max: 500 },
}

// ── Topes legales del daño punitivo (art. 47 inc. b LDC, Ley 27.701) ─────────
// Expresados en canastas básicas totales Hogar 3.
export const PUNITIVO_PISO_CBT = 0.5
export const PUNITIVO_TECHO_CBT = 2100

// ── Daño directo administrativo (art. 40 bis LDC): tope 5 CBT Hogar 3 ────────
export const DANO_DIRECTO_TECHO_CBT = 5

export const METODO_PUNITIVO_LABEL: Record<MetodoPunitivo, string> = {
  canastas: 'Por canastas (CBT Hogar 3)',
  irigoyen_testa: 'Irigoyen Testa',
  beneficio_ilicito: 'Beneficio ilícito',
  prudencial: 'Prudencial / cualitativo',
}

// ── Tasas por defecto para intereses (estimadas, configurables) ──────────────
export const TASA_PURA_DEFAULT = 0.06     // interés puro anual pre-valuación
export const TASA_ACTIVA_DEFAULT = 0.90   // tasa activa anual post-valuación (ESTIMADA — actualizar)

export const MESES_POR_ANIO_DEFAULT = 13  // 12 meses + aguinaldo

// ── Árbol de admisibilidad de rubros ─────────────────────────────────────────
export interface RubroDef {
  key: string
  label: string
  base: string // norma
  categoria: 'patrimonial' | 'no_patrimonial' | 'punitivo' | 'intereses'
}

export const RUBROS: RubroDef[] = [
  { key: 'incapacidad',        label: 'Incapacidad sobreviniente',      base: 'art. 1746 CCyC', categoria: 'patrimonial' },
  { key: 'lucro_cesante',      label: 'Lucro cesante',                  base: 'arts. 1738-1739 CCyC', categoria: 'patrimonial' },
  { key: 'gastos_medicos',     label: 'Gastos médicos y traslados',     base: 'art. 1746 CCyC', categoria: 'patrimonial' },
  { key: 'no_patrimonial',     label: 'Consecuencias no patrimoniales', base: 'art. 1741 CCyC', categoria: 'no_patrimonial' },
  { key: 'punitivo',           label: 'Daño punitivo',                  base: 'art. 52 bis LDC', categoria: 'punitivo' },
]
