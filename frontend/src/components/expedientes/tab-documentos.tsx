import { useState, useRef, useCallback } from 'react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAdjuntos, useUploadAdjunto, useDeleteAdjunto, useAnalyzeAdjunto } from '@/hooks/use-adjuntos'
import { createClient } from '@/lib/supabase/client'
import { AdjuntoChatPanel } from './adjunto-chat-panel'
import { cn } from '@/lib/utils'
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
  Sparkles,
  AlertCircle,
  MessageSquare,
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
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900/80 border border-white/10 p-6 shadow-xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Subir documento</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200">
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
                      <FileText className="h-10 w-10 text-zinc-700 dark:text-zinc-300" />
                    </div>
                  )}
                </div>
                {/* File info */}
                <div className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
                  <FileText className="h-5 w-5 text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{formatFileSize(file.size)}{file.type.startsWith('image/') ? ' — se convertirá a PDF' : ''}</p>
                  </div>
                  <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-zinc-600 dark:text-zinc-300 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 py-8 text-zinc-600 dark:text-zinc-300 hover:border-amber-500/30 hover:text-amber-400 transition-colors"
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
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Nombre del documento</label>
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
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Categoría</label>
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
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Descripción (opcional)</label>
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
// AI block — render of ai_summary + chips extraídos
// ---------------------------------------------------------------------------

const AUTO_ANALYZE_CATEGORIAS_FE = new Set(['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion'])

interface RubroExtracted {
  concepto: string
  monto: number | null
  moneda: 'ARS' | 'USD'
  fundamento?: string | null
}
interface NormaExtracted { norma: string; uso?: string | null }
interface JurisExtracted { cita: string; uso?: string | null }
interface AdjuntoExtractedShape {
  tipo_documento?: string
  partes?: { actores?: string[]; demandados?: string[] }
  objeto?: string | null
  hechos_clave?: string[]
  rubros_reclamados?: RubroExtracted[]
  normativa_citada?: NormaExtracted[]
  jurisprudencia_citada?: JurisExtracted[]
  resultado?: string | null
}

function formatMonto(monto: number | null, moneda: string): string {
  if (monto == null) return 'a determinar'
  const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `${moneda === 'USD' ? 'US$ ' : '$'}${fmt.format(monto)}`
}

