// CORS con allowlist por origin.
//
// Si la request viene de un origen permitido, se devuelve ese origin en el
// header (Access-Control-Allow-Origin). Si no, se devuelve el primero de la
// allowlist (efectivamente bloquea al browser que llamó). NUNCA devolvemos '*'
// salvo que ALLOWED_ORIGINS='*' sea explícito (escape hatch para dev).
//
// Configurar en Supabase secrets:
//   supabase secrets set ALLOWED_ORIGINS=https://app.marcorossi.com.ar,https://marcorossi.vercel.app,http://localhost:3001,http://localhost:3002
//
// Si la env var no está seteada, se usan los DEFAULTS de abajo.

const DEFAULT_ALLOWED_ORIGINS = [
  'https://app.marcorossi.com.ar',
  'https://marcorossi.vercel.app',
  'http://localhost:3001',
  'http://localhost:3002',
]

function getAllowlist(): string[] {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  if (!env) return DEFAULT_ALLOWED_ORIGINS
  return env.split(',').map((s) => s.trim()).filter(Boolean)
}

function pickOrigin(req?: Request): string {
  const allowlist = getAllowlist()
  if (allowlist.includes('*')) return '*'
  const origin = req?.headers.get('origin') ?? req?.headers.get('Origin')
  if (origin && allowlist.includes(origin)) return origin
  return allowlist[0] ?? 'https://app.marcorossi.com.ar'
}

export function corsHeaders(req?: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': pickOrigin(req),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
