import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CheckSquare, ClipboardList, AlertTriangle, Clock,
  FolderOpen, ArrowRight, Loader2, Inbox,
} from 'lucide-react'
import { useTareas } from '@/hooks/use-tareas'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import type { Consulta, ConsultaTipoAsunto } from '@/hooks/use-consultas'
import { TIPO_ASUNTO_LABEL } from '@/hooks/use-consultas'
import type { TareaWithRelations } from '@/hooks/use-tareas'
import { useWorkloadMiembros } from '@/hooks/use-workload'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatFechaVencimiento(fecha: string | null) {
  if (!fecha) return null
  const d = new Date(fecha + 'T00:00:00')
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - hoy.getTime()) / 86_400_000)
  if (diff < 0) return { label: `Vencida hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`, clase: 'text-rose-400' }
  if (diff === 0) return { label: 'Vence hoy', clase: 'text-amber-400 font-semibold' }
  if (diff === 1) return { label: 'Vence mañana', clase: 'text-amber-300' }
  return { label: `Vence en ${diff} días`, clase: 'text-zinc-400' }
}

const PRIORIDAD_COLORS: Record<string, string> = {
  URGENTE: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  ALTA: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  MEDIA: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
  BAJA: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
}

const CONSULTA_ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  presupuestada: 'Presupuestada',
}

// ---------------------------------------------------------------------------
// TareaCard
// ---------------------------------------------------------------------------

