import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, CheckSquare, Sparkles, Users, ArrowRight,
  Loader2, Clock, FolderOpen, FileText, RefreshCw,
  Check,
} from 'lucide-react'
import { useHoy, type HoyAudiencia, type HoyTarea, type HoyContenido } from '@/hooks/use-hoy'
import { useConsultas, TIPO_ASUNTO_LABEL, ESTADO_LABEL } from '@/hooks/use-consultas'
import {
  useTareasRecurrentesHoy,
  useCompletadasHoy,
  useMarcarTareaRecurrente,
  type TareaRecurrente,
} from '@/hooks/use-tareas-recurrentes'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/shared/empty-state'
import { NovedadesSae } from '@/components/inicio/novedades-sae'
import { ProximosDias } from '@/components/inicio/proximos-dias'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutosHasta(horaIso: string): number {
  return Math.round((new Date(horaIso).getTime() - Date.now()) / 60000)
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function diasEnEstado(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PRIORIDAD_COLORS: Record<string, string> = {
  URGENTE: 'bg-rose-500/15 text-rose-300',
  ALTA: 'bg-amber-500/15 text-amber-300',
  MEDIA: 'bg-cyan-500/15 text-cyan-300',
  BAJA: 'bg-zinc-500/15 text-zinc-300',
}

const CATEGORIA_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  newsletter: 'Newsletter',
  email_cliente: 'Email a cliente',
  whatsapp_difusion: 'WhatsApp difusión',
  blog: 'Blog',
  video_guion: 'Guion video',
  otro: 'Otro',
}

const ESTADO_CONTENIDO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
  archivado: 'Archivado',
}

// ---------------------------------------------------------------------------
// Subcomponentes auxiliares
// ---------------------------------------------------------------------------

function BadgeProximidad({ minutos }: { minutos: number }) {
  if (minutos < -15 || minutos > 240) return null
  if (minutos < 0) {
    return (
      <span className="shrink-0 rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
        Hace {Math.abs(minutos)} min
      </span>
    )
  }
  if (minutos <= 30) {
    return (
      <span className="shrink-0 animate-pulse rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
        En {minutos} min
      </span>
    )
  }
  if (minutos <= 90) {
    return (
      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
        En {minutos} min
      </span>
    )
  }
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return (
    <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-400">
      En {h}h{m > 0 ? ` ${m}min` : ''}
    </span>
  )
}



// ---------------------------------------------------------------------------
// Checklist hoy — tareas recurrentes
// ---------------------------------------------------------------------------

