// ─────────────────────────────────────────────────────────────────────────────
// Edge function: normativa-ingest
//
// Body: { documento_id: string }
//
// Flujo:
//   1. Valida que el documento pertenezca al usuario que llama.
//   2. Marca documento como 'procesando' y responde 202.
//   3. En background (EdgeRuntime.waitUntil):
//      - Descarga el archivo del bucket normativa-originales (service role).
//      - Extrae texto (PDF → unpdf, DOCX → mammoth).
//      - Chunkea por ARTÍCULO N (regex AR), fallback a secciones.
//      - Genera embeddings en lotes (OpenAI text-embedding-3-small vía OpenRouter).
//      - Inserta chunks en normativa_chunks.
//      - Actualiza estado a 'indexado' (o 'error' con mensaje).
//
// Nota: chunker portado de github.com/DIA-SMT/contadurIA — ver
// /docs/sprint-normativa-1.md para la genealogía.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import mammoth from 'npm:mammoth@1.8.0'
import { Buffer } from 'node:buffer'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_BATCH_SIZE = 32
const MAX_CHUNK_CHARS = 16000
const MIN_CHUNK_CHARS = 100

// ── Chunker ────────────────────────────────────────────────────────────────

const ARTICLE_LINE_REGEX = /^ART[ÍI]CULO\s+((?:\d+|[IVXLCDM]+)(?:\s*[°º])?(?:\s*BIS)?(?:\s+[A-Z])?)\s*[:.\-)]?\s*/i
const HEADING_LINE_REGEX = /^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.\-,()]{4,80}$/

interface Chunk {
  contenido: string
  metadata: {
    articulo?: string
    seccion?: string
    parte?: string
    [k: string]: unknown
  }
}

function cleanText(raw: string): string {
  return raw
    // Reconstruir palabras partidas tipo "A R T I C U L O"
    .replace(/\bA\s+R\s+T\s+[ÍI]?\s*C\s+U\s+L\s+O\b/gi, 'ARTICULO')
    .replace(/\bArt\.\s*/gi, 'ARTICULO ')
    .replace(/\r\n?/g, '\n')
    // Quitar comillas/guiones tipográficos extraños
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    // Colapsar espacios y saltos múltiples
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ArticleHit {
  raw: string
  numero: string
  start: number
}

function findArticleHits(text: string): ArticleHit[] {
  const hits: ArticleHit[] = []
  const lines = text.split('\n')
  let offset = 0
  for (const line of lines) {
    const m = line.match(ARTICLE_LINE_REGEX)
    if (m) {
      hits.push({
        raw: line,
        numero: m[1].toUpperCase().replace(/\s+/g, ' ').trim(),
        start: offset,
      })
    }
    offset += line.length + 1 // +1 por el \n
  }
  return hits
}

function arabicValue(numero: string): number | null {
  // numero ya viene normalizado en mayúsculas, sin BIS, etc.
  const m = numero.match(/^(\d+)/)
  if (m) return parseInt(m[1], 10)
  // Numeral romano simple
  const roman = numero.match(/^([IVXLCDM]+)/)
  if (roman) {
    const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
    let total = 0, prev = 0
    for (const ch of roman[1]) {
      const v = map[ch]
      if (!v) return null
      total += v <= prev ? v : v - 2 * prev
      prev = v
    }
    return total
  }
  return null
}

// Descarta encabezados espurios exigiendo secuencia monotónica (saltos ≤ 5)
function filterArticleHits(hits: ArticleHit[]): ArticleHit[] {
  if (hits.length < 2) return hits
  const out: ArticleHit[] = []
  let lastValid: number | null = null
  for (const h of hits) {
    const v = arabicValue(h.numero)
    if (v === null) continue
    if (lastValid === null) {
      out.push(h); lastValid = v; continue
    }
    if (v >= lastValid && v - lastValid <= 5) {
      out.push(h); lastValid = v
    } else if (v === lastValid) {
      // BIS, repeticiones
      out.push(h)
    }
  }
  return out
}

function chunkByArticles(text: string, hits: ArticleHit[]): Chunk[] {
  const chunks: Chunk[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].start
    const end = i + 1 < hits.length ? hits[i + 1].start : text.length
    const contenido = text.slice(start, end).trim()
    if (contenido.length < MIN_CHUNK_CHARS) continue
    chunks.push({
      contenido,
      metadata: { articulo: hits[i].numero },
    })
  }
  return chunks
}

