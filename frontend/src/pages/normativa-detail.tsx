import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, FileText, RotateCcw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useNormativaDocumento, useNormativaChunks, useReindexNormativa } from '@/hooks/use-normativa'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

export default function NormativaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: doc, isLoading } = useNormativaDocumento(id)
  const { data: chunks = [] } = useNormativaChunks(id)
  const reindex = useReindexNormativa()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (chunkId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(chunkId)) next.delete(chunkId)
      else next.add(chunkId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-5 max-w-3xl mx-auto">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Documento no encontrado.</p>
        <Link to="/normativa" className="dashboard-link mt-3 inline-flex items-center gap-1 text-xs hover:underline">
          <ChevronLeft className="h-3 w-3" /> Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <Link to="/normativa" className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
        <ChevronLeft className="h-3 w-3" /> Volver a Normativa
      </Link>

      <div className="app-card mt-3 p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2">
            <FileText className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug tracking-tight text-zinc-900 dark:text-white">{doc.titulo}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span className="font-bold uppercase tracking-[0.08em]">{doc.tipo}</span>
              {doc.numero && <span>· {doc.numero}</span>}
              {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
              {doc.fecha && <span>· {new Date(doc.fecha).toLocaleDateString('es-AR')}</span>}
              {doc.fuente && <span>· {doc.fuente}</span>}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Archivo: {doc.source_file_name}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold px-2.5 py-0.5 text-[11px]',
            doc.estado === 'indexado' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            doc.estado === 'procesando' && 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
            doc.estado === 'pendiente' && 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
            doc.estado === 'error' && 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
          )}>
            {doc.estado}
          </span>
          {doc.estado === 'indexado' && (
            <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">{doc.chunk_count} {doc.chunk_count === 1 ? 'chunk' : 'chunks'}</span>
          )}
          {(doc.estado === 'error' || doc.estado === 'pendiente') && (
            <button
              onClick={() => reindex.mutate(doc.id, {
                onSuccess: () => toast.success('Reintentando indexación…'),
                onError: (err) => toast.error(err.message),
              })}
              disabled={reindex.isPending}
              className="btn btn-secondary btn-sm"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar
            </button>
          )}
        </div>

        {doc.estado === 'error' && doc.error_message && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {doc.error_message}
          </div>
        )}
      </div>

      <div className="mt-5">
        <h2 className="eyebrow mb-2.5">
          Chunks ({chunks.length})
        </h2>
        {doc.estado === 'procesando' || doc.estado === 'pendiente' ? (
          <p className="text-sm italic text-zinc-500 dark:text-zinc-400">Indexando… los chunks aparecen acá cuando termina.</p>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay chunks (puede haber fallado la indexación).</p>
        ) : (
          <div className="space-y-1">
            {chunks.map(c => {
              const isOpen = expanded.has(c.id)
              const articulo = c.metadata.articulo as string | undefined
              const seccion = c.metadata.seccion as string | undefined
              const parte = c.metadata.parte as string | undefined
              const label = articulo
                ? `Art. ${articulo}${parte ? ` · parte ${parte}` : ''}`
                : seccion ? `§ ${seccion.slice(0, 60)}`
                : `Chunk ${c.orden}`
              return (
                <div key={c.id} className="app-card rounded-xl">
                  <button
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />}
                    <span className="flex-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">#{c.id} · {c.contenido.length} chars</span>
                  </button>
                  {isOpen && (
                    <div className="whitespace-pre-wrap border-t border-zinc-100 px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-700 dark:border-white/[0.06] dark:text-zinc-300">
                      {c.contenido}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
