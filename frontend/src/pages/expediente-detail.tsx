import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { DetailSkeleton } from '@/components/shared/loading-skeleton'
import { TimelineExpediente } from '@/components/expedientes/timeline-expediente'
import { Card } from '@/components/expedientes/detail-helpers'
import { CambiarEstadoDialog } from '@/components/expedientes/cambiar-estado-dialog'
import { EditarExpedienteDialog } from '@/components/expedientes/editar-expediente-dialog'
import { CrearSeguimientoDialog } from '@/components/expedientes/crear-seguimiento-dialog'
import { CrearTurnoDialog } from '@/components/expedientes/crear-turno-dialog'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { TabGeneral } from '@/components/expedientes/tab-general'
import { TabTurnos } from '@/components/expedientes/tab-turnos'
import { TabTareas } from '@/components/expedientes/tab-tareas'
import { TabDocumentos } from '@/components/expedientes/tab-documentos'
import { TabActuaciones } from '@/components/expedientes/tab-actuaciones'
import { TabActuacionesClaves } from '@/components/expedientes/tab-actuaciones-claves'
import { TabEscritos } from '@/components/expedientes/tab-escritos'
import { TabNormativa } from '@/components/expedientes/tab-normativa'
import { TabJurisprudencia } from '@/components/expedientes/tab-jurisprudencia'
import { TabVisionIa } from '@/components/expedientes/tab-vision-ia'
import { DescargarExpedienteDialog } from '@/components/expedientes/descargar-expediente-dialog'
import ComentariosPanel from '@/components/expedientes/comentarios-panel'
import { ExpedienteSimilaresPanel } from '@/components/expedientes/expediente-similares-panel'
import { ExpedienteBriefPanel } from '@/components/expedientes/expediente-brief-panel'
import { TabCaja } from '@/components/expedientes/tab-caja'
import { useTieneAccesoCaja } from '@/hooks/use-caja'
import { useExpediente, useExpedienteTimeline, useDeleteExpediente } from '@/hooks/use-expedientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import type { Tables } from '@/types/database.types'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { WhatsAppButtons } from '@/components/shared/whatsapp-button'
import type { WhatsAppContext } from '@/components/shared/whatsapp-button'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Edit,
  Trash2,
  FileText,
  CalendarClock,
  CheckSquare,
  Paperclip,
  Clock,
  Loader2,
  AlertCircle,
  User,
  Timer,
  ListTodo,
  Plus,
  X,
  Download,
  MessageSquareText,
  Database,
  Star,
  PenLine,
  BookMarked,
  Gavel,
  Sparkles,
  Wallet,
  MoreHorizontal,
} from 'lucide-react'
import { exportTramitePDF } from '@/lib/utils/export-tramite-pdf'

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'datos', label: 'Datos', icon: FileText, activeClasses: 'border-amber-400 text-amber-400', badgeClasses: 'bg-amber-500/15 text-amber-400' },
  { id: 'actuaciones', label: 'SAE', icon: Database, activeClasses: 'border-cyan-400 text-cyan-400', badgeClasses: 'bg-cyan-500/15 text-cyan-400' },
  { id: 'tareas', label: 'Tareas', icon: CheckSquare, activeClasses: 'border-emerald-400 text-emerald-400', badgeClasses: 'bg-emerald-500/15 text-emerald-400' },
  { id: 'audiencias', label: 'Audiencias', icon: CalendarClock, activeClasses: 'border-amber-400 text-amber-400', badgeClasses: 'bg-amber-500/15 text-amber-400' },
  { id: 'claves', label: 'Actuaciones claves', icon: Star, activeClasses: 'border-violet-400 text-violet-400', badgeClasses: 'bg-violet-500/15 text-violet-400' },
  { id: 'documentos', label: 'Documentos', icon: Paperclip, activeClasses: 'border-sky-400 text-sky-400', badgeClasses: 'bg-sky-500/15 text-sky-400' },
  { id: 'escritos', label: 'Escritos', icon: PenLine, activeClasses: 'border-rose-400 text-rose-400', badgeClasses: 'bg-rose-500/15 text-rose-400' },
  { id: 'normativa', label: 'Normativa', icon: BookMarked, activeClasses: 'border-cyan-400 text-cyan-400', badgeClasses: 'bg-cyan-500/15 text-cyan-400' },
  { id: 'jurisprudencia', label: 'Jurisprudencia', icon: Gavel, activeClasses: 'border-violet-400 text-violet-400', badgeClasses: 'bg-violet-500/15 text-violet-400' },
  { id: 'vision-ia', label: 'Visión IA', icon: Sparkles, activeClasses: 'border-violet-400 text-violet-400', badgeClasses: 'bg-violet-500/15 text-violet-400' },
  { id: 'notas', label: 'Notas', icon: MessageSquareText, activeClasses: 'border-pink-400 text-pink-400', badgeClasses: 'bg-pink-500/15 text-pink-400' },
  { id: 'caja', label: 'Caja', icon: Wallet, activeClasses: 'border-emerald-400 text-emerald-400', badgeClasses: 'bg-emerald-500/15 text-emerald-400' },
  { id: 'timeline', label: 'Timeline', icon: Clock, activeClasses: 'border-amber-400 text-amber-400', badgeClasses: 'bg-amber-500/15 text-amber-400' },
] as const

