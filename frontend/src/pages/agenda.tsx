import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckSquare, Scale, Clock, FolderOpen, Plus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { AppSplash } from '@/components/shared/app-splash'
import { cn } from '@/lib/utils'

// Secretaria usa su vista específica (lazy)
const AgendaSecretaria = lazy(() => import('./agenda-secretaria'))

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface AgendaItem {
  id: string
  kind: 'audiencia' | 'tarea' | 'plazo'
  fecha: string  // YYYY-MM-DD
  hora?: string | null
  titulo: string
  subtitulo?: string | null
  expedienteId?: string | null
  expedienteCaratula?: string | null
  prioridad?: string | null
  estadoLabel?: string | null
}

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

function isoHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoShift(baseISO: string, days: number): string {
  const d = new Date(baseISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const DIAS_ES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_ES[date.getUTCDay()]} ${d} de ${MESES_ES[m - 1]}`
}

function labelFecha(iso: string, hoy: string): string {
  const man = isoShift(hoy, 1)
  if (iso === hoy) return `Hoy — ${formatFechaLarga(iso)}`
  if (iso === man)  return `Mañana — ${formatFechaLarga(iso)}`
  return formatFechaLarga(iso)
}

function isHoyLabel(iso: string, hoy: string) { return iso === hoy }
function isVencida(iso: string, hoy: string) { return iso < hoy }

// ---------------------------------------------------------------------------
// Hook de datos
// ---------------------------------------------------------------------------

function useAgendaUnificada() {
  const hoy = isoHoy()
  const desde = isoShift(hoy, -3)  // 3 días atrás (vencidas recientes)
  const hasta = isoShift(hoy, 45)

  const { data: audiencias = [], isLoading: aud_loading } = useQuery({
    queryKey: ['agenda-audiencias', hoy],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('audiencias')
        .select(`
          id, fecha, hora, estado,
          expedientes!inner(id, caratula, numero),
          catalogo_tipos_audiencia(nombre),
          organismos(nombre)
        `)
        .gte('fecha', hoy)
        .lte('fecha', hasta)
        .in('estado', ['PENDIENTE', 'CONFIRMADA'])
        .order('fecha')
        .limit(100)
      return data ?? []
    },
    staleTime: 60_000,
  })

  const { data: tareas = [], isLoading: tar_loading } = useQuery({
    queryKey: ['agenda-tareas', hoy],
    queryFn: async () => {
      const supabase = createClient()
      // es_plazo_judicial existe en DB pero no en tipos generados — cast a any
      const { data } = await (supabase as any)
        .from('tareas')
        .select(`
          id, titulo, fecha_vencimiento, prioridad, estado, es_plazo_judicial,
          expedientes(id, caratula, numero)
        `)
        .not('fecha_vencimiento', 'is', null)
        .gte('fecha_vencimiento', desde)
        .lte('fecha_vencimiento', hasta)
        .neq('estado', 'COMPLETADA')
        .neq('estado', 'CANCELADA')
        .order('fecha_vencimiento')
        .limit(150)
      return (data ?? []) as any[]
    },
    staleTime: 60_000,
  })

  const items: AgendaItem[] = useMemo(() => {
    const list: AgendaItem[] = []

    for (const a of audiencias) {
      const exp = (a as any).expedientes
      const tipo = (a as any).catalogo_tipos_audiencia
      const org = (a as any).organismos
      list.push({
        id: a.id,
        kind: 'audiencia',
        fecha: a.fecha,
        hora: a.hora,
        titulo: tipo?.nombre ?? 'Audiencia',
        subtitulo: org?.nombre ?? null,
        expedienteId: exp?.id ?? null,
        expedienteCaratula: exp?.caratula ?? exp?.numero ?? null,
      })
    }

    for (const t of tareas) {
      const exp = (t as any).expedientes
      list.push({
        id: t.id,
        kind: (t as any).es_plazo_judicial ? 'plazo' : 'tarea',
        fecha: t.fecha_vencimiento!,
        titulo: t.titulo,
        expedienteId: exp?.id ?? null,
        expedienteCaratula: exp?.caratula ?? exp?.numero ?? null,
        prioridad: t.prioridad,
        estadoLabel: t.estado,
      })
    }

    return list.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
      // audiencias con hora van primero dentro del día
      if (a.hora && !b.hora) return -1
      if (!a.hora && b.hora) return 1
      if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
      return 0
    })
  }, [audiencias, tareas])

  const grouped = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    for (const item of items) {
      if (!map[item.fecha]) map[item.fecha] = []
      map[item.fecha].push(item)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  return {
    grouped,
    isLoading: aud_loading || tar_loading,
    totalItems: items.length,
  }
}

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------

function AgendaItemCard({ item, hoy }: { item: AgendaItem; hoy: string }) {
  const vencida = isVencida(item.fecha, hoy)

  const dotColor = item.kind === 'audiencia'
    ? 'bg-sky-500'
    : item.kind === 'plazo'
    ? 'bg-rose-500'
    : 'bg-amber-500'

  const iconColor = item.kind === 'audiencia'
    ? 'text-sky-500'
    : item.kind === 'plazo'
    ? 'text-rose-500'
    : 'text-amber-500'

  const Icon = item.kind === 'audiencia' ? Scale : item.kind === 'plazo' ? Clock : CheckSquare

  const inner = (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
      vencida && item.kind !== 'audiencia'
        ? 'border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10'
        : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-50 dark:hover:bg-white/8'
    )}>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-white/10">
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {item.titulo}
          </span>
          {item.hora && (
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
              {item.hora.slice(0, 5)}
            </span>
          )}
          {vencida && item.kind !== 'audiencia' && (
            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
              Vencida
            </span>
          )}
          {item.prioridad === 'URGENTE' && (
            <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
              Urgente
            </span>
          )}
        </div>
        {(item.expedienteCaratula || item.subtitulo) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {item.subtitulo && <span>{item.subtitulo}</span>}
            {item.subtitulo && item.expedienteCaratula && <span className="mx-1">·</span>}
            {item.expedienteCaratula && <span>{item.expedienteCaratula}</span>}
          </p>
        )}
      </div>
    </div>
  )

  if (item.expedienteId) {
    return (
      <Link to={`/expedientes/${item.expedienteId}`} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}

// ---------------------------------------------------------------------------
// Vista unificada
// ---------------------------------------------------------------------------

function AgendaUnificada() {
  const hoy = isoHoy()
  const { grouped, isLoading, totalItems } = useAgendaUnificada()

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
            <div className="h-16 rounded-lg bg-zinc-100 dark:bg-white/5 animate-pulse" />
            <div className="h-16 rounded-lg bg-zinc-100 dark:bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 dark:bg-amber-500/10">
            <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Agenda</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Próximos 45 días · audiencias, tareas y plazos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Leyenda */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Audiencia</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Plazo</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Tarea</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-6 py-12 text-center">
          <CalendarDays className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Sin eventos próximos</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            No hay audiencias ni tareas con vencimiento en los próximos 45 días.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([fecha, items]) => (
            <div key={fecha}>
              <div className={cn(
                'flex items-center gap-2 mb-3',
                isHoyLabel(fecha, hoy) && 'sticky top-0 z-10 bg-[var(--layout-bg)]/95 backdrop-blur-sm py-1 -mx-1 px-1'
              )}>
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  isHoyLabel(fecha, hoy) ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
                )} />
                <span className={cn(
                  'text-xs font-semibold uppercase tracking-wider',
                  isHoyLabel(fecha, hoy)
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-500 dark:text-zinc-400'
                )}>
                  {labelFecha(fecha, hoy)}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {items.length} {items.length === 1 ? 'evento' : 'eventos'}
                </span>
              </div>
              <div className="space-y-2 ml-4">
                {items.map(item => (
                  <AgendaItemCard key={`${item.kind}-${item.id}`} item={item} hoy={hoy} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export — adaptive por rol
// ---------------------------------------------------------------------------

export default function AgendaPage() {
  const rol = useAuthStore(s => s.profile?.rol)

  if (rol === 'SECRETARIA') {
    return (
      <Suspense fallback={<AppSplash fullscreen={false} message="Cargando agenda" />}>
        <AgendaSecretaria />
      </Suspense>
    )
  }

  return <AgendaUnificada />
}
