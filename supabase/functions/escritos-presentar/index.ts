// ─────────────────────────────────────────────────────────────────────────────
// Edge function: escritos-presentar
//
// Presenta un escrito ya firmado (PDF firmado por fuera, en firmar.gob.ar) en el
// módulo "Ingreso de Escritos" del portal del SAE de Tucumán.
//   https://portaldelsae.justucuman.gov.ar/ingreso-escritos
//
// Body:
//   { escrito_id, tipo_id | categoria, descripcion, presenta_documentacion, dry_run? }
//
// Flujo (relevado del portal real, nov-2026; ver js/escritos.js del portal):
//   1. Auth del usuario y carga del escrito (debe estar 'firmado', salvo dry_run).
//   2. Login SSO en login.justucuman.gov.ar con las credenciales SAE del abogado.
//   3. GET /inicializando?module=ingreso-escritos → abre sesión en el portal.
//   4. GET /ingreso-escritos/create → CSRF (meta csrf-token).
//   5. POST /ingreso-escritos/create/buscar-expediente  {_token, f: fueroid, e: nro}
//      → { res: 'OK', view: <tablas de radicaciones> }. Cada fila con enlace
//      /ingreso-escritos/create/{slug}/{procid}/{juzgid}; la última radicación
//      lleva la clase "waiting" (las anteriores, "confirm").
//   6. GET del formulario → <form id="form-escrito" action="/ingreso-escritos/{base64}">
//      con campos: _token, tipoid (select), descripcion, documentacion (0|1), archivos[].
//   7. POST multipart. Éxito: 302 a /ingreso-escritos y el flash
//      "El Escrito fue PRESENTADO correctamente para el Expediente …".
//      Error de validación: 302 de vuelta al formulario con los errores.
//   8. Marca el escrito como 'presentado_sae' y guarda la metadata.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { readSaePassword } from '../_shared/sae-credentials.ts'
import { authenticateWithSae, SaeError, SAE_API_URL, SAE_PORTAL_BASE as PORTAL_BASE, type SaeSession } from '../_shared/sae-request-connector.ts'

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const MAX_PDF_BYTES = 7680 * 1024 // MAX_FILE_SIZE = 7680 (KB) en el portal

// fueroid del portal según el fuero cargado en la app (respaldo si el expediente
// no trae jurisdiction_id del SAE). Valores del <select name="fueroid">.
const FUEROID_POR_FUERO: Record<string, number> = {
  civil: 2, comercial: 2,
  documentos_locaciones: 11,
  laboral: 14,
  familia: 4,
  mediacion: 20,
  administrativo: 1,
  penal: 28,
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

class PortalError extends Error {
  constructor(readonly code: string, message: string, readonly status = 502, readonly extra: Record<string, unknown> = {}) {
    super(message)
  }
}

// ─── Cliente HTTP del portal con cookies ─────────────────────────────────────

class Portal {
  private jar = new Map<string, string>()

  constructor(session: SaeSession) {
    for (const c of session.cookies) {
      const eq = c.indexOf('=')
      if (eq > 0) this.jar.set(c.slice(0, eq), c)
    }
  }

  private absorb(h: Headers) {
    const raw = h as Headers & { getSetCookie?: () => string[] }
    const lines = typeof raw.getSetCookie === 'function'
      ? raw.getSetCookie()
      : (h.get('set-cookie') ?? '').split(/,(?=[^;,\s]+=)/g)
    for (const line of lines) {
      const pair = line.split(';')[0]?.trim()
      const eq = pair?.indexOf('=') ?? -1
      if (pair && eq > 0) this.jar.set(pair.slice(0, eq), pair)
    }
  }

  async fetch(url: string, init: RequestInit & { referer?: string } = {}): Promise<Response> {
    const headers = new Headers(init.headers as HeadersInit)
    if (!headers.has('Accept')) headers.set('Accept', HTML_ACCEPT)
    headers.set('Accept-Language', 'es-AR,es;q=0.9')
    headers.set('User-Agent', BROWSER_UA)
    headers.set('Referer', init.referer ?? `${PORTAL_BASE}/ingreso-escritos`)
    if (init.method === 'POST') headers.set('Origin', PORTAL_BASE)
    if (this.jar.size) headers.set('Cookie', [...this.jar.values()].join('; '))
    const res = await fetch(abs(url), { ...init, headers, redirect: 'manual' })
    this.absorb(res.headers)
    return res
  }

  /** GET siguiendo redirecciones (hasta 5). Devuelve la respuesta final y su URL. */
  async get(url: string): Promise<{ res: Response; url: string }> {
    let cur = abs(url)
    for (let i = 0; i < 6; i++) {
      const res = await this.fetch(cur)
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel()
        cur = new URL(loc, cur).toString()
        continue
      }
      return { res, url: cur }
    }
    throw new PortalError('PORTAL_REDIRECT_LOOP', 'El portal del SAE entró en un bucle de redirecciones.')
  }
}