function chunkBySections(text: string): Chunk[] {
  const lines = text.split('\n')
  const sections: { titulo: string; start: number }[] = []
  let offset = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length >= 4 && trimmed.length <= 80 && HEADING_LINE_REGEX.test(trimmed)) {
      sections.push({ titulo: trimmed, start: offset })
    }
    offset += line.length + 1
  }
  if (sections.length < 2) {
    // Fallback total: 1 solo chunk con todo
    return text.length >= MIN_CHUNK_CHARS ? [{ contenido: text.trim(), metadata: {} }] : []
  }
  const chunks: Chunk[] = []
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].start
    const end = i + 1 < sections.length ? sections[i + 1].start : text.length
    const contenido = text.slice(start, end).trim()
    if (contenido.length < MIN_CHUNK_CHARS) continue
    chunks.push({ contenido, metadata: { seccion: sections[i].titulo } })
  }
  return chunks
}

function enforceMaxChunkSize(chunks: Chunk[]): Chunk[] {
  const out: Chunk[] = []
  for (const c of chunks) {
    if (c.contenido.length <= MAX_CHUNK_CHARS) { out.push(c); continue }
    const parts = splitLargeChunk(c.contenido)
    parts.forEach((p, i) => {
      out.push({
        contenido: p,
        metadata: { ...c.metadata, parte: `${i + 1}/${parts.length}` },
      })
    })
  }
  return out
}

