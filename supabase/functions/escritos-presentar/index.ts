// ─────────────────────────────────────────────────────────────────────────────
// Edge function: escritos-presentar
//
// Presenta un escrito firmado al portal del SAE de Tucumán.
//   https://portaldelsae.justucuman.gov.ar/ingreso-escritos
//
// Body:
//   { escrito_id, categoria, descripcion, presenta_documentacion }
//
// Flujo HTTP-only (no usa Playwright):
//   1. Auth del usuario y carga del escrito (debe estar 'firmado').
//   2. Recupera credenciales SAE del abogado.
//   3. Login al SAE (reusa _shared/sae-request-connector.ts).
//   4. Resuelve procid+jurisdictionId del expediente.
//   5. GET al form de presentación para obtener:
//      - URL de submit
//      - CSRF token
//      - Lista de categorías (mapping nombre → id interno)
//   6. Resolve la categoría que el usuario pidió contra la lista real.
//   7. POST multipart/form-data al endpoint del portal.
//   8. Parsea la respuesta, extrae nro de comprobante.
//   9. Marca el escrito como 'presentado_sae' y persiste metadata.
//
// CALIBRACIÓN PENDIENTE (marcado con TODO(cURL)):
//   - Nombres exactos de los campos del multipart.
//   - URL exacta del submit (en captura: /ingreso-escritos/create/civil/212501/231).
//   - Forma en que la respuesta indica éxito y devuelve el nro de comprobante.
//   Todo se ajusta cuando tengamos un cURL real de una presentación exitosa.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'

const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const PORTAL_BASE = 'https://portaldelsae.justucuman.gov.ar'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function portalHeaders(session: SaeSession, extra: Record<string, string> = {}): Headers {
  const h = new Headers({
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    Referer: `${PORTAL_BASE}/ingreso-escritos`,
    Origin: PORTAL_BASE,
    ...extra,
  })
  if (session.cookies.length) h.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) h.set('Authorization', session.headers.Authorization)
  return h
}

// ─── Resolver expediente: procid + jurisdictionId + fuero slug ───────────────

interface ResolvedExpediente {
  procid: string
  jurisdictionId: number
  fueroSlug: string         // ej 'civil' (lo que va en la URL del portal)
  caratula?: string
  oficina?: string
}

async function resolveExpedienteInSae(numeroSae: string, session: SaeSession): Promise<ResolvedExpediente | null> {
  const res = await fetch(`${SAE_API_URL}/user`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': BROWSER_UA,
      Referer: 'https://consultaexpedientes.justucuman.gov.ar/',
      Origin: 'https://consultaexpedientes.justucuman.gov.ar',
      Cookie: session.cookies.join('; '),
      ...(session.headers?.Authorization ? { Authorization: session.headers.Authorization } : {}),
    },
  })
  if (!res.ok) return null
  const payload = await res.json().catch(() => null) as unknown
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const proceedings = root.proceedings ?? (root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>).proceedings : null)
  if (!Array.isArray(proceedings)) return null

  for (const entry of proceedings) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const num = String(e.nro_expediente ?? e.number ?? e.numero ?? '').trim()
    if (num !== numeroSae) continue
    const procid = String(e.procid ?? e.id ?? '').trim()
    const jurisdictionId = Number(e.jurisdictionId ?? e.jurisdiction_id ?? 0)
    if (!procid || jurisdictionId <= 0) continue

    // El fuero slug vive típicamente bajo e.fuero / e.center / e.jurisdiction_name
    // TODO(cURL): confirmar de dónde sale el slug usado en la URL del portal
    // (en la captura es 'civil', en otros expedientes puede ser 'familia', 'laboral'...)
    const fueroSlug = String(
      e.fuero_slug ?? e.fueroSlug ?? e.center_slug ?? e.fuero ?? 'civil',
    ).toLowerCase().replace(/\s+/g, '-')

    return {
      procid, jurisdictionId, fueroSlug,
      caratula: typeof e.caratula === 'string' ? e.caratula : undefined,
      oficina: typeof e.oficina === 'string' ? e.oficina : undefined,
    }
  }
  return null
}

// ─── GET form de presentación: extrae CSRF + URL submit + categorías ────────

interface FormMetadata {
  submitUrl: string
  csrf: string
  // mapping de nombre legible (lower-case, sin acentos) → value del <option>
  categorias: Map<string, string>
  // si descubrimos otros hidden fields, los guardamos
  hiddenFields: Record<string, string>
}

