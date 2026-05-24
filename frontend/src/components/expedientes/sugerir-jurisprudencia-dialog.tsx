// Dialog para sugerir jurisprudencia afín mientras se redacta un escrito.
// Recibe el contexto (texto seleccionado o párrafo activo) como query inicial,
// hace búsqueda semántica vía /functions/v1/match-jurisprudencia y permite
// insertar la cita formateada al callback onInsertar.

import { useState, useEffect } from 'react'
import { Gavel, Loader2, Search, X, Quote, ExternalLink } from 'lucide-react'
import { useBuscarJurisprudenciaAfin, type MatchJurisprudenciaResult } from '@/hooks/use-jurisprudencia'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

type Seccion = 'cualquiera' | 'encabezado' | 'considerandos' | 'resuelve'

const SECCION_OPTIONS: Array<{ value: Seccion; label: string; hint: string }> = [
  { value: 'cualquiera',     label: 'Cualquiera',    hint: 'todo el fallo' },
  { value: 'considerandos',  label: 'Considerandos', hint: 'razonamiento del tribunal' },
  { value: 'resuelve',       label: 'Resuelve',      hint: 'parte dispositiva' },
  { value: 'encabezado',     label: 'Encabezado',    hint: 'antecedentes' },
]

const SECCION_BADGE: Record<string, { label: string; cls: string }> = {
  encabezado:    { label: 'Encabezado',    cls: 'bg-zinc-500/15 text-zinc-300' },
  considerandos: { label: 'Considerandos', cls: 'bg-cyan-500/15 text-cyan-300' },
  resuelve:      { label: 'Resuelve',      cls: 'bg-violet-500/15 text-violet-300' },
  otro:          { label: 'Otro',          cls: 'bg-zinc-500/15 text-zinc-300' },
}

function formatearCita(r: MatchJurisprudenciaResult): string {
  const caratula = r.caratula ?? 'Fallo'
  const tribunal = r.tribunal ? `${r.tribunal}, ` : ''
  const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : 's/f'
  return `Cfr. ${tribunal}"${caratula}", ${fecha}`
}

export function SugerirJurisprudenciaDialog({
  open, onClose, defaultQuery, onInsertar,
}: {
  open: boolean
  onClose: () => void
  defaultQuery?: string
  onInsertar: (texto: string) => void
}) {
  const [query, setQuery] = useState(defaultQuery ?? '')
  const [seccion, setSeccion] = useState<Seccion>('cualquiera')
  const [results, setResults] = useState<MatchJurisprudenciaResult[]>([])
  const buscar = useBuscarJurisprudenciaAfin()

  // Al abrir, prefiero la query del contexto. Si hay defaultQuery sustancioso, busco solo.
  useEffect(() => {
    if (!open) return
    setQuery(defaultQuery ?? '')
    setResults([])
    if (defaultQuery && defaultQuery.trim().length >= 20) {
      buscar.mutate({ query: defaultQuery, limit: 5, seccion: 'cualquiera' }, {
        onSuccess: setResults,
        onError: (err) => toast.error(err.message),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuery])

  if (!open) return null

  const handleBuscar = () => {
    if (query.trim().length < 3) return
    buscar.mutate({ query: query.trim(), limit: 8, seccion }, {
      onSuccess: setResults,
      onError: (err) => toast.error(err.message),
    })
  }

  const handleInsertar = (r: MatchJurisprudenciaResult) => {
    const cita = formatearCita(r)
    onInsertar(`\n${cita}\n`)
    toast.success(`Cita insertada: ${r.caratula?.slice(0, 50) ?? 'fallo'}`)
  }

  const handleInsertarFragmento = (r: MatchJurisprudenciaResult) => {
    const cita = formatearCita(r)
    onInsertar(`\n"${r.fragmento.trim()}" (${cita}).\n`)
    toast.success('Cita con fragmento insertada')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-base font-semibold text-zinc-50 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-violet-400" />
            Jurisprudencia afín
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Buscador */}
        <div className="border-b border-white/5 px-5 py-3 space-y-2">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleBuscar()
              }}
              placeholder="Pegá el párrafo que estás escribiendo, o un concepto: 'daño punitivo plataformas digitales', 'carga dinámica de la prueba'…"
              rows={3}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15 resize-none"
            />
            <button
              onClick={handleBuscar}
              disabled={buscar.isPending || query.trim().length < 3}
              className="self-end inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
            >
              {buscar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Buscar
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <span className="uppercase tracking-wider">Sección:</span>
            {SECCION_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setSeccion(o.value)}
                className={cn(
                  'rounded-full px-2 py-0.5 font-medium border transition-colors',
                  seccion === o.value
                    ? 'border-violet-400 text-violet-300 bg-violet-500/10'
                    : 'border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                )}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
            <span className="ml-auto text-zinc-600">⌘/Ctrl + Enter para buscar</span>
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {buscar.isPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {buscar.isSuccess
                ? 'Ningún fallo de tu corpus matchea con esa búsqueda. Probá otras palabras o filtros.'
                : 'Escribí algo y apretá Buscar para encontrar fallos relevantes en tu corpus.'}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => {
                const seccionBadge = SECCION_BADGE[r.seccion] ?? SECCION_BADGE.otro
                return (
                  <div key={r.chunk_id} className="rounded-lg border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-100 truncate">
                          {i + 1}. {r.caratula ?? 'Fallo sin carátula'}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {r.tribunal && <span>{r.tribunal}</span>}
                          {r.fecha && <span>· {new Date(r.fecha).toLocaleDateString('es-AR')}</span>}
                          <span className={cn('rounded-full px-1.5 py-0.5 text-[9px]', seccionBadge.cls)}>
                            {seccionBadge.label}
                          </span>
                          <span className="text-emerald-400">{(r.score * 100).toFixed(0)}% match</span>
                          <a
                            href={`/jurisprudencia/${r.documento_id}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-violet-300 hover:underline"
                            title="Ver fallo completo"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed italic line-clamp-4 border-l-2 border-violet-500/30 pl-3 mb-2">
                      {r.fragmento}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleInsertar(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-violet-300 hover:bg-violet-500/20"
                      >
                        <Quote className="h-2.5 w-2.5" />
                        Insertar cita
                      </button>
                      <button
                        onClick={() => handleInsertarFragmento(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20"
                      >
                        <Quote className="h-2.5 w-2.5" />
                        Insertar fragmento + cita
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
