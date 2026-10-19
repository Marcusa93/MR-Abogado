// ─────────────────────────────────────────────────────────────────────────────
// Edge function: escritos-seguimiento (cron, L-V cada 2 h entre 8 y 20)
//
// 1) Proveído: para cada escrito presentado sin proveído, busca la primera
//    actuación del juzgado en ese expediente desde la fecha de presentación
//    (decreto, sentencia, traslado, cédula, etc. — no escritos de parte).
//    Si la encuentra: la vincula, cierra la tarea "Controlar proveído" y avisa
//    por Telegram a quien presentó.
// 2) Lunes 9 h: resumen de borradores con más de 7 días sin terminar.
//
// Auth: x-cron-secret = CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tgSendKb } from '../_shared/tareas-telegram.ts'

const APP_URL = 'https://app.marcorossi.com.ar'
const TIPOS_JUZGADO = ['decreto', 'sentencia', 'traslado', 'cedula', 'audiencia', 'oficio', 'embargo', 'informe', 'planilla', 'otro']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

async function chatDe(admin: Admin, profileId: string): Promise<number | null> {
  const { data } = await admin.from('profiles').select('telegram_chat_id, rol').eq('id', profileId).maybeSingle()
  const p = data as { telegram_chat_id: number | null; rol: string } | null
  if (p?.telegram_chat_id) return p.telegram_chat_id
  // Marco no tiene el chat en su perfil: usa el del bot
  const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (dir as { id: string } | null)?.id === profileId ? (Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null) : null
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN') ?? ''

  // ── 1) Proveídos ────────────────────────────────────────────────────────
  const { data: pend } = await admin.from('escritos')
    .select('id, titulo, user_id, expediente_id, presentado_at, presentado_sae_at, tarea_seguimiento_id, expediente:expedientes(caratula)')
    .in('estado', ['presentado', 'presentado_sae']).is('proveido_movement_id', null).not('expediente_id', 'is', null)
  let proveidos = 0
  for (const e of (pend ?? []) as unknown as {
    id: string; titulo: string; user_id: string; expediente_id: string; presentado_at: string | null; presentado_sae_at: string | null
    tarea_seguimiento_id: string | null; expediente: { caratula: string | null } | null
  }[]) {
    const desde = e.presentado_at ?? e.presentado_sae_at
    if (!desde) continue
    const { data: movs } = await admin.from('sae_movements')
      .select('id, fecha, titulo, tipo_movimiento, ai_summary')
      .eq('expediente_id', e.expediente_id).in('tipo_movimiento', TIPOS_JUZGADO)
      .gte('fecha', desde.slice(0, 10)).gt('created_at', desde)
      .order('fecha', { ascending: true }).order('created_at', { ascending: true }).limit(1)
    const mov = (movs ?? [])[0] as { id: string; fecha: string; titulo: string; tipo_movimiento: string; ai_summary: string | null } | undefined
    if (!mov) continue
    const ahora = new Date().toISOString()
    await admin.from('escritos').update({ proveido_movement_id: mov.id, proveido_at: ahora }).eq('id', e.id)
    if (e.tarea_seguimiento_id) {
      await admin.from('tareas').update({ estado: 'COMPLETADA', completada_at: ahora, updated_at: ahora }).eq('id', e.tarea_seguimiento_id).eq('estado', 'PENDIENTE')
    }
    proveidos++
    const chat = token ? await chatDe(admin, e.user_id) : null
    if (chat) {
      await tgSendKb(token, chat,
        `Llegó el proveído de tu escrito "${e.titulo}"\n${e.expediente?.caratula ?? ''}\n\n` +
        `${mov.tipo_movimiento} del ${mov.fecha.split('-').reverse().join('/')}: ${(mov.ai_summary ?? mov.titulo ?? '').slice(0, 400)}`,
        [[{ text: 'Ver la actuación', url: `${APP_URL}/expedientes/${e.expediente_id}?tab=actuaciones&mid=${mov.id}` }]])
    }
  }

  // ── 2) Lunes 9 h (AR): borradores olvidados ─────────────────────────────
  let resumenes = 0
  const ar = new Date(Date.now() - 3 * 3_600_000)
  if (ar.getUTCDay() === 1 && ar.getUTCHours() === 9 && token) {
    const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: viejos } = await admin.from('escritos')
      .select('id, titulo, user_id, updated_at, expediente_id, expediente:expedientes(caratula)')
      .in('estado', ['borrador', 'final', 'firmado']).lt('updated_at', hace7).order('updated_at')
    const porUsuario = new Map<string, { titulo: string; caratula: string | null; dias: number }[]>()
    for (const v of (viejos ?? []) as unknown as { titulo: string; user_id: string; updated_at: string; expediente: { caratula: string | null } | null }[]) {
      const dias = Math.floor((Date.now() - new Date(v.updated_at).getTime()) / 86_400_000)
      porUsuario.set(v.user_id, [...(porUsuario.get(v.user_id) ?? []), { titulo: v.titulo, caratula: v.expediente?.caratula ?? null, dias }])
    }
    for (const [uid, lista] of porUsuario) {
      const chat = await chatDe(admin, uid)
      if (!chat) continue
      await tgSendKb(token, chat,
        `Escritos sin terminar (${lista.length}), con más de una semana:\n\n` +
        lista.slice(0, 12).map((x) => `• ${x.titulo}${x.caratula ? ` — ${x.caratula.slice(0, 50)}` : ''} (${x.dias} días)`).join('\n') +
        (lista.length > 12 ? `\n… y ${lista.length - 12} más` : '') +
        '\n\nTerminalos, presentalos o borralos si ya no hacen falta.',
        [[{ text: 'Abrir escritos', url: `${APP_URL}/escritos` }]])
      resumenes++
    }
  }

  return new Response(JSON.stringify({ ok: true, revisados: (pend ?? []).length, proveidos, resumenes }), { headers: { 'Content-Type': 'application/json' } })
})