function normalizeKey(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function parseForm(html: string, formUrl: string): FormMetadata {
  // CSRF: <input name="_token" value="..."> o <meta name="csrf-token" content="...">
  const csrf = html.match(/name="_token"\s+value="([^"]+)"/i)?.[1]
    ?? html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i)?.[1]
    ?? ''

  // submitUrl: <form action="..."> dentro del bloque relevante
  const formAction = html.match(/<form[^>]+action="([^"]+)"[^>]*>/i)?.[1]
  const submitUrl = formAction
    ? (formAction.startsWith('http') ? formAction : `${PORTAL_BASE}${formAction.startsWith('/') ? formAction : '/' + formAction}`)
    : formUrl

  // categorías: <select name="categoria"> ... <option value="X">Nombre</option>
  const categorias = new Map<string, string>()
  const selectMatch = html.match(/<select[^>]+name="categoria[^"]*"[^>]*>([\s\S]*?)<\/select>/i)
  if (selectMatch) {
    const optionRe = /<option\s+value="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/option>/gi
    let m: RegExpExecArray | null
    while ((m = optionRe.exec(selectMatch[1])) !== null) {
      const value = m[1].trim()
      const label = m[2].trim()
      if (value && label && !/seleccione/i.test(label)) {
        categorias.set(normalizeKey(label), value)
      }
    }
  }

  // hidden fields adicionales: cualquier <input type="hidden" name="X" value="Y">
  const hiddenFields: Record<string, string> = {}
  const hiddenRe = /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"[^>]*>/gi
  let h: RegExpExecArray | null
  while ((h = hiddenRe.exec(html)) !== null) {
    if (h[1] !== '_token') hiddenFields[h[1]] = h[2]
  }

  return { submitUrl, csrf, categorias, hiddenFields }
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    const body = await req.json().catch(() => null) as {
      escrito_id?: string
      categoria?: string
      descripcion?: string
      presenta_documentacion?: boolean
      dry_run?: boolean   // si true: hace login + GET form, NO submit; devuelve categorías reales
    } | null

    if (!body?.escrito_id) return json({ error: 'escrito_id requerido' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Escrito + expediente
    const { data: escritoRow, error: escErr } = await admin
      .from('escritos')
      .select('id, user_id, expediente_id, titulo, estado, pdf_firmado_path, expediente:expedientes(id, numero_sae, caratula, fuero)')
      .eq('id', body.escrito_id)
      .single()
    if (escErr || !escritoRow) return json({ error: 'Escrito no encontrado' }, 404)

    const escrito = escritoRow as unknown as {
      id: string; user_id: string; expediente_id: string; titulo: string;
      estado: string; pdf_firmado_path: string | null;
      expediente: { id: string; numero_sae: string | null; caratula: string | null; fuero: string | null } | null
    }

    if (escrito.user_id !== user.id) return json({ error: 'Sin permisos sobre este escrito' }, 403)
    if (!body.dry_run && escrito.estado !== 'firmado') {
      return json({ error: 'El escrito debe estar firmado para presentarlo. Adjuntá el PDF firmado primero.', code: 'NOT_SIGNED' }, 412)
    }
    if (!escrito.expediente?.numero_sae) {
      return json({ error: 'El expediente no tiene número SAE asociado', code: 'NO_NUMERO_SAE' }, 412)
    }

    // 2) Credenciales SAE del usuario
    const { data: credRow, error: credErr } = await admin
      .from('sae_credentials')
      .select('username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (credErr || !credRow) return json({ error: 'Credenciales SAE no configuradas', code: 'NO_SAE_CREDS' }, 412)

    const cred = credRow as { username: string; encrypted_secret: string | null; status: string }
    const password = cred.encrypted_secret ? atob(cred.encrypted_secret) : null
    if (!password) return json({ error: 'Credenciales SAE inválidas', code: 'BAD_SAE_CREDS' }, 412)

    // 3) Login al SAE
    let session: SaeSession
    try {
      session = await authenticateWithSae({ username: cred.username, password })
    } catch (e) {
      const code = e instanceof SaeError ? e.code : 'SAE_AUTH_UNKNOWN'
      return json({ error: e instanceof Error ? e.message : 'Login SAE falló', code }, 502)
    }

    // 4) Resolver expediente en el SAE → procid + jurisdictionId + fueroSlug
    const resolved = await resolveExpedienteInSae(escrito.expediente.numero_sae, session)
    if (!resolved) return json({ error: 'Expediente no encontrado entre los del usuario en el SAE', code: 'EXP_NOT_FOUND' }, 404)

    // 5) GET al form de presentación
    const formUrl = `${PORTAL_BASE}/ingreso-escritos/create/${resolved.fueroSlug}/${resolved.procid}/${resolved.jurisdictionId}`
    const formRes = await fetch(formUrl, { headers: portalHeaders(session) })
    if (!formRes.ok) {
      return json({
        error: `El portal devolvió ${formRes.status} al abrir el form de presentación`,
        code: 'FORM_FETCH_FAILED',
        form_url: formUrl,
      }, 502)
    }
    const formHtml = await formRes.text()
    const form = parseForm(formHtml, formUrl)
    const categoriasList = [...form.categorias.entries()].map(([nombre, id]) => ({ nombre, id }))

    // Dry-run: devuelve metadata para que el frontend muestre categorías reales
    if (body.dry_run) {
      return json({
        ok: true,
        dry_run: true,
        form_url: formUrl,
        submit_url: form.submitUrl,
        csrf_present: Boolean(form.csrf),
        categorias: categoriasList,
        hidden_fields: form.hiddenFields,
        expediente: {
          procid: resolved.procid,
          jurisdictionId: resolved.jurisdictionId,
          fueroSlug: resolved.fueroSlug,
          caratula: resolved.caratula,
          oficina: resolved.oficina,
        },
      })
    }

    if (!body.categoria?.trim()) return json({ error: 'categoria requerida' }, 400)
    if (!body.descripcion?.trim()) return json({ error: 'descripcion requerida' }, 400)

    // 6) Matchear la categoría pedida con el value del <option>
    const categoriaId = form.categorias.get(normalizeKey(body.categoria))
    if (!categoriaId) {
      return json({
        error: `Categoría no encontrada en el portal: "${body.categoria}". Categorías disponibles: ${categoriasList.map(c => c.nombre).join(', ')}`,
        code: 'CATEGORIA_INVALID',
        categorias: categoriasList,
      }, 400)
    }

    // 7) Bajar el PDF firmado del bucket
    if (!escrito.pdf_firmado_path) return json({ error: 'No hay PDF firmado adjunto' }, 412)
    const { data: pdfFile, error: pdfErr } = await admin
      .storage.from('escritos-firmados').download(escrito.pdf_firmado_path)
    if (pdfErr || !pdfFile) return json({ error: `No se pudo bajar el PDF firmado: ${pdfErr?.message}` }, 500)
    const pdfBuffer = new Uint8Array(await pdfFile.arrayBuffer())
    if (pdfBuffer.byteLength > 7864320) {
      return json({ error: 'El PDF excede el límite de 7.5 MB del portal del SAE', code: 'PDF_TOO_LARGE' }, 413)
    }

    // 8) POST multipart al endpoint del portal
    // TODO(cURL): confirmar nombres exactos de los campos del multipart. Acá uso
    // los más probables basados en la inspección del HTML (`categoria`,
    // `descripcion`, `presenta_documentacion`, `archivo`). Cualquiera que difiera
    // del cURL real se ajusta acá sin tocar el resto del flujo.
    const fd = new FormData()
    fd.append('_token', form.csrf)
    for (const [k, v] of Object.entries(form.hiddenFields)) fd.append(k, v)
    fd.append('categoria', categoriaId)
    fd.append('descripcion', body.descripcion.trim())
    fd.append('presenta_documentacion', body.presenta_documentacion ? '1' : '0')
    fd.append('archivo', new Blob([pdfBuffer], { type: 'application/pdf' }), `${escrito.titulo.replace(/[^\w\s.-]/g, '').slice(0, 80) || 'escrito'}.pdf`)

    const submitHeaders = portalHeaders(session, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: formUrl,
    })
    // Sacar Content-Type para que fetch lo setee con el boundary correcto del multipart
    submitHeaders.delete('Content-Type')

    const submitRes = await fetch(form.submitUrl, {
      method: 'POST',
      headers: submitHeaders,
      body: fd,
    })

    const submitText = await submitRes.text()

    // TODO(cURL): el portal puede responder 200 con HTML que diga "presentado" o redirigir
    // a una página de comprobante. Una vez veamos el comportamiento real, parseamos:
    //   - nro_comprobante
    //   - fecha
    //   - cualquier mensaje de error específico (ej "expediente no permite presentación")
    const errorMatch = submitText.match(/alert[-_](?:danger|error)[^>]*>\s*([^<]{5,300})</i)
                    ?? submitText.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>\s*([^<]{5,300})</i)
    if (!submitRes.ok || errorMatch) {
      return json({
        error: errorMatch?.[1]?.trim() || `Portal devolvió ${submitRes.status}`,
        code: 'SUBMIT_FAILED',
        status: submitRes.status,
        debug_excerpt: submitText.slice(0, 600),
      }, 502)
    }

    // Heurísticas para extraer el comprobante. Si nada matchea, dejamos null y
    // el usuario igual sabe que se presentó (porque marcamos el estado).
    const comprobante = submitText.match(/comprobante[^a-z0-9]{0,5}([0-9]{2,}[\/\-][0-9]{2,4})/i)?.[1]
                      ?? submitText.match(/N[°º]?\s*([0-9]{4,}\/[0-9]{2,4})/i)?.[1]
                      ?? null

    // 9) Persistir
    const presentacionMeta = {
      nro_comprobante: comprobante,
      categoria: body.categoria,
      categoria_id_portal: categoriaId,
      descripcion: body.descripcion,
      presenta_documentacion: Boolean(body.presenta_documentacion),
      oficina: resolved.oficina ?? null,
      fuero: resolved.fueroSlug,
      procid: resolved.procid,
      jurisdiction_id: resolved.jurisdictionId,
      submit_url: form.submitUrl,
      response_status: submitRes.status,
    }

    await admin.from('escritos').update({
      estado: 'presentado_sae',
      presentado_sae_at: new Date().toISOString(),
      presentacion_sae: presentacionMeta,
      updated_at: new Date().toISOString(),
    } as never).eq('id', escrito.id)

    return json({
      ok: true,
      escrito_id: escrito.id,
      nro_comprobante: comprobante,
      presentacion: presentacionMeta,
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg, code: 'INTERNAL' }, 500)
  }
})
