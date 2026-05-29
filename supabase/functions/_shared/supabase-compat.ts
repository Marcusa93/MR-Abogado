type SupabaseErrorLike = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export function supabaseErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '')
  const e = error as SupabaseErrorLike
  return [e.code, e.message, e.details, e.hint]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
}

export function isMissingSchemaObject(error: unknown, objectName: string): boolean {
  const text = supabaseErrorText(error).toLowerCase()
  const target = objectName.toLowerCase()
  return (
    text.includes(target) &&
    (
      text.includes('schema cache') ||
      text.includes('could not find') ||
      text.includes('does not exist') ||
      text.includes('relation') ||
      text.includes('function') ||
      text.includes('pgrst202') ||
      text.includes('pgrst205') ||
      text.includes('42p01') ||
      text.includes('42883')
    )
  )
}