function abs(u: string) {
  return u.startsWith('http') ? u : `${PORTAL_BASE}${u.startsWith('/') ? '' : '/'}${u}`
}

function esLogin(url: string, html: string) {
  return /login\.justucuman\.gov\.ar|\/login(\?|$)/.test(url) || /http-equiv="refresh"[^>]+login\.justucuman/i.test(html)
}

function decodeHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&deg;/g, '°').replace(/&ordm;/g, 'º')
    .replace(/&([a-z])acute;/gi, (_, c: string) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' } as Record<string, string>)[c] ?? c)
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/\s+/g, ' ').trim()
}

function hoyAR(): Date {
  const d = new Date(Date.now() - 3 * 3_600_000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function fechaAR(_d: Date) {
  return hoyAR().toISOString().slice(0, 10).split('-').reverse().join('/')
}

/** Hoy + n días hábiles (sin sábados ni domingos), YYYY-MM-DD. */
function sumarHabiles(n: number) {
  const d = hoyAR()
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n--
  }
  return d.toISOString().slice(0, 10)
}

function normalizeKey(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function csrfDe(html: string) {
  return html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i)?.[1]
    ?? html.match(/name="_token"\s+(?:type="hidden"\s+)?value="([^"]+)"/i)?.[1]
    ?? html.match(/value="([^"]+)"\s+name="_token"/i)?.[1]
    ?? ''
}

function alertas(html: string, clase: RegExp): string[] {
  const out: string[] = []
  const re = /<div[^>]+class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0].slice(0, m[0].indexOf('>'))
    if (clase.test(tag)) {
      const t = decodeHtml(m[1])
      if (t) out.push(t)
    }
  }
  const fb = /<(?:span|div)[^>]+class="[^"]*invalid-feedback[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/gi
  while (clase.source.includes('danger') && (m = fb.exec(html)) !== null) {
    const t = decodeHtml(m[1])
    if (t) out.push(t)
  }
  return out
}

// ─── Pasos del portal ────────────────────────────────────────────────────────

async function abrirModulo(portal: Portal) {
  await portal.get('/inicializando?module=ingreso-escritos').catch(() => null)
  const { res, url } = await portal.get('/ingreso-escritos')
  const html = await res.text()
  if (esLogin(url, html) || res.status >= 400) {
    throw new PortalError('PORTAL_AUTH', 'El portal del SAE no aceptó la sesión. Probá entrar una vez a mano en portaldelsae.justucuman.gov.ar y reintentá.', 502)
  }
}

interface Radicacion {
  slug: string
  procid: string
  juzgid: string
  url: string
  ultima: boolean
  oficina: string
  fecha: string
}

async function buscarRadicaciones(portal: Portal, fueroid: number, numero: string): Promise<Radicacion[]> {
  const { res: cRes, url: cUrl } = await portal.get('/ingreso-escritos/create')
  const cHtml = await cRes.text()
  if (esLogin(cUrl, cHtml)) throw new PortalError('PORTAL_AUTH', 'Se perdió la sesión con el portal del SAE.')
  const token = csrfDe(cHtml)
  if (!token) throw new PortalError('PORTAL_CSRF', 'No se pudo leer el token del formulario del portal.')

  const res = await portal.fetch('/ingreso-escritos/create/buscar-expediente', {
    method: 'POST',
    referer: `${PORTAL_BASE}/ingreso-escritos/create`,
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': token,
    },
    body: new URLSearchParams({ _token: token, f: String(fueroid), e: numero }).toString(),
  })
  const data = await res.json().catch(() => null) as { res?: string; msg?: string; view?: string } | null
  if (!data) throw new PortalError('PORTAL_BUSQUEDA', `La búsqueda del expediente en el portal falló (${res.status}).`)
  if (data.res !== 'OK') {
    throw new PortalError('EXP_NOT_FOUND', decodeHtml(data.msg ?? '') || `El portal no encontró el expediente ${numero}.`, 404)
  }

  const out: Radicacion[] = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(data.view ?? '')) !== null) {
    const a = m[1].match(/<a[^>]+href="([^"]*\/ingreso-escritos\/create\/([^/"]+)\/(\d+)\/(\d+))"[^>]*>/i)
    if (!a) continue
    const cls = a[0].match(/class="([^"]*)"/i)?.[1] ?? ''
    const celdas = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => decodeHtml(c[1]))
    out.push({
      url: a[1], slug: a[2], procid: a[3], juzgid: a[4],
      ultima: /\bwaiting\b/.test(cls) && !/\bconfirm\b/.test(cls),
      fecha: [celdas[0], celdas[1]].filter(Boolean).join(' '),
      oficina: celdas[2] ?? '',
    })
  }
  return out
}

