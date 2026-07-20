// ============================================================================
// Orquestador — corre los módulos en 3 escenarios (conservador/razonable/
// expansivo) y arma la auditoría. Cada escenario es un punto; el rango global
// emerge de conservador.total ↔ expansivo.total.
// ============================================================================

import { RUBROS } from './constantes'
import { calcularIncapacidad1746 } from './patrimonial'
import { calcularNoPatrimonial } from './no-patrimonial'
import { evaluarProcedencia, cuantificarPunitivo } from './punitivo'
import { calcularIntereses } from './intereses'
import { generarAlertas } from './alertas'
import type {
  CalculoDanosInput, Escenario, EscenarioResultado, RubroCalculado,
  ResultadoDanos, ValoresReferencia, NivelConfianza, PresetFormula,
} from './types'

const ESCENARIOS: Escenario[] = ['conservador', 'razonable', 'expansivo']

/** Preset patrimonial por escenario (conservador = clásico, más bajo). */
function presetPara(esc: Escenario, base?: PresetFormula): PresetFormula {
  if (esc === 'conservador') return 'clasico'
  return base ?? 'vuoto_mendez'
}

/** Elige min / medio / max de un rango según el escenario. */
function pick(esc: Escenario, min: number, max: number): number {
  if (esc === 'conservador') return min
  if (esc === 'expansivo') return max
  return (min + max) / 2
}

function calcularEscenario(
  esc: Escenario,
  input: CalculoDanosInput,
  valores: ValoresReferencia,
  variablesEstimadas: Set<string>,
): EscenarioResultado {
  const rubros: RubroCalculado[] = []
  const tiene = (k: string) => input.rubros.includes(k)
  const defOf = (k: string) => RUBROS.find(r => r.key === k)!

  // Patrimonial — incapacidad (art. 1746)
  if (tiene('incapacidad') && input.incapacidad) {
    const r = calcularIncapacidad1746(
      { ...input.incapacidad, preset: presetPara(esc, input.incapacidad.preset) },
      { smvm: valores.smvm },
    )
    if (r.detalle.ingresoEstimado) variablesEstimadas.add('Ingreso subsidiario (SMVM u otro)')
    const d = defOf('incapacidad')
    rubros.push({ key: d.key, label: d.label, categoria: d.categoria, monto: r.capital, detalle: r.detalle })
  }

  // Patrimonial — lucro cesante pasado (histórico, igual en todos los escenarios)
  if (tiene('lucro_cesante') && input.lucroCesantePasado) {
    const d = defOf('lucro_cesante')
    rubros.push({ key: d.key, label: d.label, categoria: d.categoria, monto: input.lucroCesantePasado })
  }

  // Patrimonial — gastos médicos (comprobados + futuros)
  if (tiene('gastos_medicos') && input.gastos) {
    const g = input.gastos
    const monto = (g.medicosPasados ?? 0) + (g.medicosFuturos ?? 0) + (g.otros ?? 0)
    const d = defOf('gastos_medicos')
    rubros.push({ key: d.key, label: d.label, categoria: d.categoria, monto })
  }

  // No patrimonial (art. 1741) — rango min/medio/max según escenario
  if (tiene('no_patrimonial') && input.noPatrimonial) {
    const r = calcularNoPatrimonial(input.noPatrimonial)
    if (input.noPatrimonial.baseEstimada) variablesEstimadas.add('Base comparable no patrimonial (estimada)')
    const d = defOf('no_patrimonial')
    rubros.push({
      key: d.key, label: d.label, categoria: d.categoria,
      monto: pick(esc, r.montoMin, r.montoMax), detalle: r,
    })
  }

  // Punitivo (art. 52 bis LDC) — procedencia + cuantificación
  if (tiene('punitivo') && input.punitivo && input.relacionConsumo) {
    const proc = evaluarProcedencia(input.procedencia ?? {})
    const r = cuantificarPunitivo(input.punitivo, { cbtHogar3: valores.cbtHogar3 }, proc.procede)
    if (input.punitivo.metodo === 'irigoyen_testa') {
      variablesEstimadas.add('Probabilidades Pc / Pd (Irigoyen Testa)')
    }
    const d = defOf('punitivo')
    rubros.push({
      key: d.key, label: d.label, categoria: d.categoria,
      monto: proc.procede ? pick(esc, r.montoMin, r.montoMax) : 0,
      detalle: { procedencia: proc, cuantificacion: r },
    })
  }

  // Intereses (deuda de valor) sobre el subtotal compensatorio
  if (input.aplicarIntereses && input.fechaHecho && input.fechaPago) {
    const compensatorio = rubros
      .filter(r => r.categoria !== 'punitivo')
      .reduce((s, r) => s + r.monto, 0)
    if (compensatorio > 0) {
      const int = calcularIntereses({
        capital: compensatorio, tipoRubro: 'deuda_de_valor',
        fechaInicio: input.fechaHecho, fechaValuacion: input.fechaValuacion,
        fechaPago: input.fechaPago,
      })
      variablesEstimadas.add('Tasa activa post-valuación (estimada)')
      rubros.push({ key: 'intereses', label: 'Intereses', categoria: 'intereses', monto: int.total, detalle: int.detalle })
    }
  }

  const total = rubros.reduce((s, r) => s + r.monto, 0)
  return { escenario: esc, rubros, total }
}

export function calcularDanos(input: CalculoDanosInput, valores: ValoresReferencia): ResultadoDanos {
  const variablesEstimadas = new Set<string>()
  const escenarios = {} as Record<Escenario, EscenarioResultado>
  for (const esc of ESCENARIOS) {
    escenarios[esc] = calcularEscenario(esc, input, valores, variablesEstimadas)
  }

  const alertas = generarAlertas(input)

  // Nivel de confianza global: baja si hay errores o muchas estimaciones.
  let nivelConfianza: NivelConfianza = 'alto'
  if (variablesEstimadas.size >= 2) nivelConfianza = 'medio'
  if (alertas.some(a => a.severidad === 'error') || variablesEstimadas.size >= 4) nivelConfianza = 'bajo'

  return {
    escenarios,
    auditoria: {
      valoresReferencia: valores,
      variablesEstimadas: [...variablesEstimadas],
      alertas,
      nivelConfianza,
    },
  }
}
