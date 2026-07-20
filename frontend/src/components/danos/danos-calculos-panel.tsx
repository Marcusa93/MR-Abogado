import { Link } from 'react-router-dom'
import { Scale, Plus, Trash2, Loader2 } from 'lucide-react'
import { useDanos, useDeleteDano } from '@/hooks/use-danos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(Math.round(n))
}

const CONF_STYLE: Record<string, string> = {
  alto: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  medio: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  bajo: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

/**
 * Panel de cálculos de daños vinculados a una consulta o expediente.
 * Se embebe en el detalle del legajo. Enlaza al estimador precargado con el contexto.
 */
export function DanosCalculosPanel({
  consultaId, expedienteId,
}: {
  consultaId?: string
  expedienteId?: string
}) {
  const { data: calculos = [], isLoading } = useDanos({ consultaId, expedienteId })
  const del = useDeleteDano()

  const nuevoHref = consultaId
    ? `/calculadora-danos?consulta_id=${consultaId}`
    : `/calculadora-danos?expediente_id=${expedienteId}`

  async function handleDelete(id: string, titulo: string) {
    if (!window.confirm(`¿Eliminar el cálculo "${titulo}"?`)) return
    try {
      await del.mutateAsync(id)
      toast.success('Cálculo eliminado')
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <Scale className="h-4 w-4 text-amber-500" /> Estimaciones de daños
        </h2>
        <Link to={nuevoHref}
          className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nuevo cálculo
        </Link>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-xs text-zinc-400">Cargando…</div>
      ) : calculos.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
          Sin estimaciones. Creá una con el estimador de daños.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-white/5">
          {calculos.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.titulo}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(c.created_at).toLocaleDateString('es-AR')}
                  {c.nivel_confianza && (
                    <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium', CONF_STYLE[c.nivel_confianza] ?? '')}>
                      {c.nivel_confianza}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {c.monto_razonable_total != null && (
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatPesos(c.monto_razonable_total)}</span>
                )}
                <button type="button" onClick={() => handleDelete(c.id, c.titulo)}
                  className="text-zinc-400 hover:text-rose-500 transition-colors" aria-label="Eliminar">
                  {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
