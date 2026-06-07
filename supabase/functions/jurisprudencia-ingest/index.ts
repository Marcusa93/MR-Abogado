// ─────────────────────────────────────────────────────────────────────────
// Edge function: jurisprudencia-ingest
//
// Ingesta un fallo en el corpus RAG de jurisprudencia. Acepta tres modos:
//
//   {mode: "url",    url: "https://servicios.infoleg.gob.ar/.../verNorma.do?id=N"}
//   {mode: "paste",  texto: "...", caratula: "...", tribunal: "...", ...}
//   {mode: "upload", file_path: "<bucket-path>", file_name, mime_type}
//
// Pipeline común a los tres modos:
//   texto crudo → chunkJurisprudencia → embeddings → jurisprudencia_chunks
//
// Para URL, llama a legal-lookup.getDocument() que ya sabe extraer texto
// de InfoLEG y SAIJ (vía proxy). Para paste, va directo. Para upload, baja
// del bucket y extrae con unpdf/mammoth.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import mammoth from 'npm:mammoth@1.7.2'
import { Buffer } from 'node:buffer'
import { corsHeaders } from '../_shared/cors.ts'
import { chunkJurisprudencia } from '../_shared/jurisprudencia-chunker.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_BATCH_SIZE = 32

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Detecta service_role decodificando el claim del JWT (sin validar firma).
function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch { return null }
}

