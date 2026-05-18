import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookMarked, Pin, PinOff, Plus, Loader2, X, FileText, Search, ExternalLink,
} from 'lucide-react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  useNormativaList,
  useExpedienteNormativa,
  useFijarNormativa,
  useDesfijarNormativa,
  type NormativaDocumento,
  type ExpedienteNormativaRow,
} from '@/hooks/use-normativa'
import { toast } from '@/stores/toast-store'

interface Props { expedienteId: string }

// ─── Dialog: fijar norma desde la biblioteca ──────────────────────────────

function FijarDialog({
  expedienteId, fijadas, onClose,
}: {
  expedienteId: string
  fijadas: Set<string>
  onClose: () => void
}) {
  const { data: biblio = [], isLoading } = useNormativaList()
  const fijar = useFijarNormativa()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<NormativaDocumento | null>(null)
  const [nota, setNota] = useState('')

  const disponibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return biblio
      .filter(d => d.estado === 'indexado')
      .filter(d => !fijadas.has(d.id))
      .filter(d => {
        if (!q) return true
        return d.titulo.toLowerCase().includes(q)
          || d.tipo.toLowerCase().includes(q)
          || (d.numero ?? '').toLowerCase().includes(q)
      })
  }, [biblio, fijadas, search])

  const submit = () => {
    if (!selected) return
    fijar.mutate(
      { expedienteId, documentoId: selected.id, nota: nota.trim() || undefined },
      {
        onSuccess: () => { toast.success('Norma fijada'); onClose() },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={fijar.isPending ? undefined : onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Pin className="h-4 w-4 text-violet-400" />
            Fijar norma al expediente
          </h2>
          <button onClick={onClose} disabled={fijar.isPending} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected ? (
          <>
            <div className="px-5 py-3 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en tu biblioteca…"
                  autoFocus
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                />
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">
                Solo aparecen normas <strong>indexadas</strong> y no fijadas todavía. Las normas fijadas SIEMPRE van como contexto al redactar escritos en este expediente.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                </div>
              ) : disponibles.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-zinc-400">
                    {biblio.length === 0
                      ? 'Tu biblioteca está vacía.'
                      : search.trim()
                      ? 'Ningún documento coincide con tu búsqueda.'
                      : 'No hay más normas disponibles para fijar.'}
                  </p>
                  <Link to="/normativa" className="mt-3 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
                    Ir a Normativa <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {disponibles.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelected(doc)}
                      className="w-full text-left flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 hover:bg-white/[0.04] hover:border-violet-500/30 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.titulo}</p>
                        <p className="text-[10px] text-zinc-500">
                          {doc.tipo}
                          {doc.numero && <> · {doc.numero}</>}
                          {doc.jurisdiccion && <> · {doc.jurisdiccion}</>}
                          <> · {doc.chunk_count} chunks</>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div className="rounded-lg border border-violet-500/30 bg-violet-950/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-violet-300 mb-1">Vas a fijar</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{selected.titulo}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {selected.tipo}{selected.numero && <> · {selected.numero}</>}{selected.jurisdiccion && <> · {selected.jurisdiccion}</>}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Nota (opcional)
                </label>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={3}
                  placeholder="Por qué fijás esta norma a este expediente"
                  disabled={fijar.isPending}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                />
              </div>
            </div>
            <div className="border-t border-white/5 px-5 py-3 flex items-center justify-between gap-2">
              <button onClick={() => setSelected(null)} disabled={fijar.isPending} className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30">
                ← Cambiar
              </button>
              <div className="flex items-center gap-2">
                <button onClick={onClose} disabled={fijar.isPending} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30">
                  Cancelar
                </button>
                <button
                  onClick={submit}
                  disabled={fijar.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
                >
                  {fijar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
                  Fijar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tab principal ────────────────────────────────────────────────────────

export function TabNormativa({ expedienteId }: Props) {
  const { data: rows = [], isLoading } = useExpedienteNormativa(expedienteId)
  const desfijar = useDesfijarNormativa()
  const [openFijar, setOpenFijar] = useState(false)
  const [confirmDesfijar, setConfirmDesfijar] = useState<ExpedienteNormativaRow | null>(null)

  const fijadasIds = useMemo(() => new Set(rows.map(r => r.documento_id)), [rows])

  return (
    <>
      <Card
        title="Normativa fijada"
        headerRight={
          <button
            onClick={() => setOpenFijar(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            Fijar norma
          </button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BookMarked}
            title="Sin normas fijadas"
            description="Fijá las leyes y códigos relevantes a este expediente. Cuando generes un escrito, esas normas SIEMPRE entran al contexto del modelo, además del retrieval automático."
            actionLabel="Fijar primera norma"
            onAction={() => setOpenFijar(true)}
          />
        ) : (
          <div className="space-y-2">
            {rows.map(row => (
              <div
                key={row.documento_id}
                className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <Pin className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/normativa/${row.documento_id}`}
                      className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-violet-300 truncate"
                    >
                      {row.documento.titulo}
                    </Link>
                    <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-violet-300">
                      {row.documento.tipo}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {row.documento.numero && <>{row.documento.numero} · </>}
                    {row.documento.jurisdiccion && <>{row.documento.jurisdiccion} · </>}
                    {row.documento.chunk_count} chunks
                  </p>
                  {row.nota && (
                    <p className="mt-1.5 text-[11px] text-zinc-400 italic line-clamp-2">{row.nota}</p>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDesfijar(row)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-white/10 transition-all"
                  title="Desfijar"
                >
                  <PinOff className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-600 dark:text-zinc-400">
          Además de estas normas, al redactar se hace retrieval automático sobre el resto de tu biblioteca buscando lo más relevante al expediente.
        </p>
      </Card>

      {openFijar && (
        <FijarDialog
          expedienteId={expedienteId}
          fijadas={fijadasIds}
          onClose={() => setOpenFijar(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDesfijar !== null}
        onClose={() => setConfirmDesfijar(null)}
        onConfirm={() => {
          if (!confirmDesfijar) return
          desfijar.mutate(
            { expedienteId, documentoId: confirmDesfijar.documento_id },
            {
              onSuccess: () => { toast.success('Norma desfijada'); setConfirmDesfijar(null) },
              onError: (err) => toast.error(err.message),
            }
          )
        }}
        title="Desfijar norma"
        description={`¿Desfijar "${confirmDesfijar?.documento.titulo}" de este expediente? La norma sigue en tu biblioteca pero deja de ir como contexto en los escritos.`}
        confirmLabel="Desfijar"
        variant="danger"
        isPending={desfijar.isPending}
      />
    </>
  )
}
