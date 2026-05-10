import { useNavigate } from 'react-router-dom'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <FileQuestion className="h-8 w-8 text-zinc-500" />
        </div>

        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Pagina no encontrada
        </h1>

        <p className="mb-6 text-sm text-zinc-400">
          La pagina que buscas no existe o fue movida.
        </p>

        <button
          type="button"
          onClick={() => navigate('/panel')}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-cyan px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </button>
      </div>
    </div>
  )
}
