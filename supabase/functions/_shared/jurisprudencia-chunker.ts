// ─────────────────────────────────────────────────────────────────────────
// Chunker para jurisprudencia (sentencias, autos, fallos plenarios).
//
// A diferencia de normativa (artículos numerados), un fallo tiene tres
// macro-secciones que querés mantener separadas en el índice:
//
//   1. Encabezado: carátula, tribunal, "Y VISTOS:", planteo del recurso.
//   2. Considerandos: razonamiento del tribunal, citas, doctrina.
//   3. Resuelve / Fallo: dispositivo final.
//
// Mantener la metadata.seccion permite al RAG distinguir entre "qué dijo el
// tribunal" (considerandos) y "qué decidió" (resuelve) cuando armás un
// escrito. Eso a un abogado le importa muchísimo.
// ─────────────────────────────────────────────────────────────────────────

export type SeccionFallo = 'encabezado' | 'considerandos' | 'resuelve' | 'otro'

export interface JurisChunk {
  contenido: string
  metadata: { seccion: SeccionFallo }
}

const RE_CONSIDERANDO = /(?:^|\n)\s*(?:Y\s+)?CONSIDERANDO\s*[:;.]?|(?:^|\n)\s*RESULTANDO\s*[:;.]?/i
const RE_RESUELVE = /(?:^|\n)\s*(?:POR\s+ELLO[,;.\s]|EL\s+TRIBUNAL\s+RESUELVE|SE\s+RESUELVE|RESUELVO|RESUELVE\s*[:;.]?|FALLA\s*[:;.]?|FALLO\s*[:;.]?|SENTENCIA\b)/i

const MAX_CHUNK = 1200
const MIN_CHUNK = 200
const OVERLAP = 150

// ─── Split por secciones del fallo ──────────────────────────────────────
function splitSecciones(texto: string): Array<{ texto: string; seccion: SeccionFallo }> {
  const out: Array<{ texto: string; seccion: SeccionFallo }> = []
  const consid = texto.match(RE_CONSIDERANDO)
  const resuelve = texto.match(RE_RESUELVE)

  const idxConsid = consid?.index ?? -1
  let idxResuelve = resuelve?.index ?? -1
  // Si "RESUELVE" aparece antes de "CONSIDERANDO", probablemente es un falso
  // positivo (ej. una cita dentro del encabezado). Ignorar.
  if (idxResuelve >= 0 && idxConsid >= 0 && idxResuelve < idxConsid) {
    idxResuelve = -1
  }

  if (idxConsid < 0 && idxResuelve < 0) {
    // No detectó estructura. Tratar todo como "otro".
    out.push({ texto: texto.trim(), seccion: 'otro' })
    return out
  }

  if (idxConsid > 0) {
    const enc = texto.slice(0, idxConsid).trim()
    if (enc.length >= MIN_CHUNK / 2) out.push({ texto: enc, seccion: 'encabezado' })
  }

  if (idxConsid >= 0 && idxResuelve > idxConsid) {
    const conside = texto.slice(idxConsid, idxResuelve).trim()
    if (conside) out.push({ texto: conside, seccion: 'considerandos' })
    const res = texto.slice(idxResuelve).trim()
    if (res) out.push({ texto: res, seccion: 'resuelve' })
  } else if (idxConsid >= 0) {
    const conside = texto.slice(idxConsid).trim()
    if (conside) out.push({ texto: conside, seccion: 'considerandos' })
  } else if (idxResuelve >= 0) {
    const enc = texto.slice(0, idxResuelve).trim()
    if (enc) out.push({ texto: enc, seccion: 'encabezado' })
    const res = texto.slice(idxResuelve).trim()
    if (res) out.push({ texto: res, seccion: 'resuelve' })
  }

  return out
}

// ─── Sub-split de una sección larga en piezas con overlap ───────────────
function splitConOverlap(s: string, maxLen: number, overlap: number): string[] {
  if (s.length <= maxLen) return [s]
  const out: string[] = []
  let start = 0
  while (start < s.length) {
    const end = Math.min(start + maxLen, s.length)
    let cut = end
    if (end < s.length) {
      // buscar bordes naturales (fin de párrafo > fin de oración > espacio)
      const window = s.slice(start, end)
      const paraEnd = window.lastIndexOf('\n\n')
      const sentEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'))
      if (paraEnd > maxLen * 0.5) cut = start + paraEnd + 2
      else if (sentEnd > maxLen * 0.5) cut = start + sentEnd + 1
    }
    const piece = s.slice(start, cut).trim()
    if (piece.length >= MIN_CHUNK / 2) out.push(piece)
    if (cut >= s.length) break
    start = Math.max(cut - overlap, start + 1)
  }
  return out
}

// ─── API pública ────────────────────────────────────────────────────────
export function chunkJurisprudencia(textoRaw: string): JurisChunk[] {
  const texto = textoRaw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (texto.length < MIN_CHUNK) {
    return texto.length > 0
      ? [{ contenido: texto, metadata: { seccion: 'otro' } }]
      : []
  }

  const secciones = splitSecciones(texto)
  const chunks: JurisChunk[] = []
  for (const s of secciones) {
    const piezas = splitConOverlap(s.texto, MAX_CHUNK, OVERLAP)
    for (const p of piezas) {
      chunks.push({ contenido: p, metadata: { seccion: s.seccion } })
    }
  }
  return chunks
}
