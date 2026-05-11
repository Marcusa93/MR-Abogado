import { useEffect } from 'react'
import { X, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  fileName: string
  isLoading: boolean
  error?: string | null
  objectUrl?: string | null
}

export function SaePdfViewerDialog({ open, onClose, fileName, isLoading, error, objectUrl }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{fileName}</p>
            <p className="text-xs text-zinc-500">Documento SAE</p>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-1.5">
            {objectUrl && (
              <>
                <a
                  href={objectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href={objectUrl}
                  download={fileName}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              title="Cerrar (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-[#0b1220]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Descargando documento desde SAE…</p>
            </div>
          ) : error ? (
            <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          ) : objectUrl ? (
            <iframe
              key={objectUrl}
              src={objectUrl}
              title={fileName}
              className="h-full w-full bg-white"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
