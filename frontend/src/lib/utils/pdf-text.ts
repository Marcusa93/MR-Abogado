// Extracción de texto de un PDF en el browser usando pdfjs-dist.
// Lazy-loaded para no inflar el bundle inicial.

const MAX_CHARS = 30_000 // ~7-8K tokens, controla costo de IA

export interface PdfTextResult {
  text: string
  pages: number
  truncated: boolean
}

let workerInitialized = false

async function ensureWorker() {
  if (workerInitialized) return
  const pdfjs = await import('pdfjs-dist')
  // Vite-compatible worker URL
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  workerInitialized = true
}

export async function extractPdfText(blobOrUrl: Blob | string): Promise<PdfTextResult> {
  await ensureWorker()
  const pdfjs = await import('pdfjs-dist')

  let data: ArrayBuffer
  if (typeof blobOrUrl === 'string') {
    const res = await fetch(blobOrUrl)
    data = await res.arrayBuffer()
  } else {
    data = await blobOrUrl.arrayBuffer()
  }

  const pdf = await pdfjs.getDocument({ data }).promise
  const parts: string[] = []
  let totalLen = 0
  let truncated = false

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (totalLen + pageText.length > MAX_CHARS) {
      const remaining = MAX_CHARS - totalLen
      if (remaining > 0) parts.push(pageText.slice(0, remaining))
      truncated = true
      break
    }
    parts.push(pageText)
    totalLen += pageText.length + 1
  }

  return {
    text: parts.join('\n\n'),
    pages: pdf.numPages,
    truncated,
  }
}
