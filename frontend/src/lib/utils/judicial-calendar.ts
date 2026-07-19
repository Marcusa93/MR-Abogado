// Calculadora de plazos procesales — Tucumán, Argentina
// Portado desde supabase/functions/_shared/judicial-calendar.ts

export interface FeriaPeriod {
  inicio: string // YYYY-MM-DD
  fin:    string // YYYY-MM-DD
}

export interface ResultadoPlazo {
  vencimiento: string  // YYYY-MM-DD
  notificacion: string // YYYY-MM-DD
  primerDia: string    // YYYY-MM-DD
}

function shiftUTC(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
  ))
}

export function isoUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

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

function nearestMonday(date: Date): Date {
  const dow = date.getUTCDay()
  if (dow === 1) return date
  if (dow === 0) return shiftUTC(date, 1)
  if (dow === 6) return shiftUTC(date, 2)
  if (dow <= 3)  return shiftUTC(date, 1 - dow)
  return shiftUTC(date, 8 - dow)
}

function buildHolidaySet(year: number): Set<string> {
  const h = new Set<string>()
  ;[
    [1, 1], [3, 24], [4, 2], [5, 1], [5, 25],
    [6, 20], [7, 9], [12, 8], [12, 25],
  ].forEach(([m, d]) => {
    h.add(`${year}-${String(m!).padStart(2, '0')}-${String(d!).padStart(2, '0')}`)
  })
  ;[
    [8, 17], [10, 12], [11, 20],
  ].forEach(([m, d]) => {
    const fixed = new Date(Date.UTC(year, m! - 1, d!))
    h.add(isoUTC(fixed))
    h.add(isoUTC(nearestMonday(fixed)))
  })
  const easter = easterUTC(year)
  h.add(isoUTC(shiftUTC(easter, -3)))  // Jueves Santo
  h.add(isoUTC(shiftUTC(easter, -2)))  // Viernes Santo
  h.add(isoUTC(shiftUTC(easter, -48))) // Lunes de Carnaval
  h.add(isoUTC(shiftUTC(easter, -47))) // Martes de Carnaval
  return h
}

const holidayCache = new Map<number, Set<string>>()
function getHolidays(year: number): Set<string> {
  if (!holidayCache.has(year)) holidayCache.set(year, buildHolidaySet(year))
  return holidayCache.get(year)!
}

function isInFeria(date: Date, periods: FeriaPeriod[]): boolean {
  const iso = isoUTC(date)
  return periods.some(p => iso >= p.inicio && iso <= p.fin)
}

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

// Calcula el vencimiento de un plazo procesal (CPCC Tucumán).
// Regla: firma → primer hábil = notificación → siguiente hábil = día 1 → contar N días.
export function calcularVencimiento(
  fechaActuacion: string,
  dias: number,
  habiles: boolean,
  feriaPeriods: FeriaPeriod[],
): ResultadoPlazo | null {
  if (!fechaActuacion || !Number.isInteger(dias) || dias <= 0) return null
  const parts = fechaActuacion.split('-').map(Number)
  if (parts.length !== 3) return null
  const [y, m, d] = parts as [number, number, number]
  const base = new Date(Date.UTC(y, m - 1, d, 12))
  if (isNaN(base.getTime())) return null

  const notif  = primerHabilDesde(shiftUTC(base, 1), feriaPeriods)
  const primer = primerHabilDesde(shiftUTC(notif, 1), feriaPeriods)

  if (!habiles) {
    return {
      vencimiento: isoUTC(shiftUTC(primer, dias - 1)),
      notificacion: isoUTC(notif),
      primerDia: isoUTC(primer),
    }
  }

  let current = new Date(primer)
  let counted = 0
  const maxIter = dias * 5 + 400
  for (let i = 0; i < maxIter; i++) {
    if (isHabilDay(current, feriaPeriods)) {
      counted++
      if (counted === dias) {
        return {
          vencimiento: isoUTC(current),
          notificacion: isoUTC(notif),
          primerDia: isoUTC(primer),
        }
      }
    }
    current = shiftUTC(current, 1)
  }
  return null
}

// Cuenta días hábiles entre dos fechas (ambas inclusive)
export function contarHabiles(desde: string, hasta: string, feriaPeriods: FeriaPeriod[]): number {
  const [y1, m1, d1] = desde.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = hasta.split('-').map(Number) as [number, number, number]
  let cur = new Date(Date.UTC(y1, m1 - 1, d1, 12))
  const end = new Date(Date.UTC(y2, m2 - 1, d2, 12))
  let count = 0
  while (cur <= end) {
    if (isHabilDay(cur, feriaPeriods)) count++
    cur = new Date(cur.getTime() + 86400000)
  }
  return count
}
