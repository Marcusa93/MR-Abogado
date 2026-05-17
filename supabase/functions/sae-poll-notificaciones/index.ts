// ─────────────────────────────────────────────────────────────────────────────
// Edge function: sae-poll-notificaciones
//
// Invocada por pg_cron 2x al día (00:15 y 08:30 AR). Autenticación
// por header x-cron-secret. Sin JWT de usuario.
//
// Flujo por cada usuario con sae_notif_enabled=true:
//   1. Login SSO (reusa _shared/sae-request-connector → login.justucuman).
//   2. Warm-up GET a /casillero para que SSO setee cookies de Laravel del portal.
//   3. Por cada uno de los 29 slugs de fuero, paginar
//      GET /casillero/fuero/{slug}?page=N hasta que no haya rel="next".
//      El portal es Laravel SSR — parsing HTML con cheerio, no hay JSON.
//      sae_notif_id = href del permalink encriptado (estable, único, opaco).
//   4. Diff contra sae_notificaciones por (profile_id, sae_notif_id).
//   5. Inserta nuevas; si vienen marcadas leídas en el portal (icono ausente
//      en td[0]), se guardan como leídas y NO se renotifican.
//   6. Intenta vincular cada nueva con expedientes locales por numero_sae.
//   7. Por cada NO leída en portal:
//      - Si profile.sae_notif_push: dispara push (difiere si quiet hours).
//      - Si profile.sae_notif_email: manda email vía Resend a todos los
//        destinatarios en sae_notif_email_addresses.
//
// Body opcional: { dry_run?: boolean, only_profile_id?: string }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'npm:cheerio@1.0.0'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'
import { sendEmail, escapeHtml } from '../_shared/resend.ts'
import { FUEROS_SAE, FUEROS_BY_SLUG } from '../_shared/fueros.ts'

const PORTAL_BASE = 'https://portaldelsae.justucuman.gov.ar'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const MAX_PAGES_PER_FUERO = 20  // safety cap
const MAX_REDIRECT_HOPS = 12     // SSO puede encadenar 4-6 saltos

// ─── Walk de redirects manual con cookie accumulation ──────────────────────
// Deno fetch sigue redirects automáticamente PERO se come los Set-Cookie de
// los hops intermedios — que es exactamente lo que necesitamos del SSO.
// Lo hacemos a mano: hop por hop, mergeando cookies en la session.

function parseSetCookieHeader(raw: string | null): string[] {
  if (!raw) return []
  // Set-Cookie con múltiples cookies viene separado por "," entre cookies
  // (cuidado: la fecha "Expires=Wed, 21 Oct..." también tiene comas).
  return raw.split(/,(?=[^;,\s]+=)/g)
    .map(s => s.split(';')[0].trim())
    .filter(Boolean)
}

function mergeCookies(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>()
  for (const c of existing) {
    const eq = c.indexOf('=')
    if (eq > 0) map.set(c.slice(0, eq), c)
  }
  for (const c of incoming) {
    const eq = c.indexOf('=')
    if (eq > 0) map.set(c.slice(0, eq), c)
  }
  return [...map.values()]
}

interface RedirectResult {
  res: Response
  finalUrl: string
  session: SaeSession
  hops: { url: string; status: number; setCookies: string[] }[]
}

async function fetchWithManualRedirects(
  startUrl: string,
  session: SaeSession,
): Promise<RedirectResult> {
  const hops: RedirectResult['hops'] = []
  let currentUrl = startUrl
  let currentSession = session

  for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
    const res = await fetch(currentUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
        'User-Agent': BROWSER_UA,
        Cookie: currentSession.cookies.join('; '),
        Referer: PORTAL_BASE,
      },
      redirect: 'manual',
    })

    const setCookies = parseSetCookieHeader(res.headers.get('set-cookie'))
    if (setCookies.length > 0) {
      currentSession = { ...currentSession, cookies: mergeCookies(currentSession.cookies, setCookies) }
    }
    hops.push({ url: currentUrl, status: res.status, setCookies })

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (!loc) return { res, finalUrl: currentUrl, session: currentSession, hops }
      try {
        currentUrl = new URL(loc, currentUrl).toString()
      } catch {
        return { res, finalUrl: currentUrl, session: currentSession, hops }
      }
      // Consumimos el body del redirect para liberar la conexión
      await res.body?.cancel().catch(() => {})
      continue
    }

    return { res, finalUrl: currentUrl, session: currentSession, hops }
  }
  throw new SaeError('TOO_MANY_REDIRECTS', `Más de ${MAX_REDIRECT_HOPS} redirects en ${startUrl}`)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string
  email: string | null
  nombre: string | null
  apellido: string | null
  sae_notif_enabled: boolean
  sae_notif_push: boolean
  sae_notif_email: boolean
  sae_notif_email_addresses: string[]
  sae_notif_push_quiet: boolean
  sae_notif_weekend: boolean
  sae_fueros_seleccionados: string[]
}

