import { Link } from 'react-router-dom'
import {
  Sun, Calendar, CheckSquare, Sparkles, Users, ArrowRight, Plus,
  AlertTriangle, Loader2, Clock, FolderOpen, FileText, RefreshCw, FolderPlus,
} from 'lucide-react'
import { useHoy, type HoyAudiencia, type HoyTarea, type HoyContenido } from '@/hooks/use-hoy'
import { useConsultas, TIPO_ASUNTO_LABEL } from '@/hooks/use-consultas'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'

function minutosHasta(horaIso: string): number {
  return Math.round((new Date(horaIso).getTime() - Date.now()) / 60000)
}

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

export default function HoyPage() {
  const { data, isLoading, isError, refetch, isFetching } = useHoy()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Hoy' }]} />
        <p className="text-sm text-red-300">No se pudo cargar la información del día.</p>
      </div>
    )
  }

  const nombre = data.usuario.nombre || 'colega'
  const hoyDate = new Date(data.fecha + 'T12:00:00')
  const dateLabel = hoyDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Hoy' }]} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Sun className="h-6 w-6 text-amber-400" />
            {greeting()}, {nombre}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 capitalize">{dateLabel}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Actualizar"
          className="mt-1 rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatChip label="Audiencias hoy" value={data.audiencias_hoy.length} icon={Calendar} color="cyan" to="/agenda" />
        <StatChip label="Tareas para hoy" value={data.tareas_hoy_count} icon={CheckSquare} color="emerald" to="/tareas" />
        <StatChip label="Tareas vencidas" value={data.tareas_vencidas_count} icon={AlertTriangle} color={data.tareas_vencidas_count > 0 ? 'rose' : 'muted'} to="/tareas?vencidas=1" />
        <StatChip label="Consultas últ. 7d" value={data.consultas_nuevas_count} icon={Users} color="amber" to="/consultas" />
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 px-1">Acciones rápidas</p>
        <div className="flex flex-wrap gap-2">
          <QuickAction to="/consultas?nueva=1" icon={Plus} label="Nueva consulta" color="emerald" />
          <QuickAction to="/expedientes/nuevo" icon={FolderPlus} label="Nuevo expediente" color="cyan" />
          <QuickAction to="/agenda" icon={Calendar} label="Agendar turno" color="violet" />
          <QuickAction to="/contenidos" icon={Sparkles} label="Nuevo contenido" color="rose" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AudienciasHoy items={data.audiencias_hoy} />
        <TareasPendientes items={data.tareas_pendientes} />
      </div>

      <ConsultasPendientes />

      <ContenidosPendientes items={data.contenidos_pendientes} />
    </div>
  )
}

function StatChip({ label, value, icon: Icon, color, to }: {
  label: string; value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'cyan'|'emerald'|'amber'|'rose'|'violet'|'muted'
  to?: string
}) {
  const colors = {
    cyan: 'border-cyan-500/20 bg-cyan-500/[0.04] text-cyan-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/[0.04] text-amber-300',
    rose: 'border-rose-500/30 bg-rose-500/[0.06] text-rose-300',
    violet: 'border-violet-500/20 bg-violet-500/[0.04] text-violet-300',
    muted: 'border-white/10 bg-white/[0.02] text-zinc-400',
  }[color]
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <p className="mt-1 text-2xl font-bold text-zinc-50 tabular-nums">{value.toLocaleString('es-AR')}</p>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cn('rounded-xl border px-4 py-3 hover:opacity-80 transition-opacity', colors)}>
        {inner}
      </Link>
    )
  }
  return <div className={cn('rounded-xl border px-4 py-3', colors)}>{inner}</div>
}

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

function QuickAction({ to, icon: Icon, label, color }: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: 'emerald'|'cyan'|'violet'|'rose'
}) {
  const cls = {
    emerald: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
    cyan: 'bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25',
    violet: 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25',
    rose: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  }[color]
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', cls)}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
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
        <EmptyState icon={CheckSquare} title="Sin tareas pendientes" description="Estás al día. ¡Buen trabajo!" />
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
                      {t.vencida ? '⚠ vencida' : new Date(t.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
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
