import type { EstadoCount, TipoCount, ResumenFinanciero } from '@/hooks/use-informes'

// ---------------------------------------------------------------------------
// Estado labels (duplicate here to avoid importing React components)
// ---------------------------------------------------------------------------

const ESTADO_LABELS: Record<string, string> = {
  NUEVA_CONSULTA: 'Nueva consulta',
  PARA_INICIAR: 'Para iniciar',
  INICIADO: 'Iniciado',
  PRUEBA: 'Prueba',
  ALEGATOS: 'Alegatos',
  SENTENCIA: 'Sentencia',
  APELACION: 'Apelación',
  CORTE: 'Corte',
  FINALIZADO: 'Finalizado',
  NO_VIABLE_RECHAZADO: 'No viable / rechazado',
  PAUSADO: 'Pausado',
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

interface ExportData {
  porEstado: EstadoCount[]
  porTipo: TipoCount[]
  financiero: ResumenFinanciero | null
}

export async function exportInformePDF({ porEstado, porTipo, financiero }: ExportData) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  let y = 20

  // ---- Header ----
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Alba | CRM Previsional', 14, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`Informe generado el ${today}`, 14, y + 8)
  doc.setTextColor(0, 0, 0)

  y += 20

  // ---- Línea separadora ----
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, pageW - 14, y)
  y += 10

  // ---- Resumen Financiero ----
  if (financiero) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen General', 14, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    const kpis = [
      ['Total Expedientes', String(financiero.totalExpedientes)],
      ['En Trámite', String(financiero.enTramite)],
      ['Resueltos', String(financiero.resueltos)],
      ['Rechazados', String(financiero.rechazados)],
      ['Tasa de Éxito', `${financiero.tasaExito}%`],
      ['Monto Reclamado', fmtMoney(financiero.montoReclamado)],
      ['Monto Otorgado', fmtMoney(financiero.montoOtorgado)],
      ['Honorarios Cobrados', fmtMoney(financiero.totalCobros)],
    ]

    for (const [label, value] of kpis) {
      doc.text(`${label}:`, 14, y)
      doc.setFont('helvetica', 'bold')
      doc.text(value, 80, y)
      doc.setFont('helvetica', 'normal')
      y += 6
    }

    y += 6
  }

  // ---- Expedientes por Estado ----
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Expedientes por Estado', 14, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Estado', 14, y)
  doc.text('Cantidad', 120, y)
  doc.setFont('helvetica', 'normal')
  y += 2
  doc.line(14, y, pageW - 14, y)
  y += 5

  const totalEstado = porEstado.reduce((s, e) => s + e.count, 0)

  for (const item of porEstado) {
    const label = ESTADO_LABELS[item.estado_interno] ?? item.estado_interno
    const pct = totalEstado > 0 ? Math.round((item.count / totalEstado) * 100) : 0
    doc.text(label, 14, y)
    doc.text(`${item.count}  (${pct}%)`, 120, y)
    y += 6

    if (y > 270) {
      doc.addPage()
      y = 20
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Total', 14, y)
  doc.text(String(totalEstado), 120, y)
  doc.setFont('helvetica', 'normal')
  y += 10

  // ---- Expedientes por Tipo ----
  if (y > 240) { doc.addPage(); y = 20 }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Expedientes por Tipo de Trámite', 14, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Tipo', 14, y)
  doc.text('Cantidad', 120, y)
  doc.setFont('helvetica', 'normal')
  y += 2
  doc.line(14, y, pageW - 14, y)
  y += 5

  for (const item of porTipo) {
    doc.text(item.nombre, 14, y)
    doc.text(String(item.count), 120, y)
    y += 6

    if (y > 270) {
      doc.addPage()
      y = 20
    }
  }

  y += 10

  // ---- Footer ----
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Estudio Jurídico Marco Rossi — Informe generado el ${today}`,
    pageW / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  )

  // ---- Save ----
  doc.save(`informe_${today.replace(/\//g, '-')}.pdf`)
}