function TareaCard({ tarea }: { tarea: TareaWithRelations }) {
  const vto = formatFechaVencimiento(tarea.fecha_vencimiento)
  const expediente = tarea.expediente as any
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] transition-colors p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', PRIORIDAD_COLORS[tarea.prioridad ?? 'MEDIA'])}>
          {tarea.prioridad}
        </span>
        <p className="flex-1 text-sm font-medium text-zinc-100 leading-snug line-clamp-2">{tarea.titulo}</p>
      </div>
      {expediente?.id && (
        <Link
          to={`/expedientes/${expediente.id}`}
          className="flex items-center gap-1 text-[11px] text-amber-300/80 hover:text-amber-300 transition-colors max-w-full truncate"
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{expediente.caratula || expediente.numero}</span>
        </Link>
      )}
      <div className="flex items-center justify-between gap-2">
        {vto && (
          <span className={cn('text-[11px]', vto.clase)}>{vto.label}</span>
        )}
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded',
          tarea.estado === 'EN_PROGRESO' ? 'bg-blue-500/15 text-blue-300' : 'bg-zinc-500/10 text-zinc-400',
        )}>
          {tarea.estado === 'EN_PROGRESO' ? 'En progreso' : 'Pendiente'}
        </span>
      </div>
      {tarea.descripcion && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 italic">{tarea.descripcion}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConsultaCard
// ---------------------------------------------------------------------------

function ConsultaCard({ consulta }: { consulta: Consulta }) {
  return (
    <Link
      to={`/consultas/${consulta.id}`}
      className="block rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] transition-colors p-3 space-y-1"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-100 leading-snug">
          {consulta.apellido ? `${consulta.apellido}, ${consulta.nombre}` : consulta.nombre}
        </p>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500 mt-0.5" />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
          {TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto] ?? consulta.tipo_asunto}
        </span>
        <span className="text-[10px] text-zinc-400">
          {CONSULTA_ESTADO_LABELS[consulta.estado] ?? consulta.estado}
        </span>
        {!consulta.diagnostico_ia && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Sin dictamen</span>
        )}
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Hook: consultas asignadas a mí
// ---------------------------------------------------------------------------

function useMisConsultas(profileId: string | undefined) {
  const supabase = createClient()
  return useQuery<Consulta[]>({
    queryKey: ['mis-consultas', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('consultas')
        .select(`
          id, nombre, apellido, telefono, email, canal, tipo_asunto,
          estado, diagnostico_ia, diagnostico_at, created_at, assigned_to,
          assigned_profile:profiles!consultas_assigned_to_fkey(nombre, apellido)
        `)
        .eq('assigned_to', profileId)
        .not('estado', 'in', '(convertida,descartada)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Consulta[]
    },
  })
}

// ---------------------------------------------------------------------------
// ExpedienteCard
// ---------------------------------------------------------------------------

function ExpedienteCard({ miembro }: { miembro: { id: string; rol: string; expediente: { id: string; numero: string | null; caratula: string | null; fuero: string | null; estado_interno: string | null } | null } }) {
  const exp = miembro.expediente
  if (!exp) return null
  return (
    <Link
      to={`/expedientes/${exp.id}`}
      className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] transition-colors p-3"
    >
      <FolderOpen className="h-4 w-4 shrink-0 text-amber-400/70 mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        {exp.numero && (
          <p className="text-[10px] text-zinc-500">{exp.numero}</p>
        )}
        <p className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">
          {exp.caratula ?? '—'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {exp.fuero && (
            <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-[10px] text-zinc-400 capitalize">
              {exp.fuero}
            </span>
          )}
          {exp.estado_interno && (
            <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-[10px] text-zinc-400 capitalize">
              {exp.estado_interno.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium capitalize',
            miembro.rol === 'abogado'
              ? 'bg-indigo-500/15 text-indigo-300'
              : 'bg-zinc-500/10 text-zinc-400'
          )}>
            {miembro.rol}
          </span>
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 mt-0.5" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CriterioPage() {
  const { profile } = useAuth()
  const profileId = profile?.id

  const { data: tareasPaginadas, isLoading: loadingTareas } = useTareas({
    asignado_a: profileId,
    pageSize: 50,
    sortBy: 'fecha_vencimiento',
    sortOrder: 'asc',
  })

  const { data: consultas = [], isLoading: loadingConsultas } = useMisConsultas(profileId)
  const { data: miembros = [], isLoading: loadingMiembros } = useWorkloadMiembros(profileId)

  const tareas = (tareasPaginadas?.data ?? []).filter(
    (t) => t.estado !== 'COMPLETADA' && t.estado !== 'CANCELADA',
  )

  const urgentesYAltas = tareas.filter((t) => t.prioridad === 'URGENTE' || t.prioridad === 'ALTA')
  const otras = tareas.filter((t) => t.prioridad !== 'URGENTE' && t.prioridad !== 'ALTA')

  const hoy = new Date()
  const fechaHoy = hoy.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-5 pb-20 sm:pb-6 max-w-6xl mx-auto">
      <Breadcrumb items={[{ label: 'Tablero' }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {greeting()}, {profile?.nombre || 'Claudio'}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 capitalize">{fechaHoy}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
          <Link to="/tareas" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 hover:bg-white/10 transition-colors">
            <CheckSquare className="h-3.5 w-3.5" /> Todas las tareas
          </Link>
          <Link to="/consultas" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 hover:bg-white/10 transition-colors">
            <ClipboardList className="h-3.5 w-3.5" /> Consultas
          </Link>
          <Link to="/expedientes" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 hover:bg-white/10 transition-colors">
            <FolderOpen className="h-3.5 w-3.5" /> Expedientes
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-zinc-400 uppercase tracking-wider font-medium">Tareas activas</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-zinc-100">{tareas.length}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3 sm:p-4">
          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-rose-400 uppercase tracking-wider font-medium">
            <AlertTriangle className="h-3 w-3 shrink-0" /> Urgentes
          </div>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-rose-300">{urgentesYAltas.length}</p>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-violet-400 uppercase tracking-wider font-medium">Consultas</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-violet-300">{consultas.length}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-amber-400 uppercase tracking-wider font-medium">Expedientes</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-amber-300">{miembros.length}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Tareas — ocupa 3 de 5 columnas en desktop */}
        <div className="lg:col-span-3 space-y-4">

          {/* Urgentes + Altas */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Prioridad alta</h2>
              {urgentesYAltas.length > 0 && (
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                  {urgentesYAltas.length}
                </span>
              )}
            </div>
            {loadingTareas ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
            ) : urgentesYAltas.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-center text-xs text-zinc-500">
                Sin tareas urgentes o altas
              </div>
            ) : (
              <div className="space-y-2">
                {urgentesYAltas.map((t) => <TareaCard key={t.id} tarea={t} />)}
              </div>
            )}
          </div>

          {/* Otras tareas */}
          {otras.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Otras tareas</h2>
                <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                  {otras.length}
                </span>
              </div>
              <div className="space-y-2">
                {otras.map((t) => <TareaCard key={t.id} tarea={t} />)}
              </div>
            </div>
          )}

          {!loadingTareas && tareas.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-8 w-8 text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-400">No tenés tareas pendientes asignadas</p>
            </div>
          )}
        </div>

        {/* Consultas — 2 de 5 columnas en desktop */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Consultas asignadas</h2>
            {consultas.length > 0 && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                {consultas.length}
              </span>
            )}
          </div>
          {loadingConsultas ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
          ) : consultas.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-center text-xs text-zinc-500">
              Sin consultas asignadas
            </div>
          ) : (
            <div className="space-y-2">
              {consultas.map((c) => <ConsultaCard key={c.id} consulta={c} />)}
            </div>
          )}

          {/* Sin dictamen — atención especial */}
          {consultas.some(c => !c.diagnostico_ia) && (
            <p className="text-[10px] text-amber-300/70 text-center">
              Las marcadas "Sin dictamen" aún no tienen análisis de IA
            </p>
          )}
        </div>
      </div>

      {/* Expedientes asignados como miembro */}
      {(loadingMiembros || miembros.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Expedientes asignados</h2>
            {miembros.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {miembros.length}
              </span>
            )}
          </div>
          {loadingMiembros ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {miembros.map((m) => (
                <ExpedienteCard key={m.id} miembro={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
