// Página pública para que el cliente suba la documentación que le pide el
// estudio, con el enlace (token) que se genera desde el expediente o la consulta.
// No requiere usuario: la seguridad es el token (48 hex, vence a los 30 días,
// revocable) y que solo se expone lo mínimo (primer nombre y la lista).
//
// POST { accion: 'info', token }
//   → { cliente, vence, items: [{ id, nombre, descripcion, obligatorio, estado }] }
// POST { accion: 'subir_url', token, item_id }
//   → { path, upload_token }  (subida directa a Storage con URL firmada)
// POST { accion: 'confirmar', token, item_id, path, nombre_original }
//   → registra el adjunto, marca el documento como recibido y avisa al estudio.
//
// Deploy con --no-verify-jwt.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

const BUCKET = 'adjuntos'
const MAX_BYTES = 25 * 1024 * 1024
const MAX_SUBIDAS_POR_ENLACE = 200

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Enlace {
  token: string
  expediente_id: string | null
  consulta_id: string | null
  created_by: string
  expires_at: string
  revocado_at: string | null
  subidas: number
}

async function cargarEnlace(admin: Admin, token: unknown): Promise<Enlace | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null
  const { data } = await admin.from('documentacion_enlaces')
    .select('token, expediente_id, consulta_id, created_by, expires_at, revocado_at, subidas')
    .eq('token', token).maybeSingle()
  const e = data as Enlace | null
  if (!e || e.revocado_at || new Date(e.expires_at).getTime() < Date.now()) return null
  return e
}

async function cargarItem(admin: Admin, enlace: Enlace, itemId: unknown) {
  if (typeof itemId !== 'string' || !/^[0-9a-f-]{36}$/.test(itemId)) return null
  let q = admin.from('documentos_requeridos').select('id, nombre, estado, expediente_id, consulta_id').eq('id', itemId)
  q = enlace.expediente_id ? q.eq('expediente_id', enlace.expediente_id) : q.eq('consulta_id', enlace.consulta_id)
  const { data } = await q.maybeSingle()
  return data as { id: string; nombre: string; estado: string; expediente_id: string | null; consulta_id: string | null } | null
}

