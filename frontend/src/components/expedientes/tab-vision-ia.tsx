import { useState } from 'react'
import {
  Sparkles, Loader2, ChevronDown, ChevronRight, RefreshCw, Send,
  AlertTriangle, MessageCircle, Lightbulb, Check, X,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import {
  useBrief, useBriefPreguntas, useBriefContradicciones,
  useGenerateBrief, useParseBriefInput, useCommitBriefEntry,
  useAnswerPregunta, useResolverContradiccion,
  type BriefEntry, type BriefSeccion,
  type ParseInputResponse, type GenerateBriefResponse,
} from '@/hooks/use-brief'

interface Props { expedienteId: string }

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 shadow-sm p-4',
      className,
    )}>{children}</div>
  )
}

const SECCION_LABELS: Record<BriefSeccion, string> = {
  hechos:         'Hechos',
  partes:         'Partes',
  estrategia:     'Estrategia',
  riesgos:        'Riesgos',
  decisiones:     'Decisiones',
  normativa:      'Normativa relevante',
  jurisprudencia: 'Jurisprudencia',
  hitos:          'Próximos hitos',
  observaciones:  'Observaciones',
}

const SECCION_ORDEN: BriefSeccion[] = [
  'hechos', 'partes', 'estrategia', 'decisiones',
  'riesgos', 'normativa', 'jurisprudencia', 'hitos', 'observaciones',
]

const CONFIDENCE_BADGE: Record<string, { label: string; cls: string }> = {
  baja:               { label: 'baja',        cls: 'bg-zinc-500/15 text-zinc-400' },
  media:              { label: 'media',       cls: 'bg-sky-500/15 text-sky-400' },
  alta:               { label: 'alta',        cls: 'bg-emerald-500/15 text-emerald-400' },
  confirmada_humana:  { label: '✓ vos',       cls: 'bg-amber-500/15 text-amber-400' },
}

const SOURCE_LABEL: Record<string, string> = {
  pregunta_predef:     'pregunta',
  input_libre:         'enseñado',
  importado_actuacion: 'SAE',
  generado_por_ia:     'IA',
  manual:              'manual',
}