interface PortalNotificacion {
  sae_notif_id: string             // id único en el portal
  numero_expediente: string | null
  caratula: string | null
  oficina: string | null
  tipo: string | null
  titulo: string | null
  fecha_emision: string | null     // ISO
  raw: Record<string, unknown>
}

// ─── Fetch de notificaciones del portal ─────────────────────────────────────
//
// El portal del SAE es Laravel SSR — no hay API JSON. La lista vive en
//   GET /casillero/fuero/{slug}?page=N
// Se renderiza como <table>. Iteramos los 29 fueros y parseamos con cheerio.
// El `ver_url` (permalink encriptado de Laravel) es opaco pero único y estable:
// lo usamos como sae_notif_id para dedup.

function parseFechaDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

async function fetchPaginaFuero(
  fueroSlug: string,
  page: number,
  session: SaeSession,
): Promise<{ items: PortalNotificacion[]; hayMas: boolean; session: SaeSession; htmlLen: number; status: number }> {
  const url = `${PORTAL_BASE}/casillero/fuero/${fueroSlug}?page=${page}`
  const { res, session: newSession, hops } = await fetchWithManualRedirects(url, session)

  // Si el último hop terminó en login.justucuman, perdimos la sesión
  const lastHop = hops[hops.length - 1]
  if (lastHop && /login\.justucuman/i.test(lastHop.url)) {
    throw new SaeError('SESSION_EXPIRED', 'Redirect a SSO en /casillero/fuero — cookies del portal no válidas')
  }
  if (!res.ok) return { items: [], hayMas: false, session: newSession, htmlLen: 0, status: res.status }

  const html = await res.text()
  const $ = cheerio.load(html)

  const items: PortalNotificacion[] = []
  $('table.table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 7) return

    const verHref = $(tds[6]).find('a').attr('href') ?? ''
    if (!verHref) return  // sin permalink no podemos dedup, lo descartamos

    const td3 = $(tds[3])
    const smallText = td3.find('small').text().trim()
    const tipo = td3.clone().children('small').remove().end().text().trim()

    items.push({
      sae_notif_id: verHref,  // permalink opaco — sirve como ID estable
      numero_expediente: ($(tds[2]).find('strong').text() || $(tds[2]).text()).trim() || null,
      caratula: null,  // no viene en la lista; lo podríamos pedir al detalle pero no hace falta hoy
      oficina: $(tds[5]).text().trim() || null,
      tipo: tipo || null,
      titulo: smallText || null,
      fecha_emision: parseFechaDMY($(tds[1]).text().trim()),
      raw: {
        fuero: fueroSlug,
        destinatario: $(tds[4]).text().trim(),
        ver_url: verHref.startsWith('http') ? verHref : `${PORTAL_BASE}${verHref}`,
        leido_portal: $(tds[0]).find('i, svg, img').length === 0,
      },
    })
  })

  const hayMas = $('ul.pagination a[rel="next"]').length > 0
  return { items, hayMas, session: newSession, htmlLen: html.length, status: res.status }
}

interface DiscoveryResult {
  slugsConBell: string[] | null   // null = parseo falló
  session: SaeSession
  htmlLen: number
  status: number
  finalUrl: string
  hopsCount: number
  anchorsFound: number             // cuántos <a href=/casillero/fuero/X> había
  debugLog: string[]
}

