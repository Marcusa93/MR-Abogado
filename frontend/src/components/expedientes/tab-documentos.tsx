import { useState, useRef, useCallback } from 'react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAdjuntos, useUploadAdjunto, useDeleteAdjunto } from '@/hooks/use-adjuntos'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import {
  Paperclip,
  Plus,
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Download,
  Loader2,
  X,
  Eye,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon
  if (type.includes('pdf')) return FileText
  return File
}

const CATEGORIAS: { value: string; label: string }[] = [
  { value: 'dni', label: 'DNI' },
  { value: 'cuil', label: 'CUIL' },
  { value: 'demanda', label: 'Demanda' },
  { value: 'contestacion', label: 'Contestación' },
  { value: 'prueba', label: 'Prueba' },
  { value: 'poder', label: 'Poder' },
  { value: 'resolucion', label: 'Resolución / Auto' },
  { value: 'sentencia', label: 'Sentencia' },
  { value: 'cedula', label: 'Cédula / Notificación' },
  { value: 'escrito', label: 'Escrito presentado' },
  { value: 'otro', label: 'Otro' },
]

const CATEGORIA_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label])
)

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

function UploadDialog({
  open,
  onClose,
  expedienteId,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string
}) {
  const { profile } = useAuth()
  const upload = useUploadAdjunto()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      if (f.size > 50 * 1024 * 1024) {
        toast.error('Archivo muy grande', 'El tamaño máximo es 50 MB.')
        return
      }
      setFile(f)
      setNombreArchivo(f.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleSubmit = async () => {
    if (!file) return
    try {
      await upload.mutateAsync({
        expedienteId,
        file,
        customName: nombreArchivo.trim() || undefined,
        categoria: categoria || undefined,
        descripcion: descripcion.trim() || undefined,
        uploadedBy: profile?.id,
      })
      toast.success('Documento subido correctamente')
      setFile(null)
      setNombreArchivo('')
      setCategoria('')
      setDescripcion('')
      onClose()
    } catch (err) {
      toast.error('Error subiendo archivo', err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-slate-900 border border-white/10 p-6 shadow-xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Subir documento</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* File input */}
          <div>
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
            />
            {file ? (
              <div className="space-y-3">
                {/* Preview */}
                <div className="relative rounded-lg border border-white/10 overflow-hidden bg-black/20">
                  {file.type.startsWith('image/') ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Preview"
                      className="mx-auto max-h-48 object-contain"
                    />
                  ) : file.type === 'application/pdf' ? (
                    <iframe
                      src={URL.createObjectURL(file)}
                      className="w-full h-48"
                      title="Preview PDF"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-24">
                      <FileText className="h-10 w-10 text-zinc-900 dark:text-zinc-500" />
                    </div>
                  )}
                </div>
                {/* File info */}
                <div className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
                  <FileText className="h-5 w-5 text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                    <p className="text-xs text-zinc-900 dark:text-zinc-500">{formatFileSize(file.size)}{file.type.startsWith('image/') ? ' — se convertirá a PDF' : ''}</p>
                  </div>
                  <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-zinc-600 dark:text-zinc-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 py-8 text-zinc-600 dark:text-zinc-400 hover:border-amber-500/30 hover:text-amber-400 transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm">Hacé click para seleccionar un archivo</span>
                <span className="text-xs">PDF, JPG, PNG — se convierte a PDF — máx. 50 MB</span>
              </button>
            )}
          </div>

          {/* Nombre del archivo */}
          {file && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nombre del documento</label>
              <input
                value={nombreArchivo}
                onChange={(e) => setNombreArchivo(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                placeholder="Nombre del archivo..."
              />
            </div>
          )}

          {/* Categoria */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            >
              <option value="">Sin categoría</option>
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Descripción (opcional)</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              placeholder="Breve descripción del documento..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || upload.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function getPublicUrl(storagePath: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${supabaseUrl}/storage/v1/object/public/adjuntos/${storagePath}`
}

export function TabDocumentos({ expedienteId }: { expedienteId: string }) {
  const { data: adjuntos, isLoading } = useAdjuntos(expedienteId)
  const deleteAdjunto = useDeleteAdjunto()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      setDialogOpen(true)
    }
  }, [])

  // Category summary
  const categoryCounts = (adjuntos ?? []).reduce<Record<string, number>>((acc, adj: any) => {
    const cat = adj.categoria || 'sin categoría'
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})

  // Filtered list
  const filteredAdjuntos = filterCategoria
    ? (adjuntos ?? []).filter((adj: any) => (adj.categoria || 'sin categoría') === filterCategoria)
    : (adjuntos ?? [])

  const handleDownload = (storagePath: string, nombreOriginal: string) => {
    const url = getPublicUrl(storagePath)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreOriginal
    a.target = '_blank'
    a.click()
  }

  const handlePreview = (storagePath: string, name: string) => {
    setPreviewUrl(getPublicUrl(storagePath))
    setPreviewName(name)
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteAdjunto.mutateAsync({
        adjuntoId: deleteTarget.id,
        storagePath: deleteTarget.path,
        expedienteId,
      })
      toast.success('Documento eliminado')
    } catch {
      // Error handled by mutation
    }
    setDeleteTarget(null)
  }, [deleteTarget, deleteAdjunto, expedienteId])

  return (
    <>
      <Card
        title={`Documentos${adjuntos?.length ? ` (${adjuntos.length})` : ''}`}
        headerRight={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Subir
          </button>
        }
      >
        {/* Drag & drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={isDragging ? 'rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/5 p-2 transition-colors' : ''}
        >
          {isDragging && (
            <div className="flex flex-col items-center justify-center py-6 text-amber-400">
              <Upload className="h-8 w-8 mb-2" />
              <p className="text-sm font-medium">Soltá el archivo acá</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-400" />
            </div>
          ) : !adjuntos || adjuntos.length === 0 ? (
            <EmptyState
              icon={Paperclip}
              title="Sin documentos"
              description="Subí documentos arrastrándolos acá o usando el botón Subir."
              size="sm"
            />
          ) : (
            <>
              {/* Category filter pills */}
              {Object.keys(categoryCounts).length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    onClick={() => setFilterCategoria('')}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      !filterCategoria
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/5 text-zinc-600 dark:text-zinc-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    Todos ({adjuntos.length})
                  </button>
                  {Object.entries(categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <button
                        key={cat}
                        onClick={() => setFilterCategoria(cat === filterCategoria ? '' : cat)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                          filterCategoria === cat
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-white/5 text-zinc-600 dark:text-zinc-400 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {CATEGORIA_LABELS[cat] ?? cat} ({count})
                      </button>
                    ))}
                </div>
              )}

              <div className="space-y-2">
                {filteredAdjuntos.map((adj: any) => {
              const mimeType = adj.tipo_mime ?? adj.tipo_archivo ?? ''
              const fileName = adj.nombre_archivo ?? adj.nombre_original ?? 'Documento'
              const fileSize = adj.tamano_bytes ?? adj.tamano ?? 0
              const Icon = getFileIcon(mimeType)
              return (
                <div
                  key={adj.id}
                  className="flex items-center gap-3 rounded-lg border border-white/5 p-3 hover:bg-white/5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                    <Icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {fileName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-zinc-900 dark:text-zinc-500">
                      <span>{formatFileSize(fileSize)}</span>
                      {adj.categoria && (
                        <>
                          <span>·</span>
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{CATEGORIA_LABELS[adj.categoria] ?? adj.categoria}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{formatDate(adj.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePreview(adj.storage_path, fileName)}
                      className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-amber-400 hover:bg-amber-950/30"
                      title="Ver documento"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDownload(adj.storage_path, fileName)}
                      className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-blue-400 hover:bg-blue-950/30"
                      title="Descargar"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: adj.id, path: adj.storage_path })}
                      disabled={deleteAdjunto.isPending}
                      className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
              </div>
            </>
          )}
        </div>
      </Card>

      <UploadDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        expedienteId={expedienteId}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Eliminar documento"
        description="¿Seguro que querés eliminar este documento? Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteAdjunto.isPending}
      />

      {/* Document preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative w-full max-w-4xl h-[85vh] mx-4 rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{previewName}</p>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-blue-400"
                  title="Abrir en nueva pestaña"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              src={previewUrl}
              className="flex-1 w-full bg-white"
              title="Vista previa"
            />
          </div>
        </div>
      )}
    </>
  )
}
