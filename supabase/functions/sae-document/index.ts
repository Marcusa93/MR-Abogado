import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { readSaePassword } from '../_shared/sae-credentials.ts'
import { isMissingSchemaObject } from '../_shared/supabase-compat.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'

const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const SAE_CONSULTA_URL = 'https://consultaexpedientes.justucuman.gov.ar/'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function apiHeaders(session: SaeSession, accept = 'application/json, text/plain, */*'): Headers {
  const h = new Headers({
    Accept: accept,
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    Origin: 'https://consultaexpedientes.justucuman.gov.ar',
    Referer: 'https://consultaexpedientes.justucuman.gov.ar/',
  })
  if (session.cookies.length) h.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) h.set('Authorization', session.headers.Authorization)
  return h
}

function encodeSaeFileName(fileName: string): string {
  const bytes = new Uint8Array(fileName.length)
  for (let i = 0; i < fileName.length; i++) bytes[i] = fileName.charCodeAt(i) & 0xff
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function resolveDownloadUrl(payload: unknown): string | undefined {
  let candidate: string | undefined
  if (typeof payload === 'string') candidate = payload
  else if (isRecord(payload)) {
    candidate = pickString(payload.url) ?? pickString(payload.link) ?? pickString(payload.href)
    if (!candidate && isRecord(payload.data)) {
      candidate = pickString(payload.data.url) ?? pickString(payload.data.link) ?? pickString(payload.data.href)
    } else if (!candidate) {
      candidate = pickString(payload.data)
    }
  }
  if (!candidate) return undefined
  try { return new URL(candidate, SAE_CONSULTA_URL).toString() } catch { return undefined }
}

function jsonError(message: string, status = 500, code?: string) {
  return new Response(JSON.stringify({ error: message, error_code: code }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function safeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'documento-sae'
}

function fileResponse(binary: ArrayBuffer, mimeType: string, fileName: string) {
  return new Response(binary, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return jsonError('No autorizado', 401)

    const body = await req.json().catch(() => null) as
      | { movementId?: string; movement_id?: string; procid?: string; jurisdictionId?: number; histid?: string; fileName?: string }
      | null
    const movementId = body?.movementId ?? body?.movement_id
    if (!body?.fileName || (!movementId && (!body?.procid || !body.jurisdictionId || !body.histid))) {
      return jsonError('Faltan parámetros: movementId o procid/jurisdictionId/histid, y fileName', 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let expedienteId: string | null = null
    let procid = body.procid ?? null
    let jurisdictionId = body.jurisdictionId ?? null
    let histid = body.histid ?? null

    if (movementId) {
      const { data: movement, error: movementError } = await serviceClient
        .from('sae_movements')
        .select('id, expediente_id, external_id, sae_case_id, raw_payload')
        .eq('id', movementId)
        .single()

      if (movementError || !movement) return jsonError('Actuación SAE no encontrada', 404)

      expedienteId = movement.expediente_id
      const { data: canView, error: canViewError } = await (anonClient.rpc as any)('can_view_expediente', {
        p_expediente_id: expedienteId,
      })
      if (canViewError) throw canViewError
      if (!canView) return jsonError('Sin permisos sobre esta actuación', 403)

      const { data: cached, error: cacheLookupError } = await serviceClient
        .from('sae_document_cache')
        .select('storage_path, mime_type')
        .eq('movement_id', movementId)
        .eq('file_name', body.fileName)
        .maybeSingle()
      if (cacheLookupError && !isMissingSchemaObject(cacheLookupError, 'sae_document_cache')) {
        console.error('[sae-document] cache lookup error', cacheLookupError)
      }

      if (cached?.storage_path) {
        const { data: cachedFile, error: cacheError } = await serviceClient.storage
          .from('sae-documents')
          .download(cached.storage_path)
        if (!cacheError && cachedFile) {
          return fileResponse(
            await cachedFile.arrayBuffer(),
            cached.mime_type ?? cachedFile.type ?? 'application/pdf',
            body.fileName,
          )
        }
      }

      const { data: ownLink, error: ownLinkError } = await serviceClient
        .from('expediente_sae_links')
        .select('procid, jurisdiction_id')
        .eq('profile_id', user.id)
        .eq('provider', 'justucuman')
        .eq('expediente_id', expedienteId)
        .maybeSingle()
      const legacyLinksUnavailable = ownLinkError && isMissingSchemaObject(ownLinkError, 'expediente_sae_links')

      if (ownLinkError && !legacyLinksUnavailable) {
        console.error('[sae-document] own link lookup error', ownLinkError)
      }

      if (!ownLink && !legacyLinksUnavailable) {
        return jsonError('El documento todavía no está cacheado. Debe descargarlo o sincronizarlo un abogado que tenga este expediente en su SAE.', 403)
      }

      const rawPayload = movement.raw_payload as Record<string, unknown> | null
      procid = ownLink?.procid ?? procid ?? movement.sae_case_id
      histid = histid ?? movement.external_id
      const rawJurisdictionId = rawPayload?.jurisdiction_id
      jurisdictionId = ownLink?.jurisdiction_id ?? jurisdictionId ?? (
        typeof rawJurisdictionId === 'number' ? rawJurisdictionId
          : typeof rawJurisdictionId === 'string' ? Number(rawJurisdictionId) || null
          : null
      )
    }

    if (!procid || !jurisdictionId || !histid) {
      return jsonError('Falta información de la actuación para descargar el archivo.', 400)
    }

    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return jsonError('No tenés credenciales SAE.', 400)
    if (cred.status === 'desactivado') return jsonError('Las credenciales SAE están desactivadas.', 400)

    const password = await readSaePassword(cred.encrypted_secret, {
      serviceClient,
      userId: user.id,
    })
    if (!password) return jsonError('No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.', 500)

    const session = await authenticateWithSae({ username: cred.username, password })

    // Step 1: ask SAE for the file (returns either JSON {url} or the binary directly)
    const fileRes = await fetch(`${SAE_API_URL}/user/proceedings/history/file`, {
      method: 'POST',
      headers: (() => {
        const h = apiHeaders(session)
        h.set('Content-Type', 'application/json')
        return h
      })(),
      body: JSON.stringify({
        jurisdiction: String(jurisdictionId),
        proceeding: String(procid),
        history: String(histid),
        file: encodeSaeFileName(body.fileName),
      }),
    })

    if (!fileRes.ok) {
      return jsonError(`SAE rechazó la descarga (${fileRes.status})`, fileRes.status >= 400 && fileRes.status < 500 ? 400 : 502, 'SAE_DOCUMENT_REJECTED')
    }

    const contentType = fileRes.headers.get('content-type') ?? ''
    let binary: ArrayBuffer
    let mimeType = contentType.split(';')[0].trim() || 'application/octet-stream'

    if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
      binary = await fileRes.arrayBuffer()
    } else {
      // SAE returned JSON pointing to the actual file URL
      const payload = await fileRes.json().catch(() => null)
      const downloadUrl = resolveDownloadUrl(payload)
      if (!downloadUrl) {
        return jsonError('SAE no devolvió una URL de descarga válida.', 502, 'SAE_DOCUMENT_NO_URL')
      }
      const binRes = await fetch(downloadUrl, {
        method: 'GET',
        headers: apiHeaders(session, 'application/pdf, application/octet-stream, */*'),
      })
      if (!binRes.ok) {
        return jsonError(`No se pudo descargar el PDF desde SAE (${binRes.status})`, 502, 'SAE_DOCUMENT_BINARY_FAILED')
      }
      binary = await binRes.arrayBuffer()
      mimeType = (binRes.headers.get('content-type') ?? 'application/pdf').split(';')[0].trim()
    }

    if (movementId && expedienteId) {
      const hash = await sha256Hex(`${movementId}|${body.fileName}`)
      const storagePath = `${expedienteId}/${movementId}/${hash}-${safeFileName(body.fileName)}`

      const { error: uploadError } = await serviceClient.storage
        .from('sae-documents')
        .upload(storagePath, binary, { contentType: mimeType, upsert: true })

      if (!uploadError) {
        const { error: cacheUpsertError } = await serviceClient
          .from('sae_document_cache')
          .upsert({
            expediente_id: expedienteId,
            movement_id: movementId,
            fetched_by: user.id,
            file_name: body.fileName,
            storage_path: storagePath,
            mime_type: mimeType,
            size_bytes: binary.byteLength,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never, { onConflict: 'movement_id,file_name' } as never)
        if (cacheUpsertError && !isMissingSchemaObject(cacheUpsertError, 'sae_document_cache')) {
          console.error('[sae-document] cache upsert error', cacheUpsertError)
        }
      } else {
        console.error('[sae-document] cache upload error', uploadError)
      }
    }

    return fileResponse(binary, mimeType, body.fileName)

  } catch (err) {
    console.error('[sae-document]', err)
    const msg = err instanceof SaeError ? err.message : err instanceof Error ? err.message : 'Error interno'
    const code = err instanceof SaeError ? err.code : 'UNKNOWN'
    return jsonError(msg, 500, code)
  }
})
