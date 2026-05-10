// ---------------------------------------------------------------------------
// "Estado de tu trámite" — Client-facing PDF summary
// Generates a professional, easy-to-read PDF that can be downloaded or shared
// via WhatsApp so the client doesn't need to call to ask about their case.
// ---------------------------------------------------------------------------

import type { ExpedienteDetail } from '@/hooks/use-expedientes'
import { ESTADO_INTERNO_LABELS } from '@/types/enums'

const ESTADO_PROGRESS: Record<string, number> = {
  NUEVA_CONSULTA: 1,
  EN_ANALISIS: 1,
  A_LA_ESPERA_DE_DOCUMENTACION: 2,
  TOMADO: 2,
  TOMADO_LISTO_PARA_INICIAR: 2,
  PRODUCCION_TAREAS_INTERNAS: 3,
  INICIADO_EN_ANSES: 4,
  EN_TRAMITE_ANSES: 5,
  RESUELTO_FAVORABLEMENTE: 6,
  FINALIZADO: 6,
  NO_VIABLE_RECHAZADO: 6,
  PAUSADO_POR_CLIENTE: 3,
}

const CANAL_LABELS: Record<string, string> = {
  WEB: 'Web ANSES',
  TELEFONO: 'Teléfono',
  PRESENCIAL: 'Presencial',
  EMAIL: 'Email',
}

const TIPO_TURNO_LABELS: Record<string, string> = {
  INICIO_TRAMITE: 'Inicio de trámite',
  SEGUIMIENTO: 'Seguimiento',
  PRESENTACION_DOCUMENTAL: 'Presentación documental',
  AUDIENCIA: 'Audiencia',
  OTRO: 'Otro',
}

