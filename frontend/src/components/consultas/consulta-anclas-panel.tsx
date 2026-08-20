import { useState } from 'react'
import { Search, Pin, X, BookOpen, Scale, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useBuscarNormativaConsulta,
  useBuscarJurisprudenciaConsulta,
  useConsultaNormativa,
  useConsultaJurisprudencia,
  usePinNormativaConsulta,
  useUnpinNormativaConsulta,
  usePinJurisprudenciaConsulta,
  useUnpinJurisprudenciaConsulta,
  useDebouncedQuery,
  type NormativaDoc,
  type JurisprudenciaDoc,
} from '@/hooks/use-consulta-anclas'

type Tab = 'normativa' | 'jurisprudencia'

// ── Sección búsqueda + resultados + anclados para normativa ─────────────────

function NormativaTab({ consultaId }: { consultaId: string }) {
  const { query, debounced, handleChange } = useDebouncedQuery()
  const { data: resultados = [], isFetching } = useBuscarNormativaConsulta(debounced)
  const { data: anclados = [] } = useConsultaNormativa(consultaId)
  const pin = usePinNormativaConsulta(consultaId)
  const unpin = useUnpinNormativaConsulta(consultaId)

  const ancladosIds = new Set(anclados.map(d => d.id))
  const [pinningId, setPinningId] = useState<string | null>(null)
  const [unpinningId, setUnpinningId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {/* Anclados */}
      {anclados.length > 0 && (
        <div className="space-y-1.5">
          {anclados.map(doc => (
            <AncladoRow
              key={doc.id}
              label={doc.titulo}
              sub={[doc.tipo, doc.numero, doc.jurisdiccion].filter(Boolean).join(' · ')}
              onUnpin={() => {
                setUnpinningId(doc.id)
                unpin.mutate(doc.id, { onSettled: () => setUnpinningId(null) })
              }}
              loading={unpinningId === doc.id}
            />
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Buscar ley, código, decreto…"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 animate-spin" />
        )}
      </div>

      {/* Resultados */}
      {debounced.length > 1 && resultados.length > 0 && (
        <div className="space-y-1">
          {resultados.map(doc => (
            <ResultadoRow
              key={doc.id}
              label={doc.titulo}
              sub={[doc.tipo, doc.numero, doc.jurisdiccion].filter(Boolean).join(' · ')}
              pinned={ancladosIds.has(doc.id)}
              onPin={() => {
                setPinningId(doc.id)
                pin.mutate(doc.id, { onSettled: () => setPinningId(null) })
              }}
              loading={pinningId === doc.id}
            />
          ))}
        </div>
      )}
      {debounced.length > 1 && !isFetching && resultados.length === 0 && (
        <p className="text-xs text-zinc-500 text-center py-2">Sin resultados para "{debounced}"</p>
      )}
    </div>
  )
}

// ── Sección búsqueda + resultados + anclados para jurisprudencia ─────────────

function JurisprudenciaTab({ consultaId }: { consultaId: string }) {
  const { query, debounced, handleChange } = useDebouncedQuery()
  const { data: resultados = [], isFetching } = useBuscarJurisprudenciaConsulta(debounced)
  const { data: anclados = [] } = useConsultaJurisprudencia(consultaId)
  const pin = usePinJurisprudenciaConsulta(consultaId)
  const unpin = useUnpinJurisprudenciaConsulta(consultaId)

  const ancladosIds = new Set(anclados.map(d => d.id))
  const [pinningId, setPinningId] = useState<string | null>(null)
  const [unpinningId, setUnpinningId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {/* Anclados */}
      {anclados.length > 0 && (
        <div className="space-y-1.5">
          {anclados.map(doc => (
            <AncladoRow
              key={doc.id}
              label={doc.caratula}
              sub={[doc.tribunal, doc.fecha].filter(Boolean).join(' · ')}
              onUnpin={() => {
                setUnpinningId(doc.id)
                unpin.mutate(doc.id, { onSettled: () => setUnpinningId(null) })
              }}
              loading={unpinningId === doc.id}
            />
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Buscar por carátula o tribunal…"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 animate-spin" />
        )}
      </div>

      {/* Resultados */}
      {debounced.length > 1 && resultados.length > 0 && (
        <div className="space-y-1">
          {resultados.map((doc: JurisprudenciaDoc) => (
            <ResultadoRow
              key={doc.id}
              label={doc.caratula}
              sub={[doc.tribunal, doc.fecha].filter(Boolean).join(' · ')}
              pinned={ancladosIds.has(doc.id)}
              onPin={() => {
                setPinningId(doc.id)
                pin.mutate(doc.id, { onSettled: () => setPinningId(null) })
              }}
              loading={pinningId === doc.id}
            />
          ))}
        </div>
      )}
      {debounced.length > 1 && !isFetching && resultados.length === 0 && (
        <p className="text-xs text-zinc-500 text-center py-2">Sin resultados para "{debounced}"</p>
      )}
    </div>
  )
}

// ── Micro-componentes ────────────────────────────────────────────────────────

function AncladoRow({
  label, sub, onUnpin, loading,
}: { label: string; sub: string; onUnpin: () => void; loading: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2">
      <Pin className="h-3 w-3 text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{label}</p>
        {sub && <p className="text-[10px] text-zinc-500 truncate">{sub}</p>}
      </div>
      <button
        onClick={onUnpin}
        disabled={loading}
        className="shrink-0 p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
        title="Desanclar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ResultadoRow({
  label, sub, pinned, onPin, loading,
}: { label: string; sub: string; pinned: boolean; onPin: () => void; loading: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
      pinned
        ? 'border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5'
        : 'border-zinc-200 dark:border-white/8 bg-white dark:bg-white/[0.02]'
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{label}</p>
        {sub && <p className="text-[10px] text-zinc-500 truncate">{sub}</p>}
      </div>
      {!pinned && (
        <button
          onClick={onPin}
          disabled={loading}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:border-blue-400/50 hover:text-blue-400 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
          Anclar
        </button>
      )}
      {pinned && <span className="shrink-0 text-[10px] text-blue-400 font-medium">Anclado</span>}
    </div>
  )
}

// ── Panel principal ──────────────────────────────────────────────────────────

export function ConsultaAnclasPanel({ consultaId }: { consultaId: string }) {
  const [tab, setTab] = useState<Tab>('normativa')

  const { data: normativa = [] } = useConsultaNormativa(consultaId)
  const { data: juris = [] } = useConsultaJurisprudencia(consultaId)
  const totalAnclados = normativa.length + juris.length

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Normativa y jurisprudencia de referencia
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Anclá documentos para que el diagnóstico use su contenido exacto
          </p>
        </div>
        {totalAnclados > 0 && (
          <span className="rounded-full bg-blue-500/15 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">
            {totalAnclados} anclado{totalAnclados !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 p-1">
        <TabBtn
          active={tab === 'normativa'}
          onClick={() => setTab('normativa')}
          icon={BookOpen}
          label="Normativa"
          count={normativa.length}
        />
        <TabBtn
          active={tab === 'jurisprudencia'}
          onClick={() => setTab('jurisprudencia')}
          icon={Scale}
          label="Jurisprudencia"
          count={juris.length}
        />
      </div>

      {tab === 'normativa'
        ? <NormativaTab consultaId={consultaId} />
        : <JurisprudenciaTab consultaId={consultaId} />
      }
    </div>
  )
}

function TabBtn({
  active, onClick, icon: Icon, label, count,
}: {
  active: boolean
  onClick: () => void
  icon: typeof BookOpen
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
        active
          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && (
        <span className="rounded-full bg-blue-500/20 text-blue-400 px-1.5 py-0.5 text-[9px] font-bold leading-none">
          {count}
        </span>
      )}
    </button>
  )
}
