import { useState } from 'react'
import { AlertTriangle, Sparkles, X, RotateCcw, CheckCircle2, Loader2, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/date-helpers'
import { toast } from '@/stores/toast-store'
import {
  useCajaIaObservaciones,
  useDescartarObservacion,
  useAplicarRecuperable,
  useEjecutarAnalisisIa,
  type CajaIaObservacion,
} from '@/hooks/use-caja-ia'

const CAMPO_LABEL: Record<string, string> = {
  categoria: 'Categoría',
  recuperable: 'Recuperable',
  descripcion: 'Descripción',
  tipo: 'Tipo',
  cliente_id: 'Cliente',
  expediente_id: 'Expediente',
  monto: 'Monto',
}

function NivelBadge({ nivel }: { nivel: CajaIaObservacion['nivel'] }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0',
      nivel === 'error'
        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    )}>
      {nivel === 'error' ? <AlertTriangle className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
      {nivel === 'error' ? 'Error' : 'Alerta'}
    </span>
  )
}

function ObservacionRow({ obs }: { obs: CajaIaObservacion }) {
  const descartar = useDescartarObservacion()
  const aplicarRecuperable = useAplicarRecuperable()
  const [confirming, setConfirming] = useState(false)

  const canApplyRecuperable =
    obs.tipo === 'gasto' &&
    obs.campo_afectado === 'recuperable' &&
    (obs.valor_sugerido === 'true' || obs.valor_sugerido === 'false')

  const handleDescartar = async () => {
    try {
      await descartar.mutateAsync(obs.id)
      toast.success('Observación descartada')
    } catch {
      toast.error('No se pudo descartar')
    }
  }

  const handleAplicar = async () => {
    if (!canApplyRecuperable) return
    try {
      await aplicarRecuperable.mutateAsync({
        observacionId: obs.id,
        gastoId: obs.registro_id,
        valor: obs.valor_sugerido === 'true',
      })
      toast.success('Actualizado: recuperable ' + (obs.valor_sugerido === 'true' ? 'activado' : 'desactivado'))
    } catch {
      toast.error('No se pudo aplicar')
    }
  }

  return (
    <div className={cn(
      'rounded-xl border p-3.5 space-y-2 transition-colors',
      obs.nivel === 'error'
        ? 'border-rose-500/25 bg-rose-500/[0.04]'
        : 'border-amber-500/20 bg-amber-500/[0.03]',
    )}>
      <div className="flex items-start gap-2.5">
        <NivelBadge nivel={obs.nivel} />

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 leading-snug">
            {obs.observacion}
          </p>

          {obs.sugerencia && (
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
              Sugerencia: {obs.sugerencia}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {obs.campo_afectado && (
              <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                Campo: {CAMPO_LABEL[obs.campo_afectado] ?? obs.campo_afectado}
                {obs.valor_sugerido ? ` → ${obs.valor_sugerido}` : ''}
              </span>
            )}
            <span className="text-[10px] text-zinc-500 dark:text-zinc-500 capitalize">
              {obs.tipo}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-500">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo(obs.analizado_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        {canApplyRecuperable && (
          !confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={aplicarRecuperable.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" />
              Aplicar
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600 dark:text-zinc-400">¿Confirmar?</span>
              <button
                onClick={handleAplicar}
                disabled={aplicarRecuperable.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                {aplicarRecuperable.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          )
        )}

        <button
          onClick={handleDescartar}
          disabled={descartar.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {descartar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Descartar
        </button>
      </div>
    </div>
  )
}

export function TabCajaIA() {
  const { data: observaciones = [], isLoading, error } = useCajaIaObservaciones()
  const analizar = useEjecutarAnalisisIa()

  const errores = observaciones.filter(o => o.nivel === 'error')
  const alertas = observaciones.filter(o => o.nivel === 'alerta')
  const lastAt = observaciones[0]?.analizado_at

  const handleAnalizar = async () => {
    try {
      const result = await analizar.mutateAsync()
      if (result.observaciones === 0) {
        toast.success('Análisis completo: todo en orden.')
      } else {
        toast.success(`Análisis completo: ${result.observaciones} observaciones encontradas.`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Análisis IA de caja</h2>
            {errores.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                {errores.length} error{errores.length > 1 ? 'es' : ''}
              </span>
            )}
            {alertas.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Detecta gastos mal categorizados, recuperables sin marcar, ingresos sin cliente y duplicados.
            {lastAt && (
              <span className="ml-2 text-zinc-400 dark:text-zinc-500">Último análisis: {timeAgo(lastAt)}</span>
            )}
          </p>
        </div>

        <button
          onClick={handleAnalizar}
          disabled={analizar.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
        >
          {analizar.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {analizar.isPending ? 'Analizando…' : 'Analizar ahora'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-sm text-rose-600 dark:text-rose-400">
          No se pudo cargar el análisis. Intentá de nuevo.
        </div>
      ) : observaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
            <Sparkles className="h-6 w-6 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {lastAt ? 'Todo en orden.' : 'Sin análisis previo.'}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {lastAt
              ? 'No hay observaciones activas en los últimos 60 días.'
              : 'Hacé clic en "Analizar ahora" para revisar gastos e ingresos con IA.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {errores.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-600 dark:text-rose-400 px-0.5">
                Errores a corregir
              </p>
              {errores.map(obs => <ObservacionRow key={obs.id} obs={obs} />)}
            </div>
          )}

          {alertas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 px-0.5">
                Alertas de revisión
              </p>
              {alertas.map(obs => <ObservacionRow key={obs.id} obs={obs} />)}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.02] px-3 py-2">
        <RotateCcw className="h-3 w-3 text-zinc-400 shrink-0" />
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500">
          El análisis corre automáticamente todos los días a las 8:00 AM. Las observaciones descartadas no vuelven a aparecer.
        </p>
      </div>
    </div>
  )
}
