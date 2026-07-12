// ─── Calculadora de plazos procesales — Tucumán, Argentina ───────────────────
//
// Regla general (CPCC Tucumán):
//   Día 0 : la actuación se firma (fecha indicada en el documento)
//   Día +1: se notifica (día siguiente, hábil o no)
//   Día +2: comienza a correr el plazo (primer día hábil desde aquí)
//
// Días inhábiles descontados:
//   • Sábados y domingos
//   • Feriados nacionales (inamovibles + movibles + Semana Santa + Carnaval)
//   • Feria judicial de verano: todo enero
//   • Feria judicial de invierno: 1–15 de julio

// ── Semana Santa (algoritmo Meeus/Jones/Butcher) ─────────────────────────────

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
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

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

// Traslado de feriados "móviles" argentinos al lunes más cercano.
// Si el feriado cae martes-miércoles → lunes anterior.
// Si cae jueves-domingo → lunes siguiente.
// Si cae lunes → se mantiene.
function nearestMonday(date: Date): Date {
  const dow = date.getUTCDay() // 0=Dom … 6=Sáb
  if (dow === 1) return date              // ya es lunes
  if (dow === 0) return shiftUTC(date, 1) // domingo → lunes
  if (dow === 6) return shiftUTC(date, 2) // sábado  → lunes
  if (dow <= 3)  return shiftUTC(date, 1 - dow) // mar/mié → lunes anterior
  return shiftUTC(date, 8 - dow)                // jue/vie  → lunes siguiente
}

// ── Construcción del set de feriados para un año ─────────────────────────────

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

  // Trasladables (se mueven al lunes más próximo)
  ;[
    [8, 17],  // Paso a la Inmortalidad del General San Martín
    [10, 12], // Día del Respeto a la Diversidad Cultural
    [11, 20], // Día de la Soberanía Nacional
  ].forEach(([m, d]) => {
    const fixed = new Date(Date.UTC(year, m - 1, d))
    h.add(isoUTC(fixed))
    h.add(isoUTC(nearestMonday(fixed))) // por si se traslada
  })

  // Semana Santa
  const easter = easterUTC(year)
  h.add(isoUTC(shiftUTC(easter, -3))) // Jueves Santo
  h.add(isoUTC(shiftUTC(easter, -2))) // Viernes Santo

  // Carnaval (lunes y martes previos al Miércoles de Ceniza)
  h.add(isoUTC(shiftUTC(easter, -48))) // Lunes de Carnaval
  h.add(isoUTC(shiftUTC(easter, -47))) // Martes de Carnaval

  return h
}

const cache = new Map<number, Set<string>>()
function holidays(year: number): Set<string> {
  if (!cache.has(year)) cache.set(year, buildHolidaySet(year))
  return cache.get(year)!
}

// ── Feria judicial de Tucumán ─────────────────────────────────────────────────

function isJudicialFeria(date: Date): boolean {
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  if (m === 1) return true           // feria de verano: enero completo
  if (m === 7 && d <= 15) return true // feria de invierno: 1–15 julio
  return false
}

// ── Verificación de habilidad de un día ──────────────────────────────────────

export function isHabilDay(date: Date): boolean {
  const dow = date.getUTCDay()
  if (dow === 0 || dow === 6) return false          // fin de semana
  if (isJudicialFeria(date)) return false           // feria judicial
  if (holidays(date.getUTCFullYear()).has(isoUTC(date))) return false
  return true
}

// ── Cálculo de vencimiento ────────────────────────────────────────────────────
//
// fechaActuacion : YYYY-MM-DD  (fecha en que se firmó la actuación)
// dias           : número de días del plazo (entero positivo)
// habiles        : true = días hábiles judiciales | false = días corridos
//
// Retorna YYYY-MM-DD o null si los parámetros son inválidos.

export function calcularVencimiento(
  fechaActuacion: string,
  dias: number,
  habiles: boolean,
): string | null {
  if (!fechaActuacion || !Number.isInteger(dias) || dias <= 0) return null

  const parts = fechaActuacion.split('-').map(Number)
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const base = new Date(Date.UTC(y, m - 1, d, 12))
  if (isNaN(base.getTime())) return null

  // Primer día desde el que corre el plazo = firma + 2
  // (firma → notificación +1 → primer día del plazo +1 más)
  const primerDia = shiftUTC(base, 2)

  if (!habiles) {
    // Días corridos: el día 1 es primerDia, el día N es primerDia + (N-1)
    return isoUTC(shiftUTC(primerDia, dias - 1))
  }

  // Días hábiles: avanzar de a un día contando solo los hábiles.
  // Si primerDia es inhábil, el plazo empieza el siguiente día hábil (día 1).
  let current = new Date(primerDia)
  let counted = 0
  const maxIter = dias * 5 + 400 // margen amplio para ferias largas
  let iter = 0

  while (iter++ < maxIter) {
    if (isHabilDay(current)) {
      counted++
      if (counted === dias) return isoUTC(current)
    }
    current = shiftUTC(current, 1)
  }

  return null // no debería llegar aquí
}