interface FormEscrito {
  action: string
  token: string
  tipos: { id: string; nombre: string }[]
  caratula: string | null
}

async function leerFormulario(portal: Portal, formUrl: string): Promise<FormEscrito> {
  const { res, url } = await portal.get(formUrl)
  const html = await res.text()
  if (esLogin(url, html)) throw new PortalError('PORTAL_AUTH', 'Se perdió la sesión con el portal del SAE.')
  const formTag = html.match(/<form\b[^>]*\bid="form-escrito"[^>]*>/i)?.[0]
  const action = formTag?.match(/\baction="([^"]+)"/i)?.[1]
  if (!action) {
    const aviso = alertas(html, /danger|warning/)[0]
    throw new PortalError('FORM_NOT_FOUND', aviso || 'El portal no mostró el formulario de presentación para este expediente.', 502, { form_url: formUrl })
  }
  const formHtml = html.slice(html.indexOf(formTag!))
  const token = formHtml.match(/name="_token"[^>]*value="([^"]+)"/i)?.[1]
    ?? formHtml.match(/value="([^"]+)"[^>]*name="_token"/i)?.[1]
    ?? csrfDe(html)

  const tipos: { id: string; nombre: string }[] = []
  const sel = formHtml.match(/<select[^>]+name="tipoid"[^>]*>([\s\S]*?)<\/select>/i)
  if (sel) {
    for (const o of sel[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
      const id = o[1].trim(), nombre = decodeHtml(o[2])
      if (id && nombre) tipos.push({ id, nombre })
    }
  }
  const caratula = (() => {
    const h = html.match(/<h[2-6][^>]*>\s*(?:<[^>]+>\s*)*\d+\/\d+[^<]*<\/[^>]+>[\s\S]{0,400}?<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/i)?.[1]
    return h ? decodeHtml(h) : null
  })()
  return { action: abs(action), token, tipos, caratula }
}

// ─── Respaldo: datos del expediente por la API del SAE ───────────────────────

