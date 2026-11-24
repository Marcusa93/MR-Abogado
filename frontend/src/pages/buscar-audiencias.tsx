import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, Loader2, X, Calendar, FolderOpen, AlertCircle, Sparkles } from 'lucide-react'
import { useSearchAudiencias, usePersonasRecurrentes, type AudienciaSearchHit, type PersonaRecurrente } from '@/hooks/use-audiencias-search'
import { formatDate } from '@/lib/utils/date-helpers'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

type Tab = 'buscar' | 'personas'

const EJEMPLOS = [
  'pericia psicológica',
  'reconocimiento de la firma',
  'tachas a los testigos',
  'monto de daño moral',
  'rechazo de la demanda',
]

export default function BuscarAudienciasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('buscar')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  // Debounce 400ms para no spammear embeddings
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400)
    return () => clearTimeout(t)
  }, [query])

  const search = useSearchAudiencias(debounced)
  const personas = usePersonasRecurrentes(1)

  // Filtrar por persona seleccionada → setea query y va a tab buscar
  const handlePersonaClick = (p: PersonaRecurrente) => {
    setQuery(p.nombre_display)
    setDebounced(p.nombre_display)
    setActiveTab('buscar')
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Buscar audiencias' }]} />

      <PageHeader
        title="Buscador de audiencias"
        subtitle={<span className="block max-w-2xl">
          Buscá frases, conceptos o nombres en todas tus audiencias transcriptas. La búsqueda es semántica:
          no hace falta coincidencia literal — encontrá temas aunque estén dichos con otras palabras.
        </span>}
      />

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-white/[0.08]">
        <nav className="-mb-px flex gap-1">
          {[
            { id: 'buscar' as const, label: 'Buscar', icon: Search },
            { id: 'personas' as const, label: 'Personas', icon: Users },
          ].map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold transition-colors',
                  isActive
                    ? 'border-[var(--brand-navy)] text-[var(--brand-navy)] dark:border-[var(--brand-accent)] dark:text-white'
                    : 'border-transparent text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-white'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.id === 'personas' && personas.data && personas.data.length > 0 && (
                  <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-500/15 px-1 text-[10px] font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
                    {personas.data.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTab === 'buscar' && (
        <div className="space-y-4">
          {/* Search input */}
          <div className="relative max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscá frases o conceptos…"
              className="field h-11 pl-10 pr-10"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                title="Limpiar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Ejemplos cuando no hay query */}
          {!query.trim() && (
            <div className="max-w-2xl space-y-2">
              <p className="eyebrow">Probá con</p>
              <div className="flex flex-wrap gap-1.5">
                {EJEMPLOS.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setQuery(e); setDebounced(e) }}
                    className="chip"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resultados */}
          {query.trim().length > 0 && query.trim().length < 3 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Mínimo 3 caracteres.</p>
          )}

          {search.isFetching && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando en tus audiencias…
            </div>
          )}

          {search.isError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {search.error instanceof Error ? search.error.message : 'Error al buscar'}
            </div>
          )}

          {search.data && search.data.length === 0 && !search.isFetching && debounced.length >= 3 && (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ninguna audiencia transcripta menciona algo cercano a tu búsqueda. Probá con otras palabras o conceptos relacionados."
            />
          )}

          <div className="space-y-3">
            {(search.data ?? []).map((hit) => (
              <ResultCard key={hit.transcript_id} hit={hit} query={debounced} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'personas' && (
        <PersonasTab personas={personas.data} isLoading={personas.isLoading} onSelect={handlePersonaClick} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResultCard — una transcripción con sus snippets
// ---------------------------------------------------------------------------

function ResultCard({ hit, query }: { hit: AudienciaSearchHit; query: string }) {
  const titulo = hit.expediente_caratula || hit.expediente_numero || 'Expediente'
  const subtitulo = [
    hit.expediente_numero,
    hit.transcript_at ? formatDate(hit.transcript_at) : null,
    hit.audio_filename,
  ].filter(Boolean).join(' · ')

  const matchPct = Math.round(hit.top_score * 100)

  return (
    <div className="app-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <Link
            to={`/expedientes/${hit.expediente_id}`}
            className="line-clamp-1 text-[14px] font-bold tracking-tight text-zinc-900 transition-colors hover:text-[var(--brand-accent)] dark:text-white"
          >
            {titulo}
          </Link>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {hit.expediente_numero && (
              <span className="tabular-nums">{hit.expediente_numero}</span>
            )}
            {hit.transcript_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(hit.transcript_at)}
              </span>
            )}
            {hit.audio_filename && (
              <span className="truncate">{hit.audio_filename}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold gap-1 border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
            title="Similaridad semántica del mejor snippet"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {matchPct}%
          </span>
          <Link
            to={`/expedientes/${hit.expediente_id}#audiencias`}
            className="btn btn-ghost btn-sm"
            title="Ver expediente"
          >
            <FolderOpen className="h-3 w-3" />
            Abrir
          </Link>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {hit.snippets.map((s) => (
          <div key={s.chunk_index} className="dashboard-panel-muted px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
            <Highlighted text={s.content} terms={query} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Highlight simple por palabras (case-insensitive). Es heurístico — la búsqueda
// es semántica, así que el match puede no estar en el texto literal; pero
// cuando hay coincidencias léxicas las marcamos para hacer evidente la lectura.
function Highlighted({ text, terms }: { text: string; terms: string }) {
  const words = useMemo(() => {
    return terms
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  }, [terms])

  if (words.length === 0) return <>{text}</>

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((p, i) =>
        regex.test(p)
          ? <mark key={i} className="rounded bg-cyan-500/25 px-0.5 text-cyan-900 dark:text-cyan-100">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// PersonasTab
// ---------------------------------------------------------------------------

function PersonasTab({
  personas,
  isLoading,
  onSelect,
}: {
  personas: PersonaRecurrente[] | undefined
  isLoading: boolean
  onSelect: (p: PersonaRecurrente) => void
}) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!personas) return []
    const f = filter.trim().toLowerCase()
    if (!f) return personas
    return personas.filter(p => p.nombre_normalizado.includes(f))
  }, [personas, filter])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando personas…
      </div>
    )
  }

  if (!personas || personas.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin personas aún"
        description="Acá vas a ver los nombres que aparecen en tus audiencias transcriptas. Se completa automáticamente a medida que analizás transcripciones."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nombre…"
          className="field h-11 pl-10"
        />
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Click en una persona para buscar todas las audiencias donde aparece.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((p) => (
          <button
            key={p.nombre_normalizado}
            onClick={() => onSelect(p)}
            className="app-card group px-3.5 py-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 text-[14px] font-bold tracking-tight text-zinc-900 transition-colors group-hover:text-[var(--brand-accent)] dark:text-white">
                {p.nombre_display}
              </p>
              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-cyan-500/30 bg-cyan-500/10 tabular-nums text-cyan-700 dark:text-cyan-300">
                {p.apariciones}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {p.expediente_ids.length} {p.expediente_ids.length === 1 ? 'expediente' : 'expedientes'}
              {p.ultima_aparicion && <> · últ. {formatDate(p.ultima_aparicion)}</>}
            </p>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-6">
          Ningún nombre coincide con "{filter}".
        </p>
      )}
    </div>
  )
}
