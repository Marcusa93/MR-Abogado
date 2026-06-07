import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, FolderOpen, Unplug } from 'lucide-react'
import { useGoogleDriveStatus, useGoogleDriveDisconnect, startGoogleDriveOAuth } from '@/hooks/use-google-drive'
import { toast } from '@/stores/toast-store'
import { formatDateTime } from '@/lib/utils/date-helpers'

export function IntegracionesDrive() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: status, isLoading } = useGoogleDriveStatus()
  const disconnect = useGoogleDriveDisconnect()
  const [connecting, setConnecting] = useState(false)

  // Manejar redirect del callback (?drive=connected o ?drive_error=...)
  useEffect(() => {
    const connected = searchParams.get('drive')
    const driveError = searchParams.get('drive_error')
    if (connected === 'connected') {
      toast.success('Google Drive conectado ✓')
      searchParams.delete('drive')
      setSearchParams(searchParams, { replace: true })
    } else if (driveError) {
      toast.error(`Error al conectar Drive: ${driveError}`)
      searchParams.delete('drive_error')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleConnect = async () => {
    try {
      setConnecting(true)
      await startGoogleDriveOAuth()
      // Redirige, no llega acá
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo iniciar OAuth')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar Google Drive? El sistema dejará de poder importar archivos de tu Drive.')) return
    try {
      await disconnect.mutateAsync()
      toast.success('Drive desconectado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar')
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
          <FolderOpen className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Google Drive</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Conectá tu cuenta para importar documentos directamente al expediente.
            Solo accedemos a los archivos que vos elijas con el selector — no a todo tu Drive.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verificando estado…
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-emerald-200 font-medium">Conectado</p>
                <p className="text-[11px] text-emerald-300/70">
                  {status.email}
                  {status.connected_at && (
                    <> · desde {formatDateTime(status.connected_at)}</>
                  )}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
          >
            {disconnect.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
            Desconectar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-sm text-amber-200">No conectado</p>
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
            Conectar Google Drive
          </button>
          <p className="text-[10px] text-zinc-500">
            Vas a ser redirigido a Google para autorizar el acceso. Volverás acá automáticamente.
          </p>
        </div>
      )}
    </div>
  )
}
