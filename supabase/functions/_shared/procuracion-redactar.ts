// Redacta, cuando el abogado lo aprueba, un escrito que propuso la procuración
// automática. El procurador nunca redacta solo (gasta tokens y deja borradores
// que no se usan): deja la propuesta y esto la ejecuta.
//
// Lo usan:
//   - procuracion-procesar  { accion: 'redactar', evento_id | diligencia_id }  (botón en la app)
//   - telegram-escrito-webhook  callback "redactar:e:<id>" / "redactar:d:<id>"
//
// Propuestas:
//   - evento     → procuracion_eventos con escrito_tipo / escrito_instrucciones
//   - diligencia → pedido de reiteración de un oficio vencido sin respuesta

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export type Propuesta = { tipo: 'evento' | 'diligencia'; id: string }

export type RedactarResultado =
  | { ok: true; escrito_id: string; titulo: string; expediente_id: string; caratula: string | null; ya_existia: boolean }
  | { ok: false; error: string }

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

async function generar(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 120_000)
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/escritos-generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const data = await res.json().catch(() => null) as Record<string, unknown> | null
    return { ok: res.ok && !data?.error, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: err instanceof Error ? err.message : String(err) } }
  } finally {
    clearTimeout(t)
  }
}

async function agregarATarea(admin: Admin, tareaId: string | null, texto: string) {
  if (!tareaId) return
  const { data } = await admin.from('tareas').select('descripcion').eq('id', tareaId).maybeSingle()
  const actual = (data as { descripcion: string | null } | null)?.descripcion ?? ''
  await admin.from('tareas').update({ descripcion: `${texto}\n\n${actual}`.trim(), updated_at: new Date().toISOString() }).eq('id', tareaId)
}

/**
 * Redacta la propuesta a nombre de `firmanteId` (quien la aprueba). Si a su
 * perfil le faltan matrícula/domicilio/CUIT, firma `directorId`.
 * Idempotente: si ya se redactó, devuelve el borrador existente.
 */
export async function redactarPropuesta(
  admin: Admin,
  propuesta: Propuesta,
  firmanteId: string,
  directorId: string,
): Promise<RedactarResultado> {
  let expedienteId: string
  let pedido: Record<string, unknown>
  let tareaId: string | null
  let guardar: (escritoId: string) => PromiseLike<unknown>

  if (propuesta.tipo === 'evento') {
    const { data } = await admin.from('procuracion_eventos')
      .select('expediente_id, movement_id, escrito_tipo, escrito_instrucciones, escrito_id, tarea_id')
      .eq('id', propuesta.id).maybeSingle()
    const ev = data as {
      expediente_id: string; movement_id: string; escrito_tipo: string | null
      escrito_instrucciones: string | null; escrito_id: string | null; tarea_id: string | null
    } | null
    if (!ev) return { ok: false, error: 'No encontré la propuesta.' }
    if (!ev.escrito_tipo) return { ok: false, error: 'Esa actuación no tiene un escrito propuesto.' }
    expedienteId = ev.expediente_id
    tareaId = ev.tarea_id
    if (ev.escrito_id) {
      const { data: e } = await admin.from('escritos').select('titulo').eq('id', ev.escrito_id).maybeSingle()
      const { data: x } = await admin.from('expedientes').select('caratula').eq('id', expedienteId).maybeSingle()
      return { ok: true, escrito_id: ev.escrito_id, titulo: (e as { titulo?: string } | null)?.titulo ?? ev.escrito_tipo, expediente_id: expedienteId, caratula: (x as { caratula?: string } | null)?.caratula ?? null, ya_existia: true }
    }
    pedido = {
      expediente_id: ev.expediente_id,
      tipo: ev.escrito_tipo,
      instrucciones: ev.escrito_instrucciones ?? '',
      responde_a_movimiento_id: ev.movement_id,
    }
    guardar = (escritoId) => admin.from('procuracion_eventos').update({ escrito_id: escritoId }).eq('id', propuesta.id)
  } else {
    const { data } = await admin.from('procuracion_diligencias')
      .select('expediente_id, tipo, destinatario, fecha_envio, vence_respuesta, plazo_es_control, reiteracion_escrito_id, tarea_reiteracion_id')
      .eq('id', propuesta.id).maybeSingle()
    const d = data as {
      expediente_id: string; tipo: string; destinatario: string; fecha_envio: string | null
      vence_respuesta: string | null; plazo_es_control: boolean
      reiteracion_escrito_id: string | null; tarea_reiteracion_id: string | null
    } | null
    if (!d) return { ok: false, error: 'No encontré la diligencia.' }
    expedienteId = d.expediente_id
    tareaId = d.tarea_reiteracion_id
    if (d.reiteracion_escrito_id) {
      const { data: x } = await admin.from('expedientes').select('caratula').eq('id', expedienteId).maybeSingle()
      return { ok: true, escrito_id: d.reiteracion_escrito_id, titulo: 'Solicita reiteración de oficio', expediente_id: expedienteId, caratula: (x as { caratula?: string } | null)?.caratula ?? null, ya_existia: true }
    }
    pedido = {
      expediente_id: d.expediente_id,
      tipo: 'Solicita reiteración de oficio',
      instrucciones:
        `Solicitar que se reitere el ${d.tipo} a ${d.destinatario}, enviado el ${fechaCorta(d.fecha_envio)}, ` +
        `que no fue contestado (${d.plazo_es_control ? 'la fecha de control' : 'el plazo'} venció el ${fechaCorta(d.vence_respuesta)}). ` +
        'Pedir que se lo haga bajo apercibimiento de astreintes.',
    }
    guardar = (escritoId) => admin.from('procuracion_diligencias').update({ reiteracion_escrito_id: escritoId, updated_at: new Date().toISOString() }).eq('id', propuesta.id)
  }

  let r = await generar({ ...pedido, on_behalf_of_user_id: firmanteId })
  if (!r.ok && r.status === 412 && firmanteId !== directorId) {
    r = await generar({ ...pedido, on_behalf_of_user_id: directorId })
  }
  if (!r.ok || typeof r.data?.escrito_id !== 'string') {
    return { ok: false, error: String(r.data?.error ?? `No se pudo redactar (${r.status})`) }
  }
  const escritoId = r.data.escrito_id
  await guardar(escritoId)
  const titulo = String((r.data.contenido as { titulo?: string } | undefined)?.titulo ?? pedido.tipo)
  await agregarATarea(admin, tareaId, `Borrador "${titulo}" listo en la solapa Escritos: revisalo, firmalo y presentalo.`)
  const { data: x } = await admin.from('expedientes').select('caratula').eq('id', expedienteId).maybeSingle()
  return { ok: true, escrito_id: escritoId, titulo, expediente_id: expedienteId, caratula: (x as { caratula?: string } | null)?.caratula ?? null, ya_existia: false }
}
