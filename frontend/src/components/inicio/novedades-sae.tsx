import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, CheckCheck, CheckCircle2, ListPlus, Loader2 } from 'lucide-react'
import {
  useSaeNotificaciones, useSaeNotifUnreadCount, useMarkSaeNotifAsRead, useMarkAllSaeNotifAsRead,
  type SaeNotificacion,
} from '@/hooks/use-sae-notificaciones'
import { useActuacionesRecientes } from '@/hooks/use-sae-dashboard'
import { cn } from '@/lib/utils'

const GRUPOS_VISIBLES = 6

const ddmm = (f: string) => {
  const d = new Date(f.length <= 10 ? f + 'T12:00:00' : f)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

function diasHasta(f: string) {
  return Math.round((new Date(f.slice(0, 10) + 'T12:00:00').getTime() - new Date(hoyISO() + 'T12:00:00').getTime()) / 86_400_000)
}

/** Plazo de la notificación: el calculado (si no se descartó) o el estimado por la IA. */
function plazoDe(n: SaeNotificacion): { texto: string; dias: number } | null {
  const p = n.plazo_sugerido
  if (p && p.estado !== 'descartado' && p.fecha_vencimiento) {
    const d = diasHasta(p.fecha_vencimiento)
    return { texto: d < 0 ? `venció ${ddmm(p.fecha_vencimiento)}` : d === 0 ? 'vence hoy' : `vence ${ddmm(p.fecha_vencimiento)}`, dias: d }
  }
  if (n.plazo_estimado_dias != null && n.plazo_estimado_dias > 0) {
    return { texto: `plazo ${n.plazo_estimado_dias}d`, dias: n.plazo_estimado_dias }
  }
  return null
}

interface Grupo {
  key: string
  expedienteId: string | null
  caratula: string
  numero: string | null
  items: SaeNotificacion[]
  urgente: boolean
  ultima: string
}

function agrupar(notifs: SaeNotificacion[]): Grupo[] {
  const map = new Map<string, Grupo>()
  for (const n of notifs) {
    const key = n.expediente_id ?? n.numero_expediente ?? n.id
    const fecha = n.fecha_emision ?? n.created_at
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        expedienteId: n.expediente_id,
        caratula: n.expediente?.caratula ?? n.caratula ?? 'Expediente sin vincular',
        numero: n.numero_expediente ?? n.expediente?.numero ?? null,
        items: [],
        urgente: false,
        ultima: fecha,
      }
      map.set(key, g)
    }
    g.items.push(n)
    if (n.prioridad === 'urgente') g.urgente = true
    if (fecha > g.ultima) g.ultima = fecha
  }
  return [...map.values()].sort((a, b) =>
    a.urgente !== b.urgente ? (a.urgente ? -1 : 1) : b.ultima.localeCompare(a.ultima),
  )
}

