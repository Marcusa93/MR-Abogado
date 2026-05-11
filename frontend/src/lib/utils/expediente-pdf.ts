// Generación de un PDF unificado del expediente:
//   1. Portada con metadata + partes + estado
//   2. Índice de actuaciones
//   3. Por cada actuación: título, fecha, resumen IA, cuerpo
//      Inmediatamente después, los PDFs adjuntos se insertan como páginas reales
//
// Sin tokens IA. Solo bandwidth (descarga PDFs vía sae-document edge function).

import { createClient } from '@/lib/supabase/client'

interface MovementRow {
  id: string
  external_id: string | null
  sae_case_id: string | null
  fecha: string
  titulo: string
  cuerpo: string | null
  tipo_movimiento: string
  ai_summary: string | null
  raw_payload: { jurisdiction_id?: number; archivos?: Array<Record<string, unknown>>; vinculos?: Array<Record<string, unknown>> } | null
  is_key: boolean | null
}

interface ExpedienteData {
  id: string
  numero: string | null
  caratula: string | null
  numero_sae: string | null
  fuero: string | null
  estado_interno: string | null
  observaciones: string | null
  ai_brief: string | null
  cliente: { nombre: string | null; apellido: string | null; dni: string | null } | null
}

export interface ProgressUpdate {
  stage: 'fetching' | 'bodies' | 'cover' | 'downloading' | 'merging' | 'finalizing' | 'done' | 'cancelled'
  current?: number
  total?: number
  message: string
  /** Bytes acumulados de adjuntos descargados (estimación running del tamaño final). */
  bytesSoFar?: number
}

export interface GenerateOptions {
  /** Si true, solo incluye actuaciones claves (is_key=true o auto-detectadas no excluidas). */
  onlyKeys?: boolean
  /** Permite cancelar la generación desde el llamador. */
  signal?: AbortSignal
}

export class CancelledError extends Error {
  constructor() {
    super('Generación cancelada por el usuario')
    this.name = 'CancelledError'
  }
}

function checkCancel(signal?: AbortSignal) {
  if (signal?.aborted) throw new CancelledError()
}

const KEY_TYPES = new Set(['sentencia', 'audiencia', 'intimacion', 'embargo', 'traslado', 'decreto', 'cedula'])

function isAutoKey(m: MovementRow): boolean {
  return KEY_TYPES.has(m.tipo_movimiento)
}

function passesKeyFilter(m: MovementRow): boolean {
  if (m.is_key === true) return true
  if (m.is_key === false) return false
  return isAutoKey(m)
}