function splitLargeChunk(content: string): string[] {
  const parts: string[] = []
  let remaining = content
  while (remaining.length > MAX_CHUNK_CHARS) {
    let cut = MAX_CHUNK_CHARS
    // Intentar cortar en \n\n → \n → '. '
    const slice = remaining.slice(0, MAX_CHUNK_CHARS)
    const lastPara = slice.lastIndexOf('\n\n')
    const lastNL = slice.lastIndexOf('\n')
    const lastDot = slice.lastIndexOf('. ')
    if (lastPara > MAX_CHUNK_CHARS * 0.5) cut = lastPara
    else if (lastNL > MAX_CHUNK_CHARS * 0.5) cut = lastNL
    else if (lastDot > MAX_CHUNK_CHARS * 0.5) cut = lastDot + 1
    parts.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining.length > 0) parts.push(remaining)
  return parts
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function deduplicateChunks(chunks: Chunk[]): Promise<Chunk[]> {
  const seen = new Set<string>()
  const out: Chunk[] = []
  for (const c of chunks) {
    const key = await sha256(`${c.metadata.articulo ?? ''}::${c.metadata.seccion ?? ''}::${c.contenido.toLowerCase().replace(/\s+/g, ' ')}`)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

async function buildChunks(rawText: string): Promise<Chunk[]> {
  const text = cleanText(rawText)
  const hits = filterArticleHits(findArticleHits(text))
  const base = hits.length >= 2 ? chunkByArticles(text, hits) : chunkBySections(text)
  const sized = enforceMaxChunkSize(base)
  return deduplicateChunks(sized)
}

// ── Extracción de texto ────────────────────────────────────────────────────

async function extractFromPdf(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n') : text
}

async function extractFromDocx(buffer: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return result.value
}

async function extractTextFromFile(buffer: Uint8Array, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase()
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    return extractFromPdf(buffer)
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    return extractFromDocx(buffer)
  }
  if (mime === 'text/plain' || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }
  if (mime === 'application/msword' || lower.endsWith('.doc')) {
    throw new Error('Formato .doc legacy no soportado: convertí a .docx, PDF nativo o .txt')
  }
  throw new Error(`Mime type no soportado: ${mime}`)
}

// ── Embeddings ──────────────────────────────────────────────────────────────

async function createEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://mr-abogado-system.vercel.app',
      'X-Title': 'MR Abogado Normativa',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter embeddings ${res.status}: ${txt.slice(0, 300)}`)
  }
  const payload = await res.json() as { data: { embedding: number[]; index: number }[] }
  // Ordenar por index por las dudas (OpenAI los devuelve ordenados, pero defensivo)
  return payload.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

// ── Pipeline principal ─────────────────────────────────────────────────────

async function processDocument(documentoId: string, apiKey: string): Promise<void> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1) Marcar procesando
    await admin.from('normativa_documentos').update({
      estado: 'procesando', error_message: null, updated_at: new Date().toISOString(),
    }).eq('id', documentoId)

    // 2) Traer documento
    const { data: doc, error: docErr } = await admin
      .from('normativa_documentos')
      .select('id, user_id, titulo, tipo, numero, jurisdiccion, source_file_path, source_file_name, source_mime_type')
      .eq('id', documentoId)
      .single()
    if (docErr || !doc) throw new Error(`Documento no encontrado: ${docErr?.message}`)

    // 3) Descargar archivo
    const { data: file, error: dlErr } = await admin
      .storage.from('normativa-originales').download(doc.source_file_path)
    if (dlErr || !file) throw new Error(`No se pudo descargar el archivo: ${dlErr?.message}`)
    const buffer = new Uint8Array(await file.arrayBuffer())

    // 4) Extraer texto
    const rawText = await extractTextFromFile(buffer, doc.source_mime_type, doc.source_file_name)
    if (!rawText || rawText.trim().length < 200) {
      throw new Error('No se pudo extraer texto del documento. ¿Es un PDF escaneado? Solo aceptamos PDFs nativamente digitales.')
    }

    // 5) Chunkear
    const chunks = await buildChunks(rawText)
    if (chunks.length === 0) {
      throw new Error('No se generaron chunks. El documento puede estar vacío o tener formato no soportado.')
    }

    // 6) Embeddings en lotes
    const rows: {
      documento_id: string; user_id: string; chunk_uid: string; orden: number;
      contenido: string; embedding: number[]; metadata: Record<string, unknown>;
    }[] = []

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
      const embeddings = await createEmbeddings(batch.map(c => c.contenido), apiKey)
      for (let j = 0; j < batch.length; j++) {
        const idx = i + j
        rows.push({
          documento_id: doc.id,
          user_id: doc.user_id,
          chunk_uid: `${doc.id}:${idx + 1}:${crypto.randomUUID().slice(0, 8)}`,
          orden: idx + 1,
          contenido: batch[j].contenido,
          embedding: embeddings[j],
          metadata: {
            ...batch[j].metadata,
            tipo: doc.tipo,
            numero: doc.numero,
            jurisdiccion: doc.jurisdiccion,
            titulo_documento: doc.titulo,
          },
        })
      }
    }

    // 7) Insertar chunks (limpiar previos por si es reindexación)
    await admin.from('normativa_chunks').delete().eq('documento_id', doc.id)
    const { error: insErr } = await admin.from('normativa_chunks').insert(rows)
    if (insErr) throw new Error(`Insert chunks: ${insErr.message}`)

    // 8) Marcar indexado
    await admin.from('normativa_documentos').update({
      estado: 'indexado',
      chunk_count: rows.length,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', doc.id)

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('normativa_documentos').update({
      estado: 'error',
      error_message: msg.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', documentoId)
  }
}

// ── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY no configurada' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json() as { documento_id?: string }
    if (!body.documento_id) {
      return new Response(JSON.stringify({ error: 'documento_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validar ownership con RLS implícito
    const { data: doc, error: docErr } = await userClient
      .from('normativa_documentos')
      .select('id')
      .eq('id', body.documento_id)
      .single()
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Documento no encontrado o sin acceso' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // @ts-ignore: EdgeRuntime es global en Supabase Edge Functions
    EdgeRuntime.waitUntil(processDocument(body.documento_id, apiKey))

    return new Response(JSON.stringify({ accepted: true, documento_id: body.documento_id }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
