import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CheckSquare, ClipboardList, AlertTriangle,
  FolderOpen, ArrowRight, Loader2,
} from 'lucide-react'
import { useTareas } from '@/hooks/use-tareas'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { PageHeader } from '@/components/shared/page-header'
import type { Consulta, ConsultaTipoAsunto } from '@/hooks/use-consultas'
import { TIPO_ASUNTO_LABEL } from '@/hooks/use-consultas'
import { useWorkloadMiembros } from '@/hooks/use-workload'
import { TareasAsignadasPanel } from '@/components/dashboard/tareas-asignadas-panel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const CONSULTA_ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  presupuestada: 'Presupuestada',
}

// ---------------------------------------------------------------------------
// ConsultaCard
// ---------------------------------------------------------------------------

function ConsultaCard({ consulta }: { consulta: Consulta }) {
  return (
    <Link
      to={`/consultas/${consulta.id}`}
      className="app-card block space-y-1.5 p-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-bold leading-snug tracking-tight text-zinc-900 dark:text-white">
          {consulta.apellido ? `${consulta.apellido}, ${consulta.nombre}` : consulta.nombre}
        </p>
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
          {TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto] ?? consulta.tipo_asunto}
        </span>
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          {CONSULTA_ESTADO_LABELS[consulta.estado] ?? consulta.estado}
        </span>
        {!consulta.diagnostico_ia && (
          <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">Sin dictamen</span>
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
      className="app-card flex items-start gap-3 p-3.5"
    >
      <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" />
      <div className="min-w-0 flex-1 space-y-1">
        {exp.numero && (
          <p className="text-[11px] font-semibold tabular-nums text-zinc-500">{exp.numero}</p>
        )}
        <p className="line-clamp-2 text-[14px] font-bold leading-snug tracking-tight text-zinc-900 dark:text-white">
          {exp.caratula ?? '—'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {exp.fuero && (
            <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-zinc-500/25 bg-zinc-500/10 capitalize text-zinc-600 dark:text-zinc-300">
              {exp.fuero}
            </span>
          )}
          {exp.estado_interno && (
            <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-zinc-500/25 bg-zinc-500/10 capitalize text-zinc-600 dark:text-zinc-300">
              {exp.estado_interno.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold capitalize',
            miembro.rol === 'abogado'
              ? 'border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300'
              : 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
          )}>
            {miembro.rol}
          </span>
        </div>
      </div>
      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CriterioPage() {
  const { profile } = useAuth()
  const profileId = profile?.id

  const { data: tareasPaginadas } = useTareas({
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

  const hoy = new Date()
  const fechaHoy = hoy.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-5 pb-20 sm:pb-6 max-w-6xl mx-auto">
      <Breadcrumb items={[{ label: 'Tablero' }]} />

      {/* Header */}
      <PageHeader
        title={<>{greeting()}, {profile?.nombre || 'Claudio'}</>}
        subtitle={<span className="capitalize">{fechaHoy}</span>}
        actions={
          <>
            <Link to="/tareas" className="btn btn-ghost btn-sm">
              <CheckSquare className="h-3.5 w-3.5" /> Todas las tareas
            </Link>
            <Link to="/consultas" className="btn btn-ghost btn-sm">
              <ClipboardList className="h-3.5 w-3.5" /> Consultas
            </Link>
            <Link to="/expedientes" className="btn btn-ghost btn-sm">
              <FolderOpen className="h-3.5 w-3.5" /> Expedientes
            </Link>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="app-card p-3.5 sm:p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Tareas activas</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white sm:text-3xl">{tareas.length}</p>
        </div>
        <div className="app-card !border-rose-500/30 p-3.5 sm:p-4">
          <div className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-3 w-3 shrink-0" /> Urgentes
          </div>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-rose-600 dark:text-rose-300 sm:text-3xl">{urgentesYAltas.length}</p>
        </div>
        <div className="app-card p-3.5 sm:p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Consultas</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white sm:text-3xl">{consultas.length}</p>
        </div>
        <div className="app-card p-3.5 sm:p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Expedientes</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white sm:text-3xl">{miembros.length}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Tareas — ocupa 3 de 5 columnas en desktop */}
        <div className="lg:col-span-3">
          {profileId && <TareasAsignadasPanel profileId={profileId} isSelf />}
        </div>

        {/* Consultas — 2 de 5 columnas en desktop */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--brand-accent)]" />
            <h2 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Consultas asignadas</h2>
            {consultas.length > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-zinc-500/25 bg-zinc-500/10 tabular-nums text-zinc-600 dark:text-zinc-300">
                {consultas.length}
              </span>
            )}
          </div>
          {loadingConsultas ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
          ) : consultas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-5 text-center text-xs text-zinc-500 dark:border-white/10">
              Sin consultas asignadas
            </div>
          ) : (
            <div className="space-y-2">
              {consultas.map((c) => <ConsultaCard key={c.id} consulta={c} />)}
            </div>
          )}

          {/* Sin dictamen — atención especial */}
          {consultas.some(c => !c.diagnostico_ia) && (
            <p className="text-center text-[11px] text-amber-700/80 dark:text-amber-300/70">
              Las marcadas "Sin dictamen" aún no tienen análisis de IA
            </p>
          )}
        </div>
      </div>

      {/* Expedientes asignados como miembro */}
      {(loadingMiembros || miembros.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[var(--brand-accent)]" />
            <h2 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Expedientes asignados</h2>
            {miembros.length > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-zinc-500/25 bg-zinc-500/10 tabular-nums text-zinc-600 dark:text-zinc-300">
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