// ─── Logo loader ──────────────────────────────────────────────────────────
// SVG → PNG via canvas. Cacheado en memoria para no re-renderizar.
let cachedLogoDataUrl: string | null = null
async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  try {
    const res = await fetch('/logo/mr-logo-azul.svg')
    if (!res.ok) return null
    const svgText = await res.text()
    const blob = new Blob([svgText], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    const w = 600
    const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.4
    const h = Math.round(w * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { URL.revokeObjectURL(url); return null }
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/png')
    URL.revokeObjectURL(url)
    cachedLogoDataUrl = dataUrl
    return dataUrl
  } catch {
    return null
  }
}

interface AttachmentRef {
  movementId: string
  movementTitle: string
  procid: string
  jurisdictionId: number
  histid: string
  fileName: string
}

function pickFileName(entry: Record<string, unknown>): string | null {
  const candidates = [entry.nombre, entry.name, entry.filename, entry.fileName, entry.label, entry.dscr]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

function extractAttachmentsFromMovement(m: MovementRow): { fileName: string; raw: Record<string, unknown> }[] {
  const rp = m.raw_payload
  if (!rp) return []
  const archivos = Array.isArray(rp.archivos) ? rp.archivos : []
  const vinculos = Array.isArray(rp.vinculos) ? rp.vinculos : []
  return [...archivos, ...vinculos]
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map(e => {
      const fileName = pickFileName(e)
      return fileName ? { fileName, raw: e } : null
    })
    .filter((x): x is { fileName: string; raw: Record<string, unknown> } => x !== null)
}

function formatDateAR(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function downloadAttachmentPdf(att: AttachmentRef, accessToken: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sae-document`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          procid: att.procid,
          jurisdictionId: att.jurisdictionId,
          histid: att.histid,
          fileName: att.fileName,
        }),
      },
    )
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export async function generateExpedientePdf(
  expedienteId: string,
  onProgress: (update: ProgressUpdate) => void,
  options: GenerateOptions = {},
): Promise<Blob> {
  // ── 1. Fetch data ─────────────────────────────────────────────────────
  onProgress({ stage: 'fetching', message: 'Obteniendo datos del expediente…' })
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) throw new Error('Sesión no encontrada')

  const { data: expRaw, error: expError } = await supabase
    .from('expedientes')
    .select(`
      id, numero, caratula, numero_sae, fuero, estado_interno, observaciones,
      ai_brief,
      cliente:clientes(nombre, apellido, dni)
    `)
    .eq('id', expedienteId)
    .single()
  if (expError || !expRaw) throw new Error('No se pudo cargar el expediente')

  const expData = expRaw as unknown as ExpedienteData & { cliente: ExpedienteData['cliente'] | ExpedienteData['cliente'][] }
  const expediente: ExpedienteData = {
    id: expData.id,
    numero: expData.numero,
    caratula: expData.caratula,
    numero_sae: expData.numero_sae,
    fuero: expData.fuero,
    estado_interno: expData.estado_interno,
    observaciones: expData.observaciones,
    ai_brief: expData.ai_brief,
    cliente: Array.isArray(expData.cliente) ? expData.cliente[0] : expData.cliente,
  }

  const { data: movsRaw, error: movsError } = await supabase
    .from('sae_movements')
    .select('id, external_id, sae_case_id, fecha, titulo, cuerpo, tipo_movimiento, ai_summary, raw_payload, is_key')
    .eq('expediente_id', expedienteId)
    .order('fecha', { ascending: true }) // chronological: from first onwards
  if (movsError) throw movsError

  const allMovements = (movsRaw ?? []) as unknown as MovementRow[]
  const movements = options.onlyKeys
    ? allMovements.filter(passesKeyFilter)
    : allMovements

  checkCancel(options.signal)

  // ── 1.5. Lazy-fetch de cuerpos faltantes ──────────────────────────────
  // En expedientes largos solo las primeras 30 tienen cuerpo guardado.
  // Bajamos en lotes lo que falte para que el PDF esté completo.
  const idsWithoutBody = movements
    .filter(m => !m.cuerpo?.trim() && m.external_id && m.sae_case_id)
    .map(m => m.id)

  if (idsWithoutBody.length > 0) {
    onProgress({
      stage: 'bodies',
      message: `Recuperando texto de ${idsWithoutBody.length} actuación${idsWithoutBody.length !== 1 ? 'es' : ''} (puede tardar un momento la primera vez)…`,
      total: idsWithoutBody.length,
    })

    // El edge function caps a 60 por llamada; iteramos en chunks
    const CHUNK = 60
    for (let i = 0; i < idsWithoutBody.length; i += CHUNK) {
      checkCancel(options.signal)
      const chunkIds = idsWithoutBody.slice(i, i + CHUNK)
      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sae-fetch-bodies`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              expediente_id: expedienteId,
              movement_ids: chunkIds,
            }),
            signal: options.signal,
          },
        )
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw new CancelledError()
        // Si falla, seguimos: el PDF se arma con lo que tengamos
        console.warn('[expediente-pdf] fetch-bodies failed', err)
      }
    }

    // Re-fetch movements with updated cuerpo
    const { data: refreshed } = await supabase
      .from('sae_movements')
      .select('id, external_id, sae_case_id, fecha, titulo, cuerpo, tipo_movimiento, ai_summary, raw_payload, is_key')
      .eq('expediente_id', expedienteId)
      .order('fecha', { ascending: true })
    const refreshedAll = (refreshed ?? []) as unknown as MovementRow[]
    const refreshedFiltered = options.onlyKeys ? refreshedAll.filter(passesKeyFilter) : refreshedAll
    // Replace movements in-place
    movements.length = 0
    movements.push(...refreshedFiltered)
  }

  checkCancel(options.signal)

  // Pre-load logo (in parallel with cover building)
  const logoDataUrlPromise = loadLogoDataUrl()

  // ── 2. Build cover with jspdf ──────────────────────────────────────────
  onProgress({ stage: 'cover', message: 'Generando portada e índice…' })
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 50
  const contentW = pageW - margin * 2

  // ── PORTADA ──
  // Brand color (azul Marco Rossi)
  const BRAND_R = 30, BRAND_G = 58, BRAND_B = 138 // ~#1e3a8a (deep blue)
  const ACCENT_R = 14, ACCENT_G = 165, ACCENT_B = 233 // ~#0ea5e9 (cyan)

  // Header band con logo + nombre estudio
  const logoDataUrl = await logoDataUrlPromise
  if (logoDataUrl) {
    try {
      const logoMaxW = 110
      const logoMaxH = 50
      pdf.addImage(logoDataUrl, 'PNG', margin, 50, logoMaxW, logoMaxH, undefined, 'FAST')
    } catch { /* if logo fails, just skip */ }
  }
  // Nombre del estudio a la derecha
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(BRAND_R, BRAND_G, BRAND_B)
  pdf.text('Marco Rossi', pageW - margin, 70, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(120)
  pdf.text('Estudio Jurídico', pageW - margin, 84, { align: 'right' })

  // Línea horizontal accent
  pdf.setDrawColor(BRAND_R, BRAND_G, BRAND_B)
  pdf.setLineWidth(1.5)
  pdf.line(margin, 120, pageW - margin, 120)

  // Tipo de documento (eyebrow)
  pdf.setTextColor(120)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(options.onlyKeys ? 'EXPEDIENTE · ACTUACIONES CLAVES' : 'EXPEDIENTE COMPLETO', margin, 145)

  // Título principal: número
  pdf.setTextColor(0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(28)
  pdf.text(expediente.numero ?? 'Sin número', margin, 178)

  // Carátula (subtítulo grande)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  pdf.setTextColor(70)
  const caratulaLines = pdf.splitTextToSize(expediente.caratula ?? 'Sin carátula', contentW)
  pdf.text(caratulaLines, margin, 205)
  let y = 205 + caratulaLines.length * 16 + 20

  // Línea separadora suave
  pdf.setDrawColor(220)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageW - margin, y)
  y += 25

  // Meta en grid de 2 columnas
  pdf.setTextColor(0)
  const metaItems: { label: string; value: string }[] = [
    { label: 'Número SAE', value: expediente.numero_sae ?? '—' },
    { label: 'Fuero', value: expediente.fuero ?? '—' },
    { label: 'Estado interno', value: expediente.estado_interno?.replace(/_/g, ' ') ?? '—' },
  ]
  if (expediente.cliente) {
    metaItems.push({
      label: 'Cliente',
      value: `${expediente.cliente.apellido ?? ''} ${expediente.cliente.nombre ?? ''}`.trim() || '—',
    })
    if (expediente.cliente.dni) metaItems.push({ label: 'DNI', value: expediente.cliente.dni })
  }
  metaItems.push({ label: 'Actuaciones', value: `${movements.length}${options.onlyKeys ? ' (claves)' : ''}` })
  metaItems.push({ label: 'Generado', value: new Date().toLocaleString('es-AR') })

  const colW = (contentW - 30) / 2
  for (let i = 0; i < metaItems.length; i++) {
    const item = metaItems[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = margin + col * (colW + 30)
    const yItem = y + row * 38
    // Label
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(140)
    pdf.text(item.label.toUpperCase(), x, yItem)
    // Value
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(0)
    const valueLines = pdf.splitTextToSize(item.value, colW)
    pdf.text(valueLines.slice(0, 2), x, yItem + 14)
  }
  y += Math.ceil(metaItems.length / 2) * 38 + 15

  // Observaciones
  if (expediente.observaciones?.trim()) {
    pdf.setDrawColor(220)
    pdf.setLineWidth(0.5)
    pdf.line(margin, y, pageW - margin, y)
    y += 18
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(140)
    pdf.text('OBSERVACIONES', margin, y)
    y += 14
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(60)
    const obsLines = pdf.splitTextToSize(expediente.observaciones, contentW)
    pdf.text(obsLines, margin, y)
    y += obsLines.length * 12 + 10
  }

  // AI brief
  if (expediente.ai_brief?.trim()) {
    if (y > pageH - 200) { pdf.addPage(); y = 80 }
    pdf.setDrawColor(ACCENT_R, ACCENT_G, ACCENT_B)
    pdf.setLineWidth(2.5)
    pdf.line(margin, y, margin + 30, y)
    y += 16
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(ACCENT_R, ACCENT_G, ACCENT_B)
    pdf.text('RESUMEN DEL EXPEDIENTE · GENERADO POR IA', margin, y)
    y += 16
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(40)
    const briefLines = pdf.splitTextToSize(expediente.ai_brief, contentW)
    for (const line of briefLines) {
      if (y > pageH - margin - 30) { pdf.addPage(); y = 80 }
      pdf.text(line, margin, y)
      y += 13
    }
  }

  // Footer brand bar
  pdf.setDrawColor(BRAND_R, BRAND_G, BRAND_B)
  pdf.setLineWidth(0.8)
  pdf.line(margin, pageH - 35, pageW - margin, pageH - 35)
  pdf.setFontSize(7)
  pdf.setTextColor(140)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Marco Rossi · Estudio Jurídico', margin, pageH - 22)
  pdf.text(`Documento generado por el sistema · ${new Date().toLocaleDateString('es-AR')}`, pageW - margin, pageH - 22, { align: 'right' })
  pdf.setTextColor(0)

  // ── ÍNDICE ──
  pdf.addPage()
  y = 80
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(options.onlyKeys ? 'Índice · actuaciones claves' : 'Índice de actuaciones', margin, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(140)
  pdf.text(`${movements.length} actuación${movements.length !== 1 ? 'es' : ''} · orden cronológico`, margin, y + 14)
  pdf.setTextColor(0)
  y += 40

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  for (const [idx, m] of movements.entries()) {
    if (y > pageH - margin) { pdf.addPage(); y = 80 }
    const fecha = formatDateAR(m.fecha).padEnd(12, ' ')
    const star = m.is_key === true ? '★ ' : '  '
    const text = `${star}${(idx + 1).toString().padStart(3, '0')}.  ${fecha}  ${m.titulo}`
    const lines = pdf.splitTextToSize(text, contentW)
    pdf.text(lines, margin, y)
    y += lines.length * 11
  }

  // ── ACTUACIONES (cuerpo) ──
  for (const m of movements) {
    pdf.addPage()
    y = 80
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    const titleLines = pdf.splitTextToSize(m.titulo, contentW)
    pdf.text(titleLines, margin, y)
    y += titleLines.length * 16 + 4

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(120)
    pdf.text(`${formatDateAR(m.fecha)} · ${m.tipo_movimiento}${m.is_key ? ' · ★ marcada como clave' : ''}`, margin, y)
    pdf.setTextColor(0)
    y += 18

    if (m.ai_summary?.trim()) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.text('Resumen IA', margin, y)
      y += 12
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      const sLines = pdf.splitTextToSize(m.ai_summary, contentW)
      for (const line of sLines) {
        if (y > pageH - margin) { pdf.addPage(); y = 80 }
        pdf.text(line, margin, y)
        y += 12
      }
      y += 8
    }

    if (m.cuerpo?.trim()) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.text('Texto', margin, y)
      y += 12
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      const cLines = pdf.splitTextToSize(m.cuerpo.trim(), contentW)
      for (const line of cLines) {
        if (y > pageH - margin) { pdf.addPage(); y = 80 }
        pdf.text(line, margin, y)
        y += 12
      }
    }
  }

  // ── 3. Convert to pdf-lib for merging ──────────────────────────────────
  onProgress({ stage: 'merging', message: 'Combinando portada con adjuntos…' })
  const { PDFDocument } = await import('pdf-lib')
  const coverBytes = pdf.output('arraybuffer')
  const finalDoc = await PDFDocument.load(coverBytes)

  // ── 4. Collect all attachments ─────────────────────────────────────────
  const allAttachments: AttachmentRef[] = []
  for (const m of movements) {
    if (!m.sae_case_id || !m.external_id) continue
    const jurisdictionId = typeof m.raw_payload?.jurisdiction_id === 'number' ? m.raw_payload.jurisdiction_id : null
    if (!jurisdictionId) continue
    for (const att of extractAttachmentsFromMovement(m)) {
      allAttachments.push({
        movementId: m.id,
        movementTitle: m.titulo,
        procid: m.sae_case_id,
        jurisdictionId,
        histid: m.external_id,
        fileName: att.fileName,
      })
    }
  }

  // ── 5. Download + merge attachments ────────────────────────────────────
  const failedAttachments: { fileName: string; movementTitle: string }[] = []
  let bytesSoFar = 0
  for (let i = 0; i < allAttachments.length; i++) {
    checkCancel(options.signal)
    const att = allAttachments[i]
    onProgress({
      stage: 'downloading',
      current: i + 1,
      total: allAttachments.length,
      message: `Descargando ${i + 1} de ${allAttachments.length}: ${att.fileName.slice(0, 60)}`,
      bytesSoFar,
    })
    const bytes = await downloadAttachmentPdf(att, accessToken)
    if (!bytes) {
      failedAttachments.push({ fileName: att.fileName, movementTitle: att.movementTitle })
      continue
    }
    bytesSoFar += bytes.byteLength
    try {
      const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await finalDoc.copyPages(srcDoc, srcDoc.getPageIndices())
      pages.forEach((p) => finalDoc.addPage(p))
    } catch {
      failedAttachments.push({ fileName: att.fileName, movementTitle: att.movementTitle })
    }
  }

  // ── 6. Append "fallidos" appendix if needed ────────────────────────────
  if (failedAttachments.length > 0) {
    onProgress({ stage: 'finalizing', message: 'Agregando apéndice de archivos no descargados…' })
    const appendixDoc = new jsPDF({ unit: 'pt', format: 'a4' })
    appendixDoc.setFont('helvetica', 'bold')
    appendixDoc.setFontSize(14)
    appendixDoc.text('Archivos no incluidos', margin, 80)
    appendixDoc.setFont('helvetica', 'normal')
    appendixDoc.setFontSize(10)
    let ya = 110
    for (const f of failedAttachments) {
      const text = `• ${f.fileName}  —  ${f.movementTitle}`
      const lines = appendixDoc.splitTextToSize(text, contentW)
      if (ya + lines.length * 12 > appendixDoc.internal.pageSize.getHeight() - margin) {
        appendixDoc.addPage()
        ya = 80
      }
      appendixDoc.text(lines, margin, ya)
      ya += lines.length * 12 + 4
    }
    const appBytes = appendixDoc.output('arraybuffer')
    const appLib = await PDFDocument.load(appBytes)
    const appPages = await finalDoc.copyPages(appLib, appLib.getPageIndices())
    appPages.forEach((p) => finalDoc.addPage(p))
  }

  // ── 7. Finalize ────────────────────────────────────────────────────────
  onProgress({ stage: 'finalizing', message: 'Finalizando PDF…' })
  const finalBytes = await finalDoc.save()
  onProgress({ stage: 'done', message: 'Listo' })
  return new Blob([finalBytes], { type: 'application/pdf' })
}
