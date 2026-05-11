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
  stage: 'fetching' | 'cover' | 'downloading' | 'merging' | 'finalizing' | 'done'
  current?: number
  total?: number
  message: string
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
    .order('fecha', { ascending: false })
  if (movsError) throw movsError

  const movements = (movsRaw ?? []) as unknown as MovementRow[]

  // ── 2. Build cover with jspdf ──────────────────────────────────────────
  onProgress({ stage: 'cover', message: 'Generando portada e índice…' })
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 50
  const contentW = pageW - margin * 2

  // ── PORTADA ──
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text('Expediente', margin, 80)

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'normal')
  pdf.text(expediente.numero ?? 'Sin número', margin, 105)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Carátula', margin, 145)
  pdf.setFont('helvetica', 'normal')
  const caratulaLines = pdf.splitTextToSize(expediente.caratula ?? 'Sin carátula', contentW)
  pdf.text(caratulaLines, margin, 162)

  let y = 162 + caratulaLines.length * 14 + 25

  const metaItems: { label: string; value: string }[] = [
    { label: 'Número SAE', value: expediente.numero_sae ?? '—' },
    { label: 'Fuero', value: expediente.fuero ?? '—' },
    { label: 'Estado', value: expediente.estado_interno ?? '—' },
  ]
  if (expediente.cliente) {
    metaItems.push({
      label: 'Cliente',
      value: `${expediente.cliente.apellido ?? ''} ${expediente.cliente.nombre ?? ''}`.trim() || '—',
    })
    if (expediente.cliente.dni) metaItems.push({ label: 'DNI', value: expediente.cliente.dni })
  }
  for (const item of metaItems) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(item.label, margin, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(item.value, margin + 110, y)
    y += 16
  }

  if (expediente.observaciones?.trim()) {
    y += 10
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('Observaciones', margin, y)
    y += 14
    pdf.setFont('helvetica', 'normal')
    const obsLines = pdf.splitTextToSize(expediente.observaciones, contentW)
    pdf.text(obsLines, margin, y)
    y += obsLines.length * 12
  }

  if (expediente.ai_brief?.trim()) {
    if (y > pageH - 200) { pdf.addPage(); y = 80 }
    y += 20
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('Resumen del expediente (generado por IA)', margin, y)
    y += 16
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const briefLines = pdf.splitTextToSize(expediente.ai_brief, contentW)
    for (const line of briefLines) {
      if (y > pageH - margin) { pdf.addPage(); y = 80 }
      pdf.text(line, margin, y)
      y += 12
    }
  }

  pdf.setFontSize(8)
  pdf.setTextColor(150)
  pdf.text(`Generado ${new Date().toLocaleString('es-AR')}`, margin, pageH - 25)
  pdf.setTextColor(0)

  // ── ÍNDICE ──
  pdf.addPage()
  y = 80
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('Índice de actuaciones', margin, y)
  y += 30

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
  for (let i = 0; i < allAttachments.length; i++) {
    const att = allAttachments[i]
    onProgress({
      stage: 'downloading',
      current: i + 1,
      total: allAttachments.length,
      message: `Descargando archivo ${i + 1} de ${allAttachments.length}: ${att.fileName.slice(0, 50)}`,
    })
    const bytes = await downloadAttachmentPdf(att, accessToken)
    if (!bytes) {
      failedAttachments.push({ fileName: att.fileName, movementTitle: att.movementTitle })
      continue
    }
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
