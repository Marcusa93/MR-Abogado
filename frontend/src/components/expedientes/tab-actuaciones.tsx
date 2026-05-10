import { useState } from 'react'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { useSaeMovements, useTriggerSaeSync } from '@/hooks/use-sae'
import { formatDate, formatDateTime } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'
import {
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  FileText,
  Gavel,
  Calendar,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react'
import { toast } from '@/stores/toast-store'

type SaeMovement = Tables<'sae_movements'>
type MovementType = Tables<'sae_movements'>['tipo_movimiento']

const TIPO_LABELS: Record<MovementType, string> = {
  sentencia: 'Sentencia',
  traslado: 'Traslado',
  audiencia: 'Audiencia',
  prueba: 'Prueba',
  embargo: 'Embargo',
  cedula: 'Cédula',
  oficio: 'Oficio',
  intimacion: 'Intimación',
  planilla: 'Planilla',
  informe: 'Informe',
  decreto: 'Decreto',
  escrito_parte: 'Escrito de parte',
  otro: 'Otro',
}

const TIPO_COLORS: Record<MovementType, string> = {
  sentencia: 'bg-rose-500/15 text-rose-400',
  traslado: 'bg-violet-500/15 text-violet-400',
  audiencia: 'bg-amber-500/15 text-amber-400',
  prueba: 'bg-blue-500/15 text-blue-400',
  embargo: 'bg-orange-500/15 text-orange-400',
  cedula: 'bg-sky-500/15 text-sky-400',
  oficio: 'bg-teal-500/15 text-teal-400',
  intimacion: 'bg-red-500/15 text-red-400',
  planilla: 'bg-indigo-500/15 text-indigo-400',
  informe: 'bg-cyan-500/15 text-cyan-400',
  decreto: 'bg-purple-500/15 text-purple-400',
  escrito_parte: 'bg-emerald-500/15 text-emerald-400',
  otro: 'bg-zinc-500/15 text-zinc-400',
}

function MovementIcon({ tipo }: { tipo: MovementType }) {
  if (tipo === 'sentencia' || tipo === 'decreto') return <Gavel className="h-3.5 w-3.5" />
  if (tipo === 'audiencia') return <Calendar className="h-3.5 w-3.5" />
  return <FileText className="h-3.5 w-3.5" />
}

function ActuacionRow({ movement }: { movement: SaeMovement }) {
  const [expanded, setExpanded] = useState(false)
  const hasCuerpo = !!movement.cuerpo?.trim()

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => hasCuerpo && setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
          hasCuerpo ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
        )}
      >
        <div className="shrink-0 mt-0.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLORS[movement.tipo_movimiento])}>
            <MovementIcon tipo={movement.tipo_movimiento} />
            {TIPO_LABELS[movement.tipo_movimiento]}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
            {movement.titulo}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatDate(movement.fecha)}
            {movement.tiene_documentos && (
              <span className="ml-2 text-sky-400">· Con documentos</span>
            )}
          </p>
        </div>

        {hasCuerpo && (
          <span className="shrink-0 text-zinc-600 dark:text-zinc-500 mt-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {expanded && hasCuerpo && (
        <div className="border-t border-white/5 px-4 py-3">
          <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
            {movement.cuerpo}
          </p>
        </div>
      )}
    </div>
  )
}

interface TabActuacionesProps {
  expedienteId: string
  numeroSae: string | null | undefined
  ultimaSincronizacion: string | null | undefined
}

export function TabActuaciones({ expedienteId, numeroSae, ultimaSincronizacion }: TabActuacionesProps) {
  const { data: movements = [], isLoading } = useSaeMovements(expedienteId)
  const sync = useTriggerSaeSync()

  const handleSync = () => {
    sync.mutate(
      { expedienteId },
      {
        onSuccess: (data) => {
          if (data?.success) {
            toast.success(`Sincronización exitosa: ${data.nuevas ?? 0} actuaciones nuevas`)
          } else {
            toast.info(data?.message ?? 'Sincronización completada')
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al sincronizar')
        },
      }
    )
  }

  if (!numeroSae) {
    return (
      <Card title="Actuaciones SAE">
        <EmptyState
          icon={Database}
          title="Sin número SAE"
          description='Este expediente no tiene número SAE. Editá el expediente y completá el campo "Número SAE" para habilitar la sincronización.'
        />
      </Card>
    )
  }

  return (
    <Card
      title="Actuaciones SAE"
      headerRight={
        <div className="flex items-center gap-3">
          {ultimaSincronizacion && (
            <span className="hidden sm:block text-xs text-zinc-500">
              Última sync: {formatDateTime(ultimaSincronizacion)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {sync.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {sync.isPending ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Numero SAE badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-mono font-medium text-cyan-400">
            <Info className="h-3 w-3" />
            SAE: {numeroSae}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Sin actuaciones sincronizadas"
            description="Presioná Sincronizar para importar las actuaciones desde el SAE."
          />
        ) : (
          <div className="space-y-2">
            {movements.map((m) => (
              <ActuacionRow key={m.id} movement={m} />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
