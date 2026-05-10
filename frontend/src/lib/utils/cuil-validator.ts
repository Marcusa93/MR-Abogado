/**
 * Validates an Argentine CUIL/CUIT number.
 *
 * Format: XX-XXXXXXXX-X  (2-digit type, 8-digit DNI, 1-digit check)
 *
 * The check digit is computed using the standard ANSES algorithm:
 *   - Multiply each of the first 10 digits by the weight vector
 *     [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
 *   - Sum the products.
 *   - remainder = sum % 11
 *   - If remainder === 0 -> check digit = 0
 *   - If remainder === 1 -> the CUIL is invalid (no valid check digit exists
 *     for this combination, except for gender prefix 23 where check = 9 and
 *     prefix 27 where check = 4).
 *   - Otherwise -> check digit = 11 - remainder
 */

const CUIL_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

/**
 * Strip hyphens and spaces from a CUIL string, returning only digits.
 */
function stripCuil(cuil: string): string {
  return cuil.replace(/[-\s]/g, '')
}

/**
 * Compute the expected check digit for the first 10 digits of a CUIL.
 * Returns the check digit (0-9) or -1 if no valid check digit exists.
 */
export function computeCuilCheckDigit(first10Digits: string): number {
  if (first10Digits.length !== 10 || !/^\d{10}$/.test(first10Digits)) {
    return -1
  }

  let sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(first10Digits[i], 10) * CUIL_WEIGHTS[i]
  }

  const remainder = sum % 11

  if (remainder === 0) return 0
  if (remainder === 1) {
    // Special cases for gender prefixes
    const prefix = first10Digits.substring(0, 2)
    if (prefix === '23') return 9
    if (prefix === '27') return 4
    return -1 // no valid check digit
  }
  return 11 - remainder
}

/**
 * Validates whether the given string is a valid CUIL/CUIT.
 *
 * Accepts formats:
 *   - "XXXXXXXXXXX" (11 digits)
 *   - "XX-XXXXXXXX-X"
 *   - "XX XXXXXXXX X"
 */
export function isValidCuil(cuil: string): boolean {
  const digits = stripCuil(cuil)

  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) {
    return false
  }

  // The first two digits must be a valid type prefix
  const prefix = digits.substring(0, 2)
  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34']
  if (!validPrefixes.includes(prefix)) {
    return false
  }

  const first10 = digits.substring(0, 10)
  const providedCheck = parseInt(digits[10], 10)
  const expectedCheck = computeCuilCheckDigit(first10)

  return expectedCheck !== -1 && providedCheck === expectedCheck
}

/**
 * Formats a CUIL string into the standard XX-XXXXXXXX-X format.
 * Returns the original string if it cannot be formatted.
 */
export function formatCuil(cuil: string): string {
  const digits = stripCuil(cuil)
  if (digits.length !== 11) return cuil
  return `${digits.substring(0, 2)}-${digits.substring(2, 10)}-${digits[10]}`
}

/**
 * Extracts the 8-digit DNI portion from a CUIL (digits 3-10).
 */
export function extractDniFromCuil(cuil: string): string | null {
  const digits = stripCuil(cuil)
  if (digits.length !== 11) return null
  return digits.substring(2, 10)
}
