import { useEffect, useState } from 'react'
import { Bell, Check, X, Loader2, Mail, Smartphone, MoonStar, Plus, Trash2, Filter } from 'lucide-react'
import {
  useSaeNotifPreferences, useUpdateSaeNotifPreferences,
} from '@/hooks/use-sae-notificaciones'
import { FUEROS_SAE } from '@/lib/sae-fueros'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export function SaeNotifConfig() {
  const { data: prefs, isLoading } = useSaeNotifPreferences()
  const update = useUpdateSaeNotifPreferences()

  const [enabled, setEnabled] = useState(false)
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(true)
  const [pushQuiet, setPushQuiet] = useState(true)
  const [weekend, setWeekend] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [fuerosSeleccionados, setFuerosSeleccionados] = useState<string[]>([])
  const [autoFueros, setAutoFueros] = useState(true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (prefs) {
      setEnabled(prefs.sae_notif_enabled)
      setPush(prefs.sae_notif_push)
      setEmail(prefs.sae_notif_email)
      setPushQuiet(prefs.sae_notif_push_quiet)
      setWeekend(prefs.sae_notif_weekend)
      setEmails(prefs.sae_notif_email_addresses ?? [])
      const selectedFueros = prefs.sae_fueros_seleccionados ?? []
      setFuerosSeleccionados(selectedFueros)
      setAutoFueros(selectedFueros.length === 0)
      setDirty(false)
    }
  }, [prefs])

  const toggleFuero = (slug: string) => {
    setFuerosSeleccionados(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
    markDirty()
  }

  const handleAutoFuerosToggle = (val: boolean) => {
    setAutoFueros(val)
    if (val) setFuerosSeleccionados([])
    markDirty()
  }

  const markDirty = () => setDirty(true)

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase()
    if (!isValidEmail(e)) {
      toast.error('Email inválido')
      return
    }
    if (emails.includes(e)) {
      toast.error('Ya está agregado')
      return
    }
    setEmails([...emails, e])
    setNewEmail('')
    markDirty()
  }

  const removeEmail = (idx: number) => {
    setEmails(emails.filter((_, i) => i !== idx))
    markDirty()
  }

  const save = () => {
    update.mutate(
      {
        sae_notif_enabled: enabled,
        sae_notif_push: push,
        sae_notif_email: email,
        sae_notif_push_quiet: pushQuiet,
        sae_notif_weekend: weekend,
        sae_notif_email_addresses: emails,
        sae_fueros_seleccionados: autoFueros ? [] : fuerosSeleccionados,
      },
      {
        onSuccess: () => {
          toast.success('Preferencias guardadas')
          setDirty(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  if (isLoading || !prefs) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Toggle principal */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'rounded-lg p-2 shrink-0',
          enabled ? 'bg-cyan-500/15 text-cyan-300' : 'bg-zinc-700/30 text-zinc-500',
        )}>
          <Bell className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">Notificaciones SAE</h3>
            <button
              onClick={() => { setEnabled(!enabled); markDirty() }}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                enabled ? 'bg-cyan-500' : 'bg-zinc-600',
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                enabled && 'translate-x-4',
              )} />
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            El sistema chequea el portal del SAE dos veces por día (00:15 y 08:30 AR) y te avisa de las notificaciones digitales nuevas.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="ml-11 space-y-5 border-l border-white/5 pl-4">
          {/* Canales */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Canales</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={push}
                  onChange={(e) => { setPush(e.target.checked); markDirty() }}
                  className="rounded border-white/20 bg-white/5"
                />
                <Smartphone className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-zinc-200">Push (browser/PWA)</span>
              </label>
              <label className="flex items-center gap-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={email}
                  onChange={(e) => { setEmail(e.target.checked); markDirty() }}
                  className="rounded border-white/20 bg-white/5"
                />
                <Mail className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-zinc-200">Email</span>
              </label>
            </div>
          </div>

          {/* Destinatarios de email */}
          {email && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Destinatarios de email</p>
              <div className="space-y-2">
                {emails.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
                    <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
                    <span className="flex-1 text-xs text-zinc-200 font-mono truncate">{e}</span>
                    <button
                      onClick={() => removeEmail(i)}
                      className="text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Quitar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                    placeholder="agregar email…"
                    className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                  <button
                    onClick={addEmail}
                    disabled={!newEmail.trim()}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-30"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </button>
                </div>
                {emails.length === 0 && (
                  <p className="text-[10px] text-amber-400">
                    Sin destinatarios: por default usaremos {prefs ? <code className="text-amber-300">{(prefs as { email?: string }).email ?? 'tu email del perfil'}</code> : 'tu email del perfil'}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Quiet hours del push */}
          {push && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Horas tranquilas</p>
              <label className="flex items-start gap-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={pushQuiet}
                  onChange={(e) => { setPushQuiet(e.target.checked); markDirty() }}
                  className="mt-0.5 rounded border-white/20 bg-white/5"
                />
                <div className="flex-1">
                  <span className="flex items-center gap-2 text-zinc-200">
                    <MoonStar className="h-3.5 w-3.5 text-zinc-500" />
                    No mandar push entre 22:00 y 08:00
                  </span>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    Las notificaciones de medianoche se guardan igual; el push se difiere a las 08:00. El email se manda al instante.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Fin de semana */}
          <div>
            <label className="flex items-start gap-3 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={weekend}
                onChange={(e) => { setWeekend(e.target.checked); markDirty() }}
                className="mt-0.5 rounded border-white/20 bg-white/5"
              />
              <div className="flex-1">
                <span className="text-zinc-200">Polear también sábados y domingos</span>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Por default solo lunes a viernes (días hábiles judiciales). Activá si esperás notificaciones fuera de semana.
                </p>
              </div>
            </label>
          </div>

          {/* Fueros a consultar */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
              <Filter className="h-3 w-3" />
              Fueros a consultar
            </p>
            <label className="flex items-start gap-3 text-xs cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={autoFueros}
                onChange={(e) => handleAutoFuerosToggle(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-white/5"
              />
              <div className="flex-1">
                <span className="text-zinc-200">Automático (recomendado)</span>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  El sistema lee la "Bandeja de Entrada" del portal y solo consulta los fueros con novedades. Más rápido y preciso que iterar los 29.
                </p>
              </div>
            </label>
            {!autoFueros && (
              <div className="border-l border-white/5 pl-4">
                <p className="text-[10px] text-zinc-500 mb-2">
                  Elegí los fueros donde trabajás. Solo esos se van a consultar siempre, ignorando el discovery automático.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-2">
                  {FUEROS_SAE.map(f => (
                    <label key={f.slug} className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-white/[0.03] rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={fuerosSeleccionados.includes(f.slug)}
                        onChange={() => toggleFuero(f.slug)}
                        className="rounded border-white/20 bg-white/5"
                      />
                      <span className="text-zinc-200 truncate">{f.label}</span>
                    </label>
                  ))}
                </div>
                {fuerosSeleccionados.length === 0 && (
                  <p className="mt-2 text-[10px] text-amber-400">
                    Sin selección: el sistema va a iterar TODOS los fueros (sin discovery). Marcá al menos uno o volvé a "Automático".
                  </p>
                )}
                {fuerosSeleccionados.length > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-400">
                    {fuerosSeleccionados.length} fuero{fuerosSeleccionados.length === 1 ? '' : 's'} seleccionado{fuerosSeleccionados.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guardar */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-30"
        >
          {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Guardar cambios
        </button>
        {dirty && <span className="text-[10px] text-amber-400">cambios sin guardar</span>}
      </div>
    </div>
  )
}
