import { useMemo } from 'react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { useSaeMovements, type SaeMovement } from '@/hooks/use-sae'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import {
  Star, Gavel, Calendar, FileText, Sparkles,
  Loader2, Clock, Users, AlertCircle, ArrowRight,
} from 'lucide-react'

const KEY_TYPES = new Set([
  'sentencia',
  'audiencia',
  'intimacion',
  'embargo',
  'traslado',
  'decreto',
  'cedula',
])

const TIPO_LABELS: Record<string, string> = {
  sentencia: 'Sentencia',
  traslado: 'Traslado',
  audiencia: 'Audiencia',
  intimacion: 'Intimación',
  embargo: 'Embargo',
  decreto: 'Decreto',
  cedula: 'Cédula',
}

const TIPO_COLORS: Record<string, string> = {
  sentencia: 'bg-rose-500/15 text-rose-400',
  traslado: 'bg-violet-500/15 text-violet-400',
  audiencia: 'bg-amber-500/15 text-amber-400',
  intimacion: 'bg-red-500/15 text-red-400',
  embargo: 'bg-orange-500/15 text-orange-400',
  decreto: 'bg-purple-500/15 text-purple-400',
  cedula: 'bg-sky-500/15 text-sky-400',
}

function TipoIcon({ tipo, className }: { tipo: string; className?: string }) {
  if (tipo === 'sentencia' || tipo === 'decreto') return <Gavel className={className} />
  if (tipo === 'audiencia') return <Calendar className={className} />
  return <FileText className={className} />
}

function ClaveRow({ movement }: { movement: SaeMovement }) {
  const aiAction = movement.ai_suggested_action
  const aiSummary = movement.ai_summary?.trim()
  const aiExtracted = movement.ai_extracted

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start gap-3">
        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[movement.tipo_movimiento] ?? 'bg-zinc-500/15 text-zinc-400')}>
          <TipoIcon tipo={movement.tipo_movimiento} className="h-3 w-3" />
          {TIPO_LABELS[movement.tipo_movimiento] ?? movement.tipo_movimiento}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100 leading-snug">{movement.titulo}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{formatDate(movement.fecha)}</p>

          {aiSummary && (
            <p className="mt-2 text-xs text-zinc-300 leading-snug flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 mt-[2px] text-violet-400" />
              <span>{aiSummary}</span>
            </p>
          )}

          {aiExtracted && (
            <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
              {aiExtracted.fechas?.map((f, i) => (
                <span key={`f-${i}`} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title={f.descripcion}>
                  <Calendar className="h-2.5 w-2.5" />
                  {f.tipo}: {formatDate(f.fecha_iso)}
                </span>
              ))}
              {aiExtracted.plazos?.map((p, i) => (
                <span key={`p-${i}`} className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-300" title={p.descripcion}>
                  <Clock className="h-2.5 w-2.5" />
                  {p.dias} {p.habiles ? 'días háb.' : 'días'}
                  {p.vence_aprox && <span className="opacity-80">· vence {formatDate(p.vence_aprox)}</span>}
                </span>
              ))}
              {aiExtracted.partes && aiExtracted.partes.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400" title={aiExtracted.partes.join(', ')}>
                  <Users className="h-2.5 w-2.5" />
                  {aiExtracted.partes.length} {aiExtracted.partes.length === 1 ? 'parte' : 'partes'}
                </span>
              )}
            </div>
          )}

          {aiAction && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                <ArrowRight className="h-3 w-3" />
                Acción sugerida: {aiAction.titulo}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface Props {
  expedienteId: string
}

export function TabActuacionesClaves({ expedienteId }: Props) {
  const { data: movements = [], isLoading } = useSaeMovements(expedienteId)

  const claves = useMemo(() => {
    return movements.filter(m =>
      KEY_TYPES.has(m.tipo_movimiento) || Boolean(m.ai_suggested_action)
    )
  }, [movements])

  return (
    <Card
      title="Actuaciones claves"
      headerRight={
        <span className="text-xs text-zinc-500">
          {claves.length} de {movements.length}
        </span>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : claves.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Sin actuaciones claves todavía"
          description="Acá aparecen sentencias, audiencias, traslados, intimaciones, decretos, cédulas y embargos. También las actuaciones con acción sugerida por IA. Sincronizá o analizá actuaciones desde el tab SAE."
        />
      ) : (
        <div className="space-y-2">
          {claves.map(m => (
            <ClaveRow key={m.id} movement={m} />
          ))}
        </div>
      )}

      {claves.some(m => !m.ai_analyzed_at) && (
        <p className="mt-3 text-[11px] text-zinc-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Algunas claves todavía no fueron analizadas con IA. Andá al tab SAE y usá "Analizar pendientes" para enriquecerlas.
        </p>
      )}
    </Card>
  )
}
