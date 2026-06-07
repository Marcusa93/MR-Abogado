import { useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useGoogleDriveStatus, useDriveImportAdjunto } from '@/hooks/use-google-drive'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const gapi: any

let gapiLoadedPromise: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    document.head.appendChild(s)
  })
}

async function loadGooglePicker(): Promise<void> {
  if (gapiLoadedPromise) return gapiLoadedPromise
  gapiLoadedPromise = (async () => {
    await loadScript('https://apis.google.com/js/api.js')
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(gapi as any).load('picker', () => resolve())
    })
  })()
  return gapiLoadedPromise
}

interface Props {
  expedienteId: string
  categoria?: string
  descripcion?: string
  onImportSuccess?: (adjuntoId: string, fileName: string) => void
  className?: string
}

export function DrivePickerButton({ expedienteId, categoria, descripcion, onImportSuccess, className }: Props) {
  const { data: status } = useGoogleDriveStatus()
  const importMutation = useDriveImportAdjunto()
  const [loading, setLoading] = useState(false)

  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined

  if (!status?.connected) {
    return null
  }

  if (!apiKey) {
    return (
      <div className="text-[10px] text-amber-400">
        Google API Key no configurada (VITE_GOOGLE_API_KEY)
      </div>
    )
  }

  const handleClick = async () => {
    try {
      setLoading(true)
      await loadGooglePicker()

      // Obtener access_token actual de Drive vía edge function helper
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sesión inválida')

      // Llamar a una RPC que devuelve el token de Drive vigente (con refresh)
      const { data: tokenData, error } = await supabase.functions.invoke('drive-get-token', {
        body: {},
      })
      if (error || !tokenData?.access_token) {
        throw new Error(tokenData?.error || 'No se pudo obtener token de Drive')
      }

      const driveToken = tokenData.access_token as string

      // Armar el picker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = new (google as any).picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMimeTypes('application/pdf,application/vnd.google-apps.document')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const picker = new (google as any).picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(driveToken)
        .setDeveloperKey(apiKey)
        .setCallback(async (data: { action: string; docs?: { id: string; name: string }[] }) => {
          if (data.action === 'picked' && data.docs && data.docs.length > 0) {
            const doc = data.docs[0]
            try {
              const result = await importMutation.mutateAsync({
                file_id: doc.id,
                expediente_id: expedienteId,
                file_name: doc.name,
                categoria,
                descripcion,
              })
              toast.success(`"${result.file_name}" importado desde Drive`)
              onImportSuccess?.(result.adjunto_id, result.file_name)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'No se pudo importar')
            }
          }
        })
        .build()

      picker.setVisible(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error abriendo Drive')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || importMutation.isPending}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50 ${className ?? ''}`}
    >
      {(loading || importMutation.isPending)
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <FolderOpen className="h-3 w-3" />}
      {importMutation.isPending ? 'Importando…' : 'Desde Drive'}
    </button>
  )
}
