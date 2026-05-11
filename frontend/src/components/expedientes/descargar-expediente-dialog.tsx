import { useEffect, useRef, useState } from 'react'
import { generateExpedientePdf, type ProgressUpdate } from '@/lib/utils/expediente-pdf'
import { Loader2, CheckCircle2, AlertCircle, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  expedienteId: string
  expedienteNumero?: string | null
}

export function DescargarExpedienteDialog({ open, onClose, expedienteId, expedienteNumero }: Props) {
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      // reset on close
      startedRef.current = false
      setProgress(null)
      setError(null)
      setDone(false)
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    setError(null)
    setDone(false)

    void (async () => {
      try {
        const blob = await generateExpedientePdf(expedienteId, (u) => setProgress(u))
        // Trigger download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const safeNum = (expedienteNumero ?? expedienteId).replace(/[^a-z0-9-_]/gi, '-')
        a.download = `expediente-${safeNum}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al generar el PDF')
      }
    })()
  }, [open, expedienteId, expedienteNumero])

  if (!open) return null

  const pct = progress?.current && progress?.total
    ? Math.round((progress.current / progress.total) * 100)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Descargar expediente</h3>
          </div>
          <button
            onClick={onClose}
            disabled={!done && !error}
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title={done || error ? 'Cerrar' : 'Esperá a que termine'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-5 space-y-4">
          {error ? (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium text-red-300">Falló la generación</p>
                <p className="text-xs text-red-400/80 mt-1 break-words">{error}</p>
              </div>
            </div>
          ) : done ? (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-300">Descarga iniciada</p>
                <p className="text-xs text-zinc-400 mt-1">El PDF debería estar guardándose en tu carpeta de descargas.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-cyan-400 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">
                    {progress?.message ?? 'Iniciando…'}
                  </p>
                </div>
              </div>

              {pct !== null && (
                <div>
                  <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn('h-full bg-cyan-500 transition-all duration-300')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500 text-right">{pct}%</p>
                </div>
              )}

              <p className="text-[11px] text-zinc-500">
                Esto puede tardar entre 30 segundos y un par de minutos según cantidad de adjuntos.
                No cierres esta ventana.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
