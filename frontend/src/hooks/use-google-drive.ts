import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
// drive.readonly: para poder leer del lado servidor los archivos que el usuario
// elige en el Picker (con drive.file el server no accede a archivos que no creó la app).
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email'

export interface GoogleDriveStatus {
  connected: boolean
  email: string | null
  connected_at: string | null
  scope: string | null
}

export function useGoogleDriveStatus() {
  const supabase = createClient()
  return useQuery<GoogleDriveStatus>({
    queryKey: ['google-drive-status'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('google_drive_status')
      if (error) throw error
      return (data ?? { connected: false, email: null, connected_at: null, scope: null }) as GoogleDriveStatus
    },
  })
}

/**
 * Redirige al usuario al consent screen de Google. Cuando aprueba, Google
 * lo manda al callback edge function que persiste los tokens.
 */
export async function startGoogleDriveOAuth(): Promise<void> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No hay sesión activa')
  }

  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined
  const projectRef = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!clientId) throw new Error('VITE_GOOGLE_OAUTH_CLIENT_ID no configurado en el frontend')
  if (!projectRef) throw new Error('VITE_SUPABASE_URL no configurado en el frontend')

  const redirectUri = `${projectRef}/functions/v1/google-oauth-callback`
  const url = new URL(GOOGLE_OAUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', session.access_token)

  window.location.href = url.toString()
}

export function useGoogleDriveDisconnect() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('google_drive_disconnect')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['google-drive-status'] })
    },
  })
}

/**
 * Importa un archivo desde Drive al expediente actual.
 */
export function useDriveImportAdjunto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      file_id: string
      expediente_id: string
      file_name?: string
      categoria?: string
      descripcion?: string
    }) => {
      const { data, error } = await supabase.functions.invoke('drive-import-adjunto', {
        body: input,
      })
      if (error) throw new Error(error.message || 'Error al importar')
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; adjunto_id: string; storage_path: string; file_name: string }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['adjuntos', variables.expediente_id] })
    },
  })
}
