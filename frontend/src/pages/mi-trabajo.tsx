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
  useActualizarEstadoTarea,
  useTeamWorkloadSummary,
  type MemberSummary,
} from '@/hooks/use-workload'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'
import {
  Loader2, ExternalLink, ChevronDown, ChevronRight,
  Briefcase, ClipboardList, FolderOpen, UserCog, Users,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORIDAD: Record<string, { label: string; dot: string; text: string }> = {
  BAJA:    { label: 'Baja',    dot: 'bg-zinc-300 dark:bg-zinc-500',         text: 'text-zinc-500' },
  MEDIA:   { label: 'Media',   dot: 'bg-blue-400',                          text: 'text-blue-600 dark:text-blue-400' },
  ALTA:    { label: 'Alta',    dot: 'bg-amber-400',                         text: 'text-amber-600 dark:text-amber-400' },
  URGENTE: { label: 'Urgente', dot: 'bg-red-500',                           text: 'text-red-600 dark:text-red-400' },
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

const ESTADO_OPTIONS = [
  { value: 'PENDIENTE',   label: 'Pendiente' },
  { value: 'EN_PROGRESO', label: 'En progreso' },
  { value: 'COMPLETADA',  label: '✓ Completar' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vencimientoColor(fecha: string | null): string {
  if (!fecha) return 'text-zinc-400'
  const diff = (new Date(fecha).getTime() - Date.now()) / 86_400_000
  if (diff < 0)  return 'text-red-600 dark:text-red-400 font-semibold'
  if (diff <= 3) return 'text-amber-600 dark:text-amber-400 font-medium'
  return 'text-zinc-600 dark:text-zinc-400'
}

// ---------------------------------------------------------------------------
// EstadoTareaSelect
// ---------------------------------------------------------------------------

function EstadoTareaSelect({
  estado,
  isPending,
  onSelect,
}: {
  estado: string
  isPending: boolean
  onSelect: (estado: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {isPending && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
      <select
        value={estado}
        disabled={isPending}
        onChange={(e) => { if (e.target.value !== estado) onSelect(e.target.value) }}
        className={cn(
          'text-xs rounded border px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 cursor-pointer',
          estado === 'EN_PROGRESO'
            ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
        )}
      >
        {ESTADO_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReasignarSelect
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
        onChange={(e) => { if (e.target.value !== currentId) onChange(e.target.value) }}
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
// TeamMemberCard
// ---------------------------------------------------------------------------

type TeamMember = { id: string; nombre: string | null; apellido: string | null; rol: string }

function TeamMemberCard({
  member,
  summary,
  isLoading,
  onSelect,
}: {
  member: TeamMember
  summary: MemberSummary | undefined
  isLoading: boolean
  onSelect: () => void
}) {
  const initials = [(member.apellido?.[0] ?? ''), (member.nombre?.[0] ?? '')].join('').toUpperCase() || '?'
  const nombre = [member.apellido, member.nombre].filter(Boolean).join(', ')
  const hasVencidas = (summary?.tareasVencidas ?? 0) > 0
  const total = (summary?.tareas ?? 0) + (summary?.consultas ?? 0) + (summary?.miembros ?? 0)

  return (
    <div className={cn(
      'rounded-xl border bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3 transition-colors',
      hasVencidas ? 'border-red-200 dark:border-red-900/40' : 'border-zinc-200 dark:border-white/8'
    )}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-[var(--brand-navy)]/10 dark:bg-[var(--brand-accent)]/15 flex items-center justify-center text-sm font-bold text-[var(--brand-navy)] dark:text-[var(--brand-ice)] shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{nombre}</p>
          <p className="text-xs text-zinc-400 lowercase">{member.rol}</p>
        </div>
        {hasVencidas && (
          <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full shrink-0">
            {summary!.tareasVencidas} venc.
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={cn(
            'rounded-lg p-2',
            hasVencidas ? 'bg-red-50 dark:bg-red-900/10' : 'bg-zinc-50 dark:bg-zinc-800/50'
          )}>
            <p className={cn(
              'text-xl font-bold tabular-nums',
              hasVencidas ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200'
            )}>
              {summary.tareas}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Tareas</p>
          </div>
          <div className="rounded-lg p-2 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xl font-bold tabular-nums text-zinc-800 dark:text-zinc-200">{summary.consultas}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Consultas</p>
          </div>
          <div className="rounded-lg p-2 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xl font-bold tabular-nums text-zinc-800 dark:text-zinc-200">{summary.miembros}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Expedientes</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-zinc-400">{total} ítems activos</span>
        <button
          type="button"
          onClick={onSelect}
          className="text-xs px-3 py-1 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/3 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          Ver detalle →
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MiTrabajoPage() {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'

  const [tab, setTab] = useState<'personal' | 'equipo'>('personal')
  const { data: team = [] } = useTeamMembers()
  const [selectedId, setSelectedId] = useState<string>(profile?.id ?? '')

  useEffect(() => {
    if (profile?.id && !selectedId) setSelectedId(profile.id)
  }, [profile?.id, selectedId])

  const selectedMember = team.find((m) => m.id === selectedId)
  const isViewingSelf = selectedId === profile?.id

  const { data: tareas = [], isLoading: loadingTareas } = useWorkloadTareas(selectedId)
  const { data: consultas = [], isLoading: loadingConsultas } = useWorkloadConsultas(selectedId)
  const { data: miembros = [], isLoading: loadingMiembros } = useWorkloadMiembros(selectedId)

  const teamIds = isAdmin && tab === 'equipo' ? team.map(m => m.id) : []
  const { data: teamSummary = {}, isLoading: loadingTeamSummary } = useTeamWorkloadSummary(teamIds)

  const reasignarTarea = useReasignarTarea()
  const reasignarConsulta = useReasignarConsulta()
  const reasignarMiembro = useReasignarExpedienteMiembro()
  const actualizarEstado = useActualizarEstadoTarea()

  const total = tareas.length + consultas.length + miembros.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {tab === 'equipo'
              ? 'Panorama del equipo'
              : isViewingSelf
                ? 'Mi trabajo'
                : `Trabajo de ${selectedMember?.apellido ?? ''} ${selectedMember?.nombre ?? ''}`
            }
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {tab === 'equipo'
              ? `${team.length} integrantes`
              : `${total} ${total === 1 ? 'ítem activo' : 'ítems activos'}${!isViewingSelf ? ' — vista de administrador' : ''}`
            }
          </p>
        </div>

        {isAdmin && team.length > 1 && tab === 'personal' && (
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

      {/* Tabs (admin only) */}
      {isAdmin && (
        <div className="flex border-b border-zinc-200 dark:border-white/8 -mt-1">
          {(['personal', 'equipo'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              {t === 'personal'
                ? <Briefcase className="h-3.5 w-3.5" />
                : <Users className="h-3.5 w-3.5" />
              }
              {t === 'personal' ? 'Mi trabajo' : 'Equipo'}
            </button>
          ))}
        </div>
      )}

      {/* TAB: EQUIPO */}
      {tab === 'equipo' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {team.map((m) => (
            <TeamMemberCard
              key={m.id}
              member={m}
              summary={teamSummary[m.id]}
              isLoading={loadingTeamSummary}
              onSelect={() => {
                setSelectedId(m.id)
                setTab('personal')
              }}
            />
          ))}
        </div>
      )}

      {/* TAB: PERSONAL */}
      {tab === 'personal' && (
        <>
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
                          <EstadoTareaSelect
                            estado={t.estado}
                            isPending={actualizarEstado.isPending && actualizarEstado.variables?.tareaId === t.id}
                            onSelect={(estado) => actualizarEstado.mutate({ tareaId: t.id, estado })}
                          />
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
                          <div className="flex items-center gap-1">
                            {t.sae_movement_id && t.expediente?.id && (
                              <Link
                                to={`/expedientes/${t.expediente.id}?tab=actuaciones&mid=${t.sae_movement_id}`}
                                title="Ver actuación vinculada"
                                className="p-1 rounded text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors inline-flex"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            )}
                            {!t.sae_movement_id && (
                              <Link
                                to={t.expediente ? `/expedientes/${t.expediente.id}` : t.consulta ? `/consultas/${t.consulta.id}` : '/tareas'}
                                title="Abrir"
                                className="p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors inline-flex"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </div>
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
        </>
      )}
    </div>
  )
}
