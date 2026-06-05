import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ChevronDown, ChevronUp, FolderOpen, Gavel, Loader2, BookMarked, Coins } from 'lucide-react'
import { useExpedienteSimilares, type ExpedienteSimilarHit } from '@/hooks/use-expediente-similares'
import { cn } from '@/lib/utils'

interface Props {
  expedienteId: string
}

function formatMonto(monto: number | null, moneda: string): string {
  if (monto == null) return 'a determinar'
  const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return `${moneda === 'USD' ? 'US$ ' : '$'}${fmt.format(monto)}`
}

const TIPO_LABELS: Record<string, string> = {
  demanda: 'Demanda',
  contestacion: 'Contestación',
  sentencia: 'Sentencia',
  resolucion: 'Resolución',
  apelacion: 'Apelación',
  escrito: 'Escrito',
  cedula: 'Cédula',
  otro: 'Otro',
}

export function ExpedienteSimilaresPanel({ expedienteId }: Props) {
  const storageKey = `expediente-similares-collapsed-${expedienteId}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === '1'
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, next ? '1' : '0')
  }

  const { data, isLoading, isError, error } = useExpedienteSimilares(expedienteId)

  // No renderizar si todavía cargó y hay 0 results + 0 source_summaries (vacío total)
  // Pero si hay message, lo mostramos por la primera vez (educativo).
  if (isError) {
    // Silencioso: no rompemos la página por una sugerencia opcional
    console.warn('[ExpedienteSimilaresPanel]', error)
    return null
  }

  if (!isLoading && data && data.results.length === 0 && !data.message) return null

  return (
    <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-500/10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -m-1 p-1 hover:bg-violet-500/[0.05] transition-colors"
          aria-expanded={!collapsed}
          aria-controls="similares-body"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-violet-400/70 shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 text-violet-400/70 shrink-0" />
          )}
          <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
          <h3 className="text-sm font-semibold text-violet-200 truncate">
            Expedientes parecidos en tu corpus
          </h3>
          {data && data.results.length > 0 && (
            <span className="text-[10px] text-violet-500/80 shrink-0">
              {data.results.length} {data.results.length === 1 ? 'sugerencia' : 'sugerencias'}
            </span>
          )}
        </button>
      </div>

      <div id="similares-body" className={cn('p-4', collapsed && 'hidden')}>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Buscando expedientes parecidos…
          </div>
        )}

        {!isLoading && data?.message && data.results.length === 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {data.message}
          </p>
        )}

        {!isLoading && data && data.results.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-violet-300/70 leading-snug">
              Basado en los documentos analizados de este expediente, encontré los siguientes en tu corpus que podrían aportar fundamentos, montos o jurisprudencia útil:
            </p>
            <div className="space-y-2">
              {data.results.map((hit) => (
                <SimilarRow key={hit.expediente_id} hit={hit} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SimilarRow({ hit }: { hit: ExpedienteSimilarHit }) {
  const [expanded, setExpanded] = useState(false)

  // Agregar rubros, normativa y jurisprudencia de los matched adjuntos
  const rubros = hit.matched_adjuntos.flatMap(a => a.ai_extracted?.rubros_reclamados ?? [])
  const normas = hit.matched_adjuntos.flatMap(a => a.ai_extracted?.normativa_citada ?? [])
  const juris = hit.matched_adjuntos.flatMap(a => a.ai_extracted?.jurisprudencia_citada ?? [])
  const resultado = hit.matched_adjuntos.find(a => a.ai_extracted?.resultado)?.ai_extracted?.resultado ?? null
  const tipos = [...new Set(hit.matched_adjuntos.map(a => a.tipo_documento).filter(Boolean))] as string[]

  const matchPct = Math.round(hit.top_score * 100)
  const titulo = hit.caratula || hit.numero || 'Expediente'

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="px-3 py-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/expedientes/${hit.expediente_id}`}
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-violet-400 transition-colors line-clamp-1"
            >
              {titulo}
            </Link>
            {tipos.length > 0 && tipos.slice(0, 2).map((t) => (
              <span key={t} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300 capitalize">
                {TIPO_LABELS[t] ?? t}
              </span>
            ))}
          </div>
          {hit.numero && (
            <p className="mt-0.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              {hit.numero}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300"
            title="Similaridad semántica"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {matchPct}%
          </span>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="rounded p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title={expanded ? 'Colapsar detalle' : 'Ver montos, normativa y citas'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Link
            to={`/expedientes/${hit.expediente_id}`}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white/10 transition-colors inline-flex items-center gap-1"
            title="Abrir expediente"
          >
            <FolderOpen className="h-3 w-3" />
            Abrir
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2.5 space-y-2.5 bg-black/10">
          {hit.matched_adjuntos[0]?.ai_summary && (
            <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-snug">
              {hit.matched_adjuntos[0].ai_summary}
            </p>
          )}

          {rubros.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-medium mb-1 flex items-center gap-1">
                <Coins className="h-2.5 w-2.5" />
                Montos / rubros
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rubros.slice(0, 8).map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300"
                    title={r.fundamento ?? undefined}
                  >
                    {r.concepto}: {formatMonto(r.monto, r.moneda)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {normas.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300/80 font-medium mb-1 flex items-center gap-1">
                <BookMarked className="h-2.5 w-2.5" />
                Normativa citada
              </p>
              <div className="flex flex-wrap gap-1.5">
                {normas.slice(0, 6).map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                    title={n.uso ?? undefined}
                  >
                    {n.norma}
                  </span>
                ))}
              </div>
            </div>
          )}

          {juris.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-rose-300/80 font-medium mb-1 flex items-center gap-1">
                <Gavel className="h-2.5 w-2.5" />
                Jurisprudencia citada
              </p>
              <div className="flex flex-wrap gap-1.5">
                {juris.slice(0, 5).map((j, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300"
                    title={j.uso ?? undefined}
                  >
                    {j.cita}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resultado && (
            <p className="text-[11px] text-rose-300/90 italic leading-snug border-l-2 border-rose-500/30 pl-2">
              → {resultado}
            </p>
          )}

          {hit.snippets.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Fragmentos coincidentes
              </p>
              {hit.snippets.map((s, i) => (
                <p key={i} className="text-[11px] text-zinc-600 dark:text-zinc-300 italic leading-snug line-clamp-2 bg-white/[0.02] rounded px-2 py-1">
                  "{s.content}"
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
