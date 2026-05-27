import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Sparkles, Check, X, Edit2, Loader2, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useAprendizajes, useAprobarAprendizaje, useDescartarAprendizaje, useEditarAprendizaje,
  type Aprendizaje, type Confidence, type Scope, type TargetKind,
} from '@/hooks/use-aprendizajes'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

type Tab = 'propuestos' | 'activos' | 'archivados'

const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  juez: 'Juez',
  organismo: 'Organismo',
  tipo_proceso: 'Tipo de proceso',
  etapa_proceso: 'Etapa',
  fuero: 'Fuero',
  general: 'General',
  estilo: 'Estilo',
}

const TARGET_KIND_CLS: Record<TargetKind, string> = {
  juez: 'bg-amber-500/15 text-amber-300',
  organismo: 'bg-cyan-500/15 text-cyan-300',
  tipo_proceso: 'bg-violet-500/15 text-violet-300',
  etapa_proceso: 'bg-sky-500/15 text-sky-300',
  fuero: 'bg-emerald-500/15 text-emerald-300',
  general: 'bg-zinc-500/15 text-zinc-300',
  estilo: 'bg-rose-500/15 text-rose-300',
}

const CONFIDENCE_CLS: Record<Confidence, string> = {
  baja: 'bg-zinc-500/15 text-zinc-400',
  media: 'bg-amber-500/15 text-amber-300',
  alta: 'bg-emerald-500/15 text-emerald-300',
}

const SCOPE_LABEL: Record<Scope, string> = {
  personal: 'Personal',
  compartido: 'Compartido',
  universal: 'Universal',
}

function AprendizajeCard({ a }: { a: Aprendizaje }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [contenidoEdit, setContenidoEdit] = useState(a.contenido)
  const [confidenceEdit, setConfidenceEdit] = useState<Confidence>(a.confidence)

  const aprobar = useAprobarAprendizaje()
  const descartar = useDescartarAprendizaje()
  const editar = useEditarAprendizaje()

  const handleAprobar = () => {
    aprobar.mutate({ id: a.id, confidence: confidenceEdit }, {
      onSuccess: () => toast.success('Aprendizaje activado'),
      onError: (err) => toast.error(err.message),
    })
  }
  const handleDescartar = () => {
    descartar.mutate(a.id, {
      onSuccess: () => toast.success('Aprendizaje descartado'),
      onError: (err) => toast.error(err.message),
    })
  }
  const handleGuardarEdicion = () => {
    editar.mutate({ id: a.id, patch: { contenido: contenidoEdit, confidence: confidenceEdit } }, {
      onSuccess: () => { toast.success('Guardado'); setEditing(false) },
      onError: (err) => toast.error(err.message),
    })
  }

  const targetCls = TARGET_KIND_CLS[a.target_kind] ?? TARGET_KIND_CLS.general
  const confCls = CONFIDENCE_CLS[a.confidence]

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-colors',
      a.proposed
        ? 'border-violet-500/30 bg-violet-950/10 hover:border-violet-500/50'
        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
    )}>
      {/* Header con badges */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {a.proposed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
            <Sparkles className="h-3 w-3" /> Propuesto por IA
          </span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', targetCls)}>
          {TARGET_KIND_LABEL[a.target_kind]}
        </span>
        {a.target_ref_text && (
          <span className="text-[10px] text-zinc-400">→ {a.target_ref_text}</span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium ml-auto', confCls)}>
          conf. {a.confidence}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
          {SCOPE_LABEL[a.scope]}
        </span>
        <span className="text-[10px] text-zinc-500">
          {a.observed_in_cases} {a.observed_in_cases === 1 ? 'caso' : 'casos'}
        </span>
      </div>

      {/* Contenido */}
      {!editing ? (
        <p className="text-sm text-zinc-200 leading-relaxed mb-3">{a.contenido}</p>
      ) : (
        <div className="space-y-2 mb-3">
          <textarea
            value={contenidoEdit}
            onChange={(e) => setContenidoEdit(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/40 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-400">Confianza:</label>
            <select
              value={confidenceEdit}
              onChange={(e) => setConfidenceEdit(e.target.value as Confidence)}
              className="h-7 rounded border border-white/10 bg-white/5 px-2 text-xs text-zinc-200"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
        </div>
      )}

      {/* Detalles colapsables */}
      {(a.source_escrito_id || a.source_diff) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Origen
        </button>
      )}
      {expanded && (
        <div className="mt-2 rounded bg-black/30 p-2 text-[10px] text-zinc-400 space-y-1">
          {a.source_escrito_id && (
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <Link to={`/escritos/${a.source_escrito_id}`} className="text-violet-300 hover:underline truncate">
                Escrito {a.source_escrito_id.slice(0, 8)}…
              </Link>
            </div>
          )}
          {a.source_diff && (
            <p>{(a.source_diff as { changed_chars?: number }).changed_chars} chars cambiados respecto a la versión IA</p>
          )}
          <p>Creado {new Date(a.created_at).toLocaleString('es-AR')}</p>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-white/5">
        {!editing ? (
          <>
            {a.proposed && (
              <button
                onClick={handleAprobar}
                disabled={aprobar.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30"
              >
                {aprobar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Aceptar
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              <Edit2 className="h-3 w-3" />
              Editar
            </button>
            <button
              onClick={handleDescartar}
              disabled={descartar.isPending}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-30"
            >
              {descartar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              {a.proposed ? 'Descartar' : 'Archivar'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleGuardarEdicion}
              disabled={editar.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
            >
              {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Guardar
            </button>
            <button
              onClick={() => { setEditing(false); setContenidoEdit(a.contenido); setConfidenceEdit(a.confidence) }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function AprendizajesPage() {
  const [tab, setTab] = useState<Tab>('propuestos')

  const filter = tab === 'propuestos'
    ? { proposed: true, is_active: true }
    : tab === 'activos'
    ? { proposed: false, is_active: true }
    : { is_active: false }

  const { data: aprendizajes = [], isLoading } = useAprendizajes(filter)

  return (
    <div className="p-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-lg bg-violet-500/10 p-2">
          <Brain className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Aprendizajes</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Patrones que el sistema aprende de tus correcciones en los escritos. Revisá y aprobá los que valen la pena.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 mb-4">
        {([
          { v: 'propuestos', label: 'Propuestos por IA', icon: Sparkles },
          { v: 'activos', label: 'Activos', icon: Check },
          { v: 'archivados', label: 'Archivados', icon: X },
        ] as const).map(t => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              tab === t.v
                ? 'border-violet-400 text-violet-300'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-200'
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : aprendizajes.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={
            tab === 'propuestos' ? 'No hay aprendizajes propuestos'
            : tab === 'activos' ? 'No hay aprendizajes activos'
            : 'Sin archivos'
          }
          description={
            tab === 'propuestos'
              ? 'Cuando firmes o presentes un escrito que hayas corregido, el sistema va a proponer aprendizajes acá.'
              : tab === 'activos'
              ? 'Aprobá aprendizajes propuestos para que entren al contexto cuando generes escritos.'
              : 'Los aprendizajes descartados aparecen acá.'
          }
        />
      ) : (
        <div className="space-y-3">
          {aprendizajes.map(a => <AprendizajeCard key={a.id} a={a} />)}
        </div>
      )}
    </div>
  )
}
