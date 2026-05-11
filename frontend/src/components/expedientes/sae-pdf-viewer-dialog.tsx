import { useEffect } from 'react'
import { X, Download, ExternalLink, Loader2, AlertCircle, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  fileName: string
  isLoading: boolean
  error?: string | null
  objectUrl?: string | null
  // Multi-file navigation
  totalFiles?: number
  currentIndex?: number
  onPrev?: () => void
  onNext?: () => void
  // AI analysis from this PDF
  onAnalyzeWithAI?: () => void
  isAnalyzing?: boolean
}

export function SaePdfViewerDialog({
  open,
  onClose,
  fileName,
  isLoading,
  error,
  objectUrl,
  totalFiles = 1,
  currentIndex = 0,
  onPrev,
  onNext,
  onAnalyzeWithAI,
  isAnalyzing = false,
}: Props) {
  const hasMultiple = totalFiles > 1
  const canGoPrev = hasMultiple && currentIndex > 0 && Boolean(onPrev)
  const canGoNext = hasMultiple && currentIndex < totalFiles - 1 && Boolean(onNext)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && canGoPrev) { e.preventDefault(); onPrev?.() }
      if (e.key === 'ArrowRight' && canGoNext) { e.preventDefault(); onNext?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, canGoPrev, canGoNext, onPrev, onNext])

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
            <p className="text-xs text-zinc-500">
              {hasMultiple ? `Documento ${currentIndex + 1} de ${totalFiles}` : 'Documento SAE'}
            </p>
          </div>

          <div className="ml-3 flex shrink-0 items-center gap-1.5">
            {hasMultiple && (
              <div className="flex items-center gap-0.5 mr-1 border-r border-white/10 pr-2">
                <button
                  onClick={onPrev}
                  disabled={!canGoPrev}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title="Documento anterior (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={onNext}
                  disabled={!canGoNext}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title="Documento siguiente (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {objectUrl && (
              <>
                {onAnalyzeWithAI && (
                  <button
                    onClick={onAnalyzeWithAI}
                    disabled={isAnalyzing}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50 mr-1"
                    title="Extrae el texto del PDF y lo analiza con IA (resumen, plazos, partes, acción sugerida)"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {isAnalyzing ? 'Analizando…' : 'Analizar con IA'}
                  </button>
                )}
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

        {hasMultiple && (
          <div className="border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Usá ← → para navegar entre documentos</span>
            <span>{currentIndex + 1} / {totalFiles}</span>
          </div>
        )}
      </div>
    </div>
  )
}
