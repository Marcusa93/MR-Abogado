// ============================================================================
// Estimador de daños — tipos del motor de cálculo (determinístico, sin LLM).
// Espejo del schema input/output del informe técnico-jurídico (Tucumán).
// ============================================================================

export type Escenario = 'conservador' | 'razonable' | 'expansivo'
export type NivelConfianza = 'bajo' | 'medio' | 'alto'

// ── Valores de referencia (vienen de tabla valores_referencia) ───────────────
export interface ValoresReferencia {
  /** CBT Hogar 3 (INDEC), en pesos. Base del daño punitivo por canastas. */
  cbtHogar3: number
  /** Salario mínimo vital y móvil mensual, en pesos. Ingreso subsidiario. */
  smvm?: number
  /** Fecha de vigencia de los valores usados (para auditoría). */
  vigenciaDesde?: string
}

// ── Ingreso ──────────────────────────────────────────────────────────────────
export type FuenteIngreso = 'acreditado' | 'estimado_indirecto' | 'no_acreditado'
export type ParametroSupletorio = 'SMVM' | 'tareas_no_remuneradas' | 'otro'

export interface IngresoInput {
  /** Ingreso mensual en pesos. Si null y no_acreditado, se usa el parámetro supletorio. */
  montoMensual: number | null
  fuente: FuenteIngreso
  parametroSupletorio?: ParametroSupletorio
}

// ── Módulo patrimonial: incapacidad (art. 1746) ──────────────────────────────
export type PresetFormula = 'vuoto_mendez' | 'clasico'
export type TipoIncapacidad = 'fisica' | 'psiquica' | 'ambas'

export interface IncapacidadInput {
  edad: number
  /** Porcentaje de incapacidad (0-100). */
  porcentaje: number
  tipo?: TipoIncapacidad
  ingreso: IngresoInput
  /** Meses de aguinaldo/año considerados (default 13). */
  mesesPorAnio?: number
  preset?: PresetFormula
  /** Override de tasa de descuento (si no, la del preset). */
  tasaDescuento?: number
}

export interface ResultadoIncapacidad {
  capital: number
  /** Insumos usados, expuestos para auditoría. */
  detalle: {
    preset: PresetFormula
    edad: number
    n: number
    tasa: number
    ingresoMensual: number
    ingresoAnual: number
    factorAjuste: number
    ingresoAjustadoAnual: number
    porcentaje: number
    perdidaAnual: number
    ingresoEstimado: boolean
  }
}

// ── Gastos y flujos pasados ──────────────────────────────────────────────────
export interface GastosInput {
  medicosPasados?: number
  medicosFuturos?: number
  /** Otros gastos comprobados (traslados, etc.). */
  otros?: number
}

// ── Módulo no patrimonial (art. 1741) ────────────────────────────────────────
export type GravedadNivel = 'bajo' | 'medio' | 'alto' | 'muy_alto' | 'extremo'
export type Vulnerabilidad = 'ninguna' | 'media' | 'alta' | 'hipervulnerable'

export interface NoPatrimonialInput {
  duracionMeses?: number
  vulnerabilidad?: Vulnerabilidad
  afectacionSalud?: boolean
  reiteracion?: boolean
  /** Nivel manual; si se omite, se infiere de los indicadores. */
  nivelManual?: GravedadNivel
  /**
   * Base comparable (monto por 1× de la matriz). Puede venir de precedentes
   * normalizados; si no hay, se usa esta base (en pesos) marcada como estimada.
   */
  baseComparable: number
  baseEstimada?: boolean
}

export interface ResultadoNoPatrimonial {
  nivel: GravedadNivel
  montoMin: number
  montoMax: number
  multiplicadorMin: number
  multiplicadorMax: number
  baseComparable: number
  confianza: NivelConfianza
  /** Indicadores que llevaron al nivel (para narrativa/auditoría). */
  factores: string[]
}