type TabId = (typeof TABS)[number]['id']

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExpedienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  const { data: tieneAccesoCaja } = useTieneAccesoCaja()
  const visibleTabs = TABS.filter((t) => t.id !== 'caja' || tieneAccesoCaja)

  const { data: expediente, isLoading, isError } = useExpediente(id!)
  const { data: timeline, isLoading: timelineLoading } = useExpedienteTimeline(id!)
  const deleteExpediente = useDeleteExpediente()

  const [activeTab, setActiveTab] = useState<TabId>('datos')
  const [estadoDialogOpen, setEstadoDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [moreActionsOpen, setMoreActionsOpen] = useState(false)
  const [seguimientoDialogOpen, setSeguimientoDialogOpen] = useState(false)
  const [turnoDialogOpen, setTurnoDialogOpen] = useState(false)
  const [tareaDialogOpen, setTareaDialogOpen] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [descargarExpedienteOpen, setDescargarExpedienteOpen] = useState(false)

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Expedientes', href: '/expedientes' },
          { label: 'Cargando...' },
        ]} />
        <DetailSkeleton />
      </div>
    )
  }

  // ---- Error state ----
  if (isError || !expediente) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Expedientes', href: '/expedientes' },
          { label: 'Error' },
        ]} />
        <EmptyState
          icon={AlertCircle}
          title="Expediente no encontrado"
          description="El expediente que buscas no existe o no tienes permisos para verlo."
          actionLabel="Volver a expedientes"
          onAction={() => navigate('/expedientes')}
        />
      </div>
    )
  }

  // ---- Derived data ----
  const seguimientos = (expediente.seguimientos ?? []) as Tables<'seguimientos'>[]
  const audiencias = (expediente.audiencias ?? []) as Tables<'audiencias'>[]
  const tareas = (expediente.tareas ?? []) as (Tables<'tareas'> & {
    asignado: Tables<'profiles'> | null
  })[]

  // Find the primary responsible (first member with rol='abogado')
  const miembros = (expediente.miembros ?? []) as any[]
  const responsable = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null

  return (
    <div className="space-y-6 animate-fade-in pb-24 sm:pb-6">
      {/* Breadcrumb + Header */}
      <div>
        <div className="mb-3">
          <Breadcrumb items={[
            { label: 'Expedientes', href: '/expedientes' },
            { label: expediente.caratula || (expediente as any).numero || 'Detalle' },
          ]} />
        </div>

        <div className="flex flex-col gap-3">
          {/* Línea 1: carátula + badges */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-50 break-words line-clamp-2 leading-snug">
                {expediente.caratula || (expediente as any).numero}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                <span className="text-zinc-500 dark:text-zinc-400 font-mono">{(expediente as any).numero}</span>
                {(expediente as any).numero_sae && (
                  <span className="text-amber-600 dark:text-amber-400 font-mono font-semibold">
                    SAE · {(expediente as any).numero_sae}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <EstadoBadge estado={expediente.estado_interno} />
                <PrioridadBadge prioridad={expediente.prioridad} />
                {(expediente as any).estado_organismo && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                    title={`Estado actual en el juzgado según SAE${(expediente as any).estado_organismo_desde ? ` · desde el ${new Date((expediente as any).estado_organismo_desde).toLocaleDateString('es-AR')}` : ''}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {(expediente as any).estado_organismo}
                    {(expediente as any).estado_organismo_desde && (
                      <span className="font-normal opacity-80">
                        · desde {new Date((expediente as any).estado_organismo_desde).toLocaleDateString('es-AR')}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-shrink-0">
              {(expediente.clientes as any)?.telefono && (
                <WhatsAppButtons
                  telefono={(expediente.clientes as any).telefono}
                  telefonoAlt={(expediente.clientes as any).telefono_alternativo}
                  clienteNombre={`${(expediente.clientes as any).nombre} ${(expediente.clientes as any).apellido}`}
                  context={{
                    tipo: expediente.estado_interno === 'FINALIZADO' ? 'resolucion' : 'seguimiento',
                    tipoTramite: (expediente.tipos_tramite as any)?.nombre,
                    estado: expediente.estado_interno.replace(/_/g, ' ').toLowerCase(),
                  } as WhatsAppContext}
                  variant="badge"
                />
              )}
              {/* CTAs principales — siempre visibles */}
              <button
                onClick={() => setEstadoDialogOpen(true)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Estado</span>
                <span className="sm:hidden text-xs">Estado</span>
              </button>
              <button
                onClick={() => setEditDialogOpen(true)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
              >
                <Edit className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editar</span>
              </button>
              {/* "..." menú con acciones secundarias (descargas + eliminar) */}
              <div className="relative">
                <button
                  onClick={() => setMoreActionsOpen(v => !v)}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
                  aria-label="Más acciones"
                  aria-expanded={moreActionsOpen}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {moreActionsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreActionsOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
                      <button
                        onClick={async () => {
                          setMoreActionsOpen(false)
                          setGeneratingPdf(true)
                          try { await exportTramitePDF(expediente) } finally { setGeneratingPdf(false) }
                        }}
                        disabled={generatingPdf}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Resumen PDF cliente
                      </button>
                      <button
                        onClick={() => { setMoreActionsOpen(false); setDescargarExpedienteOpen(true) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
                      >
                        <Download className="h-4 w-4" />
                        Expediente completo (PDF)
                      </button>
                      {isAdmin && (
                        <>
                          <div className="border-t border-zinc-200 dark:border-white/10" />
                          <button
                            onClick={() => { setMoreActionsOpen(false); setConfirmDelete(true) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/5"
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar expediente
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(() => {
          const tareasPendientes = tareas.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO').length
          const proximaAudiencia = audiencias
            .filter((t) => t.estado !== 'CANCELADA' && new Date(t.fecha) >= new Date(new Date().toISOString().slice(0, 10)))
            .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]
          // Use the last real state-change event from historial; fall back to fecha_alta
          // (NOT updated_at — that changes on any UPDATE like editing carátula or asignar miembro).
          const lastEstadoEvent = (timeline ?? []).find((e) => e.tipo === 'estado')
          const lastEstadoDate = lastEstadoEvent?.fecha ?? expediente.fecha_alta
          const diasEnEstado = lastEstadoDate
            ? Math.floor((Date.now() - new Date(lastEstadoDate).getTime()) / 86400000)
            : 0

          return (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2">
                <Timer className="h-4 w-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300">En estado actual</p>
                  <p className={cn("text-sm font-semibold", diasEnEstado > 60 ? "text-rose-400" : diasEnEstado > 30 ? "text-amber-400" : "text-zinc-800 dark:text-zinc-200")}>
                    {diasEnEstado} días
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2">
                <ListTodo className="h-4 w-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Tareas pend.</p>
                  <p className={cn("text-sm font-semibold", tareasPendientes > 0 ? "text-emerald-400" : "text-zinc-600 dark:text-zinc-300")}>
                    {tareasPendientes} de {tareas.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2">
                <CalendarClock className="h-4 w-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Próx. audiencia</p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {proximaAudiencia
                      ? new Date(proximaAudiencia.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                      : <span className="text-zinc-700 dark:text-zinc-300">—</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2">
                <User className="h-4 w-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Responsable</p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {responsable ? `${responsable.apellido}` : <span className="text-amber-400">Sin asignar</span>}
                  </p>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* Brief viviente del expediente */}
      <ExpedienteBriefPanel
        expedienteId={id!}
        brief={{
          ai_brief: (expediente as { ai_brief?: string | null }).ai_brief ?? null,
          ai_brief_generated_at: (expediente as { ai_brief_generated_at?: string | null }).ai_brief_generated_at ?? null,
          ai_brief_model: (expediente as { ai_brief_model?: string | null }).ai_brief_model ?? null,
          ai_brief_pending_refresh: (expediente as { ai_brief_pending_refresh?: boolean }).ai_brief_pending_refresh ?? false,
          ai_brief_pending_reasons: (expediente as { ai_brief_pending_reasons?: { kind: string; at: string; ref: string | null }[] | null }).ai_brief_pending_reasons ?? null,
        }}
      />

      {/* Expedientes parecidos en tu corpus (cross-expediente, colapsable) */}
      <ExpedienteSimilaresPanel expedienteId={id!} />

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-white/10 sticky top-0 z-10 bg-[var(--layout-bg)]/95 backdrop-blur-sm -mx-4 px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 overflow-x-auto -mb-px no-scrollbar">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            let count: number | null = null
            if (tab.id === 'audiencias') count = audiencias.length
            if (tab.id === 'tareas') count = tareas.length
            if (tab.id === 'notas') count = (expediente.expediente_notas ?? []).length

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? tab.activeClasses
                    : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:border-slate-600 hover:text-zinc-800 dark:hover:text-zinc-200'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {count != null && count > 0 && (
                  <span
                    className={cn(
                      'ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      isActive
                        ? tab.badgeClasses
                        : 'bg-white/5 text-zinc-600 dark:text-zinc-300'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'datos' && <TabGeneral expediente={expediente} />}
        {activeTab === 'actuaciones' && (
          <TabActuaciones
            expedienteId={id!}
            numeroSae={(expediente as any).numero_sae ?? null}
            ultimaSincronizacion={(expediente as any).ultima_sincronizacion_sae ?? null}
          />
        )}
        {activeTab === 'tareas' && (
          <TabTareas
            tareas={tareas}
            expedienteId={id!}
            expedienteInfo={{
              id: expediente.id,
              numero: (expediente as any).numero,
              caratula: expediente.caratula,
              clientes: expediente.clientes
                ? {
                    id: expediente.clientes.id,
                    nombre: expediente.clientes.nombre,
                    apellido: expediente.clientes.apellido,
                    dni: expediente.clientes.dni,
                    cuil: expediente.clientes.cuil,
                  }
                : null,
            }}
          />
        )}
        {activeTab === 'audiencias' && <TabTurnos audiencias={audiencias} expedienteId={id!} />}
        {activeTab === 'claves' && <TabActuacionesClaves expedienteId={id!} />}
        {activeTab === 'documentos' && <TabDocumentos expedienteId={id!} />}
        {activeTab === 'escritos' && <TabEscritos expedienteId={id!} />}
        {activeTab === 'normativa' && <TabNormativa expedienteId={id!} />}
        {activeTab === 'jurisprudencia' && <TabJurisprudencia expedienteId={id!} />}
        {activeTab === 'vision-ia' && <TabVisionIa expedienteId={id!} />}
        {activeTab === 'notas' && <ComentariosPanel expedienteId={id!} />}
        {activeTab === 'caja' && <TabCaja expedienteId={id!} />}
        {activeTab === 'timeline' && (
          <Card title="Línea de tiempo">
            {timelineLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-700 dark:text-zinc-300" />
              </div>
            ) : (
              <TimelineExpediente events={timeline ?? []} />
            )}
          </Card>
        )}
      </div>

      {/* Change Estado Dialog */}
      <CambiarEstadoDialog
        expedienteId={id!}
        estadoActual={expediente.estado_interno}
        open={estadoDialogOpen}
        onClose={() => setEstadoDialogOpen(false)}
      />

      {/* Edit Expediente Dialog */}
      <EditarExpedienteDialog
        expediente={expediente}
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
      />

      <DescargarExpedienteDialog
        open={descargarExpedienteOpen}
        onClose={() => setDescargarExpedienteOpen(false)}
        expedienteId={id!}
        expedienteNumero={(expediente as any).numero}
      />

      {/* Quick Action Dialogs */}
      <CrearSeguimientoDialog
        open={seguimientoDialogOpen}
        onClose={() => setSeguimientoDialogOpen(false)}
        expedienteId={id!}
      />
      <CrearTurnoDialog
        open={turnoDialogOpen}
        onClose={() => setTurnoDialogOpen(false)}
        expedienteId={id!}
      />
      <CrearTareaDialog
        open={tareaDialogOpen}
        onClose={() => setTareaDialogOpen(false)}
        expedienteId={id!}
      />

      {/* Quick Actions FAB — positioned left of BogaBot button */}
      <div className="fixed bottom-6 right-24 z-40 flex flex-col-reverse items-end gap-2 max-sm:right-20">
        {quickActionsOpen && (
          <div className="mb-2 flex flex-col gap-2 animate-fade-in">
            {[
              { label: 'Audiencia', icon: CalendarClock, color: 'bg-amber-500 hover:bg-amber-600', action: () => { setTurnoDialogOpen(true); setQuickActionsOpen(false) } },
              { label: 'Tarea', icon: CheckSquare, color: 'bg-emerald-500 hover:bg-emerald-600', action: () => { setTareaDialogOpen(true); setQuickActionsOpen(false) } },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className={cn(
                  'flex items-center gap-2 rounded-full pl-4 pr-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all',
                  item.color
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setQuickActionsOpen(!quickActionsOpen)}
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200',
            quickActionsOpen
              ? 'bg-slate-700 hover:bg-slate-600 rotate-45'
              : 'bg-gradient-cyan hover:opacity-90'
          )}
        >
          {quickActionsOpen ? <X className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-zinc-950" />}
        </button>
      </div>

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900/80 border border-white/10 p-6 shadow-xl animate-fade-in">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Eliminar expediente</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              ¿Estás seguro de que querés eliminar el expediente <strong className="text-zinc-800 dark:text-zinc-200">{(expediente as any).numero}</strong>?
              Esta acción no se puede deshacer fácilmente.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteExpediente.mutateAsync(expediente.id)
                    toast.success('Expediente eliminado')
                    navigate('/expedientes', { replace: true })
                  } catch {
                    toast.error('Error al eliminar expediente')
                    setConfirmDelete(false)
                  }
                }}
                disabled={deleteExpediente.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteExpediente.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
