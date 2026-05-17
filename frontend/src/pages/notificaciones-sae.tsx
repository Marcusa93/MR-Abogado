import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import {
  Bell, BellOff, Check, CheckCheck, Loader2, ExternalLink, AlertCircle, FileText, RefreshCw,
  Building2, CalendarDays, Search, FileCheck2,
} from 'lucide-react'
import { ConstanciaModal } from '@/components/sae/constancia-modal'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useSaeNotificaciones, useMarkSaeNotifAsRead, useMarkAllSaeNotifAsRead,
  useSaeNotifPreferences, useTriggerSaePoll,
  type SaeNotificacion, type PollResult,
} from '@/hooks/use-sae-notificaciones'
import { getFueroLabel } from '@/lib/sae-fueros'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const PORTAL_URL = 'https://portaldelsae.justucuman.gov.ar/inicializando?module=notificaciones-digitales'

function formatFechaCompleta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
}

function formatFechaRelativa(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.round((now - d) / 60_000)
  if (diffMin < 1) return 'recién'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `hace ${diffD} d`
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function NotifCard({ notif }: { notif: SaeNotificacion }) {
  const mark = useMarkSaeNotifAsRead()
  const [showConstancia, setShowConstancia] = useState(false)
  const unread = !notif.leida
  const fueroSlug = notif.raw_payload?.fuero
  const fueroLabel = getFueroLabel(fueroSlug)
  const caratulaLocal = notif.expediente?.caratula
  const fechaPortal = notif.fecha_emision ?? notif.created_at

  const isUrgente = notif.prioridad === 'urgente'

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      isUrgente && unread
        ? 'border-rose-500/50 bg-rose-500/[0.08] shadow-[0_0_0_1px_rgba(244,63,94,0.2)]'
        : unread
          ? 'border-cyan-500/40 bg-cyan-500/[0.06] shadow-[0_0_0_1px_rgba(6,182,212,0.15)]'
          : 'border-white/5 bg-white/[0.02]',
    )}>
      {/* Header: meta info (fuero · expediente · fecha) */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2 text-[11px]">
          {fueroLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 font-medium text-cyan-300">
              <Building2 className="h-2.5 w-2.5" />
              {fueroLabel}
            </span>
          )}
          {notif.numero_expediente && (
            <span className="font-mono text-zinc-300 bg-white/5 rounded px-1.5 py-0.5">
              Exp. {notif.numero_expediente}
            </span>
          )}
          <span
            className="text-zinc-500 inline-flex items-center gap-1"
            title={formatFechaCompleta(fechaPortal)}
          >
            <CalendarDays className="h-3 w-3" />
            {formatFechaRelativa(fechaPortal)}
          </span>
          {unread && (
            <span className="rounded-full bg-cyan-500/25 px-2 py-0.5 font-semibold text-cyan-200">
              Nueva
            </span>
          )}
        </div>
        {/* Marcar leído rápido */}
        {unread && (
          <button
            onClick={() => mark.mutate(notif.id)}
            disabled={mark.isPending}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30"
            title="Marcar como leída"
          >
            {mark.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Leído
          </button>
        )}
      </div>

      {/* Chips: tipo + prioridad IA */}
      <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
        {notif.tipo && (
          <span className="inline-block rounded-md bg-violet-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
            {notif.tipo}
          </span>
        )}
        {notif.prioridad === 'urgente' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-200">
            🚨 Urgente
            {notif.plazo_estimado_dias != null && ` · ${notif.plazo_estimado_dias}d`}
          </span>
        )}
        {notif.prioridad === 'info' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Info
          </span>
        )}
      </div>

      {/* Título de la actuación */}
      {notif.titulo && (
        <h3 className="text-sm font-semibold text-zinc-50 leading-snug">{notif.titulo}</h3>
      )}

      {/* Resumen IA — si hay y agrega valor sobre el título */}
      {notif.ia_resumen && notif.ia_resumen !== notif.titulo && (
        <p className="mt-1 text-[11px] text-amber-200/80 italic">
          {notif.ia_resumen}
        </p>
      )}

      {/* Carátula del expediente (si está en cartera) o destinatario (sino) */}
      {caratulaLocal ? (
        <p className="mt-1 text-xs text-zinc-300 italic truncate" title={caratulaLocal}>
          {caratulaLocal}
        </p>
      ) : notif.raw_payload?.destinatario && (
        <p className="mt-1 text-xs text-zinc-400 truncate">
          Destinatario: {notif.raw_payload.destinatario}
        </p>
      )}

      {/* Oficina judicial */}
      {notif.oficina && (
        <p className="mt-0.5 text-[11px] text-zinc-500 truncate">{notif.oficina}</p>
      )}

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {notif.expediente_id ? (
          <Link
            to={`/expedientes/${notif.expediente_id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            <FileText className="h-3 w-3" />
            Abrir expediente
          </Link>
        ) : notif.numero_expediente && (
          <span className="text-[10px] text-zinc-500 italic">
            Expediente no está en tu cartera
          </span>
        )}
        <a
          href={notif.raw_payload?.ver_url || PORTAL_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
        >
          <ExternalLink className="h-3 w-3" />
          Ver en portal
        </a>
        {!unread && (
          <button
            type="button"
            onClick={() => setShowConstancia(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/15"
            title="Ver constancia legal de toma de conocimiento"
          >
            <FileCheck2 className="h-3 w-3" />
            Constancia
          </button>
        )}
      </div>
      {showConstancia && (
        <ConstanciaModal notifId={notif.id} onClose={() => setShowConstancia(false)} />
      )}
    </div>
  )
}

export default function NotificacionesSaePage() {
  // Default 'unread' para que marcar como leído oculte de la lista.
  const [filter, setFilter] = useState<'all' | 'unread'>('unread')
  const [search, setSearch] = useState('')
  const { data: notifs = [], isLoading } = useSaeNotificaciones({ unreadOnly: filter === 'unread' })
  const { data: prefs } = useSaeNotifPreferences()
  const markAll = useMarkAllSaeNotifAsRead()
  const trigger = useTriggerSaePoll()
  const queryClient = useQueryClient()
  const [lastResult, setLastResult] = useState<PollResult | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)

  // Filtro client-side por texto (case-insensitive, sin acentos)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (!q) return notifs
    const norm = (s: string | null | undefined) =>
      (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return notifs.filter(n =>
      norm(n.tipo).includes(q)
      || norm(n.titulo).includes(q)
      || norm(n.numero_expediente).includes(q)
      || norm(n.oficina).includes(q)
      || norm(n.caratula).includes(q)
      || norm(n.expediente?.caratula).includes(q)
      || norm(n.raw_payload?.destinatario).includes(q)
    )
  }, [notifs, search])

  const handleSyncNow = () => {
    trigger.mutate(undefined, {
      onSuccess: (res) => {
        setLastResult(res)
        if (res.notifs_nuevas > 0) {
          toast.success(`${res.notifs_nuevas} ${res.notifs_nuevas === 1 ? 'notificación nueva' : 'notificaciones nuevas'}`)
        } else {
          toast.success('Sincronizado — no hay novedades')
        }
        if (res.errores?.length) {
          toast.error(`${res.errores.length} error(es) durante el polling — revisar logs`)
        }
        queryClient.invalidateQueries({ queryKey: ['sae-notificaciones'] })
        queryClient.invalidateQueries({ queryKey: ['sae-notificaciones-unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['sidebar-badges', 'sae-notif-unread'] })
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2">
            <Bell className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-50">Notificaciones SAE</h1>
            <p className="text-xs text-zinc-500">
              Notificaciones digitales capturadas del portal del SAE 2 veces por día.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncNow}
            disabled={trigger.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
            title="Forzar revisión del portal ahora (sin esperar al cron 2x/día)"
          >
            {trigger.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
            {trigger.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          >
            <ExternalLink className="h-3 w-3" />
            Portal SAE
          </a>
        </div>
      </div>

      {lastResult && (
        lastResult.debug
        || lastResult.errores.length > 0
        || (lastResult.fueros_iterados ?? []).length > 0
        || (lastResult.skip_reasons?.length ?? 0) > 0
      ) && (
        <div className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] p-3">
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className="w-full text-left flex items-center justify-between"
          >
            <div className="text-[11px] text-zinc-400">
              <span className="text-cyan-300 font-medium">Última sincronización:</span>{' '}
              {lastResult.notifs_nuevas} nuevas · {lastResult.fueros_iterados?.length ?? 0} fueros consultados
              {lastResult.discovery_mode === 'auto' && lastResult.fueros_con_novedades_detectadas && (
                <> · {lastResult.fueros_con_novedades_detectadas.length} con 🔔 detectado</>
              )}
              {lastResult.errores.length > 0 && <span className="text-rose-300"> · {lastResult.errores.length} error(es)</span>}
            </div>
            <span className="text-[10px] text-cyan-300">{debugOpen ? 'ocultar detalle' : 'ver detalle'}</span>
          </button>
          {debugOpen && (
            <div className="mt-3 space-y-2 text-[10px] font-mono">
              {lastResult.debug?.discovery && (
                <div className="rounded bg-black/30 p-2">
                  <div className="text-cyan-300 mb-1">discovery /casillero:</div>
                  <div>status={lastResult.debug.discovery.status} · hops={lastResult.debug.discovery.hops} · htmlLen={lastResult.debug.discovery.htmlLen} · anchors={lastResult.debug.discovery.anchorsFound}</div>
                  <div className="text-zinc-500 truncate">finalUrl: {lastResult.debug.discovery.finalUrl}</div>
                  {lastResult.debug.discovery.log.map((l, i) => (
                    <div key={i} className="text-zinc-400">{l}</div>
                  ))}
                </div>
              )}
              {(lastResult.debug?.fueros?.length ?? 0) > 0 && (
                <div className="rounded bg-black/30 p-2">
                  <div className="text-cyan-300 mb-1">fueros iterados:</div>
                  {lastResult.debug!.fueros.map(f => (
                    <div key={f.slug} className={f.error ? 'text-rose-300' : 'text-zinc-300'}>
                      {f.slug}: status={f.firstStatus} pages={f.pages} items={f.items} htmlLen={f.htmlLen}
                      {f.error && <span> — ERROR: {f.error}</span>}
                    </div>
                  ))}
                </div>
              )}
              {(lastResult.skip_reasons?.length ?? 0) > 0 && (
                <div className="rounded bg-amber-950/20 border border-amber-500/30 p-2 text-amber-200">
                  <div className="mb-1 font-medium">perfiles salteados:</div>
                  {lastResult.skip_reasons!.map((s, i) => <div key={i}>{s.reason}</div>)}
                </div>
              )}
              {lastResult.errores.length > 0 && (
                <div className="rounded bg-rose-950/20 border border-rose-500/30 p-2 text-rose-200">
                  <div className="mb-1 font-medium">errores:</div>
                  {lastResult.errores.map((e, i) => <div key={i}>{e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {prefs && !prefs.sae_notif_enabled && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 flex items-start gap-2">
          <BellOff className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-200">Las notificaciones automáticas están desactivadas</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Activalas en <Link to="/configuracion" className="underline">Configuración → Notificaciones SAE</Link> para que el sistema chequee el portal 2 veces por día y te mande email/push.
            </p>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por expediente, tipo, oficina, carátula…"
          className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setFilter('unread')}
          className={cn(
            'h-7 rounded-lg border px-2.5 text-xs transition-colors',
            filter === 'unread' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10',
          )}
        >
          No leídas
        </button>
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'h-7 rounded-lg border px-2.5 text-xs transition-colors',
            filter === 'all' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10',
          )}
        >
          Todas (historial)
        </button>
        <div className="flex-1" />
        {search && (
          <span className="text-[10px] text-zinc-500">
            {filtered.length} de {notifs.length}
          </span>
        )}
        <button
          onClick={() => markAll.mutate(undefined, {
            onSuccess: () => toast.success('Marcadas como leídas'),
            onError: (err) => toast.error(err.message),
          })}
          disabled={markAll.isPending || notifs.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10 disabled:opacity-30"
        >
          {markAll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
          Marcar todo leído
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : notifs.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === 'unread' ? 'No hay notificaciones sin leer' : 'No hay notificaciones todavía'}
          description={filter === 'unread'
            ? 'Cuando llegue una nueva, va a aparecer acá. Cambiá a "Todas (historial)" para ver las que ya marcaste como leídas.'
            : 'El sistema chequea el portal 2 veces por día. Si activaste las notificaciones, las vas a ver acá apenas se publiquen.'}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-8 text-center">
          <Search className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-300">Ninguna notificación coincide con "{search}"</p>
          <button
            onClick={() => setSearch('')}
            className="mt-3 text-xs text-cyan-400 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => <NotifCard key={n.id} notif={n} />)}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-500" />
        <p className="text-[11px] text-zinc-500">
          Esta lista se actualiza con dos consultas al portal: 00:15 y 08:30 (hora AR). Si necesitás ver algo en tiempo real, abrí el portal del SAE directamente.
        </p>
      </div>
    </div>
  )
}