// ── Módulo punitivo (art. 52 bis LDC) ────────────────────────────────────────
export interface ProcedenciaInput {
  incumplimientoGraveConDano?: boolean
  reiteracion?: boolean
  tratoIndigno?: boolean
  vulnerabilidad?: boolean
  riesgoSalud?: boolean
  beneficioIlicito?: boolean
  conductaProcesalObstructiva?: boolean
}

export interface ResultadoProcedencia {
  procede: boolean
  peso: number
  motivos: string[]
}

export type MetodoPunitivo = 'canastas' | 'irigoyen_testa' | 'beneficio_ilicito' | 'prudencial'
export type PunitivoNivel = 'leve' | 'media' | 'alta' | 'muy_alta' | 'excepcional'

export interface PunitivoInput {
  metodo: MetodoPunitivo
  // canastas / prudencial
  nivel?: PunitivoNivel
  /** Cantidad de canastas manual (si se prefiere fijar el número). */
  canastasManual?: number
  // irigoyen testa
  compensatorio?: number // C
  probCondenaCompensatoria?: number // Pc (0-1]
  probCondenaPunitiva?: number // Pd (0-1]
  // beneficio ilícito
  beneficioIlicito?: number
  probSancion?: number // 0-1]
}

export interface ResultadoPunitivo {
  procede: boolean
  metodo: MetodoPunitivo
  montoMin: number
  montoMax: number
  /** Equivalencia en canastas del monto razonable (punto medio). */
  canastas?: number
  /** Múltiplo D/C en Irigoyen Testa. */
  multiploDC?: number
  topeExcedido: boolean
  advertencias: string[]
}

// ── Módulo intereses ─────────────────────────────────────────────────────────
export type TipoRubroInteres = 'deuda_de_valor' | 'punitivo'

export interface InteresesInput {
  capital: number
  tipoRubro: TipoRubroInteres
  fechaInicio: string // mora / hecho / firmeza
  fechaValuacion: string
  fechaPago: string
  /** Tasa pura anual pre-valuación (default 0.06). */
  tasaPura?: number
  /** Tasa activa anual post-valuación (default configurable, estimada). */
  tasaActiva?: number
}

export interface ResultadoIntereses {
  tramoPuro: number
  tramoActivo: number
  total: number
  detalle: {
    diasPuro: number
    diasActivo: number
    tasaPura: number
    tasaActiva: number
  }
}

// ── Alertas ──────────────────────────────────────────────────────────────────
export type AlertaSeveridad = 'info' | 'warning' | 'error'
export interface Alerta {
  severidad: AlertaSeveridad
  codigo: string
  mensaje: string
}

// ── Entrada agregada del cálculo (orquestador) ───────────────────────────────
export interface CalculoDanosInput {
  jurisdiccion?: string
  tipoCaso?: string
  fechaHecho?: string
  fechaValuacion: string
  fechaPago?: string
  relacionConsumo: boolean
  /** Keys de rubros seleccionados (ver RUBROS en constantes). */
  rubros: string[]
  // patrimonial
  incapacidad?: IncapacidadInput
  incluyeDanoPsiquico?: boolean
  lucroCesantePasado?: number
  gastos?: GastosInput
  // no patrimonial
  noPatrimonial?: NoPatrimonialInput
  // punitivo
  procedencia?: ProcedenciaInput
  punitivo?: PunitivoInput
  // intereses
  aplicarIntereses?: boolean
}

// ── Salida agregada (3 escenarios + auditoría) ───────────────────────────────
export interface RubroCalculado {
  key: string
  label: string
  categoria: string
  monto: number
  /** Detalle específico del rubro (insumos, para auditoría). */
  detalle?: unknown
}

export interface EscenarioResultado {
  escenario: Escenario
  rubros: RubroCalculado[]
  total: number
}

export interface AuditoriaResultado {
  valoresReferencia: ValoresReferencia
  variablesEstimadas: string[]
  alertas: Alerta[]
  nivelConfianza: NivelConfianza
  fechaCalculo?: string
}

export interface ResultadoDanos {
  escenarios: Record<Escenario, EscenarioResultado>
  auditoria: AuditoriaResultado
}
