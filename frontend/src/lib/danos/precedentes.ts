// ============================================================================
// Normalización de precedentes jurisprudenciales.
// Los fallos guardados en unidades constantes (CBT/SMVM) se llevan a valor de
// hoy multiplicando por el valor de referencia vigente — la técnica del informe
// para comparar montos entre años sin confundir comparación con actualización.
// Los fallos sólo en pesos nominales se muestran sin normalizar (advertidos).
// ============================================================================

import type { ValoresReferencia } from './types'

export interface Precedente {
  id: string
  tribunal: string
  sala: string | null
  fecha: string | null
  caratula: string
  expediente: string | null
  tipo_conflicto: string | null
  rubro: 'punitivo' | 'no_patrimonial' | 'patrimonial' | 'mixto'
  monto_nominal: number | null
  fecha_cuantificacion: string | null
  unidad_normalizada: 'CBT' | 'SMVM' | 'IPC' | 'UVA' | null
  valor_en_unidad: number | null
  hechos_relevantes: string | null
  fundamento: string | null
  fuente_url: string | null
  estado_verificacion: 'verificado_integro' | 'remision_oficial'
  jurisdiccion: string
  activo: boolean
}

export interface PrecedenteNormalizado {
  precedente: Precedente
  /** Monto llevado a valor de hoy, o null si no se pudo. */
  montoHoy: number | null
  /** true si se normalizó a unidad constante; false si es nominal sin ajuste. */
  normalizado: boolean
  metodo: string
}

export function normalizarPrecedente(p: Precedente, valores: ValoresReferencia): PrecedenteNormalizado {
  if (p.valor_en_unidad != null && p.unidad_normalizada) {
    if (p.unidad_normalizada === 'CBT' && valores.cbtHogar3 > 0) {
      return { precedente: p, montoHoy: p.valor_en_unidad * valores.cbtHogar3, normalizado: true, metodo: `${p.valor_en_unidad} CBT × valor actual` }
    }
    if (p.unidad_normalizada === 'SMVM' && (valores.smvm ?? 0) > 0) {
      return { precedente: p, montoHoy: p.valor_en_unidad * (valores.smvm ?? 0), normalizado: true, metodo: `${p.valor_en_unidad} SMVM × valor actual` }
    }
  }
  if (p.monto_nominal != null) {
    return { precedente: p, montoHoy: p.monto_nominal, normalizado: false, metodo: 'monto nominal (sin normalizar)' }
  }
  return { precedente: p, montoHoy: null, normalizado: false, metodo: 'sin monto' }
}

function mediana(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export interface BaseComparable {
  base: number
  /** Precedentes normalizados usados para la base (con monto), ordenados. */
  usados: PrecedenteNormalizado[]
  /** true si la base surge de comparables reales (no de una estimación manual). */
  desdeReales: boolean
}

/**
 * Deriva una base comparable (mediana de montos normalizados) para un rubro a
 * partir de los precedentes disponibles. Si no hay comparables con monto,
 * devuelve base 0 y desdeReales=false (el UI cae al valor manual).
 */
export function baseComparableDe(
  precedentes: Precedente[], valores: ValoresReferencia, rubro: Precedente['rubro'],
): BaseComparable {
  const norm = precedentes
    .filter(p => p.activo && p.rubro === rubro)
    .map(p => normalizarPrecedente(p, valores))
    .filter(n => n.montoHoy != null && n.montoHoy > 0)
    .sort((a, b) => (a.montoHoy ?? 0) - (b.montoHoy ?? 0))
  const montos = norm.map(n => n.montoHoy as number)
  return { base: mediana(montos), usados: norm, desdeReales: norm.length > 0 }
}
