import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useJurisprudenciaDocumento, useJurisprudenciaChunks } from '@/hooks/use-jurisprudencia'
import { cn } from '@/lib/utils'

const SECCION_LABELS: Record<string, { label: string; cls: string }> = {
  encabezado:     { label: 'Encabezado',     cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  considerandos:  { label: 'Considerandos',  cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  resuelve:       { label: 'Resuelve',       cls: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  otro:           { label: 'Otro',           cls: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Fallo no encontrado.</p>
        <Link to="/jurisprudencia" className="dashboard-link mt-3 inline-flex items-center gap-1 text-xs hover:underline">
          <ChevronLeft className="h-3 w-3" /> Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <Link to="/jurisprudencia" className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
        <ChevronLeft className="h-3 w-3" /> Volver a Jurisprudencia
      </Link>

      <div className="app-card mt-3 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug tracking-tight text-zinc-900 dark:text-white">{doc.caratula}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span className="font-bold uppercase tracking-[0.08em]">{doc.tipo.replace('_', ' ')}</span>
              {doc.tribunal && <span>· {doc.tribunal}</span>}
              {doc.jurisdiccion && <span>· {doc.jurisdiccion}</span>}
              {doc.fecha && <span>· {new Date(doc.fecha).toLocaleDateString('es-AR')}</span>}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
              <span>Fuente: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{doc.source.replace('manual_', '')}</span></span>
              {doc.source_url && (
                <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="dashboard-link inline-flex items-center gap-1 hover:underline">
                  <ExternalLink className="h-2.5 w-2.5" />
                  ver original
                </a>
              )}
              {doc.source_file_name && <span>· {doc.source_file_name}</span>}
            </p>
            {doc.sumario && (
              <p className="mt-3 border-l-2 border-[var(--brand-accent)]/50 pl-3 text-sm italic text-zinc-700 dark:text-zinc-300">
                {doc.sumario}
              </p>
            )}
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
          Fragmentos ({chunks.length})
        </h2>
        {doc.estado === 'procesando' || doc.estado === 'pendiente' ? (
          <p className="text-sm italic text-zinc-500 dark:text-zinc-400">Indexando… los fragmentos aparecen acá cuando termina.</p>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay fragmentos (puede haber fallado la indexación).</p>
        ) : (
          <div className="space-y-1">
            {chunks.map(c => {
              const isOpen = expanded.has(c.id)
              const seccion = (c.metadata?.seccion as string) ?? 'otro'
              const label = SECCION_LABELS[seccion] ?? SECCION_LABELS.otro
              return (
                <div key={c.id} className="app-card rounded-xl">
                  <button
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />}
                    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold', label.cls)}>
                      {label.label}
                    </span>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">
                      {c.contenido.slice(0, 80)}…
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">#{c.orden} · {c.contenido.length} chars</span>
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
