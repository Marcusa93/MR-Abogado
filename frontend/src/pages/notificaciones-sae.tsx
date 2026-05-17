import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell, BellOff, Check, CheckCheck, Loader2, ExternalLink, AlertCircle, FileText, RefreshCw,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useSaeNotificaciones, useMarkSaeNotifAsRead, useMarkAllSaeNotifAsRead,
  useSaeNotifPreferences, useTriggerSaePoll,
  type SaeNotificacion, type PollResult,
} from '@/hooks/use-sae-notificaciones'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const PORTAL_URL = 'https://portaldelsae.justucuman.gov.ar/inicializando?module=notificaciones-digitales'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

function NotifCard({ notif }: { notif: SaeNotificacion }) {
  const mark = useMarkSaeNotifAsRead()
  const unread = !notif.leida

  return (
    <div className={cn(
      'group flex items-start gap-3 rounded-lg border p-4 transition-colors',
      unread ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/5 bg-white/[0.02]',
    )}>
      <div className={cn(
        'shrink-0 rounded-lg p-2',
        unread ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/5 text-zinc-500',
      )}>
        <Bell className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {notif.tipo && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-300">
              {notif.tipo}
            </span>
          )}
          {notif.numero_expediente && (
            <span className="text-[11px] font-mono text-zinc-400">
              Exp. {notif.numero_expediente}
            </span>
          )}
          {unread && (
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
              Nueva
            </span>
          )}
        </div>

        {notif.titulo && (
          <p className="mt-1.5 text-sm font-medium text-zinc-100">{notif.titulo}</p>
        )}

        {notif.caratula && (
          <p className="mt-0.5 text-[12px] text-zinc-400 truncate">{notif.caratula}</p>
        )}
        {notif.oficina && (
          <p className="text-[11px] text-zinc-500">{notif.oficina}</p>
        )}

        <p className="mt-2 text-[10px] text-zinc-600">
          {formatFecha(notif.fecha_emision ?? notif.created_at)}
        </p>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {notif.expediente_id && (
            <Link
              to={`/expedientes/${notif.expediente_id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
            >
              <FileText className="h-3 w-3" />
              Abrir expediente
            </Link>
          )}
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            <ExternalLink className="h-3 w-3" />
            Ver en el portal
          </a>
          {unread && (
            <button
              onClick={() => mark.mutate(notif.id)}
              disabled={mark.isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30"
            >
              <Check className="h-3 w-3" />
              Marcar como leída
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NotificacionesSaePage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const { data: notifs = [], isLoading } = useSaeNotificaciones({ unreadOnly: filter === 'unread' })
  const { data: prefs } = useSaeNotifPreferences()
  const markAll = useMarkAllSaeNotifAsRead()
  const trigger = useTriggerSaePoll()
  const queryClient = useQueryClient()
  const [lastResult, setLastResult] = useState<PollResult | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)

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

      {lastResult && (lastResult.debug || lastResult.errores.length > 0 || (lastResult.fueros_iterados ?? []).length > 0) && (
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
              {lastResult.debug.discovery && (
                <div className="rounded bg-black/30 p-2">
                  <div className="text-cyan-300 mb-1">discovery /casillero:</div>
                  <div>status={lastResult.debug.discovery.status} · hops={lastResult.debug.discovery.hops} · htmlLen={lastResult.debug.discovery.htmlLen} · anchors={lastResult.debug.discovery.anchorsFound}</div>
                  <div className="text-zinc-500 truncate">finalUrl: {lastResult.debug.discovery.finalUrl}</div>
                  {lastResult.debug.discovery.log.map((l, i) => (
                    <div key={i} className="text-zinc-400">{l}</div>
                  ))}
                </div>
              )}
              {lastResult.debug.fueros.length > 0 && (
                <div className="rounded bg-black/30 p-2">
                  <div className="text-cyan-300 mb-1">fueros iterados:</div>
                  {lastResult.debug.fueros.map(f => (
                    <div key={f.slug} className={f.error ? 'text-rose-300' : 'text-zinc-300'}>
                      {f.slug}: status={f.firstStatus} pages={f.pages} items={f.items} htmlLen={f.htmlLen}
                      {f.error && <span> — ERROR: {f.error}</span>}
                    </div>
                  ))}
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

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'h-7 rounded-lg border px-2.5 text-xs transition-colors',
            filter === 'all' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10',
          )}
        >
          Todas
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={cn(
            'h-7 rounded-lg border px-2.5 text-xs transition-colors',
            filter === 'unread' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10',
          )}
        >
          No leídas
        </button>
        <div className="flex-1" />
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
            ? 'Cuando llegue una nueva, va a aparecer acá.'
            : 'El sistema chequea el portal 2 veces por día. Si activaste las notificaciones, las vas a ver acá apenas se publiquen.'}
        />
      ) : (
        <div className="space-y-2">
          {notifs.map(n => <NotifCard key={n.id} notif={n} />)}
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
