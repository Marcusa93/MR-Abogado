import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BellOff, CheckCheck, Search, Loader2,
  Clock, CalendarClock, AlertTriangle, FileText, DollarSign, ArrowRightLeft,
  Monitor, AtSign, FolderOpen, Building2, ExternalLink,
} from 'lucide-react'
import {
  useAlertas, useMarcarLeida, useMarcarTodasLeidas, useSnoozeAlerta,
  type AlertaWithExpediente,
} from '@/hooks/use-alertas'
import {
  useSaeNotificaciones, useMarkSaeNotifAsRead, useMarkAllSaeNotifAsRead,
  useSnoozeSaeNotif, type SaeNotificacion,
} from '@/hooks/use-sae-notificaciones'
import { useCompletarTarea } from '@/hooks/use-tareas'
import { getFueroLabel } from '@/lib/sae-fueros'
import { SnoozeMenu } from '@/components/layout/snooze-menu'
import { ConstanciaModal } from '@/components/sae/constancia-modal'
import { timeAgo } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────────────────────────────────

type TabKey = 'todas' | 'sae' | 'tareas' | 'audiencias' | 'cobros' | 'otras'

const TABS: { key: TabKey; label: string; match?: (t: string) => boolean; src: 'all' | 'alertas' | 'sae' }[] = [
  { key: 'todas', label: 'Todas', src: 'all' },
  { key: 'sae', label: 'SAE', src: 'sae' },
  { key: 'tareas', label: 'Tareas', src: 'alertas', match: (t) => ['TAREA_ASIGNADA', 'VENCIMIENTO_TAREA', 'TAREA_VENCIDA'].includes(t) },
  { key: 'audiencias', label: 'Audiencias', src: 'alertas', match: (t) => ['AUDIENCIA_PROXIMA', 'TURNO_PROXIMO'].includes(t) },
  { key: 'cobros', label: 'Cobros', src: 'alertas', match: (t) => t === 'COBRO_PENDIENTE' },
  { key: 'otras', label: 'Otras', src: 'alertas', match: (t) => ['MENCION', 'SISTEMA', 'CUSTOM', 'DOCUMENTO_FALTANTE', 'ESTADO_CAMBIO', 'SIN_RESPONSABLE', 'SEGUIMIENTO_PENDIENTE'].includes(t) },
]

const TIPO_ICON: Record<string, { icon: typeof Bell; color: string }> = {
  VENCIMIENTO_TAREA: { icon: Clock, color: 'text-amber-400' },
  TAREA_ASIGNADA: { icon: Clock, color: 'text-cyan-400' },
  TURNO_PROXIMO: { icon: CalendarClock, color: 'text-blue-400' },
  AUDIENCIA_PROXIMA: { icon: CalendarClock, color: 'text-blue-400' },
  SEGUIMIENTO_PENDIENTE: { icon: AlertTriangle, color: 'text-orange-400' },
  DOCUMENTO_FALTANTE: { icon: FileText, color: 'text-violet-400' },
  COBRO_PENDIENTE: { icon: DollarSign, color: 'text-emerald-400' },
  ESTADO_CAMBIO: { icon: ArrowRightLeft, color: 'text-amber-400' },
  SISTEMA: { icon: Monitor, color: 'text-zinc-400' },
  MENCION: { icon: AtSign, color: 'text-pink-400' },
}

// ──────────────────────────────────────────────────────────────────────────
// Unified item
// ──────────────────────────────────────────────────────────────────────────

type UnifiedItem =
  | { kind: 'alerta'; data: AlertaWithExpediente; ts: string }
  | { kind: 'sae'; data: SaeNotificacion; ts: string }

function searchText(item: UnifiedItem): string {
  if (item.kind === 'alerta') {
    return [item.data.titulo, item.data.mensaje, item.data.expediente?.numero, item.data.expediente?.caratula]
      .filter(Boolean).join(' ').toLowerCase()
  }
  return [item.data.tipo, item.data.titulo, item.data.caratula, item.data.numero_expediente, item.data.ia_resumen]
    .filter(Boolean).join(' ').toLowerCase()
}

