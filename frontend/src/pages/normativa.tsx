import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookMarked, Plus, Loader2, FileText, Trash2, AlertCircle, X,
  RotateCcw, Check, ChevronRight, Search,
  Link as LinkIcon, ClipboardPaste, Upload,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PageHeader } from '@/components/shared/page-header'
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
    pendiente:  { label: 'En cola',    cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
    procesando: { label: 'Procesando', cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
    indexado:   { label: 'Indexado',   cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    error:      { label: 'Error',      cls: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  } as const
  const v = map[estado] ?? map.pendiente
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold', v.cls)}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={isPending ? undefined : onClose} />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
            <BookMarked className="h-4 w-4 text-[var(--brand-accent)]" />
            Agregar norma al corpus
          </h2>
          <button onClick={onClose} disabled={isPending} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-zinc-200 px-5 pt-2 dark:border-white/[0.08]">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
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
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors',
                  mode === t.v
                    ? 'border-[var(--brand-navy)] text-[var(--brand-navy)] dark:border-[var(--brand-accent)] dark:text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white'
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
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">URL de la norma *</label>
              <input
                value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=NNN"
                disabled={isPending}
                className="field h-10"
              />
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                Fuentes soportadas: InfoLEG, SAIJ. La metadata (título, tipo, fecha) se autocompleta si la dejás vacía.
              </p>
            </div>
          )}

          {mode === 'upload' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Archivo *</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setFile(f ?? null)
                  if (f && !titulo) setTitulo(f.name.replace(/\.(pdf|docx?|txt)$/i, ''))
                }}
                disabled={isPending}
                className="block w-full text-xs text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-xl file:border file:border-zinc-200 file:bg-transparent file:px-3 file:py-2 file:text-xs file:font-bold file:text-zinc-700 hover:file:bg-zinc-50 dark:file:border-white/10 dark:file:text-zinc-200 dark:hover:file:bg-white/[0.06]"
              />
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">PDF/DOCX nativamente digitales o TXT UTF-8. Máx. 30 MB.</p>
            </div>
          )}

          {mode === 'paste' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Texto de la norma *</label>
              <textarea
                value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Pegá acá el texto completo (mínimo 200 caracteres). El chunker detecta artículos automáticamente."
                rows={10}
                disabled={isPending}
                className="field text-xs leading-relaxed"
              />
            </div>
          )}

          {/* Metadata común */}
          <div className="border-t border-zinc-200 pt-3 dark:border-white/[0.08]">
            <p className="eyebrow mb-2.5">
              Metadata {mode === 'url' && '(se autocompleta si la dejás vacía)'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                  Título {mode !== 'url' && '*'}
                </label>
                <input
                  value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Código Civil y Comercial de la Nación"
                  disabled={isPending}
                  className="field h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                    Tipo {mode !== 'url' && '*'}
                  </label>
                  <input
                    list="tipos-normativa"
                    value={tipo} onChange={(e) => setTipo(e.target.value)}
                    placeholder="ley, decreto…"
                    disabled={isPending}
                    className="field h-10"
                  />
                  <datalist id="tipos-normativa">
                    {TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Número</label>
                  <input
                    value={numero} onChange={(e) => setNumero(e.target.value)}
                    placeholder="24.240"
                    disabled={isPending}
                    className="field h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Jurisdicción</label>
                  <input
                    value={jurisdiccion} onChange={(e) => setJurisdiccion(e.target.value)}
                    placeholder="nacional, tucumán…"
                    disabled={isPending}
                    className="field h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Fecha</label>
                  <input
                    type="date"
                    value={fecha} onChange={(e) => setFecha(e.target.value)}
                    disabled={isPending}
                    className="field h-10"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Fuente</label>
                <input
                  value={fuente} onChange={(e) => setFuente(e.target.value)}
                  placeholder="InfoLEG, Boletín Oficial…"
                  disabled={isPending}
                  className="field h-10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <button onClick={onClose} disabled={isPending} className="btn btn-ghost border-transparent">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="btn btn-primary"
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
      <PageHeader
        className="mb-5"
        title="Normativa"
        subtitle="Biblioteca privada de leyes, decretos y códigos. Se usa como fundamento al redactar escritos."
        actions={
          <button onClick={() => setModalOpen(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Agregar norma
          </button>
        }
      />

      {docs.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, tipo, número, jurisdicción…"
            className="field h-11 pl-10"
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
              className="app-card group flex items-center gap-3 p-3.5 transition-colors hover:border-zinc-300 dark:hover:border-white/15"
            >
              <FileText className="h-4 w-4 shrink-0 text-[var(--brand-accent)]" />
              <Link to={`/normativa/${doc.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">{doc.titulo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400">
                  <span>{doc.tipo}</span>
                  {doc.numero && <span>· {doc.numero}</span>}
                  {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
                  {doc.estado === 'indexado' && (
                    <span className="text-emerald-600 dark:text-emerald-400">· {doc.chunk_count} {doc.chunk_count === 1 ? "fragmento" : "fragmentos"}</span>
                  )}
                  {doc.estado === 'error' && doc.error_message && (
                    <span className="italic text-rose-600 dark:text-rose-400">· {doc.error_message.slice(0, 80)}</span>
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
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-[var(--brand-accent)] dark:text-zinc-400 dark:hover:bg-white/10"
                  title="Reintentar"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setConfirmDelete(doc)}
                className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-all hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:text-zinc-400"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-600" />
            </div>
          ))}
        </div>
      )}

      {filtered.some(d => d.estado === 'error') && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-200">
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