async function proceedingDesdeApi(numeroSae: string, session: SaeSession): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SAE_API_URL}/user`, {
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
  const root = await res.json().catch(() => null) as Record<string, unknown> | null
  const list = (root?.proceedings ?? (root?.data as Record<string, unknown> | undefined)?.proceedings) as unknown
  if (!Array.isArray(list)) return null
  return (list.find((e) => e && String((e as Record<string, unknown>).nro_expediente ?? '').trim() === numeroSae) as Record<string, unknown>) ?? null
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json(req, { error: 'Token inválido' }, 401)

    const body = await req.json().catch(() => null) as {
      escrito_id?: string
      tipo_id?: string
      categoria?: string
      descripcion?: string
      presenta_documentacion?: boolean
      crear_seguimiento?: boolean
      dry_run?: boolean
    } | null
    if (!body?.escrito_id) return json(req, { error: 'escrito_id requerido' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1) Escrito + expediente
    const { data: escritoRow, error: escErr } = await admin
      .from('escritos')
      .select('id, user_id, expediente_id, titulo, estado, pdf_firmado_path, expediente:expedientes(id, numero_sae, caratula, fuero, sae_proceeding_entry)')
      .eq('id', body.escrito_id)
      .single()
    if (escErr || !escritoRow) return json(req, { error: 'Escrito no encontrado' }, 404)

    const escrito = escritoRow as unknown as {
      id: string; user_id: string; expediente_id: string; titulo: string
      estado: string; pdf_firmado_path: string | null
      expediente: { id: string; numero_sae: string | null; caratula: string | null; fuero: string | null; sae_proceeding_entry: { proceeding?: Record<string, unknown> } | null } | null
    }

    if (escrito.user_id !== user.id) return json(req, { error: 'Sin permisos sobre este escrito' }, 403)
    if (!body.dry_run && escrito.estado !== 'firmado') {
      return json(req, { error: 'El escrito debe estar firmado para presentarlo. Adjuntá el PDF firmado primero.', code: 'NOT_SIGNED' }, 412)
    }
    if (!escrito.expediente?.numero_sae) {
      return json(req, { error: 'El expediente no tiene número SAE asociado', code: 'NO_NUMERO_SAE' }, 412)
    }

    // Validaciones baratas antes de tocar el portal
    let pdfBuffer: Uint8Array | null = null
    if (!body.dry_run) {
      if (!body.tipo_id?.trim() && !body.categoria?.trim()) return json(req, { error: 'Elegí la categoría del escrito' }, 400)
      if (!body.descripcion?.trim()) return json(req, { error: 'Completá la descripción' }, 400)
      if (!escrito.pdf_firmado_path) return json(req, { error: 'No hay PDF firmado adjunto', code: 'NO_PDF' }, 412)
      const { data: pdfFile, error: pdfErr } = await admin.storage.from('escritos-firmados').download(escrito.pdf_firmado_path)
      if (pdfErr || !pdfFile) return json(req, { error: `No se pudo bajar el PDF firmado: ${pdfErr?.message ?? ''}` }, 500)
      pdfBuffer = new Uint8Array(await pdfFile.arrayBuffer())
      if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
        return json(req, { error: 'El PDF supera el límite de 7,5 MB del portal del SAE', code: 'PDF_TOO_LARGE' }, 413)
      }
    }

    // 2) Credenciales SAE del abogado
    const { data: credRow } = await admin
      .from('sae_credentials')
      .select('username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (!credRow) return json(req, { error: 'Credenciales SAE no configuradas', code: 'NO_SAE_CREDS' }, 412)
    const cred = credRow as { username: string; encrypted_secret: string | null }
    const password = await readSaePassword(cred.encrypted_secret, { serviceClient: admin, userId: user.id })
    if (!password) return json(req, { error: 'Credenciales SAE inválidas', code: 'BAD_SAE_CREDS' }, 412)

    // 3) Login SSO
    let session: SaeSession
    try {
      session = await authenticateWithSae({ username: cred.username, password })
    } catch (e) {
      const code = e instanceof SaeError ? e.code : 'SAE_AUTH_UNKNOWN'
      return json(req, { error: e instanceof Error ? e.message : 'Login SAE falló', code }, 502)
    }

    // 4) Datos del expediente en el SAE (procid, fuero)
    const numeroSae = escrito.expediente.numero_sae.trim()
    let proc = escrito.expediente.sae_proceeding_entry?.proceeding ?? null
    if (!proc?.procid) proc = await proceedingDesdeApi(numeroSae, session)
    const procid = proc?.procid ? String(proc.procid) : null
    const fueroid = Number(proc?.jurisdiction_id ?? proc?.jurisdictionId ?? 0) || FUEROID_POR_FUERO[escrito.expediente.fuero ?? ''] || 0
    if (!procid) return json(req, { error: 'No encuentro este expediente entre los tuyos en el SAE. Sincronizalo y reintentá.', code: 'EXP_NOT_FOUND' }, 404)
    if (!fueroid) return json(req, { error: 'No sé en qué fuero buscar el expediente en el portal. Cargá el fuero del expediente.', code: 'NO_FUERO' }, 412)

    // 5) Portal: módulo, búsqueda, formulario
    const portal = new Portal(session)
    await abrirModulo(portal)

    const numeroBase = numeroSae.replace(/-.*$/, '')
    const radicaciones = (await buscarRadicaciones(portal, fueroid, numeroBase)).filter((r) => r.procid === procid)
    let destino = radicaciones.find((r) => r.ultima) ?? null
    if (!destino) {
      // Respaldo: la oficina donde lo tenemos sincronizado
      const juzgid = proc?.juzgid ? String(proc.juzgid) : null
      destino = radicaciones.find((r) => r.juzgid === juzgid) ?? radicaciones[0] ?? null
    }
    if (!destino) {
      return json(req, { error: `El portal no ofrece presentar escritos en el expediente ${numeroSae}.`, code: 'EXP_NOT_FOUND' }, 404)
    }

    const form = await leerFormulario(portal, destino.url)

    if (body.dry_run) {
      return json(req, {
        ok: true,
        dry_run: true,
        categorias: form.tipos,
        expediente: {
          numero: numeroSae,
          procid,
          caratula: form.caratula ?? escrito.expediente.caratula,
          oficina: destino.oficina,
          ultima_radicacion: destino.ultima,
          fecha_radicacion: destino.fecha,
        },
      })
    }

    // 6) Tipo (categoría) del portal
    const tipo = body.tipo_id
      ? form.tipos.find((t) => t.id === body.tipo_id)
      : form.tipos.find((t) => normalizeKey(t.nombre) === normalizeKey(body.categoria ?? ''))
    if (!tipo) {
      return json(req, { error: 'La categoría elegida no existe en el portal para esta oficina.', code: 'CATEGORIA_INVALID', categorias: form.tipos }, 400)
    }

    // 7) POST multipart
    const fd = new FormData()
    fd.append('_token', form.token)
    fd.append('tipoid', tipo.id)
    fd.append('descripcion', body.descripcion!.trim().slice(0, 250))
    fd.append('documentacion', body.presenta_documentacion ? '1' : '0')
    const nombrePdf = `${(escrito.titulo || 'escrito').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]/g, '').trim().slice(0, 80) || 'escrito'}.pdf`
    fd.append('archivos[]', new Blob([pdfBuffer!], { type: 'application/pdf' }), nombrePdf)

    const submitRes = await portal.fetch(form.action, { method: 'POST', body: fd, referer: destino.url })
    const loc = submitRes.headers.get('location')
    let mensaje: string | null = null
    let errores: string[] = []

    if (submitRes.status >= 300 && submitRes.status < 400 && loc) {
      await submitRes.body?.cancel()
      const destinoUrl = new URL(loc, form.action)
      const { res: after, url: afterUrl } = await portal.get(destinoUrl.toString())
      const html = await after.text()
      const ok = alertas(html, /success/).find((t) => /PRESENTADO/i.test(t))
      if (ok) mensaje = ok
      else if (destinoUrl.pathname.replace(/\/$/, '') === '/ingreso-escritos' && !esLogin(afterUrl, html)) {
        // Volvió al listado sin aviso visible: lo damos por presentado pero lo dejamos asentado.
        mensaje = 'El portal volvió al listado de escritos sin mensaje de error.'
      } else {
        errores = alertas(html, /danger|warning/)
      }
    } else if (submitRes.status === 419) {
      errores = ['El portal rechazó el envío por sesión vencida (419). Reintentá.']
    } else {
      const html = await submitRes.text()
      const ok = alertas(html, /success/).find((t) => /PRESENTADO/i.test(t))
      if (ok) mensaje = ok
      else errores = alertas(html, /danger|warning/)
      if (!ok && !errores.length) errores = [`El portal respondió ${submitRes.status}.`]
    }

    if (!mensaje) {
      return json(req, {
        error: errores.join(' · ') || 'El portal no confirmó la presentación.',
        code: 'SUBMIT_FAILED',
        status: submitRes.status,
      }, 502)
    }

    // 8) Persistir
    const ahora = new Date().toISOString()
    const presentacionMeta = {
      mensaje_portal: mensaje,
      nro_comprobante: null,
      tipo_id: tipo.id,
      categoria: tipo.nombre,
      descripcion: body.descripcion!.trim(),
      presenta_documentacion: Boolean(body.presenta_documentacion),
      oficina: destino.oficina,
      procid,
      juzgid: destino.juzgid,
      fuero_id: fueroid,
      archivo: nombrePdf,
      presentado_at: ahora,
    }
    // Tarea de controlar el proveído (igual que "Ya lo presenté"); se cierra sola
    // cuando escritos-seguimiento detecta el proveído.
    let tareaId: string | null = null
    if (body.crear_seguimiento !== false) {
      const { data: t } = await admin.from('tareas').insert({
        titulo: `Controlar proveído: ${escrito.titulo}`.slice(0, 200),
        descripcion: `Escrito presentado el ${fechaAR(new Date())} por el portal del SAE (${tipo.nombre}, ${destino.oficina}). Se cierra sola cuando llega el proveído al SAE.`,
        expediente_id: escrito.expediente_id, asignado_a: user.id, asignados: [user.id],
        fecha_vencimiento: sumarHabiles(3), prioridad: 'MEDIA', estado: 'PENDIENTE', created_by: user.id,
      } as never).select('id').single()
      tareaId = (t as { id: string } | null)?.id ?? null
    }

    await admin.from('escritos').update({
      estado: 'presentado_sae',
      presentado_sae_at: ahora,
      presentado_at: ahora,
      presentacion_sae: presentacionMeta,
      ...(tareaId ? { tarea_seguimiento_id: tareaId } : {}),
      updated_at: ahora,
    } as never).eq('id', escrito.id)

    return json(req, { ok: true, escrito_id: escrito.id, nro_comprobante: null, mensaje, presentacion: presentacionMeta })
  } catch (e) {
    if (e instanceof PortalError) return json(req, { error: e.message, code: e.code, ...e.extra }, e.status)
    const msg = e instanceof Error ? e.message : String(e)
    return json(req, { error: msg, code: 'INTERNAL' }, 500)
  }
})
