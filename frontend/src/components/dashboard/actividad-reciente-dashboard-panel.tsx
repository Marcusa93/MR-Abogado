import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, FolderOpen, CheckSquare, GitBranch, Users, FileText, ArrowRight, Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils/date-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActividadTipo = 'estado_cambio' | 'expediente_nuevo' | 'tarea_completada' | 'consulta_cambio' | 'actuacion_sae' | 'escrito_generado'

interface ActividadItem {
  id: string
  tipo: ActividadTipo
  descripcion: string
  subtitulo?: string
  expediente_id?: string
  link?: string
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
  estado_cambio:    GitBranch,
  expediente_nuevo: FolderOpen,
  tarea_completada: CheckSquare,
  consulta_cambio:  Users,
  actuacion_sae:    Radio,
  escrito_generado: FileText,
}

const TIPO_COLOR: Record<ActividadTipo, string> = {
  estado_cambio:    'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  expediente_nuevo: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  tarea_completada: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  consulta_cambio:  'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  actuacion_sae:    'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  escrito_generado: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function useActividadReciente() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['dashboard-actividad-reciente'],
    queryFn: async () => {
      const cutoff72h = new Date(Date.now() - 72 * 3600000).toISOString()
      const cutoff7d  = new Date(Date.now() - 7 * 86400000).toISOString()

      const [historialRes, tareasRes, saeRes, escritosRes, consultasRes] = await Promise.all([
        // 1. Historial de estados de expediente (últimos 7d)
        supabase
          .from('historial_estados_expediente')
          .select('id, expediente_id, estado_anterior, estado_nuevo, created_at')
          .gte('created_at', cutoff7d)
          .order('created_at', { ascending: false })
          .limit(10),

        // 2. Tareas completadas (últimos 7d)
        (supabase as any)
          .from('tareas')
          .select('id, titulo, updated_at, expediente_id, expedientes:expediente_id(caratula), assigned_profile:assigned_to(nombre, apellido)')
          .in('estado', ['COMPLETADA', 'completada'])
          .gte('updated_at', cutoff7d)
          .order('updated_at', { ascending: false })
          .limit(20),

        // 3. Actuaciones SAE clave (últimas 72h)
        (supabase as any)
          .from('sae_movements')
          .select('id, descripcion, fecha_movimiento, expediente_id, expedientes:expediente_id(caratula)')
          .eq('is_key', true)
          .gte('fecha_movimiento', cutoff72h)
          .order('fecha_movimiento', { ascending: false })
          .limit(10),

        // 4. Escritos generados (últimas 72h)
        (supabase as any)
          .from('escritos')
          .select('id, titulo, created_at, expediente_id, expedientes:expediente_id(caratula), perfil:user_id(nombre, apellido)')
          .gte('created_at', cutoff72h)
          .order('created_at', { ascending: false })
          .limit(10),

        // 5. Consultas que cambiaron de estado (últimas 72h)
        (supabase as any)
          .from('consultas')
          .select('id, nombre, apellido, estado, estado_changed_at')
          .gte('estado_changed_at', cutoff72h)
          .order('estado_changed_at', { ascending: false })
          .limit(10),
      ])

      // Resolver carátulas del historial
      const historialExpIds = [...new Set((historialRes.data ?? []).map((h: any) => h.expediente_id as string))]
      const expCaratulasRes = historialExpIds.length > 0
        ? await supabase.from('expedientes').select('id, caratula').in('id', historialExpIds)
        : { data: [] as Array<{ id: string; caratula: string | null }> }
      const expById = new Map((expCaratulasRes.data ?? []).map(e => [e.id, e]))

      const items: ActividadItem[] = []

      // Historial estados
      for (const h of historialRes.data ?? []) {
        const exp = expById.get(h.expediente_id)
        items.push({
          id: `estado-${h.id}`,
          tipo: 'estado_cambio',
          descripcion: `${estadoLabel(h.estado_anterior)} → ${estadoLabel(h.estado_nuevo)}`,
          subtitulo: exp?.caratula ?? undefined,
          expediente_id: h.expediente_id,
          fecha: h.created_at,
        })
      }

      // Tareas completadas
      for (const t of tareasRes.data ?? []) {
        const autor = t.assigned_profile
          ? [t.assigned_profile.apellido, t.assigned_profile.nombre].filter(Boolean).join(', ')
          : undefined
        items.push({
          id: `tarea-${t.id}`,
          tipo: 'tarea_completada',
          descripcion: t.titulo,
          subtitulo: t.expedientes?.caratula ?? (autor ? `por ${autor}` : undefined),
          expediente_id: t.expediente_id ?? undefined,
          fecha: t.updated_at,
        })
      }

      // Actuaciones SAE
      for (const s of saeRes.data ?? []) {
        items.push({
          id: `sae-${s.id}`,
          tipo: 'actuacion_sae',
          descripcion: s.descripcion ?? 'Actuación SAE',
          subtitulo: s.expedientes?.caratula ?? undefined,
          expediente_id: s.expediente_id ?? undefined,
          fecha: s.fecha_movimiento,
        })
      }

      // Escritos
      for (const e of escritosRes.data ?? []) {
        const autor = e.perfil
          ? [e.perfil.apellido, e.perfil.nombre].filter(Boolean).join(', ')
          : undefined
        items.push({
          id: `escrito-${e.id}`,
          tipo: 'escrito_generado',
          descripcion: e.titulo ?? 'Escrito generado',
          subtitulo: e.expedientes?.caratula ?? (autor ? `por ${autor}` : undefined),
          expediente_id: e.expediente_id ?? undefined,
          fecha: e.created_at,
        })
      }

      // Consultas con cambio de estado
      const ESTADO_CONSULTA: Record<string, string> = {
        pendiente: 'Pendiente', en_proceso: 'En proceso', presupuestada: 'Presupuestada',
        con_claudio: 'Con Claudio', requiere_info: 'Requiere info', redactando: 'Redactando',
        convertida: 'Expediente', resuelta: 'Resuelta', descartada: 'Descartada',
      }
      for (const c of consultasRes.data ?? []) {
        const nombre = [c.apellido, c.nombre].filter(Boolean).join(', ') || 'Consulta'
        items.push({
          id: `consulta-${c.id}`,
          tipo: 'consulta_cambio',
          descripcion: nombre,
          subtitulo: ESTADO_CONSULTA[c.estado] ?? c.estado,
          link: `/consultas/${c.id}`,
          fecha: c.estado_changed_at ?? c.created_at,
        })
      }

      items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      return items.slice(0, 30)
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
  const destino = item.link ?? (item.expediente_id ? `/expedientes/${item.expediente_id}` : undefined)

  const inner = (
    <div className="group flex items-start gap-3 rounded-xl border border-[rgb(87_124_142_/_10%)] bg-white/65 px-3.5 py-3 transition-colors hover:bg-[rgb(87_124_142_/_7%)] dark:border-white/6 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-100 line-clamp-1">
          {item.descripcion}
        </p>
        {item.subtitulo && (
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            {item.subtitulo}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
          {timeAgo(item.fecha)}
        </p>
      </div>
      {destino && (
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-[var(--brand-accent)] dark:group-hover:text-[var(--brand-ice)] transition-colors" />
      )}
    </div>
  )

  if (destino) {
    return <Link to={destino}>{inner}</Link>
  }
  return <div>{inner}</div>
}

export function ActividadRecienteDashboardPanel() {
  const { data: items = [], isLoading } = useActividadReciente()

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">últimas 72hs</p>
          <div className="mt-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Actividad del equipo</h3>
            {items.length > 0 && (
              <span className="dashboard-chip dashboard-chip-accent">{items.length}</span>
            )}
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">72h</span>
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin actividad reciente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {items.map(item => (
            <ActividadRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
