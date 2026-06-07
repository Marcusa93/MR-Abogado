// ─── Google Drive helpers (OAuth + Drive REST) ───────────────────────────────

export interface DriveTokens {
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

/**
 * Canjea un authorization code por tokens. Usado en el callback OAuth.
 */
export async function exchangeCodeForTokens(params: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<{ tokens: DriveTokens; email: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google token exchange ${res.status}: ${txt.slice(0, 300)}`)
  }
  const payload = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
  }

  if (!payload.refresh_token) {
    throw new Error('Google no devolvió refresh_token. Asegurate de que el OAuth client tenga prompt=consent y access_type=offline.')
  }

  // Obtener email del usuario para mostrar en la UI
  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  })
  if (!userRes.ok) {
    throw new Error(`Google userinfo ${userRes.status}`)
  }
  const userInfo = await userRes.json() as { email: string }

  const expires_at = new Date(Date.now() + payload.expires_in * 1000).toISOString()

  return {
    tokens: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at,
      scope: payload.scope,
    },
    email: userInfo.email,
  }
}

/**
 * Refresca el access_token usando el refresh_token guardado.
 */
export async function refreshAccessToken(params: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<{ access_token: string; expires_at: string }> {
  const body = new URLSearchParams({
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'refresh_token',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google refresh ${res.status}: ${txt.slice(0, 300)}`)
  }
  const payload = await res.json() as { access_token: string; expires_in: number }
  return {
    access_token: payload.access_token,
    expires_at: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
  }
}

/**
 * Dada una conexión existente, devuelve un access_token vigente
 * (refrescando si está por vencer en < 5 min).
 */
export async function getValidAccessToken(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
  profileId: string
  clientId: string
  clientSecret: string
}): Promise<string> {
  const { data: row, error } = await params.serviceClient
    .from('google_drive_credentials')
    .select('access_token, refresh_token, expires_at')
    .eq('profile_id', params.profileId)
    .maybeSingle()

  if (error) throw error
  if (!row) throw new Error('Drive no conectado para este usuario.')

  const expires = new Date(row.expires_at).getTime()
  const buffer = 5 * 60 * 1000 // 5 min de margen

  if (expires > Date.now() + buffer) {
    return row.access_token
  }

  // Refrescar
  const refreshed = await refreshAccessToken({
    refreshToken: row.refresh_token,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  })

  await params.serviceClient
    .from('google_drive_credentials')
    .update({
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
    })
    .eq('profile_id', params.profileId)

  return refreshed.access_token
}

/**
 * Descarga un archivo desde Drive. Maneja tanto archivos binarios (PDFs,
 * imágenes) como Google Docs (que requieren export).
 */
export async function downloadDriveFile(params: {
  accessToken: string
  fileId: string
}): Promise<{ data: ArrayBuffer; mimeType: string; name: string }> {
  // Primero metadata para saber el mime type y nombre
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${params.fileId}?fields=name,mimeType,size`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } },
  )
  if (!metaRes.ok) {
    throw new Error(`Drive metadata ${metaRes.status}: ${(await metaRes.text()).slice(0, 200)}`)
  }
  const meta = await metaRes.json() as { name: string; mimeType: string; size?: string }

  // Si es un Google Doc nativo, exportarlo como PDF
  const isGoogleNative = meta.mimeType.startsWith('application/vnd.google-apps')
  const downloadUrl = isGoogleNative
    ? `https://www.googleapis.com/drive/v3/files/${params.fileId}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${params.fileId}?alt=media`

  const dlRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  })
  if (!dlRes.ok) {
    throw new Error(`Drive download ${dlRes.status}: ${(await dlRes.text()).slice(0, 200)}`)
  }
  const data = await dlRes.arrayBuffer()
  const finalMime = isGoogleNative ? 'application/pdf' : meta.mimeType
  const finalName = isGoogleNative ? `${meta.name}.pdf` : meta.name

  return { data, mimeType: finalMime, name: finalName }
}
