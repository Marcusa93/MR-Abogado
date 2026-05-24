import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookMarked, Plus, Loader2, FileText, Trash2, AlertCircle, X,
  RotateCcw, Check, ChevronRight, Search,
  Link as LinkIcon, ClipboardPaste, Upload,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  useNormativaList, useUploadNormativa, useDeleteNormativa, useReindexNormativa,
  useIngestaNormativaUrl, useIngestaNormativaPaste,
  type NormativaDocumento, type UploadInput,
} from '@/hooks/use-normativa'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const TIPOS_SUGERIDOS = ['ley', 'decreto', 'codigo', 'ordenanza', 'resolucion', 'acordada', 'otro']

function EstadoBadge({ estado }: { estado: NormativaDocumento['estado'] }) {
  const map = {
    pendiente:  { label: 'En cola',    cls: 'bg-zinc-700/30 text-zinc-300' },
    procesando: { label: 'Procesando', cls: 'bg-amber-700/30 text-amber-300' },
    indexado:   { label: 'Indexado',   cls: 'bg-emerald-700/30 text-emerald-300' },
    error:      { label: 'Error',      cls: 'bg-rose-700/30 text-rose-300' },
  } as const
  const v = map[estado] ?? map.pendiente
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', v.cls)}>
      {v.label}
    </span>
  )
}

// ─── Modal de ingesta con 3 tabs ──────────────────────────────────────────

type Mode = 'url' | 'upload' | 'paste'

function IngestaModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('')
  const [numero, setNumero] = useState('')
  const [jurisdiccion, setJurisdiccion] = useState('')
  const [fuente, setFuente] = useState('')
  const [fecha, setFecha] = useState('')

  const upload = useUploadNormativa()
  const ingUrl = useIngestaNormativaUrl()
  const ingPaste = useIngestaNormativaPaste()
  const isPending = upload.isPending || ingUrl.isPending || ingPaste.isPending

  const canSubmit = (
    (mode === 'url'    && url.trim().length > 10)
    || (mode === 'upload' && file !== null && titulo.trim() && tipo.trim())
    || (mode === 'paste'  && texto.trim().length >= 200 && titulo.trim() && tipo.trim())
  )

  const submit = () => {
    if (mode === 'url') {
      ingUrl.mutate({
        url: url.trim(),
        titulo: titulo.trim() || undefined,
        tipo: tipo.trim() || undefined,
        numero: numero || undefined,
        jurisdiccion: jurisdiccion || undefined,
        fuente: fuente || undefined,
        fecha: fecha || undefined,
      }, {
        onSuccess: () => { toast.success('Norma importada. Indexando…'); onClose() },
        onError: (err) => toast.error(err.message),
      })
    } else if (mode === 'upload') {
      if (!file) return
      const input: UploadInput = {
        file, titulo: titulo.trim(), tipo: tipo.trim(),
        numero: numero || undefined, jurisdiccion: jurisdiccion || undefined,
        fuente: fuente || undefined, fecha: fecha || undefined,
      }
      upload.mutate(input, {
        onSuccess: () => { toast.success('Documento subido. Indexando…'); onClose() },
        onError: (err) => toast.error(err.message),
      })
    } else if (mode === 'paste') {
      ingPaste.mutate({
        texto: texto.trim(), titulo: titulo.trim(), tipo: tipo.trim(),
        numero: numero || undefined, jurisdiccion: jurisdiccion || undefined,
        fuente: fuente || undefined, fecha: fecha || undefined,
      }, {
        onSuccess: () => { toast.success('Norma agregada. Indexando…'); onClose() },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={isPending ? undefined : onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-white/10 bg-white dark:bg-zinc-900/90 shadow-xl mx-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-white dark:bg-zinc-900/90 z-10">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-cyan-400" />
            Agregar norma al corpus
          </h2>
          <button onClick={onClose} disabled={isPending} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/5 px-5 pt-3">
          <div className="flex gap-1">
            {([
              { v: 'url',    label: 'Desde URL',    icon: LinkIcon },
              { v: 'upload', label: 'Subir archivo', icon: Upload },
              { v: 'paste',  label: 'Pegar texto',  icon: ClipboardPaste },
            ] as const).map(t => (
              <button
                key={t.v}
                onClick={() => setMode(t.v)}
                disabled={isPending}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                  mode === t.v
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          {mode === 'url' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">URL de la norma *</label>
              <input
                value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=NNN"
                disabled={isPending}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Fuentes soportadas: InfoLEG, SAIJ. La metadata (título, tipo, fecha) se autocompleta si la dejás vacía.
              </p>
            </div>
          )}

          {mode === 'upload' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Archivo *</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setFile(f ?? null)
                  if (f && !titulo) setTitulo(f.name.replace(/\.(pdf|docx?|txt)$/i, ''))
                }}
                disabled={isPending}
                className="block w-full text-xs text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-cyan-300 hover:file:bg-cyan-500/20"
              />
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">PDF/DOCX nativamente digitales o TXT UTF-8. Máx. 30 MB.</p>
            </div>
          )}

          {mode === 'paste' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Texto de la norma *</label>
              <textarea
                value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Pegá acá el texto completo (mínimo 200 caracteres). El chunker detecta artículos automáticamente."
                rows={10}
                disabled={isPending}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15 font-mono text-xs leading-relaxed"
              />
            </div>
          )}

          {/* Metadata común */}
          <div className="pt-2 border-t border-white/5">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Metadata {mode === 'url' && '(se autocompleta si la dejás vacía)'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Título {mode !== 'url' && '*'}
                </label>
                <input
                  value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Código Civil y Comercial de la Nación"
                  disabled={isPending}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tipo {mode !== 'url' && '*'}
                  </label>
                  <input
                    list="tipos-normativa"
                    value={tipo} onChange={(e) => setTipo(e.target.value)}
                    placeholder="ley, decreto…"
                    disabled={isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                  <datalist id="tipos-normativa">
                    {TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Número</label>
                  <input
                    value={numero} onChange={(e) => setNumero(e.target.value)}
                    placeholder="24.240"
                    disabled={isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Jurisdicción</label>
                  <input
                    value={jurisdiccion} onChange={(e) => setJurisdiccion(e.target.value)}
                    placeholder="nacional, tucumán…"
                    disabled={isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fecha</label>
                  <input
                    type="date"
                    value={fecha} onChange={(e) => setFecha(e.target.value)}
                    disabled={isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fuente</label>
                <input
                  value={fuente} onChange={(e) => setFuente(e.target.value)}
                  placeholder="InfoLEG, Boletín Oficial…"
                  disabled={isPending}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-zinc-900/90">
          <button onClick={onClose} disabled={isPending} className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {isPending ? 'Indexando…' : 'Agregar al corpus'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────

export default function NormativaPage() {
  const { data: docs = [], isLoading } = useNormativaList()
  const reindex = useReindexNormativa()
  const deleteMut = useDeleteNormativa()
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<NormativaDocumento | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(d =>
      d.titulo.toLowerCase().includes(q)
      || d.tipo.toLowerCase().includes(q)
      || (d.numero ?? '').toLowerCase().includes(q)
      || (d.jurisdiccion ?? '').toLowerCase().includes(q)
    )
  }, [docs, search])

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2">
            <BookMarked className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Normativa</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Biblioteca privada de leyes, decretos y códigos. Se usa como fundamento al redactar escritos.
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar norma
        </button>
      </div>

      {docs.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, tipo, número, jurisdicción…"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Tu biblioteca está vacía"
          description="Subí CCyCN, CPCCN, leyes especiales o lo que uses habitualmente. Cada documento se chunkea por artículo y queda disponible para fundar tus escritos."
          actionLabel="Agregar primera norma"
          onAction={() => setModalOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Ningún documento coincide con "{search}".</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <div
              key={doc.id}
              className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
            >
              <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
              <Link to={`/normativa/${doc.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.titulo}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{doc.tipo}</span>
                  {doc.numero && <span>· {doc.numero}</span>}
                  {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
                  {doc.estado === 'indexado' && (
                    <span className="text-emerald-400">· {doc.chunk_count} {doc.chunk_count === 1 ? 'chunk' : 'chunks'}</span>
                  )}
                  {doc.estado === 'error' && doc.error_message && (
                    <span className="text-rose-400 italic">· {doc.error_message.slice(0, 80)}</span>
                  )}
                </p>
              </Link>
              <EstadoBadge estado={doc.estado} />
              {(doc.estado === 'error' || doc.estado === 'pendiente') && (
                <button
                  onClick={() => reindex.mutate(doc.id, {
                    onSuccess: () => toast.success('Reintentando indexación…'),
                    onError: (err) => toast.error(err.message),
                  })}
                  disabled={reindex.isPending}
                  className="shrink-0 rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-cyan-300 hover:bg-white/10"
                  title="Reintentar"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => setConfirmDelete(doc)}
                className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-rose-400 hover:bg-white/10 transition-all"
                title="Eliminar"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {filtered.some(d => d.estado === 'error') && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 flex items-start gap-2 text-xs text-rose-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Si un PDF falla con "no se pudo extraer texto", probablemente es escaneado. Convertilo a PDF digital antes de subirlo.
        </div>
      )}

      {modalOpen && <IngestaModal onClose={() => setModalOpen(false)} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          deleteMut.mutate(confirmDelete, {
            onSuccess: () => { toast.success('Documento eliminado'); setConfirmDelete(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        title="Eliminar documento"
        description={`¿Eliminar "${confirmDelete?.titulo}"? Los chunks y las fijaciones a expedientes se eliminan en cascada.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
