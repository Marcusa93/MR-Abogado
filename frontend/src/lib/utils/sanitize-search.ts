/**
 * Sanitiza input del usuario para uso seguro en filtros PostgREST.
 *
 * PostgREST usa caracteres especiales en la sintaxis de filtros:
 * - `,` separa condiciones en .or() y .and()
 * - `(` `)` agrupan condiciones
 *
 * Si el usuario ingresa estos caracteres en un campo de búsqueda,
 * se rompe la estructura del filtro o se inyectan condiciones espurias.
 *
 * Esta función reemplaza caracteres peligrosos por espacios.
 *
 * @example
 * sanitizeForPostgrest('Garcia, Juan (h)')  → 'Garcia Juan h'
 * sanitizeForPostgrest('20-12345678-9')     → '20-12345678-9'  (guiones ok)
 */
export function sanitizeForPostgrest(value: string): string {
  return value
    .replace(/[,()]/g, ' ')  // Reemplazar separadores de filtro por espacio
    .replace(/\s+/g, ' ')    // Colapsar espacios múltiples
    .trim()
}
