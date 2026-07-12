import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Clock, Calendar, Users, Plus, RefreshCw, Loader2,
  Gavel, ChevronDown, ChevronUp, AlertCircle, Scale,
} from 'lucide-react'
import { useSaeMovements, useGenerateBrief, useExpedienteBrief, type SaeMovement } from '@/hooks/use-sae'
import { useAdjuntos } from '@/hooks/use-adjuntos'
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
  const { data: adjuntos = [] } = useAdjuntos(expedienteId)
  const { data: brief } = useExpedienteBrief(expedienteId)
  const generateBrief = useGenerateBrief()
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [tareaPrefill, setTareaPrefill] = useState<{
    open: boolean
    values?: { titulo: string; descripcion: string; fechaVencimiento: string; prioridad: PlazoVigente['prioridad'] }
  }>({ open: false })

  // ── Aggregate AI data across all movements ─────────────────────────────────
  const { plazos, partes, ultimaSentencia, fechasClave, analyzedCount, jueces, normas, juris } = useMemo(() => {
    const plazosArr: PlazoVigente[] = []
    const partesSet = new Set<string>()
    const fechasArr: { tipo: string; fecha_iso: string; descripcion: string; movement: SaeMovement }[] = []
    // jueces: map by lowercase nombre → { nombre, cargo, count, lastFecha }
    const juecesMap = new Map<string, { nombre: string; cargo: string; count: number; lastFecha: string }>()
    // normas y jurisprudencia: map by lowercase texto → { texto, uso, count, fuentes }
    const normasMap = new Map<string, { texto: string; uso: string | null; count: number; fuente: string }>()
    const jurisMap = new Map<string, { texto: string; uso: string | null; count: number; fuente: string }>()
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

      const ext = m.ai_extracted as (typeof m.ai_extracted & { juez?: { nombre: string; cargo: string } | null }) | null
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
      if (ext.juez?.nombre) {
        const key = ext.juez.nombre.toLowerCase().trim()
        const existing = juecesMap.get(key)
        if (!existing) {
          juecesMap.set(key, { nombre: ext.juez.nombre, cargo: ext.juez.cargo, count: 1, lastFecha: m.fecha })
        } else {
          existing.count++
          if (m.fecha > existing.lastFecha) existing.lastFecha = m.fecha
        }
      }
      // Normativa y jurisprudencia de actuaciones SAE
      const extFull = ext as typeof ext & {
        normativa_citada?: { norma: string; uso: string | null }[]
        jurisprudencia_citada?: { cita: string; uso: string | null }[]
      }
      extFull.normativa_citada?.forEach(n => {
        const key = n.norma.toLowerCase().trim()
        const e = normasMap.get(key)
        if (!e) normasMap.set(key, { texto: n.norma, uso: n.uso, count: 1, fuente: 'actuación' })
        else e.count++
      })
      extFull.jurisprudencia_citada?.forEach(j => {
        const key = j.cita.toLowerCase().trim()
        const e = jurisMap.get(key)
        if (!e) jurisMap.set(key, { texto: j.cita, uso: j.uso, count: 1, fuente: 'actuación' })
        else e.count++
      })
    }

    // Normativa y jurisprudencia de adjuntos analizados
    for (const adj of adjuntos) {
      const adjRaw = adj as unknown as { ai_extracted?: unknown }
      const adjExt = adjRaw.ai_extracted as {
        normativa_citada?: { norma: string; uso: string | null }[]
        jurisprudencia_citada?: { cita: string; uso: string | null }[]
      } | null | undefined
      if (!adjExt) continue
      adjExt.normativa_citada?.forEach(n => {
        const key = n.norma.toLowerCase().trim()
        const e = normasMap.get(key)
        if (!e) normasMap.set(key, { texto: n.norma, uso: n.uso, count: 1, fuente: 'documento' })
        else e.count++
      })
      adjExt.jurisprudencia_citada?.forEach(j => {
        const key = j.cita.toLowerCase().trim()
        const e = jurisMap.get(key)
        if (!e) jurisMap.set(key, { texto: j.cita, uso: j.uso, count: 1, fuente: 'documento' })
        else e.count++
      })
    }

    plazosArr.sort((a, b) => a.vence_aprox.localeCompare(b.vence_aprox))
    fechasArr.sort((a, b) => a.fecha_iso.localeCompare(b.fecha_iso))
    const juecesArr = [...juecesMap.values()].sort((a, b) => b.count - a.count)

    return {
      plazos: plazosArr,
      partes: [...partesSet].sort(),
      ultimaSentencia,
      fechasClave: fechasArr,
      analyzedCount: analyzed,
      jueces: juecesArr,
      normas: [...normasMap.values()].sort((a, b) => b.count - a.count),
      juris: [...jurisMap.values()].sort((a, b) => b.count - a.count),
    }
  }, [movements, adjuntos])

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
  const hasAnyContent = brief || plazos.length > 0 || partes.length > 0 || ultimaSentencia || fechasClave.length > 0 || jueces.length > 0 || normas.length > 0 || juris.length > 0
  const hasMovements = movements.length > 0

  // Colapsable, recordado por expediente. Si no hay contenido, default colapsado.
  const storageKey = `sae-intel-collapsed-${expedienteId}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(storageKey)
    if (stored !== null) return stored === '1'
    return !hasAnyContent
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, collapsed ? '1' : '0')
  }, [collapsed, storageKey])

  if (!hasMovements) return null

  return (
    <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-500/10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -m-1 p-1 hover:bg-violet-500/[0.05] transition-colors"
          aria-expanded={!collapsed}
          aria-controls="sae-intel-body"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-violet-400/70 shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 text-violet-400/70 shrink-0" />
          )}
          <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
          <h3 className="text-sm font-semibold text-violet-200 truncate">Inteligencia del expediente</h3>
          <span className="text-[10px] text-violet-500/80 shrink-0">
            {analyzedCount}/{movements.length} con IA
          </span>
          {collapsed && hasAnyContent && (
            <span className="hidden sm:flex items-center gap-2 ml-2 text-[10px] text-violet-300/70 shrink-0">
              {plazos.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {plazos.length} plazo{plazos.length !== 1 ? 's' : ''}
                </span>
              )}
              {fechasClave.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Calendar className="h-2.5 w-2.5" />
                  {fechasClave.length} fecha{fechasClave.length !== 1 ? 's' : ''}
                </span>
              )}
              {partes.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Users className="h-2.5 w-2.5" />
                  {partes.length} parte{partes.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleGenerateBrief}
          disabled={generateBrief.isPending}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
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

      <div id="sae-intel-body" className={cn('p-4 space-y-4', collapsed && 'hidden')}>
        {/* ── Brief / TL;DR ── */}
        {brief ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-violet-400 font-medium">Brief</p>
                {brief.generated_at && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Actualizado {formatDateTime(brief.generated_at)}</p>
                )}
              </div>
              <button
                onClick={() => setBriefExpanded(v => !v)}
                className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-300 inline-flex items-center gap-0.5"
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
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin brief generado todavía. Tocá "Generar brief" arriba para que la IA sintetice el estado del expediente. Costo aproximado: 10¢.</p>
          </div>
        )}

        {/* ── Plazos vigentes ── */}
        {plazos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3 w-3 text-orange-400" />
              <p className="text-[11px] uppercase tracking-wider text-orange-300 font-medium">Plazos vigentes</p>
              <span className="text-[10px] text-zinc-600 dark:text-zinc-300">próximos 60 días</span>
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
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{formatDate(ultimaSentencia.fecha)}</p>
            {ultimaSentencia.ai_summary && (
              <p className="mt-1.5 text-xs text-zinc-300 leading-snug line-clamp-3">{ultimaSentencia.ai_summary}</p>
            )}
          </div>
        )}

        {/* ── Fechas clave + Partes + Jueces ── */}
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
                    <span className="text-zinc-600 dark:text-zinc-300">·</span>
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
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 self-center">+{partes.length - 12}</span>
                )}
              </div>
            </div>
          )}

          {jueces.length > 0 && (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Scale className="h-3 w-3 text-sky-400" />
                <p className="text-[11px] uppercase tracking-wider text-sky-300 font-medium">Jueces / Secretarios detectados</p>
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300">por frecuencia en actuaciones analizadas</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {jueces.map(j => (
                  <span
                    key={j.nombre}
                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/15 bg-sky-500/[0.05] px-2 py-0.5 text-[11px] text-sky-200"
                    title={`Mencionado/a en ${j.count} actuación${j.count !== 1 ? 'es' : ''}`}
                  >
                    <Scale className="h-2.5 w-2.5 text-sky-400/70 shrink-0" />
                    {j.nombre}
                    <span className="text-sky-400/50 text-[10px] capitalize">{j.cargo}</span>
                    {j.count > 1 && (
                      <span className="text-[10px] text-sky-400/40">×{j.count}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Normativa y Jurisprudencia citadas (agregadas de actuaciones + documentos) ── */}
        {(normas.length > 0 || juris.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {normas.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Scale className="h-3 w-3 text-amber-400" />
                  <p className="text-[11px] uppercase tracking-wider text-amber-300 font-medium">Normativa citada</p>
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-300">actuaciones + docs</span>
                </div>
                <div className="space-y-1">
                  {normas.slice(0, 10).map((n, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      <span className="shrink-0 mt-0.5 rounded bg-amber-500/15 px-1.5 py-0 text-amber-300 font-mono leading-5">
                        {n.count > 1 && <span className="mr-1 text-amber-400/60">×{n.count}</span>}
                        {n.texto}
                      </span>
                      {n.uso && <span className="text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-5">{n.uso}</span>}
                    </div>
                  ))}
                  {normas.length > 10 && (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">+{normas.length - 10} más</p>
                  )}
                </div>
              </div>
            )}

            {juris.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Gavel className="h-3 w-3 text-rose-400" />
                  <p className="text-[11px] uppercase tracking-wider text-rose-300 font-medium">Jurisprudencia invocada</p>
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-300">actuaciones + docs</span>
                </div>
                <div className="space-y-1">
                  {juris.slice(0, 8).map((j, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      <span className="shrink-0 mt-0.5 rounded bg-rose-500/10 px-1.5 py-0 text-rose-300 leading-5">
                        {j.count > 1 && <span className="mr-1 text-rose-400/60">×{j.count}</span>}
                        {j.texto}
                      </span>
                      {j.uso && <span className="text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-5">{j.uso}</span>}
                    </div>
                  ))}
                  {juris.length > 8 && (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">+{juris.length - 8} más</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!hasAnyContent && analyzedCount === 0 && (
          <div className="text-center py-2">
            <AlertCircle className="h-5 w-5 text-zinc-700 dark:text-zinc-200 mx-auto mb-1" />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
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
