import type { ClienteListItem } from '@/hooks/use-clientes'
import { ESTADO_INTERNO_LABELS } from '@/types/enums'

const ESTADO_LABELS: Record<string, string> = ESTADO_INTERNO_LABELS

export async function exportClientePDF(cliente: ClienteListItem) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  let y = 20

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Alba | CRM Previsional', 14, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`Informe de cliente — ${today}`, 14, y + 7)
  doc.setTextColor(0, 0, 0)
  y += 18

  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, pageW - 14, y)
  y += 10

  // Client info
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`${cliente.apellido}, ${cliente.nombre}`, 14, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  const info: [string, string][] = [
    ['DNI', cliente.dni ?? '-'],
    ['CUIL', cliente.cuil ?? '-'],
    ['Teléfono', cliente.telefono ?? '-'],
    ['Email', cliente.email ?? '-'],
    ['Domicilio', cliente.domicilio ?? '-'],
    ['Localidad', cliente.localidad ?? '-'],
    ['Provincia', cliente.provincia ?? '-'],
  ]

  for (const [label, value] of info) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, 55, y)
    y += 6
  }

  y += 6

  // Expedientes
  const exps = cliente.expedientes ?? []
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Expedientes (${exps.length})`, 14, y)
  y += 8

  if (exps.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('No tiene expedientes registrados.', 14, y)
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('N°', 14, y)
    doc.text('Estado', 30, y)
    doc.setFont('helvetica', 'normal')
    y += 2
    doc.line(14, y, pageW - 14, y)
    y += 5

    for (const exp of exps) {
      const label = ESTADO_LABELS[exp.estado_interno] ?? exp.estado_interno
      doc.text(`${exps.indexOf(exp) + 1}`, 14, y)
      doc.text(label, 30, y)
      y += 5

      if (y > 270) {
        doc.addPage()
        y = 20
      }
    }
  }

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Alba | CRM Previsional — Informe generado el ${today}`,
    pageW / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  )

  doc.save(`cliente_${cliente.apellido}_${cliente.nombre}_${today.replace(/\//g, '-')}.pdf`)
}
