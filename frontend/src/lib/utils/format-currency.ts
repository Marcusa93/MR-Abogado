const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const ARS_COMPACT_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  compactDisplay: 'short',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const ARS_INTEGER_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Format a number as Argentine Pesos.
 *
 * @example
 * formatCurrency(1500000)       // "$\u00a01.500.000,00"
 * formatCurrency(1500000, true) // "$\u00a01,5\u00a0M"
 */
export function formatCurrency(
  amount: number | null | undefined,
  compact = false
): string {
  if (amount == null) return '-'

  if (compact) {
    return ARS_COMPACT_FORMATTER.format(amount)
  }

  return ARS_FORMATTER.format(amount)
}

/**
 * Format a number as Argentine Pesos without decimal places.
 *
 * @example
 * formatCurrencyInteger(1500000)  // "$\u00a01.500.000"
 */
export function formatCurrencyInteger(
  amount: number | null | undefined
): string {
  if (amount == null) return '-'
  return ARS_INTEGER_FORMATTER.format(amount)
}

/**
 * Parse a user-entered currency string back to a number.
 * Strips the currency symbol, dots (thousands sep), and replaces
 * comma (decimal sep) with period.
 *
 * @example
 * parseCurrencyInput('$\u00a01.500.000,50')  // 1500000.5
 * parseCurrencyInput('1500000.50')            // 1500000.5
 */
export function parseCurrencyInput(value: string): number | null {
  const cleaned = value
    .replace(/[^0-9,.]/g, '')  // remove everything except digits, comma, period
    .replace(/\./g, '')        // remove thousands separators (dots in es-AR)
    .replace(',', '.')         // replace decimal comma with period

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Format a percentage value for display.
 *
 * @example
 * formatPercentage(20)   // "20%"
 * formatPercentage(12.5) // "12,5%"
 */
export function formatPercentage(
  value: number | null | undefined
): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100)
}
