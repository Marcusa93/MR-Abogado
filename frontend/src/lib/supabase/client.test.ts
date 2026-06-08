import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mockeamos el SDK antes de importar el módulo bajo test.
const supabaseCreateClient = vi.fn(() => ({ __fake: true }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseCreateClient,
}))

describe('lib/supabase/client', () => {
  beforeEach(() => {
    vi.resetModules()
    supabaseCreateClient.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('tira un error claro si faltan las env vars', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const mod = await import('./client')
    expect(() => mod.createClient()).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/s)
    expect(supabaseCreateClient).not.toHaveBeenCalled()
  })

  it('crea un cliente cuando las env vars están presentes', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-xyz')
    const mod = await import('./client')
    const client = mod.createClient()
    expect(client).toBeDefined()
    expect(supabaseCreateClient).toHaveBeenCalledOnce()
    expect(supabaseCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key-xyz',
    )
  })

  it('reutiliza el cliente (singleton) en llamadas subsiguientes', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-xyz')
    const mod = await import('./client')
    const a = mod.createClient()
    const b = mod.createClient()
    expect(a).toBe(b)
    expect(supabaseCreateClient).toHaveBeenCalledOnce()
  })
})
