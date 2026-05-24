import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Gavel, Plus, Loader2, FileText, Trash2, AlertCircle, X, Check,
  ChevronRight, Search, Link as LinkIcon, ClipboardPaste, Upload,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
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

function FuenteBadge({ source }: { source: JurisprudenciaDocumento['source'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    infoleg:        { label: 'InfoLEG',  cls: 'bg-cyan-500/15 text-cyan-300' },
    saij:           { label: 'SAIJ',     cls: 'bg-violet-500/15 text-violet-300' },
    csjn:           { label: 'CSJN',     cls: 'bg-blue-500/15 text-blue-300' },
    manual_upload:  { label: 'Archivo',  cls: 'bg-zinc-500/15 text-zinc-300' },
    manual_paste:   { label: 'Pegado',   cls: 'bg-zinc-500/15 text-zinc-300' },
    otro:           { label: 'Otro',     cls: 'bg-zinc-500/15 text-zinc-300' },
  }
  const v = map[source] ?? map.otro
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', v.cls)}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={ingesta.isPending ? undefined : onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-white/10 bg-white dark:bg-zinc-900/90 shadow-xl mx-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-white dark:bg-zinc-900/90 z-10">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-violet-400" />
            Agregar fallo al corpus
          </h2>
          <button onClick={onClose} disabled={ingesta.isPending} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-white/5 px-5 pt-3">
          <div className="flex gap-1">
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
                  'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                  mode === t.v
                    ? 'border-violet-400 text-violet-300'
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
          {/* Modo URL */}
          {mode === 'url' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">URL del fallo *</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://servicios.infoleg.gob.ar/infolegInternet/verNorma.do?id=NNN o https://www.saij.gob.ar/..."
                  disabled={ingesta.isPending}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                />
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Fuentes soportadas: InfoLEG, SAIJ. La carátula y metadata se extraen automáticamente.
                </p>
              </div>
            </>
          )}

          {/* Modo upload */}
          {mode === 'upload' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Archivo *</label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setFile(f ?? null)
                    if (f && !caratula) setCaratula(f.name.replace(/\.(pdf|docx?|txt)$/i, ''))
                  }}
                  disabled={ingesta.isPending}
                  className="block w-full text-xs text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-violet-300 hover:file:bg-violet-500/20"
                />
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">PDF/DOCX nativamente digitales o TXT UTF-8. Máx. 50 MB.</p>
              </div>
            </>
          )}

          {/* Modo paste */}
          {mode === 'paste' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Texto del fallo *</label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Pegá acá el texto completo del fallo (mínimo 100 caracteres)..."
                  rows={10}
                  disabled={ingesta.isPending}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15 font-mono text-xs leading-relaxed"
                />
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  El chunker detecta automáticamente encabezado, considerandos y resuelve.
                  Asegurate que esos marcadores estén en el texto.
                </p>
              </div>
            </>
          )}

          {/* Metadata común */}
          <div className="pt-2 border-t border-white/5">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Metadata {mode === 'url' && '(se completa sola si la dejás vacía)'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Carátula {mode !== 'url' && '*'}
                </label>
                <input
                  value={caratula} onChange={(e) => setCaratula(e.target.value)}
                  placeholder="GIMENEZ, ROSA c/ MERCADO LIBRE S.R.L. s/ DAÑOS Y PERJUICIOS"
                  disabled={ingesta.isPending}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Tribunal</label>
                  <input
                    value={tribunal} onChange={(e) => setTribunal(e.target.value)}
                    placeholder="CSJN, CNCom. Sala C…"
                    disabled={ingesta.isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fecha</label>
                  <input
                    type="date"
                    value={fecha} onChange={(e) => setFecha(e.target.value)}
                    disabled={ingesta.isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Jurisdicción</label>
                  <input
                    value={jurisdiccion} onChange={(e) => setJurisdiccion(e.target.value)}
                    placeholder="Nacional, Tucumán…"
                    disabled={ingesta.isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Tipo</label>
                  <select
                    value={tipo} onChange={(e) => setTipo(e.target.value)}
                    disabled={ingesta.isPending}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                  >
                    {TIPOS.map(t => <option key={t.value} value={t.value} className="bg-zinc-900">{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-zinc-900/90">
          <button onClick={onClose} disabled={ingesta.isPending} className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || ingesta.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50 transition-opacity"
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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Gavel className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Jurisprudencia</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Corpus privado de fallos. Búsqueda semántica disponible desde BogaBot y al redactar escritos.
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar fallo
        </button>
      </div>

      {docs.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por carátula, tribunal, jurisdicción, sumario…"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
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
              className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
            >
              <FileText className="h-4 w-4 text-violet-400 shrink-0" />
              <Link to={`/jurisprudencia/${doc.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.caratula}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  {doc.tribunal && <span>{doc.tribunal}</span>}
                  {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
                  {doc.fecha && <span>· {doc.fecha}</span>}
                  {doc.estado === 'indexado' && (
                    <span className="text-emerald-400">· {doc.chunk_count} {doc.chunk_count === 1 ? 'chunk' : 'chunks'}</span>
                  )}
                  {doc.estado === 'error' && doc.error_message && (
                    <span className="text-rose-400 italic">· {doc.error_message.slice(0, 80)}</span>
                  )}
                </p>
              </Link>
              <FuenteBadge source={doc.source} />
              <EstadoBadge estado={doc.estado} />
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
