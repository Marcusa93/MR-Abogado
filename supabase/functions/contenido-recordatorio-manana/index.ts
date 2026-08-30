// ─────────────────────────────────────────────────────────────────────────────
// Edge function: contenido-recordatorio-manana
//
// Invocada por pg_cron todos los días a las 12:00 UTC (9:00 Argentina).
// Busca contenidos con publicar_el = mañana, cualquier estado activo,
// y envía un mensaje de Telegram a Marco para que revise lo que viene.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

const CATEGORIA_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  newsletter: 'Newsletter',
  email_cliente: 'Email a cliente',
  whatsapp_difusion: 'WhatsApp difusión',
  blog: 'Blog',
  video_guion: 'Guion video',
  otro: 'Contenido',
}

const CATEGORIA_EMOJI: Record<string, string> = {
  instagram: '📸',
  linkedin: '💼',
  facebook: '👥',
  twitter: '🐦',
  newsletter: '📧',
  email_cliente: '✉️',
  whatsapp_difusion: '💬',
  blog: '📝',
  video_guion: '🎬',
  otro: '📌',
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'borrador',
  en_revision: 'en revisión',
  aprobado: 'aprobado ✅',
  publicado: 'publicado',
}

interface ContenidoRow {
  id: string
  titulo: string
  categoria: string
  estado: string
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const marcoChatId = Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)

  // Calcular fecha de mañana en zona Argentina (UTC-3)
  const nowUTC = new Date()
  const mananaArg = new Date(nowUTC.getTime() + (-3) * 60 * 60 * 1000)
  mananaArg.setUTCDate(mananaArg.getUTCDate() + 1)
  const manana = mananaArg.toISOString().slice(0, 10)

  const { data: contenidos, error } = await admin
    .from('contenidos')
    .select('id, titulo, categoria, estado')
    .eq('publicar_el', manana)
    .not('estado', 'in', '("publicado","archivado")')
    .is('deleted_at', null)
    .order('categoria')

  if (error) return json({ error: error.message }, 500)
  if (!contenidos?.length) return json({ sent: 0, skipped: 'sin_contenidos_manana' })

  if (!botToken || !marcoChatId) {
    return json({ skipped: 'sin_telegram_config', contenidos: contenidos.length })
  }

  const lineas = (contenidos as ContenidoRow[]).map((c) => {
    const emoji = CATEGORIA_EMOJI[c.categoria] ?? '📌'
    const label = CATEGORIA_LABEL[c.categoria] ?? c.categoria
    const estadoStr = ESTADO_LABEL[c.estado] ?? c.estado
    return `${emoji} *${label}* — ${c.titulo}\n   _Estado: ${estadoStr}_`
  })

  const texto = [
    `📅 *Mañana publicás* (${manana})`,
    '',
    lineas.join('\n\n'),
    '',
    '_Revisá y aprobá en app.marcorossi.com.ar/contenidos_',
  ].join('\n')

  try {
    await sendTelegram(botToken, marcoChatId, texto)
  } catch (e) {
    console.error('Telegram send failed', e)
    return json({ error: 'telegram_failed' }, 500)
  }

  return json({ sent: 1, contenidos: contenidos.length, fecha: manana })
})
