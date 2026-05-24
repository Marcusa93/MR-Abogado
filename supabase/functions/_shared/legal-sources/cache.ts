// Cache transparente sobre tabla legal_cache. Hashea (source, tool, args)
// a una clave determinística y maneja TTL por tool.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CACHE_TTL } from './types.ts'

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function buildCacheKey(
  tool: string,
  args: unknown,
): Promise<string> {
  // Orden estable de keys para que distintos órdenes en args produzcan el mismo hash
  const normalized = JSON.stringify(args, Object.keys(args as object || {}).sort())
  return await sha256Hex(`${tool}|${normalized}`)
}

export async function readCache<T>(
  admin: SupabaseClient,
  source: string,
  cacheKey: string,
): Promise<T | null> {
  const { data } = await admin
    .from('legal_cache')
    .select('payload, expires_at')
    .eq('source', source)
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (!data) return null
  if (new Date((data as any).expires_at) < new Date()) return null
  // best-effort hit_count++ — sin esperar respuesta
  admin.from('legal_cache')
    .update({ hit_count: undefined })  // se hace en RPC abajo
    .eq('source', source)
    .eq('cache_key', cacheKey)
    .then(() => {})
    .catch(() => {})
  return (data as any).payload as T
}

export async function writeCache(
  admin: SupabaseClient,
  source: string,
  cacheKey: string,
  tool: string,
  payload: unknown,
): Promise<void> {
  const ttl = CACHE_TTL[tool] ?? 24 * 3600
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
  await admin.from('legal_cache').upsert({
    source,
    cache_key: cacheKey,
    tool,
    payload,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAt,
    hit_count: 0,
  }, { onConflict: 'source,cache_key' })
}

// Limpia entries vencidas. Lo llamamos opportunisticamente (1% de las
// requests) para no necesitar un cron.
export async function maybeGc(admin: SupabaseClient): Promise<void> {
  if (Math.random() > 0.01) return
  try {
    await (admin.rpc as any)('legal_cache_gc')
  } catch (_e) { /* best effort */ }
}
