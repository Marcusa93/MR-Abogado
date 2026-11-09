/** Nombre legible del modelo de IA guardado en el escrito. */
export function nombreModeloCorto(id: string | null | undefined): string {
  if (!id) return '—'
  const m = id.match(/(opus|sonnet|haiku)[-_ ]?(\d+(?:[.-]\d+)?)/i)
  if (!m) return id.split('/').pop() ?? id
  const fam = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  return `${fam} ${m[2]!.replace('-', '.')}`
}
