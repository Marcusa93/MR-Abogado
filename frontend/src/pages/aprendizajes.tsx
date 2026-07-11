import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Sparkles, Check, X, Edit2, Loader2, FileText, ChevronDown, ChevronRight, GraduationCap, RefreshCw, ChevronRight as Next, Tag } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useAprendizajes, useAprobarAprendizaje, useDescartarAprendizaje, useEditarAprendizaje,
  type Aprendizaje, type Confidence, type Scope, type TargetKind,
} from '@/hooks/use-aprendizajes'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type Tab = 'propuestos' | 'activos' | 'archivados' | 'quiz'

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
        {(() => {
          const src = (a.contenido_estructurado as { source?: { type?: string; expediente_id?: string; auto?: boolean } } | null)?.source
          if (!src?.auto) return null
          const label = src.type === 'movement' ? 'IA — sentencia SAE' : 'IA — sentencia subida'
          return (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                <Sparkles className="h-3 w-3" /> {label}
              </span>
              {src.expediente_id && (
                <Link
                  to={`/expedientes/${src.expediente_id}`}
                  className="text-[10px] text-cyan-300 hover:text-cyan-200 underline truncate"
                  title="Ver expediente origen"
                >
                  → expediente
                </Link>
              )}
            </>
          )
        })()}
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

// ---------------------------------------------------------------------------
// Quiz Diario
// ---------------------------------------------------------------------------

interface PreguntaQuiz {
  id: string
  enunciado: string
  tipo: 'opcion_multiple' | 'verdadero_falso'
  opciones: string[]
  respuesta_correcta: string
  explicacion: string
  categoria: 'patron' | 'caso' | 'derecho'
}

type QuizEstado = 'idle' | 'cargando' | 'activo' | 'fin'

const CATEGORIA_LABEL: Record<PreguntaQuiz['categoria'], string> = {
  patron: 'Patrón del estudio',
  caso: 'Caso activo',
  derecho: 'Derecho',
}
const CATEGORIA_CLS: Record<PreguntaQuiz['categoria'], string> = {
  patron: 'bg-violet-500/15 text-violet-300',
  caso: 'bg-cyan-500/15 text-cyan-300',
  derecho: 'bg-amber-500/15 text-amber-300',
}

