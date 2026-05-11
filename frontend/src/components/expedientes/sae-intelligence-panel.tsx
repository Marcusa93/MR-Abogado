import { useMemo, useState } from 'react'
import {
  Sparkles, Clock, Calendar, Users, Plus, RefreshCw, Loader2,
  Gavel, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import { useSaeMovements, useGenerateBrief, useExpedienteBrief, type SaeMovement } from '@/hooks/use-sae'
import { CrearTareaDialog } from './crear-tarea-dialog'
import { formatDate, formatDateTime } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

interface PlazoVigente {
  movement_id: string
  movement_titulo: string
  movement_fecha: string
  dias: number
  habiles: boolean
  vence_aprox: string
  descripcion: string
  diasRestantes: number
  prioridad: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAJA'
}

const PRIORIDAD_PILL: Record<PlazoVigente['prioridad'], string> = {
  URGENTE: 'bg-red-500/15 text-red-300 border-red-500/30',
  ALTA: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  MEDIA: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  BAJA: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

function priorityFromDays(days: number): PlazoVigente['prioridad'] {
  if (days <= 1) return 'URGENTE'
  if (days <= 3) return 'ALTA'
  if (days <= 7) return 'MEDIA'
  return 'BAJA'
}

function daysFromToday(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

interface Props {
  expedienteId: string
}

export function SaeIntelligencePanel({ expedienteId }: Props) {
  const { data: movements = [] } = useSaeMovements(expedienteId)
  const { data: brief } = useExpedienteBrief(expedienteId)
  const generateBrief = useGenerateBrief()
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [tareaPrefill, setTareaPrefill] = useState<{
    open: boolean
    values?: { titulo: string; descripcion: string; fechaVencimiento: string; prioridad: PlazoVigente['prioridad'] }
  }>({ open: false })

  // ── Aggregate AI data across all movements ─────────────────────────────────
  const { plazos, partes, ultimaSentencia, fechasClave, analyzedCount } = useMemo(() => {
    const plazosArr: PlazoVigente[] = []
    const partesSet = new Set<string>()
    const fechasArr: { tipo: string; fecha_iso: string; descripcion: string; movement: SaeMovement }[] = []
    let ultimaSentencia: SaeMovement | null = null
    let analyzed = 0
    const today = new Date().toISOString().slice(0, 10)
    const in60days = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)

    for (const m of movements) {
      if (m.ai_analyzed_at) analyzed++

      // Última sentencia (independiente de IA)
      if ((m.tipo_movimiento === 'sentencia' || m.titulo.toLowerCase().includes('sentencia'))
          && (!ultimaSentencia || m.fecha > ultimaSentencia.fecha)) {
        ultimaSentencia = m
      }

      const ext = m.ai_extracted
      if (!ext) continue
      ext.partes?.forEach(p => partesSet.add(p.trim()))
      ext.plazos?.forEach(p => {
        if (!p.vence_aprox) return
        if (p.vence_aprox < today || p.vence_aprox > in60days) return
        const restantes = daysFromToday(p.vence_aprox)
        plazosArr.push({
          movement_id: m.id,
          movement_titulo: m.titulo,
          movement_fecha: m.fecha,
          dias: p.dias,
          habiles: p.habiles,
          vence_aprox: p.vence_aprox,
          descripcion: p.descripcion,
          diasRestantes: restantes,
          prioridad: priorityFromDays(restantes),
        })
      })
      ext.fechas?.forEach(f => {
        if (f.fecha_iso < today) return
        fechasArr.push({ ...f, movement: m })
      })
    }

    plazosArr.sort((a, b) => a.vence_aprox.localeCompare(b.vence_aprox))
    fechasArr.sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso))

    return {
      plazos: plazosArr,
      partes: [...partesSet].sort(),
      ultimaSentencia,
      fechasClave: fechasArr,
      analyzedCount: analyzed,
    }
  }, [movements])

  const handleCreateTareaFromPlazo = (p: PlazoVigente) => {
    setTareaPrefill({
      open: true,
      values: {
        titulo: `Plazo: ${p.descripcion.slice(0, 80)}`,
        descripcion: `Plazo extraído por IA de la actuación "${p.movement_titulo}".\n\n${p.descripcion}\nDías: ${p.dias} ${p.habiles ? 'hábiles' : 'corridos'}\nVence: ${p.vence_aprox}`,
        fechaVencimiento: p.vence_aprox,
        prioridad: p.prioridad,
      },
    })
  }

  const handleGenerateBrief = () => {
    generateBrief.mutate(expedienteId, {
      onSuccess: () => toast.success('Brief actualizado'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo generar el brief'),
    })
  }

  // Si no hay nada de IA acumulado, no mostramos el panel
  const hasAnyContent = brief || plazos.length > 0 || partes.length > 0 || ultimaSentencia || fechasClave.length > 0
  const hasMovements = movements.length > 0

  if (!hasMovements) return null

  return (
    <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-violet-200">Inteligencia del expediente</h3>
          <span className="text-[10px] text-violet-500/80">
            {analyzedCount}/{movements.length} actuaciones con IA
          </span>
        </div>
        <button
          onClick={handleGenerateBrief}
          disabled={generateBrief.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
          title={brief ? 'Regenerar brief con info actualizada (~10¢)' : 'Generar brief del expediente con IA (~10¢)'}
        >
          {generateBrief.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {generateBrief.isPending ? 'Generando…' : brief ? 'Actualizar brief' : 'Generar brief'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Brief / TL;DR ── */}
        {brief ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-violet-400 font-medium">Brief</p>
                {brief.generated_at && (
                  <p className="text-[10px] text-zinc-500">Actualizado {formatDateTime(brief.generated_at)}</p>
                )}
              </div>
              <button
                onClick={() => setBriefExpanded(v => !v)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-0.5"
              >
                {briefExpanded ? <>Colapsar <ChevronUp className="h-3 w-3" /></> : <>Expandir <ChevronDown className="h-3 w-3" /></>}
              </button>
            </div>
            <p className={cn(
              'text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed',
              !briefExpanded && 'line-clamp-3'
            )}>
              {brief.brief}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] p-3 text-center">
            <p className="text-xs text-zinc-500">Sin brief generado todavía. Tocá "Generar brief" arriba para que la IA sintetice el estado del expediente. Costo aproximado: 10¢.</p>
          </div>
        )}

        {/* ── Plazos vigentes ── */}
        {plazos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3 w-3 text-orange-400" />
              <p className="text-[11px] uppercase tracking-wider text-orange-300 font-medium">Plazos vigentes</p>
              <span className="text-[10px] text-zinc-600">próximos 60 días</span>
            </div>
            <div className="space-y-1.5">
              {plazos.map((p) => {
                const restantes = p.diasRestantes
                const restantesLabel = restantes === 0 ? 'hoy' : restantes === 1 ? 'mañana' : `en ${restantes} días`
                return (
                  <div key={`${p.movement_id}-${p.vence_aprox}`} className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.02] p-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', PRIORIDAD_PILL[p.prioridad])}>
                          Vence {restantesLabel} · {formatDate(p.vence_aprox)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-300 line-clamp-2 leading-snug">{p.descripcion}</p>
                    </div>
                    <button
                      onClick={() => handleCreateTareaFromPlazo(p)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-white/10 transition-colors"
                      title="Crear tarea con este vencimiento"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      Tarea
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Última sentencia ── */}
        {ultimaSentencia && (
          <div className="rounded-md border border-rose-500/20 bg-rose-500/[0.04] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Gavel className="h-3 w-3 text-rose-400" />
              <p className="text-[11px] uppercase tracking-wider text-rose-300 font-medium">Última sentencia / decisión clave</p>
            </div>
            <p className="text-xs text-zinc-200 font-medium">{ultimaSentencia.titulo}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{formatDate(ultimaSentencia.fecha)}</p>
            {ultimaSentencia.ai_summary && (
              <p className="mt-1.5 text-xs text-zinc-300 leading-snug line-clamp-3">{ultimaSentencia.ai_summary}</p>
            )}
          </div>
        )}

        {/* ── Fechas clave + Partes (lado a lado en sm+) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fechasClave.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Calendar className="h-3 w-3 text-amber-400" />
                <p className="text-[11px] uppercase tracking-wider text-amber-300 font-medium">Fechas clave</p>
              </div>
              <div className="space-y-1">
                {fechasClave.slice(0, 6).map((f, i) => (
                  <div key={`${f.fecha_iso}-${i}`} className="flex items-center gap-2 text-[11px]">
                    <span className="shrink-0 text-amber-300 font-mono">{formatDate(f.fecha_iso)}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400 line-clamp-1">{f.tipo}: {f.descripcion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {partes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3 w-3 text-zinc-400" />
                <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Partes mencionadas</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {partes.slice(0, 12).map(p => (
                  <span key={p} className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
                    {p}
                  </span>
                ))}
                {partes.length > 12 && (
                  <span className="text-[10px] text-zinc-500 self-center">+{partes.length - 12}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {!hasAnyContent && analyzedCount === 0 && (
          <div className="text-center py-2">
            <AlertCircle className="h-5 w-5 text-zinc-700 mx-auto mb-1" />
            <p className="text-[11px] text-zinc-500">
              Para que aparezca contenido acá, analizá actuaciones desde el listado de abajo (botón violeta "Analizar con IA" en cada una, o "Analizar pendientes" arriba).
            </p>
          </div>
        )}
      </div>

      <CrearTareaDialog
        open={tareaPrefill.open}
        onClose={() => setTareaPrefill({ open: false })}
        expedienteId={expedienteId}
        initialValues={tareaPrefill.values}
      />
    </div>
  )
}