function AdjuntoAiBlock({
  summary,
  extracted,
  error,
  pending,
  onRetry,
  isRetrying,
}: {
  summary: string | null
  extracted: AdjuntoExtractedShape | null
  error: string | null
  pending: boolean
  onRetry: () => void
  isRetrying: boolean
}) {
  if (pending) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-500/15 bg-violet-500/[0.04] px-2 py-1 text-[11px] text-violet-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Analizando con IA…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/[0.05] px-2.5 py-1.5 text-[11px]">
        <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-red-300 line-clamp-2" title={error}>{error}</p>
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200 underline disabled:opacity-50"
          >
            {isRetrying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!summary && !extracted) return null

  const rubros = extracted?.rubros_reclamados ?? []
  const normas = extracted?.normativa_citada ?? []
  const juris = extracted?.jurisprudencia_citada ?? []
  const hasChips = rubros.length > 0 || normas.length > 0 || juris.length > 0

  return (
    <div className="mt-2 rounded-md border border-violet-500/15 bg-violet-500/[0.04] px-2.5 py-2 space-y-1.5">
      {summary && (
        <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-snug flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0 mt-[2px] text-violet-400" />
          <span className="flex-1">{summary}</span>
        </p>
      )}

      {hasChips && (
        <div className="flex items-center flex-wrap gap-1.5">
          {rubros.slice(0, 6).map((r, i) => (
            <span
              key={`r-${i}`}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300"
              title={r.fundamento ?? undefined}
            >
              {r.concepto}: {formatMonto(r.monto, r.moneda)}
            </span>
          ))}
          {rubros.length > 6 && (
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">+{rubros.length - 6} rubros</span>
          )}
          {normas.slice(0, 4).map((n, i) => (
            <span
              key={`n-${i}`}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
              title={n.uso ?? undefined}
            >
              {n.norma}
            </span>
          ))}
          {normas.length > 4 && (
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">+{normas.length - 4} normas</span>
          )}
          {juris.slice(0, 3).map((j, i) => (
            <span
              key={`j-${i}`}
              className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300"
              title={j.uso ?? undefined}
            >
              {j.cita}
            </span>
          ))}
        </div>
      )}

      {extracted?.resultado && (
        <p className="text-[11px] text-rose-300/90 italic leading-snug">
          → {extracted.resultado}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// El bucket `adjuntos` es privado: usamos signed URLs (60 min) en vez de public URL.
async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('adjuntos')
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo generar URL de acceso')
  }
  return data.signedUrl
}

export function TabDocumentos({ expedienteId }: { expedienteId: string }) {
  const { data: adjuntos, isLoading } = useAdjuntos(expedienteId)
  const deleteAdjunto = useDeleteAdjunto()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [previewAdjuntoId, setPreviewAdjuntoId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [filterCategoria, setFilterCategoria] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const analyzeAdjunto = useAnalyzeAdjunto()

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

  const handleDownload = async (storagePath: string, nombreOriginal: string) => {
    try {
      const url = await getSignedUrl(storagePath)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreOriginal
      a.target = '_blank'
      a.click()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descargar el archivo')
    }
  }

  const handlePreview = async (storagePath: string, name: string, adjuntoId: string) => {
    try {
      const url = await getSignedUrl(storagePath)
      setPreviewUrl(url)
      setPreviewName(name)
      setPreviewAdjuntoId(adjuntoId)
      setChatOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el archivo')
    }
  }

  const handleClosePreview = () => {
    setPreviewUrl(null)
    setPreviewAdjuntoId(null)
    setChatOpen(false)
  }

  const handleAnalyze = async (adj: { id: string; storage_path: string }) => {
    try {
      await analyzeAdjunto.mutateAsync({
        adjuntoId: adj.id,
        expedienteId,
        storagePath: adj.storage_path,
        force: true,
      })
      toast.success('Documento analizado con IA')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo analizar')
    }
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
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-300" />
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
                        : 'bg-white/5 text-zinc-600 dark:text-zinc-300 border border-white/10 hover:bg-white/10'
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
                            : 'bg-white/5 text-zinc-600 dark:text-zinc-300 border border-white/10 hover:bg-white/10'
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
              const isAnalyzing = analyzeAdjunto.isPending && analyzeAdjunto.variables?.adjuntoId === adj.id
              // Pending = en categorías auto-trigger y todavía sin resultado ni error
              const isPending =
                !adj.ai_analyzed_at && !adj.ai_error && AUTO_ANALYZE_CATEGORIAS_FE.has(adj.categoria ?? '')
              const showAnalyzeButton =
                !adj.ai_analyzed_at && !isPending && !isAnalyzing
              return (
                <div
                  key={adj.id}
                  className="rounded-lg border border-white/5 p-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                      <Icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {fileName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
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
                      <AdjuntoAiBlock
                        summary={adj.ai_summary ?? null}
                        extracted={adj.ai_extracted ?? null}
                        error={adj.ai_error ?? null}
                        pending={isPending || isAnalyzing}
                        onRetry={() => handleAnalyze(adj)}
                        isRetrying={isAnalyzing}
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {showAnalyzeButton && (
                        <button
                          onClick={() => handleAnalyze(adj)}
                          disabled={isAnalyzing}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                          title="Analizar con IA — extrae rubros, normativa y jurisprudencia"
                        >
                          <Sparkles className="h-3 w-3" />
                          Analizar
                        </button>
                      )}
                      <button
                        onClick={() => handlePreview(adj.storage_path, fileName, adj.id)}
                        className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-amber-400 hover:bg-amber-950/30"
                        title="Ver documento"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownload(adj.storage_path, fileName)}
                        className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-blue-400 hover:bg-blue-950/30"
                        title="Descargar"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: adj.id, path: adj.storage_path })}
                        disabled={deleteAdjunto.isPending}
                        className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-red-400 hover:bg-red-950/30"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
          <div className={cn(
            "relative h-[88vh] mx-4 rounded-xl border border-white/10 bg-white dark:bg-zinc-900/80 shadow-2xl overflow-hidden flex flex-col transition-[max-width] duration-200",
            chatOpen ? "w-full max-w-6xl" : "w-full max-w-4xl"
          )}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{previewName}</p>
              <div className="flex items-center gap-2">
                {previewAdjuntoId && (
                  <button
                    onClick={() => setChatOpen(v => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                      chatOpen
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                    )}
                    title="Preguntar al documento con IA"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {chatOpen ? 'Cerrar chat' : 'Preguntar al doc'}
                  </button>
                )}
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-blue-400"
                  title="Abrir en nueva pestaña"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={handleClosePreview}
                  className="rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 flex min-h-0">
              <iframe
                src={previewUrl}
                className={cn("h-full bg-white transition-[width] duration-200", chatOpen ? "w-[60%]" : "w-full")}
                title="Vista previa"
              />
              {chatOpen && previewAdjuntoId && (
                <div className="w-[40%] min-w-[320px]">
                  <AdjuntoChatPanel
                    adjuntoId={previewAdjuntoId}
                    fileName={previewName}
                    expedienteId={expedienteId}
                    onClose={() => setChatOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
