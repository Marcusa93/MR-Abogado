import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Gavel, Plus, Loader2, FileText, Trash2, AlertCircle, X, Check,
  ChevronRight, Search, Link as LinkIcon, ClipboardPaste, Upload,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PageHeader } from '@/components/shared/page-header'
import {
  useJurisprudenciaList, useIngestaJurisprudencia, useDeleteJurisprudencia,
  type JurisprudenciaDocumento, type IngestaInput,
} from '@/hooks/use-jurisprudencia'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const TIPOS = [
  { value: 'sentencia',       label: 'Sentencia' },
  { value: 'auto',            label: 'Auto' },
  { value: 'fallo_plenario',  label: 'Fallo plenario' },
  { value: 'sumario',         label: 'Sumario' },
  { value: 'dictamen',        label: 'Dictamen' },
  { value: 'otro',            label: 'Otro' },
] as const

function EstadoBadge({ estado }: { estado: JurisprudenciaDocumento['estado'] }) {
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

function FuenteBadge({ source }: { source: JurisprudenciaDocumento['source'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    infoleg:        { label: 'InfoLEG',  cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
    saij:           { label: 'SAIJ',     cls: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
    csjn:           { label: 'CSJN',     cls: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300' },
    manual_upload:  { label: 'Archivo',  cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
    manual_paste:   { label: 'Pegado',   cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
    otro:           { label: 'Otro',     cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  }
  const v = map[source] ?? map.otro
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold', v.cls)}>
      {v.label}
    </span>
  )
}

// ─── Modal de ingesta con 3 tabs ──────────────────────────────────────────

type Mode = 'url' | 'paste' | 'upload'

function IngestaModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [caratula, setCaratula] = useState('')
  const [tribunal, setTribunal] = useState('')
  const [fecha, setFecha] = useState('')
  const [jurisdiccion, setJurisdiccion] = useState('')
  const [tipo, setTipo] = useState<string>('sentencia')
  const ingesta = useIngestaJurisprudencia()

  const canSubmit = (
    (mode === 'url'    && url.trim().length > 10)
    || (mode === 'paste'  && texto.trim().length >= 100 && caratula.trim().length > 0)
    || (mode === 'upload' && file !== null && caratula.trim().length > 0)
  )

  const submit = () => {
    let input: IngestaInput
    if (mode === 'url') {
      input = {
        mode: 'url',
        url: url.trim(),
        caratula: caratula.trim() || undefined,
        tribunal: tribunal.trim() || undefined,
        fecha: fecha || undefined,
        jurisdiccion: jurisdiccion.trim() || undefined,
        tipo,
      }
    } else if (mode === 'paste') {
      input = {
        mode: 'paste',
        texto: texto.trim(),
        caratula: caratula.trim(),
        tribunal: tribunal.trim() || undefined,
        fecha: fecha || undefined,
        jurisdiccion: jurisdiccion.trim() || undefined,
        tipo,
      }
    } else {
      input = {
        mode: 'upload',
        file: file!,
        caratula: caratula.trim(),
        tribunal: tribunal.trim() || undefined,
        fecha: fecha || undefined,
        jurisdiccion: jurisdiccion.trim() || undefined,
        tipo,
      }
    }

    ingesta.mutate(input, {
      onSuccess: (data) => {
        if (data.already_exists) {
          toast.success(`Este fallo ya estaba en tu corpus (${data.chunk_count} chunks).`)
        } else {
          toast.success(`Fallo indexado en ${data.chunk_count} fragmentos.`)
        }
        onClose()
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={ingesta.isPending ? undefined : onClose} />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
            <Gavel className="h-4 w-4 text-[var(--brand-accent)]" />
            Agregar fallo al corpus
          </h2>
          <button onClick={onClose} disabled={ingesta.isPending} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-200 px-5 pt-2 dark:border-white/[0.08]">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {([
              { v: 'url',    label: 'Desde URL',  icon: LinkIcon },
              { v: 'upload', label: 'Subir archivo', icon: Upload },
              { v: 'paste',  label: 'Pegar texto', icon: ClipboardPaste },
            ] as const).map(t => (
              <button
                key={t.v}
                onClick={() => setMode(t.v)}
                disabled={ingesta.isPending}
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
          {/* Modo URL */}
          {mode === 'url' && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">URL del fallo *</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=NNN o https://www.saij.gob.ar/..."
                  disabled={ingesta.isPending}
                  className="field h-10"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Fuentes soportadas: InfoLEG, SAIJ. La carátula y metadata se extraen automáticamente.
                </p>
              </div>
            </>
          )}

          {/* Modo upload */}
          {mode === 'upload' && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Archivo *</label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setFile(f ?? null)
                    if (f && !caratula) setCaratula(f.name.replace(/\.(pdf|docx?|txt)$/i, ''))
                  }}
                  disabled={ingesta.isPending}
                  className="block w-full text-xs text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-xl file:border file:border-zinc-200 file:bg-transparent file:px-3 file:py-2 file:text-xs file:font-bold file:text-zinc-700 hover:file:bg-zinc-50 dark:file:border-white/10 dark:file:text-zinc-200 dark:hover:file:bg-white/[0.06]"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">PDF/DOCX nativamente digitales o TXT UTF-8. Máx. 50 MB.</p>
              </div>
            </>
          )}

          {/* Modo paste */}
          {mode === 'paste' && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Texto del fallo *</label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Pegá acá el texto completo del fallo (mínimo 100 caracteres)..."
                  rows={10}
                  disabled={ingesta.isPending}
                  className="field text-xs leading-relaxed"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  El chunker detecta automáticamente encabezado, considerandos y resuelve.
                  Asegurate que esos marcadores estén en el texto.
                </p>
              </div>
            </>
          )}

          {/* Metadata común */}
          <div className="border-t border-zinc-200 pt-3 dark:border-white/[0.08]">
            <p className="eyebrow mb-2.5">
              Metadata {mode === 'url' && '(se completa sola si la dejás vacía)'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                  Carátula {mode !== 'url' && '*'}
                </label>
                <input
                  value={caratula} onChange={(e) => setCaratula(e.target.value)}
                  placeholder="GIMENEZ, ROSA c/ MERCADO LIBRE S.R.L. s/ DAÑOS Y PERJUICIOS"
                  disabled={ingesta.isPending}
                  className="field h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Tribunal</label>
                  <input
                    value={tribunal} onChange={(e) => setTribunal(e.target.value)}
                    placeholder="CSJN, CNCom. Sala C…"
                    disabled={ingesta.isPending}
                    className="field h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Fecha</label>
                  <input
                    type="date"
                    value={fecha} onChange={(e) => setFecha(e.target.value)}
                    disabled={ingesta.isPending}
                    className="field h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Jurisdicción</label>
                  <input
                    value={jurisdiccion} onChange={(e) => setJurisdiccion(e.target.value)}
                    placeholder="Nacional, Tucumán…"
                    disabled={ingesta.isPending}
                    className="field h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Tipo</label>
                  <select
                    value={tipo} onChange={(e) => setTipo(e.target.value)}
                    disabled={ingesta.isPending}
                    className="field h-10"
                  >
                    {TIPOS.map(t => <option key={t.value} value={t.value} className="bg-zinc-900">{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <button onClick={onClose} disabled={ingesta.isPending} className="btn btn-ghost border-transparent">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || ingesta.isPending}
            className="btn btn-primary"
          >
            {ingesta.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {ingesta.isPending ? 'Indexando…' : 'Agregar al corpus'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────

export default function JurisprudenciaPage() {
  const { data: docs = [], isLoading } = useJurisprudenciaList()
  const deleteMut = useDeleteJurisprudencia()
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<JurisprudenciaDocumento | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(d =>
      d.caratula.toLowerCase().includes(q)
      || (d.tribunal ?? '').toLowerCase().includes(q)
      || (d.jurisdiccion ?? '').toLowerCase().includes(q)
      || (d.sumario ?? '').toLowerCase().includes(q)
    )
  }, [docs, search])

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <PageHeader
        className="mb-5"
        title="Jurisprudencia"
        subtitle="Corpus privado de fallos. Búsqueda semántica disponible desde BogaBot y al redactar escritos."
        actions={
          <button onClick={() => setModalOpen(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Agregar fallo
          </button>
        }
      />

      {docs.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por carátula, tribunal, jurisdicción, sumario…"
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
          icon={Gavel}
          title="Tu corpus de fallos está vacío"
          description="Subí sentencias relevantes a tu práctica: pegá un link de InfoLEG/SAIJ, arrastrá un PDF, o pegá el texto. Cada fallo se chunkea por sección (encabezado/considerandos/resuelve) y queda disponible para BogaBot."
          actionLabel="Agregar primer fallo"
          onAction={() => setModalOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Ningún fallo coincide con "{search}".</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <div
              key={doc.id}
              className="app-card group flex items-center gap-3 p-3.5 transition-colors hover:border-zinc-300 dark:hover:border-white/15"
            >
              <FileText className="h-4 w-4 shrink-0 text-[var(--brand-accent)]" />
              <Link to={`/jurisprudencia/${doc.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">{doc.caratula}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400">
                  {doc.tribunal && <span>{doc.tribunal}</span>}
                  {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
                  {doc.fecha && <span>· {doc.fecha}</span>}
                  {doc.estado === 'indexado' && (
                    <span className="text-emerald-600 dark:text-emerald-400">· {doc.chunk_count} {doc.chunk_count === 1 ? "fragmento" : "fragmentos"}</span>
                  )}
                  {doc.estado === 'error' && doc.error_message && (
                    <span className="italic text-rose-600 dark:text-rose-400">· {doc.error_message.slice(0, 80)}</span>
                  )}
                </p>
              </Link>
              <FuenteBadge source={doc.source} />
              <EstadoBadge estado={doc.estado} />
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
          Si un PDF falla, probablemente sea escaneado. Convertilo a PDF digital o pegá el texto directamente.
        </div>
      )}

      {modalOpen && <IngestaModal onClose={() => setModalOpen(false)} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          deleteMut.mutate(confirmDelete, {
            onSuccess: () => { toast.success('Fallo eliminado'); setConfirmDelete(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        title="Eliminar fallo"
        description={`¿Eliminar "${confirmDelete?.caratula}"? Los chunks y las fijaciones a expedientes se eliminan en cascada.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
