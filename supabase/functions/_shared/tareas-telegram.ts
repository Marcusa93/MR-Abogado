// Helpers compartidos entre telegram-escrito-webhook y tareas-telegram:
// envío con botones, listado numerado de pendientes y marcar tarea como hecha.
//
// La numeración de la lista (1, 2, 3…) es la que usa "/hecho N", así que el
// orden tiene que ser el mismo en todos lados: listarPendientes() es la única
// fuente.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = SupabaseClient<any, any, any>

const TG_API = 'https://api.telegram.org'
export const APP_URL = 'https://app.marcorossi.com.ar'

export interface TgButton { text: string; callback_data?: string; url?: string }

export async function tgSendKb(token: string, chatId: number, text: string, keyboard?: TgButton[][]): Promise<boolean> {
  const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
  }).catch(() => null)
  return !!res?.ok
}

export async function tgAnswerCallback(token: string, callbackId: string, text: string) {
  await fetch(`${TG_API}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  }).catch(() => {})
}

export interface TareaPendiente {
  id: string
  titulo: string
  prioridad: string | null
  fecha_vencimiento: string | null
  created_at: string
  expediente: { id: string; caratula: string | null; numero: string | null } | null
  consulta: { id: string; nombre: string | null; apellido: string | null } | null
}

const PRIO_RANK: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }
export const PRIO_LABEL: Record<string, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }

/** Pendientes de un usuario, en el orden canónico (vencimiento → prioridad → antigüedad). */
export async function listarPendientes(admin: Admin, profileId: string): Promise<TareaPendiente[]> {
  const { data } = await admin.from('tareas')
    .select('id, titulo, prioridad, fecha_vencimiento, created_at, expediente:expedientes!tareas_expediente_id_fkey(id, caratula, numero), consulta:consultas!tareas_consulta_id_fkey(id, nombre, apellido)')
    .contains('asignados', [profileId])
    .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
    .limit(30)
  const rows = (data ?? []) as unknown as TareaPendiente[]
  return rows.sort((a, b) => {
    const fa = a.fecha_vencimiento ?? '9999-12-31'
    const fb = b.fecha_vencimiento ?? '9999-12-31'
    if (fa !== fb) return fa < fb ? -1 : 1
    const pa = PRIO_RANK[a.prioridad ?? 'MEDIA'] ?? 2
    const pb = PRIO_RANK[b.prioridad ?? 'MEDIA'] ?? 2
    if (pa !== pb) return pa - pb
    return a.created_at < b.created_at ? -1 : 1
  })
}

export function hoyAR(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "vence hoy" / "venció el 03/10" / "vence vie 10/10" */
export function vencimientoLabel(fecha: string | null): string {
  if (!fecha) return ''
  const f = fecha.slice(0, 10)
  const [y, m, d] = f.split('-').map(Number)
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const corto = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  const hoy = hoyAR()
  if (f === hoy) return 'vence HOY'
  if (f < hoy) return `VENCIDA (${corto})`
  return `vence ${dia} ${corto}`
}

export function asuntoLabel(t: Pick<TareaPendiente, 'expediente' | 'consulta'>): string {
  if (t.expediente) return (t.expediente.caratula ?? t.expediente.numero ?? 'Expediente').slice(0, 70)
  if (t.consulta) return `Consulta ${`${t.consulta.apellido ?? ''} ${t.consulta.nombre ?? ''}`.trim()}`
  return ''
}

/** Una tarea en texto plano (para avisos y listas). */
export function formatTarea(t: TareaPendiente, numero?: number): string {
  const head = `${numero !== undefined ? `${numero}. ` : ''}${t.titulo}`
  const meta = [PRIO_LABEL[t.prioridad ?? 'MEDIA'] ?? 'Media', vencimientoLabel(t.fecha_vencimiento)].filter(Boolean).join(' · ')
  const asunto = asuntoLabel(t)
  return `${head}\n   ${meta}${asunto ? `\n   ${asunto}` : ''}`
}

/** Lista numerada + un botón "Hecho N" por tarea. */
export function formatLista(tareas: TareaPendiente[], encabezado: string): { text: string; keyboard: TgButton[][] } {
  if (tareas.length === 0) {
    return { text: `${encabezado}\n\nNo tenés tareas pendientes.`, keyboard: [] }
  }
  const lineas = tareas.map((t, i) => formatTarea(t, i + 1))
  const text =
    `${encabezado}\n\n${lineas.join('\n\n')}\n\n` +
    'Cuando termines una, tocá su botón o respondé /hecho y el número (ej. /hecho 1).'
  const botones: TgButton[] = tareas.slice(0, 20).map((t, i) => ({ text: `Hecho ${i + 1}`, callback_data: `hecho:${t.id}` }))
  const keyboard: TgButton[][] = []
  for (let i = 0; i < botones.length; i += 4) keyboard.push(botones.slice(i, i + 4))
  keyboard.push([{ text: 'Abrir en la app', url: `${APP_URL}/mi-trabajo` }])
  return { text, keyboard }
}

/**
 * Marca la tarea como hecha si el usuario puede hacerlo (asignado o creador).
 * El trigger tareas_telegram_notify avisa al creador.
 */
export async function completarTarea(
  admin: Admin,
  tareaId: string,
  profileId: string,
  esDirector: boolean,
): Promise<{ ok: true; titulo: string } | { ok: false; error: string }> {
  const { data: t } = await admin.from('tareas')
    .select('id, titulo, estado, asignados, created_by')
    .eq('id', tareaId)
    .maybeSingle()
  const tarea = t as { id: string; titulo: string; estado: string; asignados: string[] | null; created_by: string | null } | null
  if (!tarea) return { ok: false, error: 'No encontré esa tarea.' }
  if (tarea.estado === 'COMPLETADA') return { ok: false, error: `"${tarea.titulo}" ya estaba marcada como hecha.` }
  const puede = esDirector || tarea.created_by === profileId || (tarea.asignados ?? []).includes(profileId)
  if (!puede) return { ok: false, error: 'Esa tarea no es tuya.' }

  const now = new Date().toISOString()
  const { error } = await admin.from('tareas')
    .update({ estado: 'COMPLETADA', completada_at: now, completada_por: profileId, updated_at: now })
    .eq('id', tareaId)
  if (error) return { ok: false, error: `No se pudo marcar: ${error.message}` }
  return { ok: true, titulo: tarea.titulo }
}

export function nombreCorto(p: { nombre: string | null; apellido: string | null } | null | undefined): string {
  return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim() || 'Alguien'
}

// ── Parser de /tarea: fecha y prioridad dentro de una línea ────────────────

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6,
}
// Conectores que preceden a la fecha y se borran junto con ella.
const CONECTOR_FECHA = String.raw`(?:(?:para|antes\s+del?|hasta\s+el|vence(?:\s+el)?|el)\s+)*`

export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function quitar(texto: string, m: RegExpExecArray): string {
  return (texto.slice(0, m.index) + ' ' + texto.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim()
}

export function parseFecha(texto: string, hoy: string): { fecha: string | null; resto: string } {
  const re = (p: string) => new RegExp(String.raw`(?:^|\s)${CONECTOR_FECHA}${p}(?=$|[\s,.])`, 'i')
  let m: RegExpExecArray | null

  if ((m = re(String.raw`pasado\s+ma[ñn]ana`).exec(texto))) return { fecha: sumarDias(hoy, 2), resto: quitar(texto, m) }
  if ((m = re(String.raw`ma[ñn]ana`).exec(texto))) return { fecha: sumarDias(hoy, 1), resto: quitar(texto, m) }
  if ((m = re('hoy').exec(texto))) return { fecha: hoy, resto: quitar(texto, m) }
  if ((m = re(String.raw`en\s+(\d{1,2})\s+d[ií]as`).exec(texto))) {
    return { fecha: sumarDias(hoy, Number(m[1])), resto: quitar(texto, m) }
  }
  if ((m = re(String.raw`(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)`).exec(texto))) {
    const objetivo = DIAS_SEMANA[m[1].toLowerCase()] ?? DIAS_SEMANA[m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
    const actual = new Date(`${hoy}T12:00:00Z`).getUTCDay()
    let delta = (objetivo - actual + 7) % 7
    if (delta === 0) delta = 7 // "el viernes" dicho un viernes = el próximo
    return { fecha: sumarDias(hoy, delta), resto: quitar(texto, m) }
  }
  if ((m = re(String.raw`(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?`).exec(texto))) {
    const dia = Number(m[1]); const mes = Number(m[2])
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let anio = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(hoy.slice(0, 4))
      let iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      // "15/01" dicho en diciembre = el año que viene. Una fecha pasada reciente
      // se deja como está (queda VENCIDA y se ve el error de tipeo).
      if (!m[3] && iso < sumarDias(hoy, -180)) { anio++; iso = `${anio}${iso.slice(4)}` }
      return { fecha: iso, resto: quitar(texto, m) }
    }
  }
  return { fecha: null, resto: texto }
}

export function parsePrioridad(texto: string): { prioridad: string | null; resto: string } {
  let m: RegExpExecArray | null
  // "prioridad alta" en cualquier lugar, o "urgente" (no es ambiguo)
  if ((m = /(?:^|\s)(?:prioridad|prio)\s+(urgente|alta|media|baja)(?=$|[\s,.])/i.exec(texto))) {
    return { prioridad: m[1].toUpperCase(), resto: quitar(texto, m) }
  }
  if ((m = /(?:^|\s)(urgente)(?=$|[\s,.])/i.exec(texto))) return { prioridad: 'URGENTE', resto: quitar(texto, m) }
  // alta/media/baja solo al final de la línea ("alta" puede ser parte del título)
  if ((m = /[\s,]+(alta|media|baja)[\s.,]*$/i.exec(texto))) return { prioridad: m[1].toUpperCase(), resto: quitar(texto, m) }
  return { prioridad: null, resto: texto }
}
