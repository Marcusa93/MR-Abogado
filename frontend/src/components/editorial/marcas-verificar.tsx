import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { llamarEditorial } from '@/hooks/use-editorial'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Marcas [VERIFICAR: …] del texto: la IA propone, con la evidencia comprobada,
// si la afirmación queda respaldada (con cita), se reformula como opinión, se
// elimina o la tiene que comprobar Marco a mano. Nada se cambia sin "Aplicar".

interface Propuesta {
  i: number
  marca: string
  decision: 'respaldada' | 'reformular' | 'eliminar' | 'mantener'
  motivo: string
  fuente: string
  original: string
  nuevo: string
}

const DECISION: Record<Propuesta['decision'], { label: string; cls: string }> = {
  respaldada: { label: 'Respaldada', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  reformular: { label: 'Reformular', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  eliminar: { label: 'Eliminar', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  mantener: { label: 'Comprobar a mano', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
}

const BTN = 'flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium disabled:opacity-50'

export function MarcasVerificar({ articuloId, cuerpo, onCuerpo, editable }: {
  articuloId: string
  cuerpo: string
  onCuerpo: (v: string) => void
  editable: boolean
}) {
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null)
  const [aplicadas, setAplicadas] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(false)

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

  const proponer = async () => {
    setCargando(true)
    try {
      const r = await llamarEditorial<{ propuestas: Propuesta[] }>({ modo: 'resolver_marcas', articulo_id: articuloId, cuerpo })
      setPropuestas(r.propuestas); setAplicadas(new Set())
      if (!r.propuestas.length) toast.info('No hay marcas para resolver')
    } catch (e) {
      toast.error('No se pudieron proponer soluciones', e instanceof Error ? e.message : undefined)
    } finally { setCargando(false) }
  }

  const aplicar = (lista: Propuesta[]) => {
    let texto = cuerpo
    const hechas = new Set(aplicadas)
    let n = 0
    for (const p of lista) {
      if (p.decision === 'mantener' || hechas.has(p.i) || !texto.includes(p.original)) continue
      texto = texto.replace(p.original, p.nuevo)
      hechas.add(p.i); n++
    }
    if (!n) return toast.info('No había cambios para aplicar', 'Puede que ya hayas editado ese tramo.')
    onCuerpo(texto); setAplicadas(hechas)
    toast.success(n === 1 ? 'Cambio aplicado' : `${n} cambios aplicados`, 'Revisalos en el texto y guardá la versión.')
  }

  if (!marcas.length && !propuestas) {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Marcas [VERIFICAR]</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No quedan marcas en el texto.</p>
      </div>
    )
  }

  const pendientes = (propuestas ?? []).filter((p) => p.decision !== 'mantener' && !aplicadas.has(p.i))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Marcas [VERIFICAR] · {marcas.length}</p>
        {editable && (
          <button type="button" onClick={() => { void proponer() }} disabled={cargando || !marcas.length}
            className={`${BTN} border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5`}>
            {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {propuestas ? 'Volver a proponer' : 'Resolver con IA'}
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Son afirmaciones que la IA no pudo respaldar al redactar. La verificación de citas no las cubre: se resuelven acá o editando el texto.
      </p>

      {!propuestas ? (
        <ul className="space-y-1.5">
          {marcas.map((m, i) => (
            <li key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
              {m.contexto && <p className="text-zinc-600 dark:text-zinc-400">{m.contexto}</p>}
              <p className="mt-0.5 font-medium text-amber-800 dark:text-amber-300">{m.marca}</p>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {editable && pendientes.length > 1 && (
            <button type="button" onClick={() => aplicar(pendientes)} className={`${BTN} w-full bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]`}>
              <Wand2 className="h-3.5 w-3.5" /> Aplicar las {pendientes.length} propuestas
            </button>
          )}
          <ul className="space-y-2">
            {propuestas.map((p) => {
              const d = DECISION[p.decision]
              const hecha = aplicadas.has(p.i)
              return (
                <li key={p.i} className={cn('space-y-1.5 rounded-lg border border-zinc-200 p-2.5 text-xs dark:border-white/10', hecha && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', d.cls)}>{d.label}</span>
                    {p.fuente && <span className="text-zinc-500">· {p.fuente}</span>}
                    {hecha && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> aplicada</span>}
                  </div>
                  {p.motivo && <p className="text-zinc-600 dark:text-zinc-400">{p.motivo}</p>}
                  {p.decision !== 'mantener' && (
                    <>
                      <p className="rounded bg-rose-500/5 p-1.5 text-zinc-500 line-through decoration-rose-400/60">{p.original}</p>
                      <p className="rounded bg-emerald-500/5 p-1.5 text-zinc-800 dark:text-zinc-200">{p.nuevo || <i>(se elimina)</i>}</p>
                      {editable && !hecha && (
                        <button type="button" onClick={() => aplicar([p])} className={`${BTN} border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5`}>
                          Aplicar
                        </button>
                      )}
                    </>
                  )}
                  {p.decision === 'mantener' && <p className="font-medium text-amber-800 dark:text-amber-300">{p.marca}</p>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
