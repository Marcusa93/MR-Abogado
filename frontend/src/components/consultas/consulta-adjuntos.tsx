import { useRef, useState } from 'react'
import {
  Loader2, FileText, ImageIcon, X, Paperclip,
  Eye, Pencil, Check, AlertTriangle, Headphones, Play, RefreshCw,
} from 'lucide-react'
import { useAdjuntosConsulta, useUploadAdjuntoConsulta } from '@/hooks/use-adjuntos'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/toast-store'

interface Props {
  consultaId: string
}

// ---------------------------------------------------------------------------
// Preview modal (imágenes)
// ---------------------------------------------------------------------------

function PreviewModal({
  url,
  nombre,
  isImage,
  onClose,
}: {
  url: string
  nombre: string
  isImage: boolean
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] rounded-xl overflow-hidden bg-zinc-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
          <span className="text-sm font-medium text-zinc-200 truncate max-w-xs">{nombre}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage ? (
            <img
              src={url}
              alt={nombre}
              className="max-w-full max-h-full object-contain rounded"
            />
          ) : (
            <iframe
              src={url}
              title={nombre}
              className="w-full h-full min-h-[60vh] rounded border-0"
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsultaAdjuntos({ consultaId }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadAdjuntoConsulta()

  const { data: adjuntos = [], isLoading } = useAdjuntosConsulta(consultaId)

  // Preview state (imágenes/PDFs)
  const [preview, setPreview] = useState<{ url: string; nombre: string; isImage: boolean } | null>(null)
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null)

  // Audio player state
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Transcription retry state
  const [transcribingId, setTranscribingId] = useState<string | null>(null)

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
    if (deletingId) return
    setDeletingId(adj.id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await (supabase as any)
        .from('adjuntos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', adj.id)
        .select('id', { count: 'exact', head: true })

      if (error) throw error
      if (count === 0) throw new Error('Sin permiso para eliminar este adjunto')

      // Liberar URL de audio si existía
      if (audioUrls[adj.id]) {
        URL.revokeObjectURL(audioUrls[adj.id])
        setAudioUrls(prev => { const n = { ...prev }; delete n[adj.id]; return n })
      }

      supabase.storage.from('adjuntos').remove([adj.storage_path]).catch(() => {})
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
      toast.success('Adjunto eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el adjunto')
    } finally {
      setDeletingId(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handlePreview(adj: any) {
    setLoadingPreviewId(adj.id)
    try {
      const { data: blob, error } = await supabase.storage
        .from('adjuntos')
        .download(adj.storage_path)
      if (error || !blob) throw error ?? new Error('No se pudo descargar')
      const url = URL.createObjectURL(new Blob([blob], { type: adj.tipo_mime ?? 'application/octet-stream' }))
      const isImage = (adj.tipo_mime as string | null)?.startsWith('image/') ?? false
      if (!isImage) {
        const tab = window.open(url, '_blank')
        if (!tab) toast.error('El navegador bloqueó la nueva pestaña. Permitir popups.')
      } else {
        setPreview({ url, nombre: adj.nombre_archivo, isImage: true })
      }
    } catch {
      toast.error('No se pudo cargar la vista previa')
    } finally {
      setLoadingPreviewId(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleLoadAudio(adj: any) {
    if (audioUrls[adj.id]) return // ya cargado
    setLoadingAudioId(adj.id)
    try {
      const { data: blob, error } = await supabase.storage
        .from('adjuntos')
        .download(adj.storage_path)
      if (error || !blob) throw error ?? new Error('No se pudo descargar el audio')
      const url = URL.createObjectURL(new Blob([blob], { type: adj.tipo_mime ?? 'audio/mpeg' }))
      setAudioUrls(prev => ({ ...prev, [adj.id]: url }))
    } catch {
      toast.error('No se pudo cargar el audio')
    } finally {
      setLoadingAudioId(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleRetryTranscribe(adj: any) {
    if (transcribingId) return
    setTranscribingId(adj.id)
    try {
      const { error } = await supabase.functions.invoke('transcribe-adjunto', {
        body: { adjunto_id: adj.id, force: true },
      })
      if (error) throw new Error(error.message)
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
      toast.success('Transcripción completada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo transcribir')
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
    } finally {
      setTranscribingId(null)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function startRename(adj: any) {
    setRenamingId(adj.id)
    setRenameValue(adj.nombre_archivo)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function commitRename(adj: any) {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === adj.nombre_archivo) {
      setRenamingId(null)
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('adjuntos')
        .update({ nombre_archivo: trimmed })
        .eq('id', adj.id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
      toast.success('Nombre actualizado')
    } catch {
      toast.error('No se pudo renombrar el adjunto')
    } finally {
      setRenamingId(null)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {/* Botón subir */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            Adjuntar archivos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.mp3,.m4a,.wav,.webm,.ogg,.aac"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
        ) : adjuntos.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">Sin archivos adjuntos todavía.</p>
        ) : (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(adjuntos as any[]).map((adj: any) => {
              const mime = (adj.tipo_mime as string | null) ?? ''
              const isImage = mime.startsWith('image/')
              const isAudio = mime.startsWith('audio/') || mime === 'video/mp4' || mime === 'video/webm'
              const isPending = !adj.ai_analyzed_at && !adj.ai_error
              const hasError = !!adj.ai_error
              const isRenamingThis = renamingId === adj.id
              const isDeletingThis = deletingId === adj.id
              const isPreviewingThis = loadingPreviewId === adj.id
              const isLoadingAudioThis = loadingAudioId === adj.id
              const isTranscribingThis = transcribingId === adj.id
              const audioUrl = audioUrls[adj.id]

              return (
                <div
                  key={adj.id}
                  className="rounded-lg border border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 space-y-1.5"
                >
                  {/* Fila principal */}
                  <div className="flex items-start gap-2">
                    {/* Ícono */}
                    <div className="mt-0.5 shrink-0 text-zinc-400">
                      {isAudio
                        ? <Headphones className="h-4 w-4" />
                        : isImage
                          ? <ImageIcon className="h-4 w-4" />
                          : <FileText className="h-4 w-4" />
                      }
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Nombre + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {isRenamingThis ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(adj)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => commitRename(adj)}
                            className="text-sm rounded border border-blue-400 bg-white dark:bg-zinc-700 px-1.5 py-0.5 text-zinc-800 dark:text-zinc-100 outline-none min-w-0 max-w-xs"
                          />
                        ) : (
                          <span
                            className="text-sm text-zinc-800 dark:text-zinc-200 truncate max-w-xs"
                            title={adj.nombre_archivo}
                          >
                            {adj.nombre_archivo}
                          </span>
                        )}

                        {isPending && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            {isAudio ? 'Transcribiendo...' : 'Analizando...'}
                          </span>
                        )}
                        {hasError && (
                          <span
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            title={adj.ai_error ?? ''}
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {isAudio ? 'Error al transcribir' : 'Error al analizar'}
                          </span>
                        )}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(adj.ai_extracted as any)?.tipo_documento && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 capitalize">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(adj.ai_extracted as any).tipo_documento === 'transcripcion_audio'
                              ? 'transcripción'
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              : (adj.ai_extracted as any).tipo_documento}
                          </span>
                        )}
                      </div>

                      {/* Summary / transcripción preview */}
                      {adj.ai_summary && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {adj.ai_summary}
                        </p>
                      )}

                      {/* Objeto (solo documentos) */}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {!isAudio && (adj.ai_extracted as any)?.objeto && (
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <span className="font-medium">Objeto:</span> {(adj.ai_extracted as any).objeto}
                        </p>
                      )}

                      {/* Hechos clave (solo documentos) */}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {!isAudio && Array.isArray((adj.ai_extracted as any)?.hechos_clave) && (adj.ai_extracted as any).hechos_clave.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(adj.ai_extracted as any).hechos_clave.map((h: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                              {h}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="shrink-0 flex items-center gap-0.5 mt-0.5">
                      {isAudio ? (
                        <>
                          {/* Reproducir / retry transcripción */}
                          <button
                            type="button"
                            onClick={() => handleLoadAudio(adj)}
                            disabled={isLoadingAudioThis || !!audioUrl}
                            title={audioUrl ? 'Reproductor activo' : 'Cargar audio'}
                            className="p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors disabled:opacity-40"
                          >
                            {isLoadingAudioThis
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Play className="h-3.5 w-3.5" />
                            }
                          </button>
                          {/* Reintentar transcripción si hay error */}
                          {hasError && (
                            <button
                              type="button"
                              onClick={() => handleRetryTranscribe(adj)}
                              disabled={isTranscribingThis}
                              title="Reintentar transcripción"
                              className="p-1 rounded text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors disabled:opacity-40"
                            >
                              {isTranscribingThis
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />
                              }
                            </button>
                          )}
                        </>
                      ) : (
                        /* Vista previa (imágenes/PDFs) */
                        <button
                          type="button"
                          onClick={() => handlePreview(adj)}
                          disabled={!!isPreviewingThis}
                          title={isImage ? 'Ver imagen' : 'Abrir PDF'}
                          className="p-1 rounded text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors disabled:opacity-40"
                        >
                          {isPreviewingThis
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Eye className="h-3.5 w-3.5" />
                          }
                        </button>
                      )}

                      {/* Renombrar */}
                      {isRenamingThis ? (
                        <button
                          type="button"
                          onClick={() => commitRename(adj)}
                          title="Confirmar nombre"
                          className="p-1 rounded text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRename(adj)}
                          title="Renombrar"
                          className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Eliminar */}
                      <button
                        type="button"
                        onClick={() => handleDelete(adj)}
                        disabled={isDeletingThis}
                        title="Eliminar adjunto"
                        className="p-1 rounded text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-40"
                      >
                        {isDeletingThis
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <X className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Player de audio — aparece después de cargar */}
                  {isAudio && audioUrl && (
                    <audio
                      controls
                      src={audioUrl}
                      className="w-full h-9 rounded"
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal preview imagen */}
      {preview && (
        <PreviewModal
          url={preview.url}
          nombre={preview.nombre}
          isImage={preview.isImage}
          onClose={() => {
            URL.revokeObjectURL(preview.url)
            setPreview(null)
          }}
        />
      )}
    </>
  )
}