const AUDIENCIAS_ACTIVAS = new Set(['PENDIENTE', 'CONFIRMADA', 'pendiente', 'confirmada'])
const TAREAS_PENDIENTES = new Set(['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fmtDateShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export async function exportTramitePDF(expediente: ExpedienteDetail) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 16
  const marginR = pageW - 16
  const contentW = marginR - marginL

  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  let y = 20

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageH - 25) {
      doc.addPage()
      y = 20
    }
  }

  // ========================================================================
  // HEADER
  // ========================================================================
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59) // slate-800
  doc.text('Estado de tu trámite', marginL, y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139) // slate-500
  doc.text(`Generado el ${today}`, marginL, y + 7)
  doc.text('Alba | Estudio Jurídico Previsional', marginR, y + 7, { align: 'right' })

  y += 14

  // Line
  doc.setDrawColor(203, 213, 225) // slate-300
  doc.setLineWidth(0.5)
  doc.line(marginL, y, marginR, y)
  y += 10

  // ========================================================================
  // CLIENT & CASE INFO
  // ========================================================================
  const cliente = expediente.clientes as any
  const tipoTramite = (expediente.tipos_tramite as any)?.nombre ?? 'Trámite previsional'

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(
    cliente ? `${cliente.apellido}, ${cliente.nombre}` : 'Cliente',
    marginL,
    y,
  )
  y += 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105) // slate-600

  const infoRows: [string, string][] = [
    ['Tipo de trámite', tipoTramite],
    ['Carátula', expediente.caratula],
    ['Expediente N°', (expediente as any).numero],
  ]
  if ((expediente as any).numero_expediente_anses) {
    infoRows.push(['N° Expediente ANSES', (expediente as any).numero_expediente_anses])
  }
  const fechaInicio = (expediente as any).fecha_inicio ?? expediente.fecha_alta
  if (fechaInicio) {
    infoRows.push(['Fecha de inicio', fmtDate(fechaInicio)])
  }

  for (const [label, value] of infoRows) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text(`${label}:`, marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    doc.text(value, marginL + 55, y)
    y += 6
  }

  y += 8

  // ========================================================================
  // CURRENT STATUS — big highlighted box
  // ========================================================================
  checkPageBreak(35)

  const estadoLabel =
    ESTADO_INTERNO_LABELS[expediente.estado_interno as keyof typeof ESTADO_INTERNO_LABELS] ?? expediente.estado_interno
  const progress = ESTADO_PROGRESS[expediente.estado_interno] ?? 0
  const maxSteps = 6

  // Background box
  doc.setFillColor(240, 249, 255) // sky-50
  doc.setDrawColor(56, 189, 248) // sky-400
  doc.setLineWidth(0.3)
  doc.roundedRect(marginL, y, contentW, 28, 3, 3, 'FD')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(56, 189, 248)
  doc.text('ESTADO ACTUAL', marginL + 6, y + 7)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 116, 144) // cyan-700
  doc.text(estadoLabel, marginL + 6, y + 16)

  // Progress bar
  if (progress > 0 && progress <= maxSteps) {
    const barX = marginL + 6
    const barY = y + 20
    const barW = contentW - 12
    const barH = 3

    // Background
    doc.setFillColor(224, 242, 254) // sky-100
    doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F')

    // Fill
    const fillW = (progress / maxSteps) * barW
    doc.setFillColor(14, 165, 233) // sky-500
    doc.roundedRect(barX, barY, fillW, barH, 1.5, 1.5, 'F')

    // Step text
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(`Paso ${progress} de ${maxSteps}`, barX + barW, barY - 1, { align: 'right' })
  }

  y += 36

  // ========================================================================
  // RECENT ACTIVITY (last 5 seguimientos)
  // ========================================================================
  const seguimientos = (expediente.seguimientos ?? [])
    .sort((a, b) => new Date(b.fecha_control).getTime() - new Date(a.fecha_control).getTime())
    .slice(0, 5)

  if (seguimientos.length > 0) {
    checkPageBreak(20 + seguimientos.length * 16)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Actividad reciente', marginL, y)
    y += 8

    for (const seg of seguimientos) {
      checkPageBreak(16)

      // Date circle
      doc.setFillColor(241, 245, 249) // slate-100
      doc.circle(marginL + 3, y + 1, 2, 'F')

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(71, 85, 105)
      doc.text(fmtDateShort(seg.fecha_control), marginL + 8, y + 2)

      const canal = CANAL_LABELS[(seg as any).canal] ?? (seg as any).canal
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(`(${canal})`, marginL + 32, y + 2)

      if ((seg as any).estado_organismo_reportado) {
        y += 5
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(30, 41, 59)
        const lines = doc.splitTextToSize((seg as any).estado_organismo_reportado, contentW - 10)
        doc.text(lines, marginL + 8, y + 2)
        y += lines.length * 4
      }

      y += 8
    }

    y += 4
  }

  // ========================================================================
  // UPCOMING APPOINTMENTS (audiencias pendientes/confirmadas)
  // ========================================================================
  const todayStr = new Date().toISOString().slice(0, 10)
  const audienciasFuturas = (expediente.audiencias ?? [])
    .filter(
      (t) =>
        AUDIENCIAS_ACTIVAS.has(t.estado) &&
        t.fecha >= todayStr,
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 3)

  if (audienciasFuturas.length > 0) {
    checkPageBreak(16 + audienciasFuturas.length * 12)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Próximas audiencias', marginL, y)
    y += 8

    for (const audiencia of audienciasFuturas) {
      checkPageBreak(12)

      const tipo = TIPO_TURNO_LABELS[(audiencia as any).tipo_turno] ?? (audiencia as any).tipo_turno

      doc.setFillColor(254, 252, 232) // yellow-50
      doc.setDrawColor(250, 204, 21) // yellow-400
      doc.setLineWidth(0.2)
      doc.roundedRect(marginL, y, contentW, 10, 2, 2, 'FD')

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(133, 77, 14) // yellow-800
      doc.text(fmtDate(audiencia.fecha), marginL + 4, y + 6)

      if ((audiencia as any).hora) {
        doc.setFont('helvetica', 'normal')
        doc.text(`a las ${(audiencia as any).hora}`, marginL + 55, y + 6)
      }

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(113, 63, 18) // yellow-900
      doc.text(`— ${tipo}`, marginL + ((audiencia as any).hora ? 78 : 55), y + 6)

      y += 14
    }

    y += 4
  }

  // ========================================================================
  // PENDING TASKS (what the client needs to do / know about)
  // ========================================================================
  const tareasPendientes = (expediente.tareas ?? [])
    .filter((t) => TAREAS_PENDIENTES.has(t.estado))
    .sort((a, b) => {
      if (a.fecha_vencimiento && b.fecha_vencimiento) return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      if (a.fecha_vencimiento) return -1
      return 1
    })
    .slice(0, 5)

  if (tareasPendientes.length > 0) {
    checkPageBreak(16 + tareasPendientes.length * 8)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Tareas en curso', marginL, y)
    y += 8

    for (const tarea of tareasPendientes) {
      checkPageBreak(8)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')

      // Checkbox
      doc.setDrawColor(148, 163, 184) // slate-400
      doc.setLineWidth(0.3)
      doc.rect(marginL + 2, y - 2.5, 3, 3)

      doc.setTextColor(30, 41, 59)
      const title = doc.splitTextToSize(tarea.titulo, contentW - 30)
      doc.text(title[0], marginL + 8, y)

      if (tarea.fecha_vencimiento) {
        doc.setTextColor(100, 116, 139)
        doc.setFontSize(8)
        doc.text(`vence ${fmtDateShort(tarea.fecha_vencimiento)}`, marginR, y, { align: 'right' })
      }

      y += title.length > 1 ? 10 : 7
    }

    y += 4
  }

  // ========================================================================
  // OBSERVATIONS (if any)
  // ========================================================================
  if (expediente.observaciones) {
    checkPageBreak(25)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Observaciones', marginL, y)
    y += 7

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const obsLines = doc.splitTextToSize(expediente.observaciones, contentW)
    doc.text(obsLines, marginL, y)
    y += obsLines.length * 4 + 8
  }

  // ========================================================================
  // CONTACT INFO box
  // ========================================================================
  checkPageBreak(25)

  doc.setFillColor(248, 250, 252) // slate-50
  doc.setDrawColor(226, 232, 240) // slate-200
  doc.setLineWidth(0.3)
  doc.roundedRect(marginL, y, contentW, 18, 2, 2, 'FD')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('¿Tenés dudas sobre tu trámite?', marginL + 4, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'Comunicate con el estudio. Este resumen fue generado automáticamente y refleja el estado actual de tu expediente.',
    marginL + 4,
    y + 11,
  )
  doc.text(
    'La información aquí contenida es orientativa y no constituye notificación formal.',
    marginL + 4,
    y + 15,
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
      `Alba | Estudio Jurídico Previsional — ${today} — Pág. ${p}/${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' },
    )
  }

  // ========================================================================
  // SAVE
  // ========================================================================
  const clienteName = cliente ? `${cliente.apellido}_${cliente.nombre}` : 'cliente'
  const safeName = clienteName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  doc.save(`estado_tramite_${safeName}_${today.replace(/\//g, '-')}.pdf`)
}
