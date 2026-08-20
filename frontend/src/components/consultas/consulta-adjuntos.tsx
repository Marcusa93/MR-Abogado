import { useRef } from 'react'
import { Loader2, FileText, ImageIcon, X, Paperclip } from 'lucide-react'
import { useAdjuntosConsulta, useUploadAdjuntoConsulta } from '@/hooks/use-adjuntos'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/toast-store'

interface Props {
  consultaId: string
}

export function ConsultaAdjuntos({ consultaId }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadAdjuntoConsulta()

  // Pollear cada 5 segundos para detectar cuando termina el análisis IA.
  // pollWhilePending=true siempre activo mientras el componente está montado;
  // los adjuntos ya analizados igualmente tienen ai_analyzed_at y no cambian.
  const { data: adjuntos = [], isLoading } = useAdjuntosConsulta(consultaId, {
    pollWhilePending: true,
  })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''

    for (const file of files) {
      try {
        await upload.mutateAsync({ consultaId, file })
        toast.success(`${file.name} subido`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo')
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleDelete(adj: any) {
    try {
      // Soft delete en tabla + remove del storage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('adjuntos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', adj.id)

      await supabase.storage.from('adjuntos').remove([adj.storage_path]).catch(() => {})

      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
      toast.success('Adjunto eliminado')
    } catch {
      toast.error('No se pudo eliminar el adjunto')
    }
  }

  const isUploading = upload.isPending

  return (
    <div className="space-y-3">
      {/* Botón subir */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          Adjuntar documentos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Lista de adjuntos */}
      {isLoading ? (
        <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
      ) : adjuntos.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">Sin documentos adjuntos todavía.</p>
      ) : (
        <div className="space-y-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(adjuntos as any[]).map((adj: any) => {
            const isImage = (adj.tipo_mime as string | null)?.startsWith('image/')
            const isPending = !adj.ai_analyzed_at && !adj.ai_error
            const hasError = !!adj.ai_error

            return (
              <div
                key={adj.id}
                className="flex items-start gap-2 rounded-lg border border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2"
              >
                {/* Ícono */}
                <div className="mt-0.5 shrink-0 text-zinc-400">
                  {isImage ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate max-w-xs">
                      {adj.nombre_archivo}
                    </span>
                    {isPending && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Analizando...
                      </span>
                    )}
                    {hasError && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        Error al analizar
                      </span>
                    )}
                  </div>
                  {adj.ai_summary && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
                      {adj.ai_summary}
                    </p>
                  )}
                </div>

                {/* Botón eliminar */}
                <button
                  type="button"
                  onClick={() => handleDelete(adj)}
                  title="Eliminar adjunto"
                  className="shrink-0 mt-0.5 p-1 rounded text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
