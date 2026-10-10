import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Send, Plus, CheckCircle2, Clock, AlertCircle, Copy, Check, Unlink } from 'lucide-react'
import { toast } from '@/stores/toast-store'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { useVincularTelegramParaOtro } from '@/hooks/use-telegram-vinculo'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PerfilEquipo {
  id: string
  nombre: string | null
  apellido: string | null
  rol: string | null
  telegram_chat_id: number | null
  tareas_total: number
  tareas_urgentes: number
  tareas_vencidas: number
  proxima: { id: string; titulo: string; fecha_vencimiento: string | null; prioridad: string | null } | null
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function useEquipoControl() {
  const supabase = createClient()
  return useQuery<PerfilEquipo[]>({
    queryKey: ['equipo-control'],
    staleTime: 90_000,
    queryFn: async () => {
      const { data: perfiles, error } = await (supabase as any)
        .from('profiles')
        .select('id, nombre, apellido, rol, telegram_chat_id')
        .eq('activo', true)
        .in('rol', ['DIRECTOR', 'ABOGADO', 'CRITERIO'])
        .order('apellido', { ascending: true })
      if (error) throw error
      if (!perfiles?.length) return []

      const hoy = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const ids = (perfiles as { id: string }[]).map(p => p.id)

      const { data: tareas } = await supabase
        .from('tareas' as never)
        .select('id, titulo, prioridad, fecha_vencimiento, asignado_a')
        .in('asignado_a' as never, ids)
        .in('estado' as never, ['PENDIENTE', 'EN_PROGRESO'])
        .order('fecha_vencimiento' as never, { ascending: true, nullsFirst: false })

      const map = new Map<string, Array<{ id: string; titulo: string; prioridad: string | null; fecha_vencimiento: string | null }>>()
      for (const t of (tareas ?? []) as Array<{ id: string; titulo: string; prioridad: string | null; fecha_vencimiento: string | null; asignado_a: string }>) {
        const list = map.get(t.asignado_a) ?? []
        list.push({ id: t.id, titulo: t.titulo, prioridad: t.prioridad, fecha_vencimiento: t.fecha_vencimiento })
        map.set(t.asignado_a, list)
      }

      return (perfiles as { id: string; nombre: string | null; apellido: string | null; rol: string | null; telegram_chat_id: number | null }[]).map(p => {
        const ts = map.get(p.id) ?? []
        const sorted = [...ts].sort((a, b) => {
          const fa = a.fecha_vencimiento ?? '9999-12-31'
          const fb = b.fecha_vencimiento ?? '9999-12-31'
          return fa < fb ? -1 : fa > fb ? 1 : 0
        })
        return {
          ...p,
          tareas_total: ts.length,
          tareas_urgentes: ts.filter(t => t.prioridad === 'URGENTE').length,
          tareas_vencidas: ts.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < hoy).length,
          proxima: sorted[0] ?? null,
        }
      })
    },
  })
}

// ── Helpers UI ───────────────────────────────────────────────────────────────

function iniciales(nombre: string | null, apellido: string | null): string {
  const n = (nombre ?? '').charAt(0)
  const a = (apellido ?? '').charAt(0)
  return `${a}${n}`.toUpperCase() || '??'
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const hoy = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const mañana = new Date(Date.now() - 3 * 60 * 60 * 1000 + 86400000).toISOString().slice(0, 10)
  if (iso === hoy) return 'HOY'
  if (iso === mañana) return 'mañana'
  if (iso < hoy) return `VENCIDA ${iso.slice(5).replace('-', '/')}`
  return iso.slice(5).replace('-', '/')
}

function avatarColor(index: number): string {
  const colors = [
    'bg-sky-500/20 text-sky-400',
    'bg-violet-500/20 text-violet-400',
    'bg-amber-500/20 text-amber-400',
    'bg-emerald-500/20 text-emerald-400',
    'bg-rose-500/20 text-rose-400',
  ]
  return colors[index % colors.length]
}

// ── TelegramBadge ─────────────────────────────────────────────────────────────

