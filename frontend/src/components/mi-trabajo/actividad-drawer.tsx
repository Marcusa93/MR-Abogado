import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink, Plus, Loader2 } from 'lucide-react'
import {
  useAsuntoActividad,
  useAddActividad,
  TIPO_LABELS,
  TIPO_DOT,
  TIPO_BADGE,
  TIPOS_CONSULTA,
  TIPOS_EXPEDIENTE,
} from '@/hooks/use-asunto-actividad'
import type { AsuntoItem } from '@/hooks/use-mi-trabajo'
import { formatDateTime } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// ActividadDrawer
// ---------------------------------------------------------------------------

export function ActividadDrawer({
  item,
  onClose,
}: {
  item: AsuntoItem
  onClose: () => void
}) {
  const { data: entries = [], isLoading } = useAsuntoActividad(item)
  const addActividad = useAddActividad()

  const tipos = item.tipo === 'consulta'
    ? [...TIPOS_CONSULTA]
    : [...TIPOS_EXPEDIENTE]

  const [tipo, setTipo] = useState<string>(tipos[0])
  const [descripcion, setDescripcion] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = descripcion.trim()
    if (!trimmed) return
    addActividad.mutate(
      { item, tipo, descripcion: trimmed },
      { onSuccess: () => setDescripcion('') },
    )
  }

  return (
    <>
      {/* Backdrop — siempre visible, toca para cerrar */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel
          Mobile : bottom sheet desde ~10% del topo, ancho completo, esquinas redondeadas arriba
          Desktop: panel lateral derecho fijo, 420px de ancho
      */}
      <div className={cn(
        'fixed z-50 flex flex-col bg-white dark:bg-zinc-900 shadow-2xl',
        // Mobile: bottom sheet
        'inset-x-0 bottom-0 top-[8%] rounded-t-2xl',
        // Desktop: right panel
        'sm:inset-y-0 sm:top-0 sm:right-0 sm:left-auto sm:w-[420px] sm:rounded-none',
        'sm:border-l sm:border-zinc-200 sm:dark:border-white/8',
      )}>

        {/* Indicador de arrastre — solo mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-100 dark:border-white/5 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={cn(
                'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                item.tipo === 'consulta'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
              )}>
                {item.tipo === 'consulta' ? 'Consulta' : 'Expediente'}
              </span>
              <Link
                to={item.href}
                title="Abrir detalle"
                className="text-zinc-400 hover:text-blue-500 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug truncate text-sm">
              {item.cliente_label}
            </h3>
            {item.titulo && item.titulo !== item.cliente_label && (
              <p className="text-xs text-zinc-400 truncate mt-0.5">{item.titulo}</p>
            )}
          </div>
          {/* Botón cerrar — tap target generoso */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-400 italic text-center py-10">
              Sin actividad registrada todavía.
            </p>
          ) : (
            <div className="relative">
              {/* Línea vertical */}
              <div className="absolute left-[6px] top-2 bottom-2 w-px bg-zinc-100 dark:bg-white/6" />

              <div className="space-y-5">
                {entries.map((entry) => (
                  <div key={entry.id} className="relative pl-6">
                    {/* Punto en la línea */}
                    <div className={cn(
                      'absolute left-0 top-[5px] h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900',
                      TIPO_DOT[entry.tipo] ?? 'bg-zinc-300 dark:bg-zinc-600',
                    )} />

                    <div className="space-y-1.5">
                      {/* Badge + fecha + autor */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                          TIPO_BADGE[entry.tipo] ?? TIPO_BADGE.otro,
                        )}>
                          {TIPO_LABELS[entry.tipo] ?? entry.tipo}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatDateTime(entry.created_at)}
                        </span>
                        {entry.autor && entry.autor !== 'Sistema' && entry.autor !== 'SAE' && (
                          <span className="text-xs text-zinc-400">· {entry.autor}</span>
                        )}
                        {entry.readonly && (
                          <span className="text-[9px] text-zinc-300 dark:text-zinc-600 uppercase tracking-wide">automático</span>
                        )}
                      </div>

                      {/* Descripción */}
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                        {entry.descripcion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Formulario de nueva actividad */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-zinc-100 dark:border-white/5 px-5 py-4 space-y-3 shrink-0 bg-zinc-50 dark:bg-zinc-900/50"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Registrar actividad
            </span>
          </div>

          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {tipos.map(t => (
              <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>
            ))}
          </select>

          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Ej: Demanda redactada, TCL enviado, Documentación solicitada, Respuesta recibida…"
            rows={3}
            className="w-full text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
          />

          <button
            type="submit"
            disabled={!descripcion.trim() || addActividad.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {addActividad.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Registrar
          </button>
        </form>
      </div>
    </>
  )
}