function carpeta(enlace: Enlace): string {
  return enlace.expediente_id ? enlace.expediente_id : `consultas/${enlace.consulta_id}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405)

  try {
    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const enlace = await cargarEnlace(admin, body.token)
    if (!enlace) return json(req, { error: 'El enlace no es válido o venció. Pedile uno nuevo al estudio.' }, 404)

    // ── info ───────────────────────────────────────────────────────────────
    if (body.accion === 'info') {
      let cliente = ''
      if (enlace.expediente_id) {
        const { data } = await admin.from('expedientes').select('clientes(nombre)').eq('id', enlace.expediente_id).maybeSingle()
        cliente = ((data as { clientes?: { nombre?: string | null } | null } | null)?.clientes?.nombre ?? '').trim()
      } else {
        const { data } = await admin.from('consultas').select('nombre').eq('id', enlace.consulta_id).maybeSingle()
        cliente = ((data as { nombre?: string | null } | null)?.nombre ?? '').trim()
      }
      let q = admin.from('documentos_requeridos')
        .select('id, nombre, descripcion, obligatorio, estado')
        .neq('estado', 'no_aplica')
        .order('orden', { ascending: true }).order('created_at', { ascending: true })
      q = enlace.expediente_id ? q.eq('expediente_id', enlace.expediente_id) : q.eq('consulta_id', enlace.consulta_id)
      const { data: items } = await q
      return json(req, {
        cliente: cliente.split(/\s+/)[0] ?? '',
        vence: enlace.expires_at,
        items: items ?? [],
      })
    }

    // ── subir_url ──────────────────────────────────────────────────────────
    if (body.accion === 'subir_url') {
      if (enlace.subidas >= MAX_SUBIDAS_POR_ENLACE) return json(req, { error: 'Se alcanzó el máximo de archivos para este enlace.' }, 429)
      const item = await cargarItem(admin, enlace, body.item_id)
      if (!item) return json(req, { error: 'Documento no encontrado.' }, 404)
      const path = `${carpeta(enlace)}/cliente_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.pdf`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return json(req, { error: 'No se pudo preparar la subida.' }, 500)
      return json(req, { path: data.path, upload_token: data.token })
    }

    // ── confirmar ──────────────────────────────────────────────────────────
    if (body.accion === 'confirmar') {
      const item = await cargarItem(admin, enlace, body.item_id)
      if (!item) return json(req, { error: 'Documento no encontrado.' }, 404)
      const path = typeof body.path === 'string' ? body.path : ''
      const dir = carpeta(enlace)
      if (!path.startsWith(`${dir}/cliente_`) || path.includes('..')) return json(req, { error: 'Archivo inválido.' }, 400)

      // El archivo tiene que existir y no superar el tamaño máximo
      const nombreArchivo = path.slice(dir.length + 1)
      const { data: lista } = await admin.storage.from(BUCKET).list(dir, { search: nombreArchivo, limit: 1 })
      const obj = (lista ?? []).find((o) => o.name === nombreArchivo)
      if (!obj) return json(req, { error: 'No se recibió el archivo. Probá de nuevo.' }, 400)
      const tamano = Number((obj.metadata as { size?: number } | null)?.size ?? 0)
      if (tamano > MAX_BYTES) {
        await admin.storage.from(BUCKET).remove([path])
        return json(req, { error: 'El archivo supera los 25 MB.' }, 400)
      }

      let clienteId: string | null = null
      let responsable: string = enlace.created_by
      let caratula = ''
      if (enlace.expediente_id) {
        const { data } = await admin.from('expedientes')
          .select('cliente_id, abogado_responsable_id, caratula, numero').eq('id', enlace.expediente_id).maybeSingle()
        const e = data as { cliente_id: string | null; abogado_responsable_id: string | null; caratula: string | null; numero: string | null } | null
        clienteId = e?.cliente_id ?? null
        responsable = e?.abogado_responsable_id ?? responsable
        caratula = e?.caratula ?? e?.numero ?? ''
      } else {
        const { data } = await admin.from('consultas').select('nombre, apellido').eq('id', enlace.consulta_id).maybeSingle()
        const c = data as { nombre: string | null; apellido: string | null } | null
        caratula = `Consulta ${`${c?.apellido ?? ''} ${c?.nombre ?? ''}`.trim()}`
      }

      const nombreLimpio = item.nombre.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'Documento'
      const { data: adj, error: adjErr } = await admin.from('adjuntos').insert({
        expediente_id: enlace.expediente_id,
        consulta_id: enlace.expediente_id ? null : enlace.consulta_id,
        cliente_id: clienteId,
        nombre_archivo: `${nombreLimpio}.pdf`,
        tipo_mime: 'application/pdf',
        tamano_bytes: tamano || null,
        storage_path: path,
        categoria: 'documentacion',
        descripcion: `Subido por el cliente desde el enlace de documentación${typeof body.nombre_original === 'string' ? ` (archivo: ${body.nombre_original.slice(0, 120)})` : ''}`,
        uploaded_by: enlace.created_by,
      }).select('id').single()
      if (adjErr || !adj) return json(req, { error: 'No se pudo registrar el archivo.' }, 500)

      const ahora = new Date().toISOString()
      await admin.from('documentos_requeridos').update({
        estado: 'recibido', fuente: 'cliente', adjunto_id: (adj as { id: string }).id, recibido_at: ahora, updated_at: ahora,
      }).eq('id', item.id)
      await admin.from('documentacion_enlaces').update({ subidas: enlace.subidas + 1, ultimo_uso_at: ahora }).eq('token', enlace.token)

      // Aviso al responsable
      await admin.from('alertas').insert({
        tipo: 'CUSTOM',
        titulo: `El cliente subió: ${item.nombre}`,
        mensaje: caratula ? `${caratula.slice(0, 120)} — desde el enlace de documentación.` : 'Desde el enlace de documentación.',
        expediente_id: enlace.expediente_id,
        destinatario_id: responsable,
        prioridad: 'MEDIA',
        payload: {
          link: enlace.expediente_id ? `/expedientes/${enlace.expediente_id}?tab=documentos` : `/consultas/${enlace.consulta_id}`,
          documento_requerido_id: item.id,
        },
      })

      return json(req, { ok: true })
    }

    return json(req, { error: 'Acción inválida' }, 400)
  } catch (err) {
    console.error('[documentacion-publica]', err)
    return json(req, { error: 'Algo falló. Probá de nuevo en un rato.' }, 500)
  }
})
