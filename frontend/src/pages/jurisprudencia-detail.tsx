import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Gavel, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useJurisprudenciaDocumento, useJurisprudenciaChunks } from '@/hooks/use-jurisprudencia'
import { cn } from '@/lib/utils'

const SECCION_LABELS: Record<string, { label: string; cls: string }> = {
  encabezado:     { label: 'Encabezado',     cls: 'bg-zinc-500/15 text-zinc-300' },
  considerandos:  { label: 'Considerandos',  cls: 'bg-cyan-500/15 text-cyan-300' },
  resuelve:       { label: 'Resuelve',       cls: 'bg-violet-500/15 text-violet-300' },
  otro:           { label: 'Otro',           cls: 'bg-zinc-500/15 text-zinc-300' },
}

export default function JurisprudenciaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: doc, isLoading } = useJurisprudenciaDocumento(id)
  const { data: chunks = [] } = useJurisprudenciaChunks(id)
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
        <p className="text-sm text-zinc-400">Fallo no encontrado.</p>
        <Link to="/jurisprudencia" className="mt-3 inline-flex items-center gap-1 text-xs text-violet-400 hover:underline">
          <ChevronLeft className="h-3 w-3" /> Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <Link to="/jurisprudencia" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
        <ChevronLeft className="h-3 w-3" /> Volver a Jurisprudencia
      </Link>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 shrink-0">
            <Gavel className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{doc.caratula}</h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
              <span className="uppercase tracking-wider">{doc.tipo.replace('_', ' ')}</span>
              {doc.tribunal && <span>· {doc.tribunal}</span>}
              {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
              {doc.fecha && <span>· {new Date(doc.fecha).toLocaleDateString('es-AR')}</span>}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
              <span>Fuente: <span className="text-zinc-300">{doc.source.replace('manual_', '')}</span></span>
              {doc.source_url && (
                <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-300 hover:underline">
                  <ExternalLink className="h-2.5 w-2.5" />
                  ver original
                </a>
              )}
              {doc.source_file_name && <span>· {doc.source_file_name}</span>}
            </p>
            {doc.sumario && (
              <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 italic border-l-2 border-violet-500/40 pl-3">
                {doc.sumario}
              </p>
            )}
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
        </div>

        {doc.estado === 'error' && doc.error_message && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 flex items-start gap-2 text-xs text-rose-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {doc.error_message}
          </div>
        )}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Fragmentos ({chunks.length})
        </h2>
        {doc.estado === 'procesando' || doc.estado === 'pendiente' ? (
          <p className="text-sm text-zinc-400 italic">Indexando… los fragmentos aparecen acá cuando termina.</p>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay fragmentos (puede haber fallado la indexación).</p>
        ) : (
          <div className="space-y-1">
            {chunks.map(c => {
              const isOpen = expanded.has(c.id)
              const seccion = (c.metadata?.seccion as string) ?? 'otro'
              const label = SECCION_LABELS[seccion] ?? SECCION_LABELS.otro
              return (
                <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
                  <button
                    onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] rounded-lg"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', label.cls)}>
                      {label.label}
                    </span>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">
                      {c.contenido.slice(0, 80)}…
                    </span>
                    <span className="text-[10px] text-zinc-600 dark:text-zinc-300 shrink-0">#{c.orden} · {c.contenido.length} chars</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
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
