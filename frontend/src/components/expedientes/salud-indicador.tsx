import { cn } from '@/lib/utils'
import type { ColorSalud, SaludExpediente } from '@/hooks/use-expediente-salud'

export const SALUD_STYLE: Record<ColorSalud, { dot: string; texto: string; borde: string; fondo: string; label: string }> = {
  rojo:     { dot: 'bg-rose-500',    texto: 'text-rose-700 dark:text-rose-300',       borde: 'border-l-rose-500',    fondo: 'bg-rose-500/10',    label: 'Urgente' },
  amarillo: { dot: 'bg-amber-400',   texto: 'text-amber-700 dark:text-amber-300',     borde: 'border-l-amber-400',   fondo: 'bg-amber-500/10',   label: 'Requiere atención' },
  verde:    { dot: 'bg-emerald-500', texto: 'text-emerald-700 dark:text-emerald-300', borde: 'border-l-emerald-500', fondo: 'bg-emerald-500/10', label: 'En orden' },
  gris:     { dot: 'bg-zinc-300 dark:bg-zinc-600', texto: 'text-zinc-500 dark:text-zinc-400', borde: 'border-l-zinc-300 dark:border-l-zinc-700', fondo: 'bg-zinc-500/10', label: 'Sin seguimiento activo' },
}

function textoTooltip(s: SaludExpediente | null | undefined) {
  if (!s) return 'Calculando…'
  const base = SALUD_STYLE[s.semaforo].label
  return s.motivos.length ? `${base}:\n· ${s.motivos.join('\n· ')}` : base
}

/** Punto de color con los motivos en el tooltip. */
export function SaludDot({ salud, className }: { salud: SaludExpediente | null | undefined; className?: string }) {
  const color = salud?.semaforo ?? 'gris'
  return (
    <span
      role="img"
      aria-label={textoTooltip(salud)}
      title={textoTooltip(salud)}
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', salud ? SALUD_STYLE[color].dot : 'bg-zinc-200 dark:bg-zinc-700 animate-pulse', className)}
    />
  )
}

/** Motivo principal en una línea, para listas y tarjetas. */
export function SaludMotivo({ salud, className }: { salud: SaludExpediente | null | undefined; className?: string }) {
  if (!salud || salud.motivos.length === 0) return null
  const extra = salud.motivos.length - 1
  return (
    <p className={cn('truncate text-[11px] font-medium', SALUD_STYLE[salud.semaforo].texto, className)} title={salud.motivos.join(' · ')}>
      {salud.motivos[0]}{extra > 0 && <span className="font-normal opacity-75"> · y {extra} más</span>}
    </p>
  )
}
