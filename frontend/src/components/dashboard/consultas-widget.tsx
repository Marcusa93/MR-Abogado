import { Link } from 'react-router-dom'
import { Users, ArrowRight } from 'lucide-react'
import { useConsultasConteo, ESTADO_LABEL, type ConsultaEstado } from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'

const PILL_COLOR: Partial<Record<ConsultaEstado, string>> = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  con_claudio: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  requiere_info: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  redactando: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  en_proceso: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  presupuestada: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
}

const ACTIVE_ESTADOS: ConsultaEstado[] = ['pendiente', 'en_proceso', 'presupuestada', 'con_claudio', 'requiere_info', 'redactando']

export function ConsultasWidget() {
  const { data: conteo = {} as Record<ConsultaEstado, number>, isLoading } = useConsultasConteo()

  const total = ACTIVE_ESTADOS.reduce((acc, e) => acc + (conteo[e] ?? 0), 0)
  const activas = ACTIVE_ESTADOS.filter(e => (conteo[e] ?? 0) > 0)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 animate-pulse">
        <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
        <div className="h-8 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    )
  }

  return (
    <Link
      to="/consultas"
      className="block rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Consultas activas</span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
      </div>

      <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
        {total}
        <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500 ml-1">en trámite</span>
      </div>

      {activas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {activas.map(e => (
            <span
              key={e}
              className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PILL_COLOR[e] ?? 'bg-zinc-100 text-zinc-600')}
            >
              {conteo[e]} {ESTADO_LABEL[e]}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">Sin consultas activas</p>
      )}
    </Link>
  )
}
