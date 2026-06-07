// LLM guard: validación de tamaño de input + rate limit por usuario.
//
// Uso:
//
//   import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
//
//   Deno.serve(async (req) => {
//     ...
//     const guard = await checkLlmGuard(adminClient, user.id, 'nico-chat', bodyBytes)
//     if (!guard.ok) return json(req, { error: guard.error }, guard.status)
//
//     // ... hacer la call al LLM ...
//
//     // fire-and-forget — no bloquea la respuesta
//     logLlmCall(adminClient, user.id, 'nico-chat', bodyBytes)
//     return json(req, result)
//   })
//
// Tunear por env (todas opcionales):
//   LLM_MAX_INPUT_BYTES         (default 200_000 = 200 KB)
//   LLM_RATE_LIMIT_PER_MIN      (default 30 calls/min/user/function)
//   LLM_RATE_LIMIT_WINDOW_SECS  (default 60)

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_MAX_INPUT_BYTES = 200_000
const DEFAULT_RATE_LIMIT = 30
const DEFAULT_WINDOW_SECS = 60

function envInt(name: string, fallback: number): number {
  const v = Deno.env.get(name)
  if (!v) return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export interface LlmGuardResult {
  ok: boolean
  status: number
  error?: string
  recentCount?: number
}

/**
 * Valida tamaño de input y rate limit antes de llamar al LLM.
 * No registra la llamada — eso es responsabilidad del caller via logLlmCall().
 *
 * @param adminClient supabase client con service_role (para bypass de RLS en lectura del log)
 * @param userId      auth user id ya validado
 * @param functionName identifier estable de la function (ej. 'nico-chat')
 * @param inputBytes  bytes del payload de entrada del usuario
 */
export async function checkLlmGuard(
  adminClient: SupabaseClient,
  userId: string,
  functionName: string,
  inputBytes: number,
): Promise<LlmGuardResult> {
  const maxBytes = envInt('LLM_MAX_INPUT_BYTES', DEFAULT_MAX_INPUT_BYTES)
  if (inputBytes > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Input demasiado grande (${inputBytes} bytes). Máximo: ${maxBytes} bytes.`,
    }
  }

  const limit = envInt('LLM_RATE_LIMIT_PER_MIN', DEFAULT_RATE_LIMIT)
  const window = envInt('LLM_RATE_LIMIT_WINDOW_SECS', DEFAULT_WINDOW_SECS)

  const { data, error } = await (adminClient.rpc as any)('llm_recent_count', {
    p_user_id: userId,
    p_function_name: functionName,
    p_window_seconds: window,
  })

  if (error) {
    // Si la RPC falla (ej. migration sin aplicar), fail-open con warning.
    // No queremos romper el sistema entero por un guard rate-limit.
    console.warn('[llm-guard] llm_recent_count falló, fail-open:', error.message)
    return { ok: true, status: 200 }
  }

  const recentCount = typeof data === 'number' ? data : 0
  if (recentCount >= limit) {
    return {
      ok: false,
      status: 429,
      error: `Demasiadas solicitudes. Máximo ${limit} por ${window}s. Esperá un momento.`,
      recentCount,
    }
  }

  return { ok: true, status: 200, recentCount }
}

/**
 * Registra la llamada para el rate-limit futuro. Fire-and-forget — no se
 * espera. Si falla, no propaga error (loggea warn). El caller no debería
 * await este resultado.
 */
export function logLlmCall(
  adminClient: SupabaseClient,
  userId: string,
  functionName: string,
  inputBytes: number,
): void {
  ;(adminClient.from('llm_call_log').insert as any)({
    user_id: userId,
    function_name: functionName,
    input_bytes: inputBytes,
  })
    .then((res: { error?: { message: string } | null }) => {
      if (res?.error) console.warn('[llm-guard] log insert failed:', res.error.message)
    })
    .catch((err: unknown) => {
      console.warn('[llm-guard] log insert threw:', err)
    })
}

/** Estima bytes de un body JSON parseable o string. */
export function estimateBytes(input: unknown): number {
  if (typeof input === 'string') return new TextEncoder().encode(input).length
  try {
    return new TextEncoder().encode(JSON.stringify(input ?? '')).length
  } catch {
    return 0
  }
}