function AlertaRow({
  alerta, selected, onToggleSelect, onMarkRead, onSnooze, onNavigate, onCompletarTarea,
}: {
  alerta: AlertaWithExpediente
  selected: boolean
  onToggleSelect: () => void
  onMarkRead: () => void
  onSnooze: (until: Date) => void
  onNavigate: (path: string) => void
  onCompletarTarea: (tareaId: string) => void
}) {
  const meta = TIPO_ICON[alerta.tipo] ?? { icon: Bell, color: 'text-zinc-400' }
  const Icon = meta.icon
  const tareaId = alerta.payload?.tarea_id
  const isTareaAlert = !!tareaId && ['TAREA_ASIGNADA', 'VENCIMIENTO_TAREA', 'TAREA_VENCIDA'].includes(alerta.tipo)
  const isMencion = alerta.tipo === 'MENCION'
  return (
    <div className={cn(
      'group rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-3',
      selected
        ? 'border-amber-500/40 bg-amber-500/[0.06]'
        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
    )}>
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer shrink-0"
        />
        <div className={cn('shrink-0 mt-0.5', meta.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => {
            onMarkRead()
            if (alerta.expediente_id) onNavigate(`/expedientes/${alerta.expediente_id}`)
          }}
        >
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">{alerta.titulo}</p>
          {alerta.mensaje && (
            <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2">{alerta.mensaje}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400">
              {alerta.tipo.replace('_', ' ')}
            </span>
            {alerta.expediente && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 max-w-full truncate">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">{alerta.expediente.numero || alerta.expediente.caratula}</span>
              </span>
            )}
            <span className="text-[10px] text-zinc-500">{timeAgo(alerta.created_at)}</span>
          </div>
        </div>
      </div>
      {/* Acciones: en mobile bajo el contenido (con sangría), en desktop al costado */}
      <div className="flex items-center gap-1 flex-wrap pl-8 sm:pl-0 sm:shrink-0 sm:justify-end">
        {isTareaAlert && tareaId && (
          <button
            onClick={() => { onCompletarTarea(tareaId); onMarkRead() }}
            className="rounded px-2 py-1 text-[10px] font-medium text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 whitespace-nowrap"
            title="Marcar tarea como completada"
          >
            Tarea hecha
          </button>
        )}
        {isMencion && alerta.expediente_id && (
          <button
            onClick={() => { onMarkRead(); onNavigate(`/expedientes/${alerta.expediente_id}?focus=notas`) }}
            className="rounded px-2 py-1 text-[10px] font-medium text-pink-300 border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 whitespace-nowrap"
            title="Ir a responder"
          >
            Responder
          </button>
        )}
        <button
          onClick={onMarkRead}
          className="rounded px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 whitespace-nowrap"
        >
          Leída
        </button>
        <SnoozeMenu onSnooze={onSnooze} />
      </div>
    </div>
  )
}

function SaeRow({
  notif, selected, onToggleSelect, onMarkRead, onSnooze, onNavigate, onConstancia, onCrearTarea,
}: {
  notif: SaeNotificacion
  selected: boolean
  onToggleSelect: () => void
  onMarkRead: () => void
  onSnooze: (until: Date) => void
  onNavigate: (path: string) => void
  onConstancia: () => void
  onCrearTarea: () => void
}) {
  const fueroLabel = getFueroLabel(notif.raw_payload?.fuero)
  const isUrgente = notif.prioridad === 'urgente'
  return (
    <div className={cn(
      'group rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-3',
      isUrgente && !notif.leida
        ? 'border-rose-500/50 bg-rose-500/[0.08]'
        : selected
          ? 'border-cyan-500/40 bg-cyan-500/[0.06]'
          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
    )}>
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer shrink-0"
        />
        <div className="shrink-0 rounded-lg bg-cyan-500/15 p-1.5 text-cyan-300 mt-0.5">
          <Bell className="h-4 w-4" />
        </div>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => {
            onMarkRead()
            if (notif.expediente_id) onNavigate(`/expedientes/${notif.expediente_id}`)
          }}
        >
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {notif.tipo && (
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
                {notif.tipo}
              </span>
            )}
            {isUrgente && (
              <span className="rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                🚨 Urgente{notif.plazo_estimado_dias != null && ` · ${notif.plazo_estimado_dias}d`}
              </span>
            )}
            {notif.numero_expediente && (
              <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[180px]">Exp. {notif.numero_expediente}</span>
            )}
          </div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
            {notif.titulo || notif.caratula || 'Notificación SAE'}
          </p>
          {notif.ia_resumen && notif.ia_resumen !== notif.titulo && (
            <p className="mt-0.5 text-xs text-amber-200/80 italic line-clamp-2">{notif.ia_resumen}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-zinc-500">
            {fueroLabel && (
              <span className="inline-flex items-center gap-1 text-cyan-300 max-w-full truncate">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{fueroLabel}</span>
              </span>
            )}
            {notif.oficina && <span className="truncate max-w-[160px]">{notif.oficina}</span>}
            <span>{timeAgo(notif.fecha_emision ?? notif.created_at)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap pl-8 sm:pl-0 sm:shrink-0 sm:justify-end">
        {notif.expediente_id && (
          <button
            onClick={onCrearTarea}
            className="rounded px-2 py-1 text-[10px] font-medium text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 whitespace-nowrap"
            title="Crear tarea desde esta notificación"
          >
            Crear tarea
          </button>
        )}
        {!notif.leida && (
          <button
            onClick={onMarkRead}
            className="rounded px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 whitespace-nowrap"
          >
            Leída
          </button>
        )}
        {notif.leida && (
          <button
            onClick={onConstancia}
            className="rounded px-2 py-1 text-[10px] font-medium text-emerald-300 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 whitespace-nowrap"
            title="Constancia legal"
          >
            Constancia
          </button>
        )}
        <SnoozeMenu onSnooze={onSnooze} />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('todas')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [constanciaId, setConstanciaId] = useState<string | null>(null)

  const { data: alertas = [], isLoading: loadingAlertas } = useAlertas()
  const { data: saeNotifs = [], isLoading: loadingSae } = useSaeNotificaciones({ unreadOnly: false, limit: 100 })
  const marcarLeida = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()
  const snoozeAlerta = useSnoozeAlerta()
  const markSaeRead = useMarkSaeNotifAsRead()
  const markAllSaeRead = useMarkAllSaeNotifAsRead()
  const snoozeSae = useSnoozeSaeNotif()
  const completarTarea = useCompletarTarea()

  const isLoading = loadingAlertas || loadingSae

  // ── unify + filter ─────────────────────────────────────
  const items: UnifiedItem[] = useMemo(() => {
    const tabDef = TABS.find(t => t.key === tab)!
    const list: UnifiedItem[] = []
    if (tabDef.src === 'all' || tabDef.src === 'alertas') {
      for (const a of alertas) {
        if (tabDef.match && !tabDef.match(a.tipo)) continue
        list.push({ kind: 'alerta', data: a, ts: a.created_at })
      }
    }
    if (tabDef.src === 'all' || tabDef.src === 'sae') {
      for (const n of saeNotifs) {
        list.push({ kind: 'sae', data: n, ts: n.fecha_emision ?? n.created_at })
      }
    }
    list.sort((a, b) => b.ts.localeCompare(a.ts))
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(x => searchText(x).includes(q))
  }, [tab, alertas, saeNotifs, search])

  // ── counts per tab ─────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {} as Record<TabKey, number>
    for (const t of TABS) {
      let n = 0
      if (t.src === 'all' || t.src === 'alertas') {
        n += alertas.filter(a => !t.match || t.match(a.tipo)).length
      }
      if (t.src === 'all' || t.src === 'sae') {
        n += saeNotifs.filter(s => !s.leida).length
      }
      counts[t.key] = n
    }
    return counts
  }, [alertas, saeNotifs])

  // ── selection helpers ──────────────────────────────────
  const toggleOne = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())
  const selectAllVisible = () => {
    setSelected(new Set(items.map(i => `${i.kind}-${i.data.id}`)))
  }

  const handleBulkMarkRead = () => {
    for (const i of items) {
      const key = `${i.kind}-${i.data.id}`
      if (!selected.has(key)) continue
      if (i.kind === 'alerta') marcarLeida.mutate(i.data.id)
      else markSaeRead.mutate(i.data.id)
    }
    clearSelection()
  }

  const handleMarcarAllAll = () => {
    marcarTodasLeidas.mutate()
    markAllSaeRead.mutate()
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
            Notificaciones
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            Alertas internas y notificaciones SAE en un solo lugar.
          </p>
        </div>
        <button
          onClick={handleMarcarAllAll}
          disabled={marcarTodasLeidas.isPending || markAllSaeRead.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
        >
          <CheckCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Marcar todas leídas</span>
          <span className="sm:hidden">Marcar todas</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-white/5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); clearSelection() }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap',
              tab === t.key
                ? 'bg-amber-500/15 text-amber-300 border-b-2 border-amber-400 -mb-px'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]',
            )}
          >
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-px text-[9px] font-bold',
                tab === t.key ? 'bg-amber-500/30 text-amber-100' : 'bg-white/10 text-zinc-400',
              )}>
                {tabCounts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + bulk */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, expediente, mensaje…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
        </div>
        {selected.size > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-300 font-medium whitespace-nowrap">{selected.size} seleccionadas</span>
            <button
              onClick={handleBulkMarkRead}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] sm:text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 whitespace-nowrap"
            >
              <CheckCheck className="h-3 w-3" /> Marcar leídas
            </button>
            <button
              onClick={clearSelection}
              className="text-[11px] sm:text-xs text-zinc-500 hover:text-zinc-300 whitespace-nowrap"
            >
              Cancelar
            </button>
          </div>
        ) : items.length > 0 && (
          <button
            onClick={selectAllVisible}
            className="text-[11px] sm:text-xs text-zinc-500 hover:text-zinc-300 whitespace-nowrap self-start sm:self-auto"
          >
            Seleccionar visibles ({items.length})
          </button>
        )}
      </div>

      {/* Atajos rápidos a vistas dedicadas */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <button
          onClick={() => navigate('/alertas')}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-400 hover:bg-white/10"
        >
          <ExternalLink className="h-2.5 w-2.5" /> Vista de alertas
        </button>
        <button
          onClick={() => navigate('/notificaciones-sae')}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-400 hover:bg-white/10"
        >
          <ExternalLink className="h-2.5 w-2.5" /> Vista SAE
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BellOff className="h-10 w-10 text-zinc-600 dark:text-zinc-400 mb-3" />
            <p className="text-sm text-zinc-400">
              {search ? 'No hay resultados para tu búsqueda' : 'Sin notificaciones'}
            </p>
          </div>
        ) : (
          items.map(item => {
            const key = `${item.kind}-${item.data.id}`
            if (item.kind === 'alerta') {
              return (
                <AlertaRow
                  key={key}
                  alerta={item.data}
                  selected={selected.has(key)}
                  onToggleSelect={() => toggleOne(key)}
                  onMarkRead={() => marcarLeida.mutate(item.data.id)}
                  onSnooze={(until) => snoozeAlerta.mutate({ id: item.data.id, until })}
                  onNavigate={(path) => navigate(path)}
                  onCompletarTarea={(tareaId) => completarTarea.mutate(tareaId)}
                />
              )
            }
            return (
              <SaeRow
                key={key}
                notif={item.data}
                selected={selected.has(key)}
                onToggleSelect={() => toggleOne(key)}
                onMarkRead={() => markSaeRead.mutate(item.data.id)}
                onSnooze={(until) => snoozeSae.mutate({ id: item.data.id, until })}
                onNavigate={(path) => navigate(path)}
                onConstancia={() => setConstanciaId(item.data.id)}
                onCrearTarea={() => {
                  const exp = item.data.expediente_id
                  const t = encodeURIComponent(item.data.titulo ?? item.data.tipo ?? 'Notificación SAE')
                  navigate(`/expedientes/${exp}?nueva_tarea=1&titulo=${t}`)
                }}
              />
            )
          })
        )}
      </div>

      {constanciaId && (
        <ConstanciaModal notifId={constanciaId} onClose={() => setConstanciaId(null)} />
      )}
    </div>
  )
}
