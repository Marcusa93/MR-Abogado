import { useNavigate } from 'react-router-dom'
import { InformesCommandCenter } from '@/components/informes/informes-command-center'
import { exportExpedientesToCSV } from '@/lib/utils/export-csv'
import { exportInformePDF } from '@/lib/utils/export-pdf'
import { toast } from '@/stores/toast-store'
import { PageHeader } from '@/components/shared/page-header'
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
      <PageHeader
        title="Informes"
        subtitle="Tablero en vivo con el corpus IA del estudio"
        actions={
          <>
            <button onClick={handleExportCSV} className="btn btn-ghost">
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button onClick={handleExportPDF} className="btn btn-primary">
              <FileText className="h-4 w-4" />
              Exportar PDF
            </button>
          </>
        }
      />

      <InformesCommandCenter />
    </div>
  )
}