function ChecklistHoy({ perfilId }: { perfilId: string }) {
  const { data: tareas = [], isLoading } = useTareasRecurrentesHoy(perfilId)
  const { data: completadasSet = new Set<string>() } = useCompletadasHoy(perfilId)
  const marcar = useMarcarTareaRecurrente()

  const completadas = tareas.filter(t => completadasSet.has(t.id)).length

  async function toggle(tarea: TareaRecurrente) {
    const yaCompletada = completadasSet.has(tarea.id)
    try {
      await marcar.mutateAsync({ id: tarea.id, completada: !yaCompletada, perfilId })
    } catch {
      toast.error('No se pudo actualizar')
    }
  }

  if (isLoading) return null
  if (tareas.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Rutina diaria</h3>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
            {completadas}/{tareas.length} completadas
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {tareas.map(t => {
          const done = completadasSet.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                done
                  ? 'border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
              )}
            >
              <div className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors',
                done ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600',
              )}>
                {done && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium leading-tight', done ? 'line-through text-zinc-500' : 'text-zinc-100')}>
                  {t.titulo}
                </p>
                {t.descripcion && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{t.descripcion}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MisTareasActivas
// ---------------------------------------------------------------------------


interface ConsultaAsignada {
  id: string
  nombre: string
  apellido: string | null
  tipo_asunto: string
  estado: string
  estado_changed_at: string | null
}

function useMisConsultasAsignadas(userId: string) {
  const supabase = createClient()
  return useQuery<ConsultaAsignada[]>({
    queryKey: ['mis-consultas-asignadas', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('consultas')
        .select('id, nombre, apellido, tipo_asunto, estado, estado_changed_at')
        .eq('assigned_to', userId)
        .not('estado', 'in', '(convertida,resuelta,descartada)')
        .order('estado_changed_at', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as ConsultaAsignada[]
    },
    enabled: !!userId,
    staleTime: 60_000,
  })
}

function SemaforoConsulta({ dias }: { dias: number }) {
  if (dias < 3) return null
  if (dias <= 7) {
    return <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">{dias}d</span>
  }
  return <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-400">{dias}d</span>
}

function MisConsultasAsignadas({ userId }: { userId: string }) {
  const { data: consultas = [], isLoading } = useMisConsultasAsignadas(userId)

  if (isLoading) return null
  if (consultas.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Mis consultas asignadas</h3>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            {consultas.length}
          </span>
        </div>
        <Link to="/consultas" className="text-[11px] text-amber-400 hover:text-amber-300">Ver todas →</Link>
      </div>
      <div className="space-y-1.5">
        {consultas.map(c => {
          const dias = diasEnEstado(c.estado_changed_at)
          return (
            <Link
              key={c.id}
              to={`/consultas/${c.id}`}
              className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 line-clamp-1">
                  {c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre}
                </p>
                <p className="text-[10px] text-zinc-500">{TIPO_ASUNTO_LABEL[c.tipo_asunto as keyof typeof TIPO_ASUNTO_LABEL] ?? c.tipo_asunto}</p>
              </div>
              <span className="shrink-0 text-[10px] text-zinc-400">{ESTADO_LABEL[c.estado as keyof typeof ESTADO_LABEL] ?? c.estado}</span>
              <SemaforoConsulta dias={dias} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Secciones que ya existían (para SECRETARIA y todos)
// ---------------------------------------------------------------------------

function ConsultasPendientes() {
  const { data = [] } = useConsultas({ estado: 'pendiente' })
  if (!data.length) return null
  const top = data.slice(0, 5)
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Consultas sin atender</h3>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            {data.length}
          </span>
        </div>
        <Link to="/consultas?estado=pendiente" className="text-[11px] text-amber-400 hover:text-amber-300">Ver todas →</Link>
      </div>
      <div className="space-y-1.5">
        {top.map(c => (
          <Link
            key={c.id}
            to={`/consultas/${c.id}`}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">
                {c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre}
              </p>
              <p className="text-[10px] text-zinc-500">{TIPO_ASUNTO_LABEL[c.tipo_asunto]}</p>
            </div>
            {!c.diagnostico_at && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                Sin diagnóstico
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

function AudienciasHoy({ items }: { items: HoyAudiencia[] }) {
  const sorted = [...items].sort((a, b) => new Date(a.hora).getTime() - new Date(b.hora).getTime())
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Audiencias de hoy</h3>
          {items.length > 0 && (
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
              {items.length}
            </span>
          )}
        </div>
        <Link to="/agenda" className="text-[11px] text-cyan-400 hover:text-cyan-300">Ver agenda →</Link>
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">No hay audiencias hoy.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => {
            const min = minutosHasta(a.hora)
            const esProxima = min > -15 && min <= 90
            return (
              <Link
                key={a.id}
                to={`/expedientes/${a.expediente_id}`}
                className={cn(
                  'block rounded-lg border px-3 py-2 transition-colors',
                  esProxima
                    ? 'border-amber-500/30 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100 line-clamp-1">
                      {a.cliente_apellido}, {a.cliente_nombre}
                    </p>
                    <p className="text-[11px] text-zinc-500 line-clamp-1">
                      {a.expediente_caratula || a.expediente_numero}
                    </p>
                    {a.organismo && (
                      <p className="text-[10px] text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">{a.organismo}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-300 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      {formatHora(a.hora)}
                    </span>
                    <BadgeProximidad minutos={min} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TareasPendientes({ items }: { items: HoyTarea[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Tus tareas</h3>
        </div>
        <Link to="/tareas" className="text-[11px] text-emerald-400 hover:text-emerald-300">Ver todas →</Link>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Sin tareas pendientes" description="Estás al día." />
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className={cn(
              'rounded-lg border px-3 py-2',
              t.vencida ? 'border-rose-500/20 bg-rose-500/[0.04]' : 'border-white/5 bg-white/[0.02]'
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight">{t.titulo}</p>
                  {t.expediente_caratula && (
                    <Link to={`/expedientes/${t.expediente_id}`} className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-zinc-500 hover:text-zinc-300">
                      <FolderOpen className="h-2.5 w-2.5" />
                      {t.expediente_caratula}
                    </Link>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn('rounded-full px-1.5 py-0 text-[10px] font-medium', PRIORIDAD_COLORS[t.prioridad])}>
                    {t.prioridad}
                  </span>
                  {t.fecha_vencimiento && (
                    <span className={cn(
                      'text-[10px] tabular-nums',
                      t.vencida ? 'text-rose-400' : 'text-zinc-500'
                    )}>
                      {t.vencida ? 'vencida' : new Date(t.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContenidosPendientes({ items }: { items: HoyContenido[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Contenidos en curso</h3>
        </div>
        <Link to="/contenidos" className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300">
          Ver todos
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-3 text-center">No hay borradores en proceso. <Link to="/contenidos" className="text-violet-300 hover:underline">Crear uno</Link>.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((c) => (
            <Link key={c.id} to="/contenidos" className="rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-3 py-2 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight">{c.titulo}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</p>
                </div>
                <FileText className="h-3 w-3 text-violet-400/70 shrink-0 mt-0.5" />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className={cn(
                  'rounded-full px-1.5 py-0 text-[9px] font-medium',
                  c.estado === 'aprobado' ? 'bg-emerald-500/15 text-emerald-300'
                    : c.estado === 'en_revision' ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-zinc-500/15 text-zinc-400'
                )}>
                  {ESTADO_CONTENIDO_LABEL[c.estado] ?? c.estado}
                </span>
                {c.publicar_el && (
                  <span className="text-[10px] text-zinc-500">
                    {new Date(c.publicar_el + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------


export default function HoyPage() {
  const { profile } = useAuth()
  const { data, isLoading, isError, refetch, isFetching } = useHoy()
  const qc = useQueryClient()

  const isSecretaria = profile?.rol === 'SECRETARIA'
  const esCriterio = profile?.rol === 'CRITERIO'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (isError || !data || !data.usuario) {
    return <p className="py-10 text-sm text-rose-500">No se pudo cargar la información del día.</p>
  }

  const nombre = data.usuario.nombre || 'colega'
  const hoyDate = new Date(data.fecha + 'T12:00:00')
  const dateLabel = hoyDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  const actualizar = () => {
    refetch()
    qc.invalidateQueries({ queryKey: ['sae-notificaciones'] })
    qc.invalidateQueries({ queryKey: ['sae-actuaciones-recientes'] })
    qc.invalidateQueries({ queryKey: ['tareas'] })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 animate-fade-in">
      {/* Saludo */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {greeting()}, {nombre}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={actualizar}
            disabled={isFetching}
            title="Actualizar"
            className="rounded-md border border-zinc-200 p-2 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-zinc-200"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Lo primero: qué pasó en el SAE */}
        <div className="min-w-0 space-y-5">
          {!esCriterio && <NovedadesSae />}
          {isSecretaria && <AudienciasHoy items={data.audiencias_hoy} />}
          {isSecretaria && <TareasPendientes items={data.tareas_pendientes} />}
          {isSecretaria && <ContenidosPendientes items={data.contenidos_pendientes} />}
        </div>

        {/* Lo que viene */}
        <div className="min-w-0 space-y-5">
          {profile?.id && <ProximosDias profileId={profile.id} />}
          {profile?.id && <MisConsultasAsignadas userId={profile.id} />}
          {isSecretaria && <ConsultasPendientes />}
          {profile?.id && <ChecklistHoy perfilId={profile.id} />}
        </div>
      </div>
    </div>
  )
}
