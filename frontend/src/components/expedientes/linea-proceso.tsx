import { cn } from '@/lib/utils'
import { useExpedienteHitos, type HitoProceso } from '@/hooks/use-expediente-salud'

const ORDEN = ['mediacion', 'demanda', 'contestacion', 'prueba', 'alegatos', 'sentencia', 'apelacion', 'ejecucion']
// Etapas que no todos los procesos tienen: solo se muestran si ocurrieron.
const OPCIONALES = new Set(['mediacion', 'alegatos', 'apelacion', 'ejecucion'])

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (f: string) => {
  const [y, m, d] = f.slice(0, 10).split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y.slice(2)}`
}

function diasDesde(f: string) {
  return Math.floor((Date.now() - new Date(f + 'T12:00:00').getTime()) / 86_400_000)
}

/** Hitos alcanzados por fecha y, a continuación, los que faltan hasta la sentencia. */
export function ordenarHitos(hitos: HitoProceso[]) {
  const alcanzados = hitos.filter((h) => h.fecha).sort((a, b) => a.fecha!.localeCompare(b.fecha!))
  const maxIdx = Math.max(-1, ...alcanzados.map((h) => ORDEN.indexOf(h.clave)))
  const faltan = hitos
    .filter((h) => !h.fecha && !OPCIONALES.has(h.clave) && ORDEN.indexOf(h.clave) > maxIdx)
    .sort((a, b) => ORDEN.indexOf(a.clave) - ORDEN.indexOf(b.clave))
  return { alcanzados, faltan }
}

export function LineaProceso({ expedienteId, tieneSae }: { expedienteId: string; tieneSae: boolean }) {
  const { data, isLoading } = useExpedienteHitos(expedienteId)

  if (isLoading) return <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
  if (!data || data.movimientos === 0) {
    return (
      <div className="app-card px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
        {tieneSae
          ? 'Todavía no se trajeron movimientos del SAE para armar la línea del proceso.'
          : 'Sin expediente del SAE vinculado: la línea del proceso se arma con sus movimientos.'}
      </div>
    )
  }

  const { alcanzados, faltan } = ordenarHitos(data.hitos)
  const pasos = [...alcanzados.map((h) => ({ ...h, hecho: true })), ...faltan.map((h) => ({ ...h, hecho: false }))]
  const actual = alcanzados.length - 1
  const quieto = data.ultimo ? diasDesde(data.ultimo) : null

  return (
    <div className="app-card px-4 py-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="dashboard-eyebrow">Línea del proceso</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {data.inicio && <>Desde el {fmt(data.inicio)} · </>}
          {data.movimientos} movimientos
          {quieto != null && (
            <> · último hace <span className={cn('font-medium', quieto >= 120 ? 'text-rose-600 dark:text-rose-400' : quieto >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300')}>{quieto} días</span></>
          )}
        </p>
      </div>

      {alcanzados.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No se reconocieron todavía hitos del proceso en los movimientos del SAE.</p>
      ) : (
        <ol className="flex overflow-x-auto no-scrollbar pb-1">
          {pasos.map((p, i) => {
            const esActual = i === actual
            return (
              <li key={p.clave} className="relative flex min-w-[88px] flex-1 flex-col items-center text-center">
                {i > 0 && (
                  <span className={cn('absolute right-1/2 top-[7px] h-0.5 w-full', p.hecho ? 'bg-[var(--brand-navy)] dark:bg-cyan-400/70' : 'bg-zinc-200 dark:bg-white/10')} aria-hidden />
                )}
                <span
                  className={cn(
                    'relative z-[1] h-4 w-4 rounded-full border-2',
                    esActual
                      ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] ring-4 ring-[var(--brand-navy)]/15 dark:border-cyan-400 dark:bg-cyan-400 dark:ring-cyan-400/20'
                      : p.hecho
                        ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] dark:border-cyan-400/70 dark:bg-cyan-400/70'
                        : 'border-zinc-300 bg-[var(--layout-bg)] dark:border-white/20',
                  )}
                />
                <span className={cn('mt-1.5 text-xs', esActual ? 'font-semibold text-zinc-900 dark:text-zinc-50' : p.hecho ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500')}>
                  {p.label}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{p.fecha ? fmt(p.fecha) : 'Pendiente'}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
