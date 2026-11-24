import { useNavigate } from 'react-router-dom'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center animate-fade-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
          <FileQuestion className="h-8 w-8 text-cyan-700 dark:text-cyan-300" />
        </div>

        <h1 className="page-title mb-2">
          Pagina no encontrada
        </h1>

        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          La pagina que buscas no existe o fue movida.
        </p>

        <button
          type="button"
          onClick={() => navigate('/panel')}
          className="btn btn-primary px-5"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </button>
      </div>
    </div>
  )
}
