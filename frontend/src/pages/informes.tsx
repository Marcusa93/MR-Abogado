import { useNavigate } from 'react-router-dom'
import { InformesCommandCenter } from '@/components/informes/informes-command-center'
import { exportExpedientesToCSV } from '@/lib/utils/export-csv'
import { exportInformePDF } from '@/lib/utils/export-pdf'
import { toast } from '@/stores/toast-store'
import { Download, FileText } from 'lucide-react'

export default function InformesPage() {
  const navigate = useNavigate()
  void navigate

  const handleExportCSV = async () => {
    try {
      await exportExpedientesToCSV()
      toast.success('CSV exportado')
    } catch {
      toast.error('Error al exportar CSV')
    }
  }

  const handleExportPDF = async () => {
    try {
      await exportInformePDF({ porEstado: [], porTipo: [], financiero: null })
      toast.success('PDF generado')
    } catch {
      toast.error('Error al generar PDF')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Informes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
            Tablero en vivo con el corpus IA del estudio
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 min-h-[38px] rounded-lg bg-[var(--brand-navy)] dark:bg-white px-4 text-sm font-medium text-white dark:text-[var(--brand-navy)] shadow-sm hover:opacity-90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      <InformesCommandCenter />
    </div>
  )
}
