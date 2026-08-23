import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamMembers } from '@/hooks/use-team-members'
import {
  useWorkloadTareas,
  useWorkloadConsultas,
  useWorkloadMiembros,
  useReasignarTarea,
  useReasignarConsulta,
  useReasignarExpedienteMiembro,
} from '@/hooks/use-workload'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'
import {
  Loader2, ExternalLink, ChevronDown, ChevronRight,
  Briefcase, ClipboardList, FolderOpen, UserCog,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORIDAD: Record<string, { label: string; dot: string; text: string }> = {
  BAJA:    { label: 'Baja',    dot: 'bg-zinc-300 dark:bg-zinc-500',         text: 'text-zinc-500' },
  MEDIA:   { label: 'Media',   dot: 'bg-blue-400',                          text: 'text-blue-600 dark:text-blue-400' },
  ALTA:    { label: 'Alta',    dot: 'bg-amber-400',                         text: 'text-amber-600 dark:text-amber-400' },
  URGENTE: { label: 'Urgente', dot: 'bg-red-500',                           text: 'text-red-600 dark:text-red-400' },
}

const ESTADO_TAREA: Record<string, { label: string; color: string }> = {
  PENDIENTE:   { label: 'Pendiente',   color: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' },
  EN_PROGRESO: { label: 'En progreso', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
}

const ESTADO_CONSULTA: Record<string, string> = {
  pendiente:      'Pendiente',
  en_proceso:     'En proceso',
  presupuestada:  'Presupuestada',
}

const TIPO_ASUNTO: Record<string, string> = {
  laboral_trabajador: 'Laboral (trabajador)',
  laboral_empleador:  'Laboral (empleador)',
  civil:              'Civil',
  familia:            'Familia',
  previsional:        'Previsional',
  penal:              'Penal',
  otro:               'Otro',
}

function vencimientoColor(fecha: string | null): string {
  if (!fecha) return 'text-zinc-400'
  const diff = (new Date(fecha).getTime() - Date.now()) / 86_400_000
  if (diff < 0)  return 'text-red-600 dark:text-red-400 font-semibold'
  if (diff <= 3) return 'text-amber-600 dark:text-amber-400 font-medium'
  return 'text-zinc-600 dark:text-zinc-400'
}

// ---------------------------------------------------------------------------
// Inline Reasignar select
// ---------------------------------------------------------------------------

function ReasignarSelect({
  currentId,
  team,
  isPending,
  onChange,
}: {
  currentId: string
  team: { id: string; nombre: string | null; apellido: string | null; rol: string }[]
  isPending: boolean
  onChange: (newId: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {isPending && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
      <select
        value={currentId}
        disabled={isPending}
        onChange={(e) => {
          if (e.target.value !== currentId) onChange(e.target.value)
        }}
        className="text-xs rounded border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
      >
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.apellido} {m.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  count,
  isLoading,
  empty,
  children,
}: {
  icon: typeof Briefcase
  title: string
  count: number
  isLoading: boolean
  empty: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/8 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/3 transition-colors"
      >
        <Icon className="h-4 w-4 text-zinc-400 shrink-0" />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex-1">{title}</span>
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
        ) : (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            {count}
          </span>
        )}
        {open
          ? <ChevronDown className="h-4 w-4 text-zinc-400" />
          : <ChevronRight className="h-4 w-4 text-zinc-400" />
        }
      </button>

      {open && (
        <div className="border-t border-zinc-100 dark:border-white/5">
          {isLoading ? (
            <div className="px-5 py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : count === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-400 italic text-center">{empty}</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MiTrabajoPage() {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'

  const { data: team = [] } = useTeamMembers()

  const [selectedId, setSelectedId] = useState<string>(profile?.id ?? '')

  // Sincronizar cuando carga el profile
  useEffect(() => {
    if (profile?.id && !selectedId) setSelectedId(profile.id)
  }, [profile?.id, selectedId])

  const selectedMember = team.find((m) => m.id === selectedId)
  const isViewingSelf = selectedId === profile?.id

  const { data: tareas = [], isLoading: loadingTareas } = useWorkloadTareas(selectedId)
  const { data: consultas = [], isLoading: loadingConsultas } = useWorkloadConsultas(selectedId)
  const { data: miembros = [], isLoading: loadingMiembros } = useWorkloadMiembros(selectedId)

  const reasignarTarea = useReasignarTarea()
  const reasignarConsulta = useReasignarConsulta()
  const reasignarMiembro = useReasignarExpedienteMiembro()

  const total = tareas.length + consultas.length + miembros.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {isViewingSelf
              ? 'Mi trabajo'
              : `Trabajo de ${selectedMember?.apellido ?? ''} ${selectedMember?.nombre ?? ''}`
            }
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {total} {total === 1 ? 'ítem activo' : 'ítems activos'}
            {!isViewingSelf && ' — vista de administrador'}
          </p>
        </div>

        {/* Admin: selector de responsable */}
        {isAdmin && team.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <UserCog className="h-4 w-4 text-zinc-400" />
            <label className="text-xs text-zinc-500 whitespace-nowrap">Ver como:</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
            >
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.apellido} {m.nombre}{m.id === profile?.id ? ' (yo)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tareas */}
      <Section
        icon={Briefcase}
        title="Tareas pendientes"
        count={tareas.length}
        isLoading={loadingTareas}
        empty="Sin tareas pendientes asignadas."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-white/5 text-xs text-zinc-400 uppercase tracking-wide">
                <th className="px-5 py-2.5 text-left font-medium">Tarea</th>
                <th className="px-3 py-2.5 text-left font-medium">Expediente / Consulta</th>
                <th className="px-3 py-2.5 text-left font-medium">Prioridad</th>
                <th className="px-3 py-2.5 text-left font-medium">Vencimiento</th>
                <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                {isAdmin && <th className="px-3 py-2.5 text-left font-medium">Responsable</th>}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-white/3">
              {tareas.map((t) => {
                const prio = PRIORIDAD[t.prioridad] ?? PRIORIDAD.MEDIA
                const est = ESTADO_TAREA[t.estado] ?? { label: t.estado, color: '' }
                const expLabel = t.expediente?.caratula ?? t.expediente?.numero ?? null
                const consultaLabel = t.consulta ? `${t.consulta.apellido ?? ''} ${t.consulta.nombre}`.trim() : null
                const contextLabel = expLabel ?? consultaLabel

                return (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3 max-w-[220px]">
                      <span className="block font-medium text-zinc-800 dark:text-zinc-200 truncate" title={t.titulo}>
                        {t.titulo}
                      </span>
                      {t.descripcion && (
                        <span className="block text-xs text-zinc-400 truncate mt-0.5" title={t.descripcion}>
                          {t.descripcion}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[180px]">
                      {contextLabel ? (
                        t.expediente ? (
                          <Link
                            to={`/expedientes/${t.expediente.id}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline truncate block text-xs"
                            title={contextLabel}
                          >
                            {contextLabel}
                          </Link>
                        ) : t.consulta ? (
                          <Link
                            to={`/consultas/${t.consulta.id}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline truncate block text-xs"
                            title={contextLabel}
                          >
                            {contextLabel}
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-400 truncate block">{contextLabel}</span>
                        )
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('flex items-center gap-1.5 text-xs', prio.text)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', prio.dot)} />
                        {prio.label}
                      </span>
                    </td>
                    <td className={cn('px-3 py-3 text-xs whitespace-nowrap', vencimientoColor(t.fecha_vencimiento))}>
                      {t.fecha_vencimiento ? formatDate(t.fecha_vencimiento) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', est.color)}>
                        {est.label}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3">
                        <ReasignarSelect
                          currentId={t.asignado_a}
                          team={team}
                          isPending={reasignarTarea.isPending && reasignarTarea.variables?.tareaId === t.id}
                          onChange={(newId) => reasignarTarea.mutate({ tareaId: t.id, newProfileId: newId })}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <Link
                        to={t.expediente ? `/expedientes/${t.expediente.id}` : t.consulta ? `/consultas/${t.consulta.id}` : '/tareas'}
                        title="Abrir"
                        className="p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors inline-flex"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Consultas */}
      <Section
        icon={ClipboardList}
        title="Consultas asignadas"
        count={consultas.length}
        isLoading={loadingConsultas}
        empty="Sin consultas asignadas."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-white/5 text-xs text-zinc-400 uppercase tracking-wide">
                <th className="px-5 py-2.5 text-left font-medium">Cliente</th>
                <th className="px-3 py-2.5 text-left font-medium">Tipo de asunto</th>
                <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                <th className="px-3 py-2.5 text-left font-medium">Ingreso</th>
                {isAdmin && <th className="px-3 py-2.5 text-left font-medium">Responsable</th>}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-white/3">
              {consultas.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {TIPO_ASUNTO[c.tipo_asunto] ?? c.tipo_asunto}
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 capitalize">
                      {ESTADO_CONSULTA[c.estado] ?? c.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">
                    {formatDate(c.created_at)}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <ReasignarSelect
                        currentId={c.assigned_to ?? ''}
                        team={team}
                        isPending={reasignarConsulta.isPending && reasignarConsulta.variables?.consultaId === c.id}
                        onChange={(newId) => reasignarConsulta.mutate({ consultaId: c.id, newProfileId: newId })}
                      />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <Link
                      to={`/consultas/${c.id}`}
                      title="Abrir consulta"
                      className="p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors inline-flex"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Expedientes como miembro */}
      <Section
        icon={FolderOpen}
        title="Expedientes como miembro"
        count={miembros.length}
        isLoading={loadingMiembros}
        empty="Sin expedientes asignados como miembro."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-white/5 text-xs text-zinc-400 uppercase tracking-wide">
                <th className="px-5 py-2.5 text-left font-medium">N° / Carátula</th>
                <th className="px-3 py-2.5 text-left font-medium">Fuero</th>
                <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                <th className="px-3 py-2.5 text-left font-medium">Rol en causa</th>
                {isAdmin && <th className="px-3 py-2.5 text-left font-medium">Reasignar a</th>}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-white/3">
              {miembros.map((m) => {
                if (!m.expediente) return null
                const exp = m.expediente

                return (
                  <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3 max-w-[240px]">
                      {exp.numero && (
                        <span className="block text-xs text-zinc-400 mb-0.5">{exp.numero}</span>
                      )}
                      <span className="block font-medium text-zinc-800 dark:text-zinc-200 truncate" title={exp.caratula ?? undefined}>
                        {exp.caratula ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500 capitalize">
                      {exp.fuero ?? '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 capitalize">
                        {exp.estado_interno?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                        m.rol === 'abogado'
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                          : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                      )}>
                        {m.rol}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3">
                        <ReasignarSelect
                          currentId={selectedId}
                          team={team}
                          isPending={reasignarMiembro.isPending && reasignarMiembro.variables?.miembroId === m.id}
                          onChange={(newId) =>
                            reasignarMiembro.mutate({
                              miembroId: m.id,
                              expedienteId: exp.id,
                              newProfileId: newId,
                              rol: m.rol,
                            })
                          }
                        />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <Link
                        to={`/expedientes/${exp.id}`}
                        title="Abrir expediente"
                        className="p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors inline-flex"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
