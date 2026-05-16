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
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-5 max-w-3xl mx-auto">
        <p className="text-sm text-zinc-400">Documento no encontrado.</p>
        <Link to="/normativa" className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
          <ChevronLeft className="h-3 w-3" /> Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <Link to="/normativa" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
        <ChevronLeft className="h-3 w-3" /> Volver a Normativa
      </Link>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2 shrink-0">
            <FileText className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-zinc-50">{doc.titulo}</h1>
            <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
              <span className="uppercase tracking-wider">{doc.tipo}</span>
              {doc.numero && <span>· {doc.numero}</span>}
              {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
              {doc.fecha && <span>· {new Date(doc.fecha).toLocaleDateString('es-AR')}</span>}
              {doc.fuente && <span>· {doc.fuente}</span>}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Archivo: {doc.source_file_name}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-medium',
            doc.estado === 'indexado' && 'bg-emerald-700/30 text-emerald-300',
            doc.estado === 'procesando' && 'bg-amber-700/30 text-amber-300',
            doc.estado === 'pendiente' && 'bg-zinc-700/30 text-zinc-300',
            doc.estado === 'error' && 'bg-rose-700/30 text-rose-300',
          )}>
            {doc.estado}
          </span>
          {doc.estado === 'indexado' && (
            <span className="text-xs text-zinc-400">{doc.chunk_count} {doc.chunk_count === 1 ? 'chunk' : 'chunks'}</span>
          )}
          {(doc.estado === 'error' || doc.estado === 'pendiente') && (
            <button
              onClick={() => reindex.mutate(doc.id, {
                onSuccess: () => toast.success('Reintentando indexación…'),
                onError: (err) => toast.error(err.message),
              })}
              disabled={reindex.isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-30"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar
            </button>
          )}
        </div>

        {doc.estado === 'error' && doc.error_message && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 flex items-start gap-2 text-xs text-rose-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {doc.error_message}
          </div>
        )}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Chunks ({chunks.length})
        </h2>
        {doc.estado === 'procesando' || doc.estado === 'pendiente' ? (
          <p className="text-sm text-zinc-400 italic">Indexando… los chunks aparecen acá cuando termina.</p>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay chunks (puede haber fallado la indexación).</p>
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
                <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
                  <button
                    onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] rounded-lg"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3 text-zinc-500" /> : <ChevronDown className="h-3 w-3 text-zinc-500" />}
                    <span className="text-xs font-medium text-zinc-200 flex-1 truncate">{label}</span>
                    <span className="text-[10px] text-zinc-600 shrink-0">#{c.id} · {c.contenido.length} chars</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 px-3 py-2 text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
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