// Discovery: parsea /casillero para detectar qué fueros tienen 🔔.
async function discoverFuerosWithNovedades(session: SaeSession): Promise<DiscoveryResult> {
  const debugLog: string[] = []
  const { res, finalUrl, session: newSession, hops } = await fetchWithManualRedirects(
    `${PORTAL_BASE}/casillero`,
    session,
  )

  debugLog.push(`/casillero status=${res.status} hops=${hops.length} finalUrl=${finalUrl}`)
  for (const h of hops) {
    debugLog.push(`  hop ${h.url} → ${h.status} (set-cookie: ${h.setCookies.length})`)
  }

  if (/login\.justucuman/i.test(finalUrl)) {
    throw new SaeError('SESSION_EXPIRED', `Discovery /casillero terminó en SSO (${finalUrl}). Cookies de portal no aplican.`)
  }
  if (!res.ok) {
    return { slugsConBell: null, session: newSession, htmlLen: 0, status: res.status, finalUrl, hopsCount: hops.length, anchorsFound: 0, debugLog }
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const slugsConBell = new Set<string>()

  const anchors = $('a[href*="/casillero/fuero/"]')
  debugLog.push(`anchors a[href*=/casillero/fuero/]: ${anchors.length}`)

  anchors.each((_, a) => {
    const $a = $(a)
    const href = $a.attr('href') ?? ''
    const m = href.match(/\/casillero\/fuero\/([a-z0-9-]+)/i)
    if (!m) return
    const slug = m[1].toLowerCase()

    const container = $a.closest('tr, li, .row, .card, .panel, div').first()
    const candidates = container.length > 0 ? container : $a.parent()

    const hasBellIcon = candidates.find('i[class*="bell"], svg[class*="bell"], [class*="fa-bell"]').length > 0
    const containerText = candidates.text().toLowerCase()
    const hasNovedadText = containerText.includes('novedad')
    const badge = $a.find('.badge, .pill, .count, [class*="badge"]').first()
    const hasBadge = badge.length > 0 && /\d+/.test(badge.text())

    if (hasBellIcon || hasNovedadText || hasBadge) {
      slugsConBell.add(slug)
      debugLog.push(`  ✓ ${slug} (bell=${hasBellIcon} novedad=${hasNovedadText} badge=${hasBadge})`)
    }
  })

  return {
    slugsConBell: [...slugsConBell],
    session: newSession, htmlLen: html.length, status: res.status, finalUrl, hopsCount: hops.length,
    anchorsFound: anchors.length, debugLog,
  }
}

interface FueroResult {
  items: PortalNotificacion[]
  errores: string[]
  fueros_iterados: string[]
  fueros_con_novedades_detectadas: string[] | 'discovery_fallido'
  fueros_seleccionados_manual: string[] | null
  session: SaeSession
  debug: {
    discovery?: {
      status: number
      finalUrl: string
      hops: number
      htmlLen: number
      anchorsFound: number
      log: string[]
    }
    fueros: { slug: string; pages: number; items: number; firstStatus: number; htmlLen: number; error?: string }[]
  }
}

async function fetchNotificacionesFromPortal(
  session: SaeSession,
  fuerosSeleccionados: string[],
): Promise<FueroResult> {
  const allItems: PortalNotificacion[] = []
  const errores: string[] = []
  const debug: FueroResult['debug'] = { fueros: [] }
  let currentSession = session

  // Decidir qué fueros iterar
  let fuerosAIterar: string[]
  let fuerosConBell: string[] | 'discovery_fallido' = 'discovery_fallido'

  if (fuerosSeleccionados.length > 0) {
    fuerosAIterar = fuerosSeleccionados
  } else {
    const discovery = await discoverFuerosWithNovedades(currentSession)
    currentSession = discovery.session
    debug.discovery = {
      status: discovery.status,
      finalUrl: discovery.finalUrl,
      hops: discovery.hopsCount,
      htmlLen: discovery.htmlLen,
      anchorsFound: discovery.anchorsFound,
      log: discovery.debugLog,
    }

    if (discovery.slugsConBell === null) {
      fuerosAIterar = FUEROS_SAE.map(f => f.slug)
      errores.push('Discovery de bandeja falló — barriendo todos los fueros')
    } else if (discovery.slugsConBell.length === 0) {
      fuerosAIterar = []
      fuerosConBell = []
    } else {
      fuerosAIterar = discovery.slugsConBell
      fuerosConBell = discovery.slugsConBell
    }
  }

  for (const slug of fuerosAIterar) {
    let pages = 0
    let firstStatus = 0
    let totalHtmlLen = 0
    let errorMsg: string | undefined
    let itemsForThisFuero = 0
    try {
      for (let page = 1; page <= MAX_PAGES_PER_FUERO; page++) {
        const r = await fetchPaginaFuero(slug, page, currentSession)
        currentSession = r.session
        if (page === 1) firstStatus = r.status
        totalHtmlLen += r.htmlLen
        pages++
        allItems.push(...r.items)
        itemsForThisFuero += r.items.length
        if (!r.hayMas || r.items.length === 0) break
      }
    } catch (e) {
      if (e instanceof SaeError && e.code === 'SESSION_EXPIRED') throw e
      errorMsg = e instanceof Error ? e.message : String(e)
      errores.push(`${slug}: ${errorMsg}`)
    }
    debug.fueros.push({ slug, pages, items: itemsForThisFuero, firstStatus, htmlLen: totalHtmlLen, error: errorMsg })
  }

  return {
    items: allItems, errores,
    fueros_iterados: fuerosAIterar,
    fueros_con_novedades_detectadas: fuerosConBell,
    fueros_seleccionados_manual: fuerosSeleccionados.length > 0 ? fuerosSeleccionados : null,
    session: currentSession, debug,
  }
}

// ─── Quiet hours: ¿push ahora o diferido? ───────────────────────────────────

// Devuelve null si se puede mandar ya. Si está en quiet hours, devuelve el ISO
// de las 08:00 AR del próximo día (o de hoy si todavía no llegaron las 8).
function computePushDelay(quietEnabled: boolean): string | null {
  if (!quietEnabled) return null
  const now = new Date()
  // Convertir a hora AR (UTC-3)
  const utcHour = now.getUTCHours()
  const arHour = (utcHour - 3 + 24) % 24
  if (arHour >= 8 && arHour < 22) return null  // horario activo

  // Calcular las 08:00 AR del momento más cercano (puede ser hoy o mañana)
  const target = new Date(now)
  // Trabajar en UTC: 08:00 AR = 11:00 UTC
  target.setUTCHours(11, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.toISOString()
}

// ─── Push: reusa la edge function send-push-notification ────────────────────

async function triggerPush(profileId: string, title: string, body: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        user_ids: [profileId],
        payload: { title, body, url, tag: 'sae-notif' },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Email: HTML básico legible ─────────────────────────────────────────────

function renderEmailHtml(profile: ProfileRow, notif: PortalNotificacion, expedienteUrl: string | null): string {
  const nombre = `${profile.nombre ?? ''} ${profile.apellido ?? ''}`.trim() || 'Dr./Dra.'
  const fecha = notif.fecha_emision
    ? new Date(notif.fecha_emision).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'fecha no informada'

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#0f1015;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;color:#a1a1aa;text-transform:uppercase;">MR Abogado · Notificación SAE</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#fafafa;">Nueva notificación digital</h1>
          <p style="margin:0 0 4px;font-size:14px;color:#d4d4d8;">${escapeHtml(nombre)},</p>
          <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa;">Te llegó una notificación nueva en el portal del SAE Tucumán:</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f12;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin-bottom:20px;">
            ${notif.titulo ? `<tr><td style="padding-bottom:8px;"><strong style="color:#fafafa;font-size:15px;">${escapeHtml(notif.titulo)}</strong></td></tr>` : ''}
            ${notif.tipo ? `<tr><td style="padding-bottom:4px;font-size:11px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(notif.tipo)}</td></tr>` : ''}
            ${notif.numero_expediente ? `<tr><td style="padding-bottom:4px;font-size:13px;color:#d4d4d8;">Expediente: <span style="font-family:monospace;">${escapeHtml(notif.numero_expediente)}</span></td></tr>` : ''}
            ${notif.caratula ? `<tr><td style="padding-bottom:4px;font-size:12px;color:#a1a1aa;">${escapeHtml(notif.caratula)}</td></tr>` : ''}
            ${notif.oficina ? `<tr><td style="padding-bottom:4px;font-size:12px;color:#a1a1aa;">${escapeHtml(notif.oficina)}</td></tr>` : ''}
            <tr><td style="font-size:11px;color:#71717a;padding-top:6px;">${escapeHtml(fecha)}</td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(135deg,#8b5cf6,#06b6d4);border-radius:8px;">
                <a href="${PORTAL_BASE}/inicializando?module=notificaciones-digitales" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#fafafa;text-decoration:none;">Ver en el portal del SAE</a>
              </td>
              ${expedienteUrl ? `<td style="padding-left:8px;"><a href="${expedienteUrl}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#d4d4d8;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;text-decoration:none;">Abrir expediente en MR</a></td>` : ''}
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:11px;color:#71717a;">Este email lo generó el sistema MR Abogado a partir del polling de notificaciones del SAE.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: dos modos
  //  1) Cron: header x-cron-secret válido → procesa TODOS los usuarios con opt-in
  //  2) Usuario: JWT válido en Authorization → procesa SOLO al usuario que llama
  let forcedProfileId: string | null = null
  const cronSecret = Deno.env.get('CRON_SECRET')
  const headerSecret = req.headers.get('x-cron-secret')
  const isCronAuth = Boolean(cronSecret && headerSecret === cronSecret)

  if (!isCronAuth) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)
    forcedProfileId = user.id  // limita el barrido al usuario que llamó
  }

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; only_profile_id?: string }
  const dryRun = Boolean(body.dry_run)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Filtro de fin de semana: 0=domingo, 6=sábado (UTC-3 AR)
  const arDay = (new Date(Date.now() - 3 * 3600_000)).getUTCDay()
  const isWeekend = arDay === 0 || arDay === 6

  // 1) Traer usuarios con opt-in
  let profilesQuery = admin
    .from('profiles')
    .select('id, email, nombre, apellido, sae_notif_enabled, sae_notif_push, sae_notif_email, sae_notif_email_addresses, sae_notif_push_quiet, sae_notif_weekend, sae_fueros_seleccionados')
    .eq('sae_notif_enabled', true)
  if (forcedProfileId) {
    profilesQuery = profilesQuery.eq('id', forcedProfileId)
  } else if (body.only_profile_id) {
    profilesQuery = profilesQuery.eq('id', body.only_profile_id)
  }
  if (isWeekend) {
    profilesQuery = profilesQuery.eq('sae_notif_weekend', true)
  }
  const { data: profiles, error: profErr } = await profilesQuery
  if (profErr) return json({ error: profErr.message }, 500)

  const stats = {
    profiles_checked: 0,
    profiles_skipped: 0,
    notifs_nuevas: 0,
    push_enviados: 0,
    push_diferidos: 0,
    emails_enviados: 0,
    fueros_iterados: [] as string[],
    fueros_con_novedades_detectadas: null as string[] | null,
    discovery_mode: 'auto' as 'auto' | 'manual',
    errores: [] as { profile_id: string; error: string }[],
    // Toda razón de skip queda registrada acá, así nunca volvemos a
    // tener un "silencio" engañoso.
    skip_reasons: [] as { profile_id: string; reason: string }[],
    // Solo se popula en modo manual (forcedProfileId no null): telemetría
    // detallada para debug del flow real con el portal.
    debug: null as FueroResult['debug'] | null,
  }

  for (const p of (profiles ?? []) as ProfileRow[]) {
    stats.profiles_checked++

    // 2) Traer credenciales SAE. El status válido en DB es 'activo' (español).
    const { data: credRow } = await admin
      .from('sae_credentials')
      .select('username, encrypted_secret, status')
      .eq('profile_id', p.id)
      .maybeSingle()
    const cred = credRow as { username: string; encrypted_secret: string | null; status: string } | null
    if (!cred) {
      stats.profiles_skipped++
      stats.skip_reasons.push({ profile_id: p.id, reason: 'sin_credenciales_sae' })
      continue
    }
    if (!cred.encrypted_secret) {
      stats.profiles_skipped++
      stats.skip_reasons.push({ profile_id: p.id, reason: 'credenciales_sin_secret' })
      continue
    }
    if (cred.status !== 'activo') {
      stats.profiles_skipped++
      stats.skip_reasons.push({ profile_id: p.id, reason: `status_no_activo (${cred.status})` })
      continue
    }
    const password = atob(cred.encrypted_secret)

    // 3) Login al SAE
    let session: SaeSession
    try {
      session = await authenticateWithSae({ username: cred.username, password })
    } catch (e) {
      const code = e instanceof SaeError ? e.code : 'AUTH_UNKNOWN'
      stats.errores.push({ profile_id: p.id, error: `Login: ${code}` })
      continue
    }

    // 4) Fetch notificaciones del portal
    //    fetchNotificacionesFromPortal hace todo: discovery /casillero (con
    //    walk de redirects manual que acumula cookies de SSO + Laravel
    //    portal) y luego itera fueros con la sesión enriquecida.
    let portalNotifs: PortalNotificacion[] = []
    let fueroResult: FueroResult | null = null
    try {
      fueroResult = await fetchNotificacionesFromPortal(session, p.sae_fueros_seleccionados ?? [])
      session = fueroResult.session  // sesión enriquecida con cookies del portal
      portalNotifs = fueroResult.items
      stats.fueros_iterados = fueroResult.fueros_iterados
      if (fueroResult.fueros_seleccionados_manual) {
        stats.discovery_mode = 'manual'
      } else if (Array.isArray(fueroResult.fueros_con_novedades_detectadas)) {
        stats.fueros_con_novedades_detectadas = fueroResult.fueros_con_novedades_detectadas
      }
      // Solo exponemos debug si es invocación manual del usuario (1 profile)
      if (forcedProfileId) stats.debug = fueroResult.debug
      for (const err of fueroResult.errores) {
        stats.errores.push({ profile_id: p.id, error: err })
      }
    } catch (e) {
      const code = e instanceof SaeError ? e.code : 'FETCH_UNKNOWN'
      const msg = e instanceof Error ? e.message : String(e)
      stats.errores.push({ profile_id: p.id, error: `Fetch: ${code} — ${msg}` })
      continue
    }
    if (portalNotifs.length === 0) continue

    // 5) Cargar las ya conocidas para diff
    const ids = portalNotifs.map(n => n.sae_notif_id)
    const { data: existing } = await admin
      .from('sae_notificaciones')
      .select('sae_notif_id')
      .eq('profile_id', p.id)
      .in('sae_notif_id', ids)
    const existingIds = new Set((existing ?? []).map(r => (r as { sae_notif_id: string }).sae_notif_id))
    const nuevas = portalNotifs.filter(n => !existingIds.has(n.sae_notif_id))

    if (nuevas.length === 0) continue

    // 6) Vincular cada nueva con expediente local por numero_sae
    const numerosExp = nuevas.map(n => n.numero_expediente).filter((x): x is string => Boolean(x))
    const expByNumero = new Map<string, string>()
    if (numerosExp.length > 0) {
      const { data: exps } = await admin
        .from('expedientes')
        .select('id, numero_sae')
        .in('numero_sae', numerosExp)
        .eq('created_by', p.id)
      for (const e of (exps ?? []) as { id: string; numero_sae: string | null }[]) {
        if (e.numero_sae) expByNumero.set(e.numero_sae, e.id)
      }
    }

    // 7) Insertar nuevas. Si vienen YA leídas del portal (el usuario las
    //    abrió por su cuenta antes del primer poll), las guardamos pero
    //    sin disparar push/email — la fila queda como histórico.
    const pushDelay = computePushDelay(p.sae_notif_push_quiet)
    const insertRows = nuevas.map(n => {
      const yaLeidaEnPortal = Boolean((n.raw as { leido_portal?: boolean }).leido_portal)
      return {
        profile_id: p.id,
        sae_notif_id: n.sae_notif_id,
        expediente_id: n.numero_expediente ? expByNumero.get(n.numero_expediente) ?? null : null,
        numero_expediente: n.numero_expediente,
        caratula: n.caratula,
        oficina: n.oficina,
        tipo: n.tipo,
        titulo: n.titulo,
        fecha_emision: n.fecha_emision,
        leida: yaLeidaEnPortal,
        leida_at: yaLeidaEnPortal ? new Date().toISOString() : null,
        push_diferido_hasta: !yaLeidaEnPortal && p.sae_notif_push ? pushDelay : null,
        raw_payload: n.raw,
      }
    })

    if (!dryRun) {
      const { error: insErr } = await admin.from('sae_notificaciones').insert(insertRows)
      if (insErr) {
        stats.errores.push({ profile_id: p.id, error: `Insert: ${insErr.message}` })
        continue
      }
    }
    stats.notifs_nuevas += nuevas.length

    if (dryRun) continue

    // 8) Disparar push + email solo por las NO leídas en el portal
    for (const n of nuevas) {
      const yaLeida = Boolean((n.raw as { leido_portal?: boolean }).leido_portal)
      if (yaLeida) continue  // ya la vio en el portal, no la renotifiquemos

      const expedienteId = n.numero_expediente ? expByNumero.get(n.numero_expediente) : null
      const expedienteUrl = expedienteId ? `https://app.marcorossi.com.ar/expedientes/${expedienteId}` : null

      // Push (si habilitado y no diferido)
      if (p.sae_notif_push && !pushDelay) {
        const ok = await triggerPush(
          p.id,
          `📬 ${n.tipo ?? 'Notificación SAE'}`,
          `${n.numero_expediente ? `Exp. ${n.numero_expediente} · ` : ''}${n.titulo ?? n.caratula ?? 'Nueva notificación'}`,
          expedienteUrl ?? '/notificaciones-sae',
        )
        if (ok) {
          stats.push_enviados++
          await admin.from('sae_notificaciones')
            .update({ notified_push_at: new Date().toISOString() } as never)
            .eq('profile_id', p.id).eq('sae_notif_id', n.sae_notif_id)
        }
      } else if (p.sae_notif_push && pushDelay) {
        stats.push_diferidos++
      }

      // Email — soporta múltiples destinatarios. Si la lista está vacía, fallback al email del perfil.
      if (p.sae_notif_email) {
        const recipients = (p.sae_notif_email_addresses?.length
          ? p.sae_notif_email_addresses
          : [p.email].filter((x): x is string => Boolean(x))
        ).map(s => s.trim()).filter(Boolean)
        if (recipients.length > 0) {
          const html = renderEmailHtml(p, n, expedienteUrl)
          const subject = `📬 ${n.tipo ?? 'Notificación SAE'}${n.numero_expediente ? ` · Exp. ${n.numero_expediente}` : ''}`
          const result = await sendEmail({ to: recipients, subject, html, tags: [{ name: 'tipo', value: 'sae_notif' }] })
          if (result.ok) {
            stats.emails_enviados += recipients.length
            await admin.from('sae_notificaciones')
              .update({ notified_email_at: new Date().toISOString() } as never)
              .eq('profile_id', p.id).eq('sae_notif_id', n.sae_notif_id)
          } else {
            stats.errores.push({ profile_id: p.id, error: `Email: ${result.error}` })
          }
        }
      }
    }
  }

  // 9) Procesar push diferidos vencidos (los que pasaron la quiet hour)
  if (!dryRun) {
    const { data: pendientes } = await admin
      .from('sae_notificaciones')
      .select('id, profile_id, sae_notif_id, tipo, titulo, caratula, numero_expediente, expediente_id, push_diferido_hasta')
      .is('notified_push_at', null)
      .not('push_diferido_hasta', 'is', null)
      .lte('push_diferido_hasta', new Date().toISOString())
      .limit(200)

    for (const n of (pendientes ?? []) as {
      id: string; profile_id: string; sae_notif_id: string;
      tipo: string | null; titulo: string | null; caratula: string | null;
      numero_expediente: string | null; expediente_id: string | null
    }[]) {
      const url = n.expediente_id ? `https://app.marcorossi.com.ar/expedientes/${n.expediente_id}` : '/notificaciones-sae'
      const ok = await triggerPush(
        n.profile_id,
        `📬 ${n.tipo ?? 'Notificación SAE'}`,
        `${n.numero_expediente ? `Exp. ${n.numero_expediente} · ` : ''}${n.titulo ?? n.caratula ?? 'Notificación pendiente'}`,
        url,
      )
      if (ok) {
        stats.push_enviados++
        await admin.from('sae_notificaciones')
          .update({ notified_push_at: new Date().toISOString() } as never)
          .eq('id', n.id)
      }
    }
  }

  return json({ ok: true, dry_run: dryRun, ...stats })
})
