// ---------------------------------------------------------------------------
// Constancia de CUIL — PDF generator
// Generates a professional-looking CUIL certificate PDF using AFIP data.
// ---------------------------------------------------------------------------

import type { AfipData } from '@/hooks/use-cuil-validation'
import { formatCuil, extractDniFromCuil } from '@/lib/utils/cuil-validator'

export async function exportConstanciaCuilPDF(afip: AfipData) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 20
  const marginR = pageW - 20
  const contentW = marginR - marginL

  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const todayFull = new Date().toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  let y = 25

  // ========================================================================
  // HEADER BAR
  // ========================================================================
  doc.setFillColor(15, 23, 42) // slate-900
  doc.rect(0, 0, pageW, 40, 'F')

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Constancia de CUIL', marginL, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184) // slate-400
  doc.text('Datos obtenidos del padrón público de AFIP', marginL, y + 7)
  doc.text(`Fecha de consulta: ${todayFull}`, marginR, y + 7, { align: 'right' })

  y = 55

  // ========================================================================
  // CUIL HIGHLIGHT BOX
  // ========================================================================
  const formattedCuil = formatCuil(afip.cuil)

  doc.setFillColor(240, 253, 244) // green-50
  doc.setDrawColor(34, 197, 94) // green-500
  doc.setLineWidth(0.5)
  doc.roundedRect(marginL, y, contentW, 24, 3, 3, 'FD')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(22, 101, 52) // green-800
  doc.text('CUIL / CUIT', marginL + 6, y + 8)

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(21, 128, 61) // green-700
  doc.text(formattedCuil, marginL + 6, y + 19)

  // Estado badge
  if (afip.estadoClave) {
    const isActive = afip.estadoClave === 'ACTIVO'
    const badgeText = afip.estadoClave
    const badgeW = doc.getTextWidth(badgeText) * 0.45 + 12

    if (isActive) {
      doc.setFillColor(220, 252, 231) // green-100
    } else {
      doc.setFillColor(254, 243, 199) // yellow-100
    }
    doc.roundedRect(marginR - badgeW - 4, y + 4, badgeW, 8, 2, 2, 'F')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    if (isActive) {
      doc.setTextColor(22, 101, 52) // green-800
    } else {
      doc.setTextColor(133, 77, 14) // yellow-800
    }
    doc.text(badgeText, marginR - badgeW / 2 - 2, y + 9.5, { align: 'center' })
  }

  y += 34

  // ========================================================================
  // PERSONAL DATA
  // ========================================================================
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59) // slate-800
  doc.text('Datos del contribuyente', marginL, y)
  y += 3

  doc.setDrawColor(226, 232, 240) // slate-200
  doc.setLineWidth(0.3)
  doc.line(marginL, y, marginR, y)
  y += 8

  const dataRows: [string, string][] = []

  if (afip.nombre) {
    dataRows.push(['Apellido y Nombre / Razón Social', afip.nombre])
  }
  if (afip.tipoPersona) {
    dataRows.push([
      'Tipo de persona',
      afip.tipoPersona === 'FISICA' ? 'Persona Física' : 'Persona Jurídica',
    ])
  }

  const dniFromCuil = extractDniFromCuil(afip.cuil)
  if (dniFromCuil) {
    dataRows.push(['DNI', dniFromCuil])
  }

  dataRows.push(['CUIL / CUIT', formattedCuil])

  if (afip.estadoClave) {
    dataRows.push(['Estado', afip.estadoClave])
  }

  if (afip.domicilio) {
    if (afip.domicilio.direccion) {
      dataRows.push(['Domicilio fiscal', afip.domicilio.direccion])
    }
    if (afip.domicilio.localidad) {
      dataRows.push(['Localidad', afip.domicilio.localidad])
    }
    if (afip.domicilio.provincia) {
      dataRows.push(['Provincia', afip.domicilio.provincia])
    }
    if (afip.domicilio.codigoPostal) {
      dataRows.push(['Código postal', afip.domicilio.codigoPostal])
    }
  }

  doc.setFontSize(10)
  for (const [rowIndex, [label, value]] of dataRows.entries()) {
    // Alternating row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252) // slate-50
      doc.rect(marginL, y - 4, contentW, 8, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(label, marginL + 4, y)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59) // slate-800
    doc.text(value, marginL + 85, y)

    y += 8
  }

  y += 6

  // ========================================================================
  // ACTIVITIES
  // ========================================================================
  if (afip.actividades.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Actividades económicas', marginL, y)
    y += 3

    doc.line(marginL, y, marginR, y)
    y += 8

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105) // slate-600

    for (const act of afip.actividades) {
      const lines = doc.splitTextToSize(`• ${act}`, contentW - 8)
      doc.text(lines, marginL + 4, y)
      y += lines.length * 4.5 + 2

      if (y > pageH - 40) {
        doc.addPage()
        y = 25
      }
    }

    y += 4
  }

  // ========================================================================
  // ACTIVE TAXES
  // ========================================================================
  if (afip.impuestosActivos.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Impuestos activos', marginL, y)
    y += 3

    doc.line(marginL, y, marginR, y)
    y += 8

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)

    for (const imp of afip.impuestosActivos) {
      doc.text(`• ${imp}`, marginL + 4, y)
      y += 5

      if (y > pageH - 40) {
        doc.addPage()
        y = 25
      }
    }

    y += 4
  }

  // ========================================================================
  // DISCLAIMER
  // ========================================================================
  if (y > pageH - 50) {
    doc.addPage()
    y = 25
  }

  doc.setFillColor(248, 250, 252) // slate-50
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.roundedRect(marginL, y, contentW, 22, 2, 2, 'FD')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184) // slate-400
  doc.text(
    'Esta constancia fue generada a partir de datos del padrón público de AFIP y tiene carácter informativo.',
    marginL + 4,
    y + 6,
  )
  doc.text(
    'No constituye documento oficial ni reemplaza la constancia emitida por AFIP/ANSES.',
    marginL + 4,
    y + 11,
  )
  doc.text(
    `Generada el ${todayFull} — Alba | Estudio Jurídico Previsional`,
    marginL + 4,
    y + 16,
  )

  // ========================================================================
  // FOOTER (every page)
  // ========================================================================
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Constancia CUIL ${formattedCuil} — ${today} — Pág. ${p}/${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' },
    )
  }

  // ========================================================================
  // SAVE
  // ========================================================================
  const safeName = (afip.nombre ?? 'contribuyente')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
  doc.save(`constancia_cuil_${formattedCuil}_${safeName}.pdf`)
}