function QuizDiario() {
  const supabase = createClient()
  const [estado, setEstado] = useState<QuizEstado>('idle')
  const [preguntas, setPreguntas] = useState<PreguntaQuiz[]>([])
  const [idx, setIdx] = useState(0)
  const [seleccionadas, setSeleccionadas] = useState<Record<number, string>>({})
  const [confirmadas, setConfirmadas] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const preguntaActual = preguntas[idx] ?? null
  const seleccion = seleccionadas[idx] ?? null
  const confirmada = confirmadas[idx] ?? false
  const esCorrecto = seleccion === preguntaActual?.respuesta_correcta
  const puntaje = Object.entries(confirmadas).filter(([i, v]) => v && seleccionadas[parseInt(i)] === preguntas[parseInt(i)]?.respuesta_correcta).length

  const generarQuiz = async () => {
    setEstado('cargando')
    setError(null)
    setSeleccionadas({})
    setConfirmadas({})
    setIdx(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aprendizajes-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { ok?: boolean; preguntas?: PreguntaQuiz[]; error?: string; mensaje?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error desconocido')
      if (data.mensaje) {
        setError(data.mensaje)
        setEstado('idle')
        return
      }
      setPreguntas(data.preguntas ?? [])
      setEstado('activo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el quiz')
      setEstado('idle')
    }
  }

  if (estado === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <div className="rounded-full bg-amber-500/10 p-4">
          <GraduationCap className="h-8 w-8 text-amber-400" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-zinc-100 mb-1">Repaso del día</h2>
          <p className="text-sm text-zinc-500 max-w-sm">
            5 preguntas generadas por IA sobre los patrones del estudio, tus casos activos y conceptos de derecho.
          </p>
        </div>
        {error && (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 max-w-sm text-center">
            {error}
          </p>
        )}
        <button
          onClick={generarQuiz}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:opacity-90 transition-opacity"
        >
          <Sparkles className="h-4 w-4" />
          Generar quiz
        </button>
      </div>
    )
  }

  if (estado === 'cargando') {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-sm text-zinc-500">Generando preguntas…</p>
      </div>
    )
  }

  if (estado === 'fin' || (estado === 'activo' && idx >= preguntas.length)) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 max-w-md mx-auto">
        <div className={cn(
          'rounded-full p-4',
          puntaje >= 4 ? 'bg-emerald-500/10' : puntaje >= 3 ? 'bg-amber-500/10' : 'bg-rose-500/10'
        )}>
          <GraduationCap className={cn(
            'h-8 w-8',
            puntaje >= 4 ? 'text-emerald-400' : puntaje >= 3 ? 'text-amber-400' : 'text-rose-400'
          )} />
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-zinc-100 tabular-nums">{puntaje}/{preguntas.length}</p>
          <p className="text-sm text-zinc-500 mt-1">
            {puntaje === preguntas.length ? '¡Perfecto!' : puntaje >= 3 ? 'Muy bien.' : 'A repasar un poco más.'}
          </p>
        </div>
        {/* Resumen de errores */}
        {preguntas.filter((_, i) => seleccionadas[i] !== preguntas[i].respuesta_correcta).length > 0 && (
          <div className="w-full space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Para repasar</p>
            {preguntas.map((p, i) => seleccionadas[i] !== p.respuesta_correcta ? (
              <div key={p.id} className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
                <p className="text-xs text-zinc-300 mb-1">{p.enunciado}</p>
                <p className="text-[11px] text-emerald-400">Correcta: {p.respuesta_correcta}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{p.explicacion}</p>
              </div>
            ) : null)}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={generarQuiz}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Nuevo quiz
          </button>
        </div>
      </div>
    )
  }

  if (!preguntaActual) return null

  return (
    <div className="max-w-xl mx-auto py-4">
      {/* Progreso */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">{idx + 1} / {preguntas.length}</p>
        <div className="flex gap-1">
          {preguntas.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 w-8 rounded-full transition-colors',
                i < idx
                  ? seleccionadas[i] === preguntas[i].respuesta_correcta
                    ? 'bg-emerald-500'
                    : 'bg-rose-500'
                  : i === idx
                  ? 'bg-amber-400'
                  : 'bg-white/10'
              )}
            />
          ))}
        </div>
      </div>

      {/* Tarjeta de pregunta */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        {/* Categoría */}
        <div className="flex items-center gap-2 mb-3">
          <Tag className="h-3 w-3 text-zinc-500" />
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', CATEGORIA_CLS[preguntaActual.categoria])}>
            {CATEGORIA_LABEL[preguntaActual.categoria]}
          </span>
        </div>

        <p className="text-sm font-medium text-zinc-100 leading-relaxed mb-4">{preguntaActual.enunciado}</p>

        {/* Opciones */}
        <div className="space-y-2">
          {preguntaActual.opciones.map((opcion) => {
            const estaSeleccionada = seleccion === opcion
            const esLaCorrecta = opcion === preguntaActual.respuesta_correcta
            let cls = 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300'
            if (confirmada) {
              if (esLaCorrecta) cls = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              else if (estaSeleccionada) cls = 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              else cls = 'border-white/5 bg-white/[0.01] text-zinc-500'
            } else if (estaSeleccionada) {
              cls = 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            }
            return (
              <button
                key={opcion}
                disabled={confirmada}
                onClick={() => setSeleccionadas(prev => ({ ...prev, [idx]: opcion }))}
                className={cn('w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors', cls)}
              >
                {opcion}
              </button>
            )
          })}
        </div>

        {/* Explicación post-confirmación */}
        {confirmada && (
          <div className={cn(
            'mt-4 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
            esCorrecto
              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
              : 'border-rose-500/20 bg-rose-500/5 text-rose-200'
          )}>
            <span className="font-semibold mr-1">{esCorrecto ? '¡Correcto!' : 'Incorrecto.'}</span>
            {preguntaActual.explicacion}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 mt-4">
        {!confirmada ? (
          <button
            disabled={!seleccion}
            onClick={() => setConfirmadas(prev => ({ ...prev, [idx]: true }))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="h-4 w-4" />
            Confirmar
          </button>
        ) : idx < preguntas.length - 1 ? (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/15 transition-colors"
          >
            Siguiente
            <Next className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setEstado('fin')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium text-zinc-900 hover:opacity-90 transition-opacity"
          >
            Ver resultado
          </button>
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
    : tab === 'archivados'
    ? { is_active: false }
    : {}

  const { data: aprendizajes = [], isLoading } = useAprendizajes(
    tab !== 'quiz' ? filter : {},
  )

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
      <div className="flex gap-1 border-b border-white/5 mb-4 overflow-x-auto">
        {([
          { v: 'propuestos', label: 'Propuestos por IA', icon: Sparkles },
          { v: 'activos', label: 'Activos', icon: Check },
          { v: 'archivados', label: 'Archivados', icon: X },
          { v: 'quiz', label: 'Repaso del día', icon: GraduationCap },
        ] as const).map(t => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              tab === t.v
                ? t.v === 'quiz'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-violet-400 text-violet-300'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-200'
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Cuerpo */}
      {tab === 'quiz' ? (
        <QuizDiario />
      ) : isLoading ? (
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
