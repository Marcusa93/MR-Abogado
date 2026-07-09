import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, FolderOpen, CheckSquare, GitBranch, Users, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils/date-helpers'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type ActividadTipo = 'estado_cambio' | 'expediente_nuevo' | 'tarea_completada' | 'consulta_nueva'

interface ActividadItem {
  id: string
  tipo: ActividadTipo
  descripcion: string
  expediente_id?: string
  expediente_caratula?: string
  fecha: string
}

const ESTADO_LABEL: Record<string, string> = {
  EN_ESTUDIO: 'En estudio',
  ACTIVO: 'Activo',
  EN_JUICIO: 'En juicio',
  EN_EJECUCION: 'En ejecución',
  FAVORABLE: 'Favorable',
  DESFAVORABLE: 'Desfavorable',
  SUSPENDIDO: 'Suspendido',
  TERMINADO: 'Terminado',
  ARCHIVADO: 'Archivado',
}

function estadoLabel(s: string | null) {
  return s ? (ESTADO_LABEL[s] ?? s) : '—'
}

const TIPO_ICON: Record<ActividadTipo, React.FC<{ className?: string }>> = {
  estado_cambio:     GitBranch,
  expediente_nuevo:  FolderOpen,
  tarea_completada:  CheckSquare,
  consulta_nueva:    Users,
}

const TIPO_COLOR: Record<ActividadTipo, string> = {
  estado_cambio:     'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  expediente_nuevo:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  tarea_completada:  'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  consulta_nueva:    'bg-amber-500/10 text-amber-600 dark:text-amber-300',
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function useActividadReciente() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['dashboard-actividad-reciente'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()

      // 1. Historial de estados
      const historialRes = await supabase
        .from('historial_estados_expediente')
        .select('id, expediente_id, estado_anterior, estado_nuevo, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(10)

      // Resolver carátulas del historial en una sola query
      const historialExpIds = [...new Set((historialRes.data ?? []).map(h => h.expediente_id))]

      const [expCaratulasRes, expNuevosRes, tareasRes, consultasRes] = await Promise.all([
        historialExpIds.length > 0
          ? supabase
              .from('expedientes')
              .select('id, numero, caratula')
              .in('id', historialExpIds)
          : Promise.resolve({ data: [] as Array<{ id: string; numero: string | null; caratula: string | null }> }),

        supabase
          .from('expedientes')
          .select('id, numero, caratula, created_at')
          .is('deleted_at', null)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('tareas')
          .select('id, titulo, updated_at, expediente_id')
          .in('estado', ['COMPLETADA', 'completada'])
          .gte('updated_at', cutoff)
          .order('updated_at', { ascending: false })
          .limit(5),

        // consultas — not yet in database.types.ts
        (supabase as any)
          .from('consultas')
          .select('id, nombre, apellido, tipo_asunto, created_at')
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const expById = new Map(
        (expCaratulasRes.data ?? []).map(e => [e.id, e])
      )

      const items: ActividadItem[] = []

      for (const h of historialRes.data ?? []) {
        const exp = expById.get(h.expediente_id)
        const caratula = exp?.caratula ?? exp?.numero ?? 'Expediente'
        items.push({
          id: `estado-${h.id}`,
          tipo: 'estado_cambio',
          descripcion: `${estadoLabel(h.estado_anterior)} → ${estadoLabel(h.estado_nuevo)}`,
          expediente_id: h.expediente_id,
          expediente_caratula: caratula,
          fecha: h.created_at,
        })
      }

      for (const e of expNuevosRes.data ?? []) {
        items.push({
          id: `exp-${e.id}`,
          tipo: 'expediente_nuevo',
          descripcion: 'Nuevo expediente iniciado',
          expediente_id: e.id,
          expediente_caratula: e.caratula ?? e.numero ?? undefined,
          fecha: e.created_at,
        })
      }

      for (const t of tareasRes.data ?? []) {
        items.push({
          id: `tarea-${t.id}`,
          tipo: 'tarea_completada',
          descripcion: t.titulo,
          expediente_id: t.expediente_id ?? undefined,
          fecha: t.updated_at,
        })
      }

      for (const c of consultasRes.data ?? []) {
        const nombre = [c.apellido, c.nombre].filter(Boolean).join(', ') || 'Consulta'
        items.push({
          id: `consulta-${c.id}`,
          tipo: 'consulta_nueva',
          descripcion: nombre,
          expediente_id: undefined,
          fecha: c.created_at,
        })
      }

      items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      return items.slice(0, 12)
    },
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ActividadRow({ item }: { item: ActividadItem }) {
  const Icon = TIPO_ICON[item.tipo]
  const color = TIPO_COLOR[item.tipo]

  const inner = (
    <div className="group flex items-start gap-3 rounded-xl border border-[rgb(87_124_142_/_10%)] bg-white/65 px-3.5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:border-white/6 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-100 line-clamp-1">
          {item.descripcion}
        </p>
        {item.expediente_caratula && (
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            {item.expediente_caratula}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
          {timeAgo(item.fecha)}
        </p>
      </div>
      {item.expediente_id && (
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-[var(--brand-accent)] dark:group-hover:text-[var(--brand-ice)] transition-colors" />
      )}
    </div>
  )

  if (item.expediente_id) {
    return (
      <Link to={`/expedientes/${item.expediente_id}`}>
        {inner}
      </Link>
    )
  }
  return <div>{inner}</div>
}

export function ActividadRecienteDashboardPanel() {
  const { data: items = [], isLoading } = useActividadReciente()

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">última semana</p>
          <div className="mt-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Actividad reciente</h3>
            {items.length > 0 && (
              <span className="dashboard-chip dashboard-chip-accent">{items.length}</span>
            )}
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">7d</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="dashboard-stat-orb mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Activity className="h-6 w-6" />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin actividad registrada esta semana.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {items.map(item => (
            <ActividadRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
