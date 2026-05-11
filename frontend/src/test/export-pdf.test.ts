import { describe, it, expect, vi } from 'vitest'

// Mock jsPDF as a class constructor
vi.mock('jspdf', () => {
  class MockJsPDF {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    setFontSize = vi.fn()
    setFont = vi.fn()
    setTextColor = vi.fn()
    setDrawColor = vi.fn()
    text = vi.fn()
    line = vi.fn()
    addPage = vi.fn()
    save = vi.fn()
  }
  return { default: MockJsPDF }
})

describe('exportInformePDF', () => {
  it('generates PDF without errors', async () => {
    const { exportInformePDF } = await import('@/lib/utils/export-pdf')

    await expect(
      exportInformePDF({
        porEstado: [
          { estado_interno: 'INICIADO', count: 52 },
          { estado_interno: 'NUEVA_CONSULTA', count: 6 },
        ],
        porTipo: [
          { id: 'tipo-1', nombre: 'Jubilación Ordinaria', count: 30 },
          { id: 'tipo-2', nombre: 'PUAM', count: 10 },
        ],
        financiero: {
          totalExpedientes: 58,
          enTramite: 52,
          resueltos: 4,
          rechazados: 2,
          tasaExito: 67,
          montoReclamado: 1500000,
          montoOtorgado: 1000000,
          totalCobros: 300000,
          cantCobros: 5,
        },
      })
    ).resolves.toBeUndefined()
  })

  it('handles empty data gracefully', async () => {
    const { exportInformePDF } = await import('@/lib/utils/export-pdf')

    await expect(
      exportInformePDF({
        porEstado: [],
        porTipo: [],
        financiero: null,
      })
    ).resolves.toBeUndefined()
  })
})
