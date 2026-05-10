import { createClient as supabaseCreateClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

let client: ReturnType<typeof supabaseCreateClient<Database>> | null = null

export function createClient() {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Faltan variables de entorno de Supabase. ' +
        'Asegurate de que VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY ' +
        'esten definidas en .env.local'
    )
  }

  client = supabaseCreateClient<Database>(url, key)
  return client
}
