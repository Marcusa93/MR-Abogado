// ─── Calculadora de plazos procesales — Tucumán, Argentina ───────────────────
//
// Regla general (CPCC Tucumán):
//   Firma  : fecha indicada en el documento.
//   Notificación: PRIMER DÍA HÁBIL posterior a la firma (las cédulas se
//                 diligencian solo en días hábiles).
//   Primer día procesal: PRIMER DÍA HÁBIL posterior a la notificación.
//   Los N días del plazo se cuentan a partir de ahí.
//
// Días inhábiles descontados:
//   • Sábados y domingos
//   • Feriados nacionales (inamovibles + movibles + Semana Santa + Carnaval)
//   • Períodos de feria judicial informados por la tabla feria_judicial de la BD

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface FeriaPeriod {
  inicio: string // YYYY-MM-DD
  fin:    string // YYYY-MM-DD
}

// ── Helpers de fecha UTC ──────────────────────────────────────────────────────

function shiftUTC(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
  ))
}

function isoUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ── Semana Santa (algoritmo Meeus/Jones/Butcher) ──────────────────────────────

function easterUTC(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

// ── Traslado de feriados al lunes más cercano ─────────────────────────────────
// mar/mié → lunes anterior; jue/vie → lunes siguiente; sáb → lunes +2; dom → lunes +1

function nearestMonday(date: Date): Date {
  const dow = date.getUTCDay()
  if (dow === 1) return date
  if (dow === 0) return shiftUTC(date, 1)
  if (dow === 6) return shiftUTC(date, 2)
  if (dow <= 3)  return shiftUTC(date, 1 - dow)
  return shiftUTC(date, 8 - dow)
}

// ── Feriados nacionales argentinos ────────────────────────────────────────────

function buildHolidaySet(year: number): Set<string> {
  const h = new Set<string>()

  // Inamovibles
  ;[
    [1, 1],   // Año Nuevo
    [3, 24],  // Día Nacional de la Memoria
    [4, 2],   // Veteranos de Malvinas
    [5, 1],   // Día del Trabajador
    [5, 25],  // Revolución de Mayo
    [6, 20],  // Bandera
    [7, 9],   // Independencia
    [12, 8],  // Inmaculada Concepción
    [12, 25], // Navidad
  ].forEach(([m, d]) => {
    h.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  })

  // Trasladables — se agrega tanto la fecha fija como el lunes trasladado
  ;[
    [8, 17],  // Paso a la Inmortalidad del Gral. San Martín
    [10, 12], // Diversidad Cultural
    [11, 20], // Soberanía Nacional
  ].forEach(([m, d]) => {
    const fixed = new Date(Date.UTC(year, m - 1, d))
    h.add(isoUTC(fixed))
    h.add(isoUTC(nearestMonday(fixed)))
  })

  // Semana Santa
  const easter = easterUTC(year)
  h.add(isoUTC(shiftUTC(easter, -3))) // Jueves Santo
  h.add(isoUTC(shiftUTC(easter, -2))) // Viernes Santo

  // Carnaval
  h.add(isoUTC(shiftUTC(easter, -48))) // Lunes de Carnaval
  h.add(isoUTC(shiftUTC(easter, -47))) // Martes de Carnaval

  return h
}

const holidayCache = new Map<number, Set<string>>()
function getHolidays(year: number): Set<string> {
  if (!holidayCache.has(year)) holidayCache.set(year, buildHolidaySet(year))
  return holidayCache.get(year)!
}

// ── Verificación de feria para una fecha ─────────────────────────────────────

function isInFeria(date: Date, periods: FeriaPeriod[]): boolean {
  const iso = isoUTC(date)
  return periods.some(p => iso >= p.inicio && iso <= p.fin)
}

// ── API pública ───────────────────────────────────────────────────────────────

export function isHabilDay(date: Date, feriaPeriods: FeriaPeriod[]): boolean {
  const dow = date.getUTCDay()
  if (dow === 0 || dow === 6) return false
  if (isInFeria(date, feriaPeriods)) return false
  if (getHolidays(date.getUTCFullYear()).has(isoUTC(date))) return false
  return true
}

function primerHabilDesde(from: Date, feriaPeriods: FeriaPeriod[]): Date {
  let d = new Date(from)
  for (let i = 0; i < 400; i++) {
    if (isHabilDay(d, feriaPeriods)) return d
    d = shiftUTC(d, 1)
  }
  return d
}

// Calcula el vencimiento de un plazo procesal.
//
// Regla procesal (CPCC Tucumán):
//   1. Firma: día indicado en la actuación.
//   2. Notificación: PRIMER DÍA HÁBIL posterior a la firma.
//      (Las cédulas solo se diligencian en días hábiles.)
//   3. Primer día a efectos procesales: PRIMER DÍA HÁBIL posterior a la notificación.
//   4. Desde ese día se cuentan los N días del plazo.
//
// Ejemplo — firma 08/07/2026, feria 09–24/07:
//   Notificación  → 27/07 (lunes, primer hábil tras la feria + fin de semana)
//   Primer día    → 28/07 (martes)
//   5 días hábiles → vence 03/08
//
// fechaActuacion : YYYY-MM-DD
// dias           : entero positivo
// habiles        : true = días hábiles | false = días corridos
// feriaPeriods   : períodos de feria de la tabla feria_judicial

export function calcularVencimiento(
  fechaActuacion: string,
  dias: number,
  habiles: boolean,
  feriaPeriods: FeriaPeriod[],
): string | null {
  if (!fechaActuacion || !Number.isInteger(dias) || dias <= 0) return null

  const parts = fechaActuacion.split('-').map(Number)
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const base = new Date(Date.UTC(y, m - 1, d, 12))
  if (isNaN(base.getTime())) return null

  // Notificación = primer hábil posterior a la firma
  const notificacion = primerHabilDesde(shiftUTC(base, 1), feriaPeriods)

  // Primer día procesal = primer hábil posterior a la notificación
  const primerDia = primerHabilDesde(shiftUTC(notificacion, 1), feriaPeriods)

  if (!habiles) {
    // Días corridos: día 1 = primerDia, día N = primerDia + (N-1) calendarios
    return isoUTC(shiftUTC(primerDia, dias - 1))
  }

  // Días hábiles: primerDia es el día 1; contar N hábiles sucesivos
  let current = new Date(primerDia)
  let counted = 0
  const maxIter = dias * 5 + 400

  for (let i = 0; i < maxIter; i++) {
    if (isHabilDay(current, feriaPeriods)) {
      counted++
      if (counted === dias) return isoUTC(current)
    }
    current = shiftUTC(current, 1)
  }

  return null
}
