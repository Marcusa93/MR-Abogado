// ─────────────────────────────────────────────────────────────────────────────
// Edge function: contenido-recordatorio
//
// Invocada por pg_cron todos los días a las 12:00 UTC (9:00 Argentina).
// Busca contenidos con publicar_el = hoy y estado = 'aprobado' y envía
// una notificación push/email al creador y al asignado via dispatch-alert-notification.
//
// Auth: x-cron-secret header (mismo CRON_SECRET del resto de jobs).
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

interface ContenidoRow {
  id: string
  titulo: string
  categoria: string
  created_by: string
  asignado_a: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const today = new Date().toISOString().slice(0, 10)

  const { data: contenidos, error } = await admin
    .from('contenidos')
    .select('id, titulo, categoria, created_by, asignado_a')
    .eq('publicar_el', today)
    .eq('estado', 'aprobado')
    .is('deleted_at', null)

  if (error) return json({ error: error.message }, 500)
  if (!contenidos?.length) return json({ sent: 0, skipped: 'sin_contenidos_hoy' })

  let sent = 0
  for (const c of contenidos as ContenidoRow[]) {
    const label = CATEGORIA_LABEL[c.categoria] ?? c.categoria
    const userIds = [...new Set([c.created_by, c.asignado_a].filter((id): id is string => !!id))]
    for (const userId of userIds) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/dispatch-alert-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            tipo: 'CONTENIDO_PROGRAMADO',
            usuario_id: userId,
            titulo: `Publicar hoy: ${c.titulo}`,
            mensaje: `Tenés un contenido de ${label} aprobado programado para hoy.`,
            url: '/contenidos',
          }),
        })
        if (res.ok) sent++
      } catch (e) {
        console.error('dispatch failed for contenido', c.id, e)
      }
    }
  }

  return json({ sent, contenidos: contenidos.length })
})