function Item({ n }: { n: SaeNotificacion }) {
  const navigate = useNavigate()
  const markRead = useMarkSaeNotifAsRead()
  const urgente = n.prioridad === 'urgente'
  const plazo = plazoDe(n)
  const texto = n.ia_resumen && n.ia_resumen !== n.titulo ? n.ia_resumen : (n.titulo ?? 'Notificación del SAE')

  const abrir = () => {
    markRead.mutate(n.id)
    if (n.expediente_id) navigate(`/expedientes/${n.expediente_id}`)
  }

  return (
    <li className="group relative py-2 pl-4">
      <span className={cn('absolute -left-[3.5px] top-[15px] h-1.5 w-1.5 rounded-full', urgente ? 'bg-rose-500' : 'bg-cyan-400')} aria-hidden />
      <div className="flex flex-wrap items-center gap-1.5">
        {n.tipo && (
          <span className={cn('tag-mono', urgente && '!border-rose-500/40 !text-rose-600 dark:!text-rose-300')}>{n.tipo}</span>
        )}
        {plazo && (
          <span className={cn(
            'tag-mono',
            plazo.dias <= 3 ? '!border-rose-500/40 !bg-rose-500/10 !text-rose-600 dark:!text-rose-300'
              : plazo.dias <= 7 ? '!border-amber-500/40 !bg-amber-500/10 !text-amber-700 dark:!text-amber-300'
              : '',
          )}>
            {plazo.texto}
          </span>
        )}
        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{ddmm(n.fecha_emision ?? n.created_at)}</span>
        <div className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {n.expediente_id && (
            <button
              type="button"
              title="Crear tarea"
              onClick={() => {
                markRead.mutate(n.id)
                navigate(`/expedientes/${n.expediente_id}?nueva_tarea=1&titulo=${encodeURIComponent(n.titulo ?? n.tipo ?? 'Notificación SAE')}`)
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            >
              <ListPlus className="h-3.5 w-3.5" /><span className="hidden md:inline">Tarea</span>
            </button>
          )}
          <button
            type="button"
            title="Marcar leída"
            onClick={() => markRead.mutate(n.id)}
            disabled={markRead.isPending}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-emerald-300"
          >
            <Check className="h-3.5 w-3.5" /><span className="hidden md:inline">Leída</span>
          </button>
        </div>
      </div>
      <button type="button" onClick={abrir} className="mt-1 block w-full text-left text-[13.5px] leading-snug text-zinc-800 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
        <span className="line-clamp-2">{texto}</span>
      </button>
    </li>
  )
}

function MovimientosHoy() {
  const { data: movs = [], isLoading } = useActuacionesRecientes()
  if (isLoading) return null
  return (
    <div className="border-t border-zinc-200/80 px-4 py-3 sm:px-5 dark:border-white/[0.06]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="dashboard-eyebrow">Movimientos de hoy</p>
        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{movs.length}</span>
      </div>
      {movs.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Todavía no entraron movimientos nuevos hoy.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {movs.slice(0, 5).map((m) => (
            <li key={m.id}>
              <Link to={`/expedientes/${m.expediente_id}`} className="flex items-start gap-3 py-2 hover:opacity-90">
                <span className="mt-0.5 w-[88px] shrink-0 truncate font-mono text-[10.5px] uppercase text-zinc-400 dark:text-zinc-500" title={m.tipo_movimiento}>
                  {m.tipo_movimiento.replace(/_/g, ' ')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-zinc-800 dark:text-zinc-200">{m.ai_summary || m.titulo}</span>
                  <span className="block truncate text-[11.5px] text-zinc-500">{m.expediente_caratula ?? m.expediente_numero}</span>
                </span>
              </Link>
            </li>
          ))}
          {movs.length > 5 && <li className="pt-2 text-[11.5px] text-zinc-500">y {movs.length - 5} más en sus expedientes</li>}
        </ul>
      )}
    </div>
  )
}

export function NovedadesSae() {
  const { data: notifs = [], isLoading } = useSaeNotificaciones({ unreadOnly: true, limit: 100 })
  const { data: total = 0 } = useSaeNotifUnreadCount()
  const markAll = useMarkAllSaeNotifAsRead()
  const [todos, setTodos] = useState(false)

  const grupos = useMemo(() => agrupar(notifs), [notifs])
  const urgentes = notifs.filter((n) => n.prioridad === 'urgente').length
  const visibles = todos ? grupos : grupos.slice(0, GRUPOS_VISIBLES)

  return (
    <section className="app-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/80 px-4 py-3.5 sm:px-5 dark:border-white/[0.06]">
        <span className={cn('status-dot', total > 0 ? (urgentes > 0 ? 'text-rose-500' : 'text-cyan-400') : 'text-emerald-500')} aria-hidden />
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Novedades del SAE</h2>
        {total > 0 && <span className="tag-mono">{total} sin leer</span>}
        {urgentes > 0 && <span className="tag-mono !border-rose-500/40 !bg-rose-500/10 !text-rose-600 dark:!text-rose-300">{urgentes} urgente{urgentes > 1 ? 's' : ''}</span>}
        <div className="ml-auto flex items-center gap-1">
          {total > 0 && (
            <button
              type="button"
              onClick={() => { if (window.confirm(`¿Marcar las ${total} novedades como leídas?`)) markAll.mutate() }}
              disabled={markAll.isPending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            >
              {markAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Todo leído</span>
            </button>
          )}
          <Link to="/notificaciones" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300">
            Ver todo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/[0.04]" />)}
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Está al día con el SAE</p>
            <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Cuando entre una notificación nueva al casillero, aparece acá primero.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200/80 dark:divide-white/[0.06]">
          {visibles.map((g) => (
            <div key={g.key} className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline gap-2">
                {g.expedienteId ? (
                  <Link to={`/expedientes/${g.expedienteId}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-zinc-900 hover:text-cyan-700 dark:text-zinc-50 dark:hover:text-cyan-300">
                    {g.caratula}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-50">{g.caratula}</span>
                )}
                {g.numero && <span className="hidden shrink-0 font-mono text-[11px] text-zinc-400 sm:inline dark:text-zinc-500">{g.numero}</span>}
                {g.items.length > 1 && <span className="shrink-0 font-mono text-[11px] text-cyan-700 dark:text-cyan-300">×{g.items.length}</span>}
              </div>
              <ul className="ml-0.5 mt-0.5 border-l border-zinc-200 dark:border-white/[0.08]">
                {g.items.map((n) => <Item key={n.id} n={n} />)}
              </ul>
            </div>
          ))}
          {grupos.length > GRUPOS_VISIBLES && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="w-full px-5 py-2.5 text-left text-[12px] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:hover:bg-white/[0.02] dark:hover:text-zinc-200"
            >
              {todos ? 'Mostrar menos' : `Ver ${grupos.length - GRUPOS_VISIBLES} expedientes más con novedades`}
            </button>
          )}
        </div>
      )}

      <MovimientosHoy />
    </section>
  )
}
