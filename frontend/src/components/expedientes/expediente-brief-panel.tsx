import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/date-helpers'

interface BriefSnapshot {
  ai_brief: string | null
  ai_brief_generated_at: string | null
  ai_brief_model: string | null
  ai_brief_pending_refresh: boolean
  ai_brief_pending_reasons: { kind: string; at: string; ref: string | null }[] | null
}

interface Props {
  expedienteId: string
  brief: Partial<BriefSnapshot>
}

const KIND_LABELS: Record<string, string> = {
  sae_sentencia: 'Sentencia en SAE',
  sae_decreto: 'Decreto en SAE',
  adjunto_sentencia: 'Sentencia subida',
  adjunto_resolucion: 'Resolución subida',
  adjunto_apelacion: 'Apelación subida',
  audiencia_transcripta: 'Audiencia transcripta',
}

function useGenerarBrief(expedienteId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sae-generate-brief', {
        body: { expediente_id: expedienteId },
      })
      if (error) throw new Error(error.message || 'Error al generar brief')
      if (data?.error) throw new Error(data.error)
      return data as { brief: string; generated_at: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expediente', expedienteId] })
      qc.invalidateQueries({ queryKey: ['expedientes-detail', expedienteId] })
    },
  })
}

export function ExpedienteBriefPanel({ expedienteId, brief }: Props) {
  const storageKey = `brief-collapsed-${expedienteId}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === '1'
  })

  // Recordar última visita para mostrar diff "desde tu última lectura"
  const visitedKey = `brief-visited-${expedienteId}`
  const [, setVisitedAt] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVisitedAt(window.localStorage.getItem(visitedKey))
      window.localStorage.setItem(visitedKey, new Date().toISOString())
    }
  }, [visitedKey])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    }
  }

  const generar = useGenerarBrief(expedienteId)

  // Solo renderizar si hay brief o pending o ya se generó alguna vez
  if (!brief.ai_brief && !brief.ai_brief_pending_refresh) return null

  const reasons = brief.ai_brief_pending_reasons ?? []
  const reasonsByKind = reasons.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1
    return acc
  }, {})

  const tieneNovedades = brief.ai_brief_pending_refresh === true

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-colors',
      tieneNovedades
        ? 'border-amber-500/30 bg-amber-500/[0.03]'
        : 'border-emerald-500/15 bg-emerald-500/[0.02]'
    )}>
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -m-1 p-1 hover:bg-white/[0.04] transition-colors"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />}
          <Sparkles className={cn('h-4 w-4 shrink-0', tieneNovedades ? 'text-amber-400' : 'text-emerald-400')} />
          <h3 className="text-sm font-semibold text-zinc-100 truncate">Brief del expediente</h3>
          {tieneNovedades && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 shrink-0">
              <AlertTriangle className="h-2.5 w-2.5" />
              {reasons.length > 0 ? `${reasons.length} novedad${reasons.length !== 1 ? 'es' : ''}` : 'novedades'}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => generar.mutate()}
          disabled={generar.isPending}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
            tieneNovedades
              ? 'border border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
            generar.isPending && 'opacity-50'
          )}
          title={brief.ai_brief ? 'Regenerar brief con info actualizada' : 'Generar brief'}
        >
          {generar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {generar.isPending ? 'Generando…' : brief.ai_brief ? 'Regenerar' : 'Generar'}
        </button>
      </div>

      <div className={cn('p-4 space-y-3', collapsed && 'hidden')}>
        {tieneNovedades && Object.keys(reasonsByKind).length > 0 && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[11px] text-amber-200 font-medium mb-1">Novedades sin reflejar en el brief:</p>
            <ul className="text-[11px] text-amber-100/80 space-y-0.5">
              {Object.entries(reasonsByKind).map(([kind, count]) => (
                <li key={kind} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-amber-300" />
                  {KIND_LABELS[kind] ?? kind}
                  {count > 1 && <span className="text-amber-300/70">×{count}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.ai_brief ? (
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{brief.ai_brief}</p>
        ) : (
          <p className="text-xs text-zinc-500 italic">
            No hay brief generado todavía. Clickeá "Generar" arriba para que la IA sintetice el estado del expediente.
          </p>
        )}

        {brief.ai_brief_generated_at && (
          <p className="text-[10px] text-zinc-500">
            Última generación: {formatDateTime(brief.ai_brief_generated_at)}
          </p>
        )}
      </div>
    </div>
  )
}
