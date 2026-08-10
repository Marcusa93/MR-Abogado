import { useState } from 'react'
import { Loader2, RefreshCw, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'
import { useOrdenarHechos } from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { timeAgo } from '@/lib/utils/date-helpers'

interface Props {
  consultaId: string
  hechosOrdenados: string
  preguntasSugeridas: string[]
  hechosOrdenadosAt: string | null
}

export function ConsultaHechosOrdenados({
  consultaId,
  hechosOrdenados,
  preguntasSugeridas,
  hechosOrdenadosAt,
}: Props) {
  const ordenar = useOrdenarHechos()
  const [expandido, setExpandido] = useState(true)
  const [preguntasRespondidas, setPreguntasRespondidas] = useState<Set<number>>(new Set())

  async function handleReordenar() {
    if (!window.confirm('¿Re-ordenar los hechos? Esto reemplazará el análisis actual.')) return
    try {
      await ordenar.mutateAsync(consultaId)
      toast.success('Hechos re-ordenados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo re-ordenar')
    }
  }

  function togglePregunta(idx: number) {
    setPreguntasRespondidas(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Hechos ordenados con IA</span>
          {hechosOrdenadosAt && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">{timeAgo(hechosOrdenadosAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleReordenar() }}
            disabled={ordenar.isPending}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-lg bg-amber-100 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors disabled:opacity-50"
          >
            {ordenar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-ordenar
          </button>
          {expandido ? <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        </div>
      </button>

      {expandido && (
        <div className="px-5 pb-5 space-y-4 border-t border-amber-200 dark:border-amber-800/40 pt-4">
          {/* Relato ordenado */}
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2 uppercase tracking-wide">Relato cronológico</p>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-zinc-900/60 rounded-lg border border-amber-100 dark:border-amber-800/30 p-4">
              {hechosOrdenados}
            </div>
          </div>

          {/* Preguntas sugeridas */}
          {preguntasSugeridas.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2 uppercase tracking-wide">
                Preguntas a realizarle al cliente
                <span className="normal-case ml-1 text-amber-500 dark:text-amber-500">
                  ({preguntasRespondidas.size}/{preguntasSugeridas.length} respondidas)
                </span>
              </p>
              <ul className="space-y-1.5">
                {preguntasSugeridas.map((p, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => togglePregunta(i)}
                      className={cn(
                        'w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg border transition-colors text-sm',
                        preguntasRespondidas.has(i)
                          ? 'border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/10 text-zinc-400 dark:text-zinc-500 line-through'
                          : 'border-amber-100 dark:border-amber-800/30 bg-white dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-amber-200 dark:hover:border-amber-700/50',
                      )}
                    >
                      <span className="mt-0.5 shrink-0 text-amber-500 dark:text-amber-400">
                        {preguntasRespondidas.has(i)
                          ? <CheckSquare className="h-4 w-4 text-green-500" />
                          : <Square className="h-4 w-4" />
                        }
                      </span>
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
