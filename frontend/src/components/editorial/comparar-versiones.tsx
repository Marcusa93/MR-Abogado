import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { diffPalabras } from '@/lib/utils/diff-palabras'

// Muestra qué cambió entre dos textos: agregado en verde, quitado tachado en rojo.

export function CompararVersiones({ titulo, antes, despues, onClose }: {
  titulo: string
  antes: { etiqueta: string; texto: string }
  despues: { etiqueta: string; texto: string }
  onClose: () => void
}) {
  const [soloCambios, setSoloCambios] = useState(true)
  const tramos = useMemo(() => diffPalabras(antes.texto, despues.texto), [antes.texto, despues.texto])
  const agregadas = tramos.filter((t) => t.tipo === 'agregado').reduce((n, t) => n + (t.texto.trim() ? t.texto.trim().split(/\s+/).length : 0), 0)
  const quitadas = tramos.filter((t) => t.tipo === 'quitado').reduce((n, t) => n + (t.texto.trim() ? t.texto.trim().split(/\s+/).length : 0), 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-xl dark:bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{titulo}</p>
            <p className="text-xs text-zinc-500">
              {antes.etiqueta} → {despues.etiqueta} ·{' '}
              <span className="text-emerald-700 dark:text-emerald-400">+{agregadas} palabras</span>{' '}
              <span className="text-rose-700 dark:text-rose-400">−{quitadas}</span>
            </p>
          </div>
          <button type="button" onClick={() => setSoloCambios((v) => !v)}
            className="min-h-9 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
            {soloCambios ? 'Ver todo' : 'Solo cambios'}
          </button>
          <button type="button" onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-500/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          {agregadas + quitadas === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No hay cambios en el texto.</p>
          ) : (
            <div className="whitespace-pre-wrap bg-white p-4 text-justify text-black ring-1 ring-zinc-200 dark:ring-white/10"
              style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: 1.5 }}>
              {tramos.map((t, i) => t.tipo === 'igual'
                ? (soloCambios && t.texto.length > 260
                  ? <span key={i}>{t.texto.slice(0, 100)}<span className="mx-1 select-none rounded bg-zinc-100 px-1.5 text-xs text-zinc-400">…</span>{t.texto.slice(-100)}</span>
                  : <span key={i}>{t.texto}</span>)
                : t.tipo === 'agregado'
                  ? <ins key={i} className="bg-emerald-200/70 no-underline">{t.texto}</ins>
                  : <del key={i} className="bg-rose-200/70 text-rose-900">{t.texto}</del>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
