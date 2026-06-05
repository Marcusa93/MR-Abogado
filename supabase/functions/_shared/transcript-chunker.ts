// ─── Chunker para transcripts de audiencias ──────────────────────────────────
// Texto de transcripción de Whisper viene sin estructura (sin headers ni
// secciones). Usamos un chunker por caracteres con overlap, respetando
// fronteras de oración cuando es posible.

const TARGET_CHARS = 1800   // ~450 tokens ≈ 0.6 KB de embedding cada uno
const OVERLAP_CHARS = 200   // continuidad semántica entre chunks contiguos
const MIN_CHUNK_CHARS = 200 // descarta colas demasiado cortas

export interface TranscriptChunk {
  index: number
  content: string
}

/**
 * Divide el transcript en chunks de ~TARGET_CHARS con overlap. Intenta cortar
 * en finales de oración (. ! ?) para no partir frases. Si una oración es
 * más larga que TARGET_CHARS, corta duro por carácter.
 */
export function chunkTranscript(text: string): TranscriptChunk[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return []
  if (clean.length <= TARGET_CHARS) {
    return [{ index: 0, content: clean }]
  }

  const chunks: TranscriptChunk[] = []
  let cursor = 0
  let idx = 0

  while (cursor < clean.length) {
    const remaining = clean.length - cursor
    if (remaining <= TARGET_CHARS) {
      const tail = clean.slice(cursor).trim()
      if (tail.length >= MIN_CHUNK_CHARS || chunks.length === 0) {
        chunks.push({ index: idx, content: tail })
      }
      break
    }

    // Busco el último final de oración dentro de la ventana
    const windowEnd = cursor + TARGET_CHARS
    const window = clean.slice(cursor, windowEnd)
    const sentenceEnds = [...window.matchAll(/[.!?](?=\s|$)/g)]
    const lastEnd = sentenceEnds.length > 0
      ? cursor + (sentenceEnds[sentenceEnds.length - 1].index ?? 0) + 1
      : windowEnd

    const chunkText = clean.slice(cursor, lastEnd).trim()
    if (chunkText.length > 0) {
      chunks.push({ index: idx, content: chunkText })
      idx++
    }

    // Avanzo, respetando overlap
    const nextCursor = Math.max(cursor + MIN_CHUNK_CHARS, lastEnd - OVERLAP_CHARS)
    if (nextCursor <= cursor) break // safety: no infinito
    cursor = nextCursor
  }

  return chunks
}