function TelegramBadge({ profileId, connected, onLinked }: {
  profileId: string
  connected: boolean
  onLinked: () => void
}) {
  const [copied, setCopied] = useState(false)
  const generar = useVincularTelegramParaOtro()
  const queryClient = useQueryClient()

  const desconectar = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      await (supabase as any).from('profiles').update({ telegram_chat_id: null }).eq('id', profileId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo-control'] })
      toast.success('Telegram desvinculado')
    },
  })

  if (connected) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 cursor-pointer hover:bg-rose-500/10 hover:text-rose-400 transition-colors group"
        title="Clic para desvincular"
        onClick={() => desconectar.mutate()}
      >
        <CheckCircle2 className="h-3 w-3 group-hover:hidden" />
        <Unlink className="h-3 w-3 hidden group-hover:block" />
        <span className="group-hover:hidden">TG conectado</span>
        <span className="hidden group-hover:inline">Desvincular</span>
      </span>
    )
  }

  async function handleGenerar() {
    try {
      const url = await generar.mutateAsync(profileId)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copiado — mandáselo por WhatsApp o email')
      onLinked()
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('No se pudo generar el link')
    }
  }

  return (
    <button
      onClick={handleGenerar}
      disabled={generar.isPending}
      className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400 hover:bg-sky-500/15 hover:text-sky-400 transition-colors cursor-pointer"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {generar.isPending ? 'Generando…' : copied ? 'Link copiado' : 'Copiar link TG'}
    </button>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

export function CargaEquipoPanel() {
  const { profile } = useAuth()
  const { data: equipo = [], isLoading } = useEquipoControl()
  const queryClient = useQueryClient()

  const isAdminOrDirector = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'
  if (!isAdminOrDirector) return null

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
          <div>
            <p className="dashboard-eyebrow text-[10px]">dirección</p>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Control de equipo</h3>
          </div>
        </div>
        <Link
          to="/tareas"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : equipo.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">Sin miembros activos.</p>
      ) : (
        <div className="space-y-2">
          {equipo.map((p, idx) => {
            const nombre = [p.apellido, p.nombre].filter(Boolean).join(', ') || '—'
            const proxFecha = p.proxima?.fecha_vencimiento ? fechaCorta(p.proxima.fecha_vencimiento) : null
            const proxVencida = p.proxima?.fecha_vencimiento
              ? p.proxima.fecha_vencimiento < new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : false

            return (
              <div
                key={p.id}
                className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.015] dark:bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                {/* Avatar */}
                <div className={cn(
                  'mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold',
                  avatarColor(idx),
                )}>
                  {iniciales(p.nombre, p.apellido)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{nombre}</span>
                    <TelegramBadge
                      profileId={p.id}
                      connected={!!p.telegram_chat_id}
                      onLinked={() => queryClient.invalidateQueries({ queryKey: ['equipo-control'] })}
                    />
                  </div>

                  {/* Contadores */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1.5">
                    {p.tareas_urgentes > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                        <AlertCircle className="h-3 w-3" />
                        {p.tareas_urgentes} urgente{p.tareas_urgentes > 1 ? 's' : ''}
                      </span>
                    )}
                    {p.tareas_vencidas > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                        <Clock className="h-3 w-3" />
                        {p.tareas_vencidas} vencida{p.tareas_vencidas > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-500">
                      {p.tareas_total === 0 ? 'Sin tareas pendientes' : `${p.tareas_total} pendiente${p.tareas_total > 1 ? 's' : ''}`}
                    </span>
                  </div>

                  {/* Próxima tarea */}
                  {p.proxima && (
                    <p className={cn('text-[11px] truncate', proxVencida ? 'text-amber-400' : 'text-zinc-500')}>
                      <span className="font-medium text-zinc-400 dark:text-zinc-300">
                        {p.proxima.titulo.slice(0, 52)}
                        {p.proxima.titulo.length > 52 ? '…' : ''}
                      </span>
                      {proxFecha && (
                        <span className={cn('ml-1.5', proxVencida ? 'text-amber-500 font-semibold' : 'text-zinc-500')}>
                          · {proxFecha}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Acciones */}
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <Link
                    to={`/tareas?asignado=${encodeURIComponent(`${p.apellido ?? ''} ${p.nombre ?? ''}`.trim())}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
                  >
                    <Send className="h-3 w-3" />
                    Ver tareas
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
