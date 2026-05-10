// ---------------------------------------------------------------------------
// BogaBot chat client — calls Supabase Edge Function proxy (no API key on client)
// The Edge Function holds the OPENROUTER_API_KEY server-side.
// ---------------------------------------------------------------------------

import { createClient } from '@/lib/supabase/client'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Returns true if the Edge Function URL is configured (BogaBot can work).
 */
export function isNicoIAEnabled(): boolean {
  try {
    const supabase = createClient()
    // If supabase client exists, the edge function endpoint is available
    return !!supabase
  } catch {
    return false
  }
}

/**
 * Calls the bogabot-chat Edge Function (non-streaming).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    model?: string
    temperature?: number
    max_tokens?: number
    signal?: AbortSignal
  }
): Promise<string> {
  const supabase = createClient()

  const { data, error } = await supabase.functions.invoke('bogabot-chat', {
    body: {
      messages,
      model: options?.model,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.max_tokens ?? 2048,
      stream: false,
    },
  })

  if (error) throw new Error(`BogaBot no disponible: ${error.message}`)
  return data?.choices?.[0]?.message?.content ?? ''
}

/**
 * Calls the bogabot-chat Edge Function with SSE streaming.
 * Calls `onChunk` with accumulated text on each chunk.
 */
export async function chatCompletionStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: {
    model?: string
    temperature?: number
    max_tokens?: number
    signal?: AbortSignal
  }
): Promise<string> {
  const supabase = createClient()

  // We need to call the function URL directly for streaming
  // supabase.functions.invoke doesn't support streaming responses
  const projectUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!projectUrl || !anonKey) {
    throw new Error('Supabase no está configurado.')
  }

  const functionUrl = `${projectUrl}/functions/v1/bogabot-chat`

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Tu sesión expiró. Volvé a iniciar sesión para usar BogaBot.')
  }

  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      messages,
      model: options?.model,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.max_tokens ?? 2048,
      stream: true,
    }),
    signal: options?.signal,
  })

  if (!res.ok) {
    throw new Error('BogaBot no disponible en este momento.')
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No se pudo iniciar el stream')

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''

  // Timeout: if no chunk arrives within 30s, abort the stream
  const CHUNK_TIMEOUT_MS = 30_000
  let chunkTimer: ReturnType<typeof setTimeout> | null = null

  const resetChunkTimer = () => {
    if (chunkTimer) clearTimeout(chunkTimer)
    chunkTimer = setTimeout(() => {
      reader.cancel()
    }, CHUNK_TIMEOUT_MS)
  }

  resetChunkTimer()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      resetChunkTimer()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6)
        if (payload === '[DONE]') continue

        try {
          const parsed = JSON.parse(payload)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            accumulated += delta
            onChunk(accumulated)
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    if (chunkTimer) clearTimeout(chunkTimer)
  }

  if (!accumulated) {
    throw new Error('No se recibió respuesta del asistente. Intentá de nuevo.')
  }

  return accumulated
}
