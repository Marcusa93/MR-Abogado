import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, Plus, Trash2 } from 'lucide-react'
import { useOrdenarHechos, useUpdateConsulta } from '@/hooks/use-consultas'
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
  const update = useUpdateConsulta()
  const [expandido, setExpandido] = useState(true)

  // Hechos
  const [editandoHechos, setEditandoHechos] = useState(false)
  const [hechosEdit, setHechosEdit] = useState(hechosOrdenados)

  // Preguntas
  const [preguntas, setPreguntas] = useState<string[]>(preguntasSugeridas)

  // Sincronizar cuando llegan nuevos datos (ej: después de re-ordenar)
  useEffect(() => { setHechosEdit(hechosOrdenados) }, [hechosOrdenados])
  useEffect(() => { setPreguntas(preguntasSugeridas) }, [preguntasSugeridas])

  const hechosModificado = hechosEdit !== hechosOrdenados
  const preguntasModificadas = JSON.stringify(preguntas) !== JSON.stringify(preguntasSugeridas)
  const dirty = hechosModificado || preguntasModificadas

  async function handleReordenar() {
    if (!window.confirm('¿Re-ordenar los hechos? Esto reemplazará el análisis actual.')) return
    try {
      await ordenar.mutateAsync(consultaId)
      toast.success('Hechos re-ordenados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo re-ordenar')
    }
  }

  async function handleGuardar() {
    const limpiadas = preguntas.map(p => p.trim()).filter(Boolean)
    try {
      await update.mutateAsync({
        id: consultaId,
        hechos_ordenados: hechosEdit,
        preguntas_sugeridas: limpiadas,
      })
      toast.success('Cambios guardados')
      setEditandoHechos(false)
      setPreguntas(limpiadas)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  function handleCancelarHechos() {
    setHechosEdit(hechosOrdenados)
    setEditandoHechos(false)
  }

  function updatePregunta(idx: number, val: string) {
    setPreguntas(prev => prev.map((p, i) => i === idx ? val : p))
  }

  function deletePregunta(idx: number) {
    setPreguntas(prev => prev.filter((_, i) => i !== idx))
  }

  function addPregunta() {
    setPreguntas(prev => [...prev, ''])
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
      {/* Header */}
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
          {dirty && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-800/30 px-1.5 py-0.5 rounded">
              sin guardar
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleGuardar() }}
              disabled={update.isPending}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-lg bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Guardar
            </button>
          )}
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
        <div className="px-5 pb-5 space-y-5 border-t border-amber-200 dark:border-amber-800/40 pt-4">

          {/* Relato ordenado */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">Relato cronológico</p>
              {!editandoHechos ? (
                <button
                  type="button"
                  onClick={() => setEditandoHechos(true)}
                  className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelarHechos}
                  className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
              )}
            </div>

            {editandoHechos ? (
              <textarea
                value={hechosEdit}
                onChange={e => setHechosEdit(e.target.value)}
                rows={12}
                className="w-full text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed bg-white dark:bg-zinc-900/60 rounded-lg border border-amber-300 dark:border-amber-700/50 p-4 resize-y focus:outline-none focus:ring-1 focus:ring-amber-400 dark:focus:ring-amber-600"
              />
            ) : (
              <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-zinc-900/60 rounded-lg border border-amber-100 dark:border-amber-800/30 p-4">
                {hechosEdit}
              </div>
            )}
          </div>

          {/* Preguntas sugeridas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                Preguntas a realizarle al cliente
              </p>
              <button
                type="button"
                onClick={addPregunta}
                className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>
            </div>

            <ul className="space-y-2">
              {preguntas.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2.5 text-[10px] font-bold text-amber-500 dark:text-amber-400 w-4 shrink-0 text-right select-none">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={p}
                    onChange={e => updatePregunta(i, e.target.value)}
                    placeholder="Escribí la pregunta..."
                    className={cn(
                      'flex-1 text-sm text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900/60 rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:focus:ring-amber-600 transition-colors',
                      p.trim()
                        ? 'border-amber-100 dark:border-amber-800/30 hover:border-amber-200 dark:hover:border-amber-700/50'
                        : 'border-amber-200 dark:border-amber-700/50',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => deletePregunta(i)}
                    className="mt-2 p-0.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Eliminar pregunta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}

              {preguntas.length === 0 && (
                <li className="text-sm text-zinc-400 dark:text-zinc-500 italic px-1">
                  Sin preguntas. Usá "Agregar" para añadir.
                </li>
              )}
            </ul>
          </div>

          {/* Guardar al pie si hay cambios */}
          {dirty && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleGuardar}
                disabled={update.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
              >
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar cambios
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
