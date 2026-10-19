import { useMemo } from 'react'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

// Marcas [VERIFICAR: …] del texto. Se resuelven con "Depurar el artículo": la
// IA reescribe el texto quitando toda norma o fallo no verificable y dejando el
// argumento coherente; el resultado queda como versión nueva para revisar.

export function MarcasVerificar({ cuerpo, editable, depurando, onDepurar }: {
  cuerpo: string
  editable: boolean
  depurando: boolean
  onDepurar: () => void
}) {
  const marcas = useMemo(() => {
    const out: { marca: string; contexto: string }[] = []
    const re = /\[VERIFICAR[^\]]*\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(cuerpo))) {
      const antes = cuerpo.slice(Math.max(0, m.index - 160), m.index)
      const desde = Math.max(antes.lastIndexOf('. '), antes.lastIndexOf('\n'))
      out.push({ marca: m[0], contexto: (desde >= 0 ? antes.slice(desde + 1) : `…${antes}`).trim() })
    }
    return out
  }, [cuerpo])

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Marcas [VERIFICAR] · {marcas.length}</p>
      {!marcas.length ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No quedan marcas en el texto.</p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Afirmaciones que la IA no pudo respaldar. <b>Depurar</b> reescribe el artículo: quita toda norma o fallo que no esté verificado,
            resuelve estas marcas y deja el texto coherente. Queda como versión nueva y te muestra qué cambió.
          </p>
          {editable && (
            <button type="button" onClick={onDepurar} disabled={depurando}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--brand-navy)] px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-[var(--brand-navy)]">
              {depurando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {depurando ? 'Depurando… (1-2 min)' : 'Depurar el artículo'}
            </button>
          )}
          <ul className="space-y-1.5">
            {marcas.map((m, i) => (
              <li key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                {m.contexto && <p className="text-zinc-600 dark:text-zinc-400">{m.contexto}</p>}
                <p className="mt-0.5 font-medium text-amber-800 dark:text-amber-300">{m.marca}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