export function TabVisionIa({ expedienteId }: Props) {
  const { data: brief = [], isLoading: briefLoading } = useBrief(expedienteId)
  const { data: preguntas = [] } = useBriefPreguntas(expedienteId)
  const { data: contradicciones = [] } = useBriefContradicciones(expedienteId)

  const generate = useGenerateBrief()
  const parse = useParseBriefInput()
  const answerPregunta = useAnswerPregunta()
  const resolverContradiccion = useResolverContradiccion()

  const [openSections, setOpenSections] = useState<Set<BriefSeccion>>(
    new Set(['hechos', 'estrategia', 'decisiones']),
  )
  const [inputLibre, setInputLibre] = useState('')
  const [parseResult, setParseResult] = useState<ParseInputResponse | null>(null)
  const [generateResult, setGenerateResult] = useState<GenerateBriefResponse | null>(null)

  const toggle = (s: BriefSeccion) => {
    const next = new Set(openSections)
    if (next.has(s)) next.delete(s); else next.add(s)
    setOpenSections(next)
  }

  // Agrupa entries del brief por sección
  const briefBySection = brief.reduce<Record<BriefSeccion, BriefEntry[]>>((acc, e) => {
    if (!acc[e.seccion]) acc[e.seccion] = []
    acc[e.seccion].push(e)
    return acc
  }, {} as Record<BriefSeccion, BriefEntry[]>)

  // ─── Acciones ────────────────────────────────────────────────────────────

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({ expediente_id: expedienteId })
      setGenerateResult(res)
    } catch (e: any) {
      toast.error(e.message || 'Error generando brief')
    }
  }

  async function handleParse() {
    const txt = inputLibre.trim()
    if (txt.length < 5) {
      toast.error('Escribí al menos una frase')
      return
    }
    try {
      const res = await parse.mutateAsync({ expediente_id: expedienteId, texto: txt })
      setParseResult(res)
    } catch (e: any) {
      toast.error(e.message || 'Error procesando')
    }
  }

  // Si el panel está vacío y nunca se generó, ofrecer arrancar
  const briefVacio = !briefLoading && brief.length === 0

  return (
    <div className="space-y-4">
      {/* Header con tipo de proceso + botón generar */}
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-violet-500/15 p-2">
              <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Visión IA del expediente</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Brief estructurado que la IA arma y vos validás. Nada se guarda sin tu confirmación.
              </p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generate.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 text-sm font-medium disabled:opacity-50"
          >
            {generate.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            {briefVacio ? 'Generar brief' : 'Actualizar brief'}
          </button>
        </div>
      </Panel>

      {/* Resultado de generate: propuesta para revisar */}
      {generateResult && (
        <GenerateResultPanel
          expedienteId={expedienteId}
          result={generateResult}
          onClose={() => setGenerateResult(null)}
        />
      )}

      {/* Contradicciones pendientes */}
      {contradicciones.length > 0 && (
        <Panel>
          <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-4 w-4" />
            Contradicciones pendientes ({contradicciones.length})
          </h4>
          <ul className="space-y-2">
            {contradicciones.map(c => (
              <li key={c.id} className="text-sm rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                <p className="text-zinc-200">{c.descripcion}</p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => resolverContradiccion.mutate({
                      contradiccion_id: c.id, expediente_id: expedienteId, resolucion: 'a_vale',
                    })}
                    className="px-2 py-1 rounded text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                  >Vale A</button>
                  {c.entry_b_id && (
                    <button
                      onClick={() => resolverContradiccion.mutate({
                        contradiccion_id: c.id, expediente_id: expedienteId, resolucion: 'b_vale',
                      })}
                      className="px-2 py-1 rounded text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    >Vale B</button>
                  )}
                  <button
                    onClick={() => resolverContradiccion.mutate({
                      contradiccion_id: c.id, expediente_id: expedienteId, resolucion: 'ninguna', estado: 'descartada',
                    })}
                    className="px-2 py-1 rounded text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  >Descartar</button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Brief actual por sección */}
      {briefLoading ? (
        <Panel><Loader2 className="h-5 w-5 animate-spin text-zinc-400 mx-auto" /></Panel>
      ) : briefVacio ? (
        <Panel>
          <EmptyState
            icon={Sparkles}
            title="Sin brief todavía"
            description="Apretá 'Generar brief' para que la IA proponga uno a partir de las actuaciones, escritos y normativa fijada. Vos confirmás cada cosa antes de que se guarde."
          />
        </Panel>
      ) : (
        <Panel>
          <div className="space-y-1">
            {SECCION_ORDEN.map(seccion => {
              const items = briefBySection[seccion] ?? []
              if (items.length === 0) return null
              const isOpen = openSections.has(seccion)
              return (
                <div key={seccion} className="border-b border-zinc-800 last:border-0">
                  <button
                    onClick={() => toggle(seccion)}
                    className="w-full flex items-center gap-2 py-2.5 text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-zinc-400" />
                      : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                    <span className="text-sm font-medium text-zinc-200">
                      {SECCION_LABELS[seccion]}
                    </span>
                    <span className="text-xs text-zinc-500 ml-1">({items.length})</span>
                  </button>
                  {isOpen && (
                    <ul className="pb-2.5 pl-6 space-y-1.5">
                      {items.map(e => (
                        <li key={e.entry_id} className="text-sm text-zinc-300 group flex items-start gap-2">
                          <span className="text-zinc-600 mt-1.5 text-xs">•</span>
                          <div className="flex-1">
                            <p>{e.contenido}</p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-[10px]',
                                CONFIDENCE_BADGE[e.confidence]?.cls,
                              )}>
                                {CONFIDENCE_BADGE[e.confidence]?.label}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {SOURCE_LABEL[e.source] ?? e.source}
                              </span>
                              {e.version > 1 && (
                                <span className="text-[10px] text-zinc-500">v{e.version}</span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* Preguntas abiertas */}
      {preguntas.length > 0 && (
        <Panel>
          <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5 mb-3">
            <MessageCircle className="h-4 w-4 text-cyan-400" />
            La IA quiere saber ({preguntas.length})
          </h4>
          <ul className="space-y-2.5">
            {preguntas.map(p => (
              <li key={p.id} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="text-sm text-zinc-200">{p.pregunta}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => answerPregunta.mutate({
                      pregunta_id: p.id, expediente_id: expedienteId, estado: 'descartada',
                    })}
                    className="px-2 py-1 rounded text-xs text-zinc-400 hover:bg-zinc-800"
                  >Después</button>
                  <span className="text-[10px] text-zinc-600">
                    Contestá abajo en el cuadro libre y se procesa
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Input libre */}
      <Panel>
        <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Enseñarle algo a la IA
        </h4>
        <p className="text-xs text-zinc-400 mb-2">
          Escribí libre, en tu idioma. La IA va a procesarlo y mostrarte qué entendió antes de guardar.
        </p>
        <textarea
          value={inputLibre}
          onChange={(e) => setInputLibre(e.target.value)}
          rows={3}
          placeholder='Ej: "el juez Pérez es duro con cautelares" o "no vamos a oponer prescripción"'
          className="w-full text-sm bg-zinc-900/50 border border-zinc-800 rounded-md p-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 resize-y"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleParse}
            disabled={parse.isPending || inputLibre.trim().length < 5}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 text-sm font-medium disabled:opacity-50"
          >
            {parse.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            Procesar
          </button>
        </div>
      </Panel>

      {/* Tarjeta de confirmación post-parse */}
      {parseResult && (
        <ParseResultPanel
          expedienteId={expedienteId}
          result={parseResult}
          onClose={() => { setParseResult(null); setInputLibre('') }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Panel: tarjeta de confirmación tras "Procesar"
// ──────────────────────────────────────────────────────────────────────────

function ParseResultPanel({
  expedienteId, result, onClose,
}: {
  expedienteId: string
  result: ParseInputResponse
  onClose: () => void
}) {
  const commit = useCommitBriefEntry()
  const [checked, setChecked] = useState<Set<number>>(
    new Set(result.cambios_propuestos.map((_, i) => i)),
  )

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i); else next.add(i)
    setChecked(next)
  }

  async function handleConfirm() {
    const toCommit = result.cambios_propuestos.filter((_, i) => checked.has(i))
    if (toCommit.length === 0) {
      toast.error('Tildá al menos una propuesta para guardar')
      return
    }
    try {
      for (const c of toCommit) {
        await commit.mutateAsync({
          expediente_id: expedienteId,
          seccion: c.seccion,
          tipo: c.tipo,
          contenido: c.contenido,
          contenido_estructurado: c.contenido_estructurado ?? null,
          source: 'input_libre',
          confidence: 'confirmada_humana',
          versionar_entry_id: c.operacion === 'versionar_entry' ? c.versionar_entry_id : null,
        })
      }
      toast.success(`${toCommit.length} entrada(s) agregada(s) al brief`)
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Error guardando')
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <Check className="h-4 w-4 text-violet-400" />
            La IA entendió esto
          </h4>
          <p className="text-xs text-zinc-400 mt-0.5">
            Revisá y tildá lo que querés guardar. Nada se persiste hasta que confirmes.
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preguntas de clarificación */}
      {result.preguntas_clarificacion.length > 0 && (
        <div className="mb-3 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5">
          <p className="text-xs font-medium text-cyan-400 mb-1">Necesita aclarar:</p>
          <ul className="space-y-1">
            {result.preguntas_clarificacion.map((q, i) => (
              <li key={i} className="text-sm text-zinc-300">• {q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Cambios propuestos */}
      {result.cambios_propuestos.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">
          La IA no extrajo cambios concretos del input. Probablemente necesite que la pregunta de
          aclaración esté contestada o que des más contexto.
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {result.cambios_propuestos.map((c, i) => (
            <label
              key={i}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors',
                checked.has(i)
                  ? 'border-violet-500/30 bg-violet-500/5'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
              )}
            >
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() => toggle(i)}
                className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">{c.contenido}</p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                    {SECCION_LABELS[c.seccion]} / {c.tipo}
                  </span>
                  {c.operacion === 'versionar_entry' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400">
                      reemplaza versión anterior
                    </span>
                  )}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    CONFIDENCE_BADGE[c.confidence]?.cls,
                  )}>
                    {CONFIDENCE_BADGE[c.confidence]?.label}
                  </span>
                </div>
                {c.rationale && (
                  <p className="mt-1 text-[11px] text-zinc-500 italic">{c.rationale}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Contradicciones detectadas */}
      {result.contradicciones_detectadas.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <p className="text-xs font-medium text-amber-400 mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Contradicciones detectadas:
          </p>
          <ul className="space-y-1">
            {result.contradicciones_detectadas.map((c, i) => (
              <li key={i} className="text-sm text-zinc-300">
                <span className={cn(
                  'mr-1 px-1.5 py-0.5 rounded text-[10px]',
                  c.severidad === 'alta' ? 'bg-rose-500/15 text-rose-400' :
                  c.severidad === 'media' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-zinc-700 text-zinc-400',
                )}>{c.severidad}</span>
                {c.descripcion}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-zinc-500 italic">
            Al confirmar lo nuevo, las contradicciones quedan registradas para que las resuelvas arriba.
          </p>
        </div>
      )}

      {/* Generalizable */}
      {result.generalizable_sugerido.length > 0 && (
        <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <p className="text-xs font-medium text-emerald-400 mb-1 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" />
            Aprendizajes generalizables (capa 1):
          </p>
          <ul className="space-y-1">
            {result.generalizable_sugerido.map((g, i) => (
              <li key={i} className="text-sm text-zinc-300">
                <span className="mr-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                  {g.target_kind}{g.target_ref_text ? `/${g.target_ref_text}` : ''}
                </span>
                {g.contenido}
                {g.rationale && (
                  <span className="block text-[11px] text-zinc-500 italic mt-0.5">{g.rationale}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-zinc-500 italic">
            (La sugerencia al rulebook se gestiona desde Configuración &gt; Aprendizajes — todavía no se aplica acá.)
          </p>
        </div>
      )}

      {/* Acciones */}
      {result.cambios_propuestos.length > 0 && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:bg-zinc-800"
          >Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={commit.isPending || checked.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500 text-white hover:bg-violet-600 text-sm font-medium disabled:opacity-50"
          >
            {commit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar y guardar ({checked.size})
          </button>
        </div>
      )}
    </Panel>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Panel: resultado de "Generar brief"
// ──────────────────────────────────────────────────────────────────────────

function GenerateResultPanel({
  expedienteId, result, onClose,
}: {
  expedienteId: string
  result: GenerateBriefResponse
  onClose: () => void
}) {
  const commit = useCommitBriefEntry()
  const [checked, setChecked] = useState<Set<number>>(
    new Set(result.entries_propuestas.map((_, i) => i)),
  )

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i); else next.add(i)
    setChecked(next)
  }

  async function handleConfirm() {
    const toCommit = result.entries_propuestas.filter((_, i) => checked.has(i))
    if (toCommit.length === 0) {
      toast.error('Tildá al menos una propuesta')
      return
    }
    try {
      for (const c of toCommit) {
        await commit.mutateAsync({
          expediente_id: expedienteId,
          seccion: c.seccion,
          tipo: c.tipo,
          contenido: c.contenido,
          contenido_estructurado: c.contenido_estructurado ?? null,
          source: 'generado_por_ia',
          confidence: c.confidence,
          evidence_refs: c.evidence_refs ?? [],
        })
      }
      toast.success(`${toCommit.length} entrada(s) agregada(s) al brief`)
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Error guardando')
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-400" />
            Brief propuesto
          </h4>
          {result.resumen_corto && (
            <p className="text-sm text-zinc-300 mt-1">{result.resumen_corto}</p>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {result.entries_propuestas.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">
          La IA no propuso entradas nuevas (probablemente porque ya hay un brief completo o falta
          contexto). Si querés enseñarle algo específico, usá el cuadro de input libre.
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {result.entries_propuestas.map((c, i) => (
            <label
              key={i}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors',
                checked.has(i)
                  ? 'border-violet-500/30 bg-violet-500/5'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
              )}
            >
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() => toggle(i)}
                className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">{c.contenido}</p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                    {SECCION_LABELS[c.seccion]} / {c.tipo}
                  </span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    CONFIDENCE_BADGE[c.confidence]?.cls,
                  )}>
                    {CONFIDENCE_BADGE[c.confidence]?.label}
                  </span>
                  {c.evidence_refs && c.evidence_refs.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-400">
                      {c.evidence_refs.length} fuente(s)
                    </span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {result.preguntas_abiertas.length > 0 && (
        <div className="mb-3 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5">
          <p className="text-xs font-medium text-cyan-400 mb-1">
            La IA dejó {result.preguntas_abiertas.length} pregunta(s) abierta(s) (se crearán al confirmar):
          </p>
          <ul className="space-y-1">
            {result.preguntas_abiertas.map((q, i) => (
              <li key={i} className="text-sm text-zinc-300">• {q.pregunta}</li>
            ))}
          </ul>
        </div>
      )}

      {result.proximos_hitos_calculados.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
          <p className="text-xs font-medium text-amber-400 mb-1">Próximos hitos calculados:</p>
          <ul className="space-y-1">
            {result.proximos_hitos_calculados.map((h, i) => (
              <li key={i} className="text-sm text-zinc-300">
                • {h.descripcion}
                {h.plazo_dias_restantes != null && (
                  <span className="text-zinc-500"> ({h.plazo_dias_restantes}d)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.entries_propuestas.length > 0 && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:bg-zinc-800"
          >Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={commit.isPending || checked.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500 text-white hover:bg-violet-600 text-sm font-medium disabled:opacity-50"
          >
            {commit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar ({checked.size})
          </button>
        </div>
      )}
    </Panel>
  )
}
