// Avisos de tareas por Telegram (bot de escritos/gestión).
//
// Eventos (body.evento):
//   asignada   → al asignado/s con Telegram vinculado (trigger tareas_telegram_notify)
//   completada → al creador de la tarea (trigger tareas_telegram_notify)
//   diario     → cron 06:00 AR lun-vie: pendientes a cada usuario vinculado
//
// Auth: header x-cron-secret == CRON_SECRET (lo envían el trigger y el cron).
// Deploy con --no-verify-jwt.
// Secrets: CRON_SECRET, TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_MARCO_CHAT_ID

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  APP_URL, formatLista, formatTarea, listarPendientes, nombreCorto, tgSendKb,
  type TareaPendiente,
} from '../_shared/tareas-telegram.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Perfil { id: string; nombre: string | null; apellido: string | null; rol: string | null; telegram_chat_id: number | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return json(req, { error: 'CRON_SECRET no configurado' }, 500)
  if ((req.headers.get('x-cron-secret') ?? '') !== cronSecret) return json(req, { error: 'No autorizado' }, 401)

  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  if (!token) return json(req, { error: 'TELEGRAM_ESCRITO_BOT_TOKEN no configurado' }, 500)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as {
    evento?: string; tarea_id?: string; nuevos?: string[]; completada_por?: string | null
  }

  async function perfiles(ids: string[]): Promise<Perfil[]> {
    if (ids.length === 0) return []
    const { data } = await admin.from('profiles')
      .select('id, nombre, apellido, rol, telegram_chat_id')
      .in('id', ids)
    return (data ?? []) as Perfil[]
  }

  async function cargarTarea(id: string) {
    const { data } = await admin.from('tareas')
      .select('id, titulo, prioridad, fecha_vencimiento, created_at, created_by, descripcion, expediente:expedientes!tareas_expediente_id_fkey(id, caratula, numero), consulta:consultas!tareas_consulta_id_fkey(id, nombre, apellido)')
      .eq('id', id)
      .maybeSingle()
    return data as (TareaPendiente & { created_by: string | null; descripcion: string | null }) | null
  }

  try {
    // ── Asignada: avisar a los nuevos asignados ──────────────────────────────
    if (body.evento === 'asignada' && body.tarea_id) {
      const tarea = await cargarTarea(body.tarea_id)
      if (!tarea) return json(req, { ok: true, skipped: 'tarea no encontrada' })

      const [creador] = await perfiles(tarea.created_by ? [tarea.created_by] : [])
      const destinos = (await perfiles(body.nuevos ?? []))
        .filter(p => p.telegram_chat_id && p.id !== tarea.created_by)

      let enviados = 0
      for (const p of destinos) {
        const de = creador ? ` de ${nombreCorto(creador)}` : ''
        const text =
          `Nueva tarea${de}:\n\n${formatTarea(tarea)}` +
          (tarea.descripcion ? `\n\n${tarea.descripcion.slice(0, 600)}` : '')
        const ok = await tgSendKb(token, p.telegram_chat_id!, text, [
          [{ text: 'Marcar como hecha', callback_data: `hecho:${tarea.id}` }],
          [{ text: 'Ver mis tareas', url: `${APP_URL}/mi-trabajo` }],
        ])
        if (ok) enviados++
      }
      return json(req, { ok: true, enviados })
    }

    // ── Completada: avisar al creador ────────────────────────────────────────
    if (body.evento === 'completada' && body.tarea_id) {
      const tarea = await cargarTarea(body.tarea_id)
      if (!tarea?.created_by) return json(req, { ok: true, skipped: 'sin creador' })
      if (body.completada_por && body.completada_por === tarea.created_by) {
        return json(req, { ok: true, skipped: 'la completó el mismo creador' })
      }

      const [creador] = await perfiles([tarea.created_by])
      const [completador] = await perfiles(body.completada_por ? [body.completada_por] : [])
      // Marco puede no haber vinculado su perfil: se usa el chat fijo del director.
      const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null
      const chat = creador?.telegram_chat_id ?? (creador?.rol === 'DIRECTOR' ? marcoChat : null)
      if (!chat) return json(req, { ok: true, skipped: 'creador sin Telegram' })

      const quien = completador ? nombreCorto(completador) : 'Alguien'
      const asunto = tarea.expediente?.caratula ?? tarea.expediente?.numero ?? ''
      await tgSendKb(token, chat,
        `${quien} terminó una tarea:\n"${tarea.titulo}"${asunto ? `\n${asunto.slice(0, 70)}` : ''}`,
        tarea.expediente ? [[{ text: 'Ver expediente', url: `${APP_URL}/expedientes/${tarea.expediente.id}` }]] : undefined,
      )
      return json(req, { ok: true })
    }

    // ── Diario: pendientes de cada usuario vinculado ─────────────────────────
    if (body.evento === 'diario') {
      const { data } = await admin.from('profiles')
        .select('id, nombre, apellido, rol, telegram_chat_id')
        .eq('activo', true)
        .not('telegram_chat_id', 'is', null)
      let enviados = 0
      for (const p of (data ?? []) as Perfil[]) {
        const tareas = await listarPendientes(admin, p.id)
        if (tareas.length === 0) continue
        const { text, keyboard } = formatLista(
          tareas,
          `Buen día, ${p.nombre ?? ''}. Tenés ${tareas.length} ${tareas.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}:`,
        )
        if (await tgSendKb(token, p.telegram_chat_id!, text, keyboard)) enviados++
      }
      return json(req, { ok: true, enviados })
    }

    return json(req, { error: 'evento inválido' }, 400)
  } catch (err) {
    console.error('[tareas-telegram]', err)
    return json(req, { error: err instanceof Error ? err.message : 'error interno' }, 500)
  }
})
