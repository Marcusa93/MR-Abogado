import { useEffect, useState } from 'react'
import { Check, Loader2, Bell, Mail, Smartphone, CircleCheck, CircleX, CircleMinus } from 'lucide-react'
import { useNotifPrefs, useUpdateNotifPrefs } from '@/hooks/use-notif-prefs'
import { useLastDispatch, type DispatchSnapshot } from '@/hooks/use-notif-dispatches'
import { NOTIF_EVENTS, type NotifPrefs } from '@/lib/notif-events'
import { timeAgo } from '@/lib/utils/date-helpers'
import { toast } from '@/stores/toast-store'

function DispatchStatusPill({ snap, label }: { snap: DispatchSnapshot | null | undefined; label: string }) {
  if (snap === undefined) {
    return <span className="text-[10px] text-zinc-500">—</span>
  }
  if (snap === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
        <CircleMinus className="h-3 w-3" /> Sin envíos
      </span>
    )
  }
  const tone =
    snap.status === 'success'
      ? 'text-emerald-400'
      : snap.status === 'skipped'
        ? 'text-zinc-500'
        : 'text-rose-400'
  const Icon = snap.status === 'success' ? CircleCheck : snap.status === 'skipped' ? CircleMinus : CircleX
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${tone}`} title={`${label}: ${snap.reason ?? snap.status}`}>
      <Icon className="h-3 w-3" />
      {timeAgo(snap.attempted_at)}
      {snap.status === 'failed' && snap.reason && (
        <span className="text-[10px] text-rose-400/80 truncate max-w-[120px]">· {snap.reason}</span>
      )}
    </span>
  )
}

function DispatchTelemetry() {
  const push = useLastDispatch('push')
  const email = useLastDispatch('email')
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Último envío</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-3 w-3 text-zinc-500 shrink-0" />
          <DispatchStatusPill snap={push.data} label="Push" />
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
          <DispatchStatusPill snap={email.data} label="Email" />
        </div>
      </div>
    </div>
  )
}

export function NotifPrefsConfig() {
  const { data: storedPrefs, isLoading } = useNotifPrefs()
  const update = useUpdateNotifPrefs()
  const [prefs, setPrefs] = useState<NotifPrefs>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (storedPrefs) {
      setPrefs(storedPrefs)
      setDirty(false)
    }
  }, [storedPrefs])

  const getValue = (key: string, channel: 'push' | 'email'): boolean => {
    const ev = NOTIF_EVENTS.find(e => e.key === key)
    if (!ev) return false
    const userPref = prefs[key]
    if (userPref && typeof userPref[channel] === 'boolean') return userPref[channel]
    return channel === 'push' ? ev.pushDefault : ev.emailDefault
  }

  const toggle = (key: string, channel: 'push' | 'email') => {
    const current = getValue(key, channel)
    setPrefs(p => ({
      ...p,
      [key]: { ...(p[key] ?? { push: false, email: false }), [channel]: !current },
    }))
    setDirty(true)
  }

  const save = () => {
    update.mutate(prefs, {
      onSuccess: () => { toast.success('Preferencias guardadas'); setDirty(false) },
      onError: (err) => toast.error(err.message),
    })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/15 text-violet-300 p-2 shrink-0">
          <Bell className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">Notificaciones de la app</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Elegí por cada tipo de evento si querés recibir push (browser/PWA) y/o email. Los defaults están pensados para no spammear: las menciones y tareas vienen activas, los cambios de estado vienen apagados.
          </p>
        </div>
      </div>

      {/* Tabla de eventos × canales */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_70px] gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02] text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          <div>Evento</div>
          <div className="flex items-center justify-center gap-1 text-center"><Smartphone className="h-3 w-3" /> Push</div>
          <div className="flex items-center justify-center gap-1 text-center"><Mail className="h-3 w-3" /> Email</div>
        </div>
        {NOTIF_EVENTS.map((ev, i) => {
          const push = getValue(ev.key, 'push')
          const email = getValue(ev.key, 'email')
          return (
            <div
              key={ev.key}
              className={`grid grid-cols-[1fr_70px_70px] gap-2 px-3 py-2.5 items-center ${i < NOTIF_EVENTS.length - 1 ? 'border-b border-white/5' : ''} hover:bg-white/[0.02]`}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-100">{ev.label}</p>
                <p className="text-[10px] text-zinc-500 leading-snug mt-0.5">{ev.desc}</p>
              </div>
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={push}
                  onChange={() => toggle(ev.key, 'push')}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer"
                />
              </div>
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={email}
                  onChange={() => toggle(ev.key, 'email')}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-30"
        >
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Guardar cambios
        </button>
        {dirty && <span className="text-[10px] text-amber-400">cambios sin guardar</span>}
      </div>

      <DispatchTelemetry />

      <p className="text-[10px] text-zinc-600">
        Las notificaciones del SAE tienen sus propias preferencias arriba (incluyendo horario silencioso y selector de fueros).
      </p>
    </div>
  )
}