// ─── Detección de fuente desde URL ──────────────────────────────────────
function detectarFuente(url: string): { source: string; sourceDocId: string } | null {
  // InfoLEG: https://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=NNN
  const infoleg = url.match(/servicios\.infoleg\.gob\.ar\/infolegInternet\/verNorma\.do[^"\s]*[?&]id=(\d+)/i)
  if (infoleg) return { source: 'infoleg', sourceDocId: infoleg[1] }

  // SAIJ: https://www.saij.gob.ar/<uuid> o /detalle?...id=<uuid>
  const saij = url.match(/saij\.gob\.ar\/(?:detalle[^?]*\?[^#]*id=)?([a-z0-9-]{20,})/i)
  if (saij) return { source: 'saij', sourceDocId: saij[1] }

  return null
}

// ─── Extracción de texto desde archivo ──────────────────────────────────
async function extractFromPdf(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

async function extractFromDocx(buffer: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return result.value
}

async function extractTextFromFile(buffer: Uint8Array, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase()
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return extractFromPdf(buffer)
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    lower.endsWith('.docx') || lower.endsWith('.doc')
  ) {
    return extractFromDocx(buffer)
  }
  if (mime.startsWith('text/') || lower.endsWith('.txt')) {
    return new TextDecoder('utf-8').decode(buffer)
  }
  throw new Error(`Mime type no soportado: ${mime}`)
}

// ─── Embeddings ─────────────────────────────────────────────────────────
async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Jurisprudencia',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter embeddings ${res.status}: ${txt.slice(0, 300)}`)
  }
  const payload = await res.json() as { data: { embedding: number[]; index: number }[] }
  return payload.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { ok: false, error: 'No autorizado' }, 401)
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const isServiceRole = token === serviceKey || decodeJwtRole(token) === 'service_role'

  const admin = createClient(supabaseUrl, serviceKey)
  const body = await req.json().catch(() => null) as {
    mode?: 'url' | 'paste' | 'upload'
    url?: string
    texto?: string
    file_path?: string
    file_name?: string
    mime_type?: string
    caratula?: string
    tribunal?: string
    jurisdiccion?: string
    fecha?: string
    tipo?: string
    numero?: string
    sumario?: string
    on_behalf_of_user_id?: string
  } | null

  // Resolver user: si viene service_role usamos on_behalf_of_user_id.
  let userId: string
  if (isServiceRole) {
    if (!body?.on_behalf_of_user_id) {
      return json(req, { ok: false, error: 'service_role requiere on_behalf_of_user_id' }, 400)
    }
    userId = body.on_behalf_of_user_id
  } else {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json(req, { ok: false, error: 'Token inválido' }, 401)
    userId = user.id
  }
  const user = { id: userId }

  if (!body || !body.mode) return json(req, { ok: false, error: 'Body requiere { mode, ... }' }, 400)
  if (!['url', 'paste', 'upload'].includes(body.mode)) {
    return json(req, { ok: false, error: `mode inválido: ${body.mode}` }, 400)
  }

  // Metadata acumulada con prioridad: lo que vino en el body > lo que detectó la fuente
  const meta: Record<string, unknown> = {
    caratula: body.caratula ?? null,
    tribunal: body.tribunal ?? null,
    jurisdiccion: body.jurisdiccion ?? null,
    fecha: body.fecha ?? null,
    tipo: body.tipo ?? 'sentencia',
    numero: body.numero ?? null,
    sumario: body.sumario ?? null,
    source: 'manual_paste',
    source_doc_id: null,
    source_url: null,
    source_file_path: null,
    source_file_name: null,
    source_mime_type: null,
  }

  let texto = ''

  try {
    if (body.mode === 'paste') {
      if (!body.texto || body.texto.trim().length < 100) {
        return json(req, { ok: false, error: 'texto muy corto (mínimo 100 chars)' }, 400)
      }
      texto = body.texto.trim()
      meta.source = 'manual_paste'
      if (!meta.caratula) meta.caratula = 'Fallo (sin carátula)'
    }
    else if (body.mode === 'url') {
      if (!body.url) return json(req, { ok: false, error: 'url requerida' }, 400)
      const detect = detectarFuente(body.url)
      if (!detect) return json(req, { ok: false, error: 'Fuente no reconocida. Soportadas: InfoLEG (servicios.infoleg.gob.ar/verNorma.do?id=N), SAIJ (saij.gob.ar/<uuid>).' }, 400)

      const lookupRes = await fetch(`${supabaseUrl}/functions/v1/legal-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          source: detect.source,
          tool: 'getDocument',
          args: { source_doc_id: detect.sourceDocId },
          on_behalf_of_user_id: user.id,
        }),
      })
      const lookupData = await lookupRes.json()
      if (!lookupData?.ok) {
        return json(req, { ok: false, error: `Extracción falló (${detect.source}): ${lookupData?.error ?? 'desconocido'}` }, 502)
      }
      const doc = lookupData.result as Record<string, any>
      texto = (doc.texto_completo ?? '').toString().trim()
      meta.source = detect.source
      meta.source_doc_id = detect.sourceDocId
      meta.source_url = body.url
      meta.caratula  = meta.caratula  ?? doc.caratula ?? doc.titulo ?? 'Fallo importado'
      meta.tribunal  = meta.tribunal  ?? doc.tribunal
      meta.fecha     = meta.fecha     ?? doc.fecha
      meta.jurisdiccion = meta.jurisdiccion ?? doc.jurisdiccion
      meta.sumario   = meta.sumario   ?? doc.resumen
    }
    else if (body.mode === 'upload') {
      if (!body.file_path) return json(req, { ok: false, error: 'file_path requerido' }, 400)
      const { data: file, error: dlErr } = await admin
        .storage.from('jurisprudencia-originales').download(body.file_path)
      if (dlErr || !file) return json(req, { ok: false, error: `No se pudo bajar el archivo: ${dlErr?.message}` }, 400)
      const buffer = new Uint8Array(await file.arrayBuffer())
      const mime = body.mime_type ?? 'application/octet-stream'
      texto = (await extractTextFromFile(buffer, mime, body.file_name ?? body.file_path)).trim()
      meta.source = 'manual_upload'
      meta.source_file_path = body.file_path
      meta.source_file_name = body.file_name ?? body.file_path.split('/').pop() ?? null
      meta.source_mime_type = mime
      if (!meta.caratula) meta.caratula = meta.source_file_name ?? 'Fallo (sin carátula)'
    }

    if (texto.length < 100) {
      return json(req, { ok: false, error: 'Texto extraído muy corto (<100 chars). Revisá la fuente.' }, 400)
    }

    // Dedupe por checksum
    const checksum = await sha256Hex(texto)
    const { data: existing } = await admin
      .from('jurisprudencia_documentos')
      .select('id, caratula, chunk_count, estado')
      .eq('user_id', user.id)
      .eq('checksum', checksum)
      .maybeSingle()
    if (existing) {
      return json(req, {
        ok: true, already_exists: true,
        documento_id: existing.id,
        caratula: existing.caratula,
        chunk_count: existing.chunk_count,
        estado: existing.estado,
      })
    }

    // Insertar documento en estado 'procesando'
    const { data: doc, error: insErr } = await admin
      .from('jurisprudencia_documentos')
      .insert({
        user_id: user.id,
        caratula: meta.caratula,
        tribunal: meta.tribunal,
        jurisdiccion: meta.jurisdiccion,
        fecha: meta.fecha,
        tipo: meta.tipo,
        numero: meta.numero,
        sumario: meta.sumario,
        source: meta.source,
        source_doc_id: meta.source_doc_id,
        source_url: meta.source_url,
        source_file_path: meta.source_file_path,
        source_file_name: meta.source_file_name,
        source_mime_type: meta.source_mime_type,
        checksum,
        estado: 'procesando',
      })
      .select('id')
      .single()
    if (insErr || !doc) {
      return json(req, { ok: false, error: `Insertando documento: ${insErr?.message}` }, 500)
    }
    const docId = doc.id

    // Chunkear
    const chunks = chunkJurisprudencia(texto)
    if (chunks.length === 0) {
      await admin.from('jurisprudencia_documentos').update({
        estado: 'error', error_message: 'El chunker no produjo chunks.',
      }).eq('id', docId)
      return json(req, { ok: false, error: 'No se generaron chunks (texto muy corto o vacío).' }, 422)
    }

    // Embeddings en lotes
    const allEmbeddings: number[][] = []
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
      const embs = await createEmbeddings(batch.map(c => c.contenido))
      allEmbeddings.push(...embs)
    }

    // Insertar chunks
    const chunkRows = chunks.map((c, i) => ({
      documento_id: docId,
      user_id: user.id,
      chunk_uid: `${docId}:${i}:${crypto.randomUUID().slice(0, 8)}`,
      orden: i,
      contenido: c.contenido,
      embedding: allEmbeddings[i],
      metadata: {
        ...c.metadata,
        caratula: meta.caratula,
        tribunal: meta.tribunal,
        fecha: meta.fecha,
      },
    }))
    const { error: chunkErr } = await admin.from('jurisprudencia_chunks').insert(chunkRows)
    if (chunkErr) {
      await admin.from('jurisprudencia_documentos').update({
        estado: 'error', error_message: chunkErr.message,
      }).eq('id', docId)
      return json(req, { ok: false, error: `Insertando chunks: ${chunkErr.message}` }, 500)
    }

    // Marcar indexado
    await admin.from('jurisprudencia_documentos').update({
      estado: 'indexado',
      chunk_count: chunks.length,
    }).eq('id', docId)

    return json(req, {
      ok: true,
      documento_id: docId,
      caratula: meta.caratula,
      chunk_count: chunks.length,
      source: meta.source,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(req, { ok: false, error: msg }, 500)
  }
})
