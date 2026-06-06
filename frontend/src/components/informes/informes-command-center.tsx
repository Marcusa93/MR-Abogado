import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FolderOpen, Sparkles, Brain, Gavel, BookMarked, Users, Building2,
  AlertTriangle, Loader2, Mic2, FileText, TrendingUp, Scale,
} from 'lucide-react'
import { useInformesDashboard, type InformesDashboard } from '@/hooks/use-informes-dashboard'
import { cn } from '@/lib/utils'

const ESTADO_LABEL: Record<string, string> = {
  NUEVA_CONSULTA: 'Nueva consulta',
  PARA_INICIAR: 'Para iniciar',
  INICIADO: 'Iniciado',
  PRUEBA: 'Prueba',
  ALEGATOS: 'Alegatos',
  SENTENCIA: 'Sentencia',
  APELACION: 'Apelación',
  CORTE: 'Corte',
  FINALIZADO: 'Finalizado',
  NO_VIABLE_RECHAZADO: 'Rechazado',
  PAUSADO: 'Pausado',
}

const FUERO_LABEL: Record<string, string> = {
  civil: 'Civil',
  laboral: 'Laboral',
  penal: 'Penal',
  familia: 'Familia',
  administrativo: 'Administrativo',
  comercial: 'Comercial',
  previsional: 'Previsional',
  otro: 'Otro',
  sin_fuero: 'Sin fuero',
}

export function InformesCommandCenter() {
  const { data, isLoading, isError, error } = useInformesDashboard()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">
          {error instanceof Error ? error.message : 'No se pudo cargar el tablero'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <HeroTotales totales={data.totales} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TendenciaMensual data={data.tendencia_mensual} />
        </div>
        <PulsoIA data={data.pulso_ia} />
      </div>

      <MapaTribunales data={data.por_organismo} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DonutCard
          titulo="Por fuero"
          icon={Scale}
          data={data.por_fuero.map(f => ({ name: FUERO_LABEL[f.fuero] ?? f.fuero, value: f.count }))}
        />
        <DonutCard
          titulo="Por tipo de trámite"
          icon={Briefcase}
          data={data.por_tipo_tramite.map(t => ({ name: t.nombre, value: t.count }))}
        />
      </div>

      <DistribucionEstados data={data.por_estado} totalActivos={data.totales.activos + data.totales.pausados} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TopList
          titulo="Jueces detectados"
          subtitulo="De sentencias analizadas"
          icon={Gavel}
          accentColor="rose"
          items={data.jueces_recurrentes.map(j => ({ label: j.nombre, value: j.apariciones }))}
          emptyMsg="A medida que la IA analice sentencias, los jueces que firman se van listando acá."
        />
        <TopList
          titulo="Normativa más citada"
          subtitulo="En demandas y sentencias"
          icon={BookMarked}
          accentColor="amber"
          items={data.normativa_top.map(n => ({ label: n.norma, value: n.apariciones }))}
          emptyMsg="Subí y analizá demandas/sentencias para ver qué normativa aparece más en tu corpus."
        />
        <TopList
          titulo="Fallos invocados"
          subtitulo="Jurisprudencia citada en tu corpus"
          icon={Scale}
          accentColor="violet"
          items={data.jurisprudencia_top.map(j => ({ label: j.cita, value: j.apariciones }))}
          emptyMsg="Acá aparece la jurisprudencia que la IA detecte en los docs que subas."
        />
      </div>

      <PersonasRecurrentes data={data.personas_recurrentes} />
    </div>
  )
}

// ─── Componentes ────────────────────────────────────────────────────────────

function Briefcase({ className }: { className?: string }) {
  return <FolderOpen className={className} />
}

function HeroTotales({ totales }: { totales: InformesDashboard['totales'] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <HeroCard label="Expedientes" value={totales.total} icon={FolderOpen} accentColor="cyan" />
      <HeroCard label="Activos" value={totales.activos} icon={TrendingUp} accentColor="emerald" sub={`${Math.round((totales.activos / Math.max(totales.total, 1)) * 100)}% del total`} />
      <HeroCard label="Alta prioridad" value={totales.alta_prioridad} icon={AlertTriangle} accentColor="amber" sub="urgentes + altas" />
      <HeroCard label="Finalizados" value={totales.finalizados} icon={CheckIcon} accentColor="violet" />
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function HeroCard({
  label, value, icon: Icon, accentColor, sub,
}: {
  label: string; value: number
  icon: React.ComponentType<{ className?: string }>
  accentColor: 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose'
  sub?: string
}) {
  const ring = {
    cyan: 'from-cyan-500/15 to-cyan-500/5 border-cyan-500/20',
    emerald: 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/20',
    amber: 'from-amber-500/15 to-amber-500/5 border-amber-500/20',
    violet: 'from-violet-500/15 to-violet-500/5 border-violet-500/20',
    rose: 'from-rose-500/15 to-rose-500/5 border-rose-500/20',
  }[accentColor]
  const iconColor = {
    cyan: 'text-cyan-400', emerald: 'text-emerald-400',
    amber: 'text-amber-400', violet: 'text-violet-400', rose: 'text-rose-400',
  }[accentColor]
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm', ring)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</p>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </div>
      <p className="mt-1 text-3xl font-bold text-zinc-50 tabular-nums">{value.toLocaleString('es-AR')}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  )
}

function TendenciaMensual({ data }: { data: InformesDashboard['tendencia_mensual'] }) {
  const formatted = data.map(d => ({
    mes: d.mes.slice(5),
    Expedientes: d.expedientes_nuevos,
    Actuaciones: d.movements_nuevos,
    Sentencias: d.sentencias_analizadas,
  }))

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Actividad últimos 12 meses</h3>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id="g-exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="g-act" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="g-sent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="mes" stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Area type="monotone" dataKey="Expedientes" stroke="#06b6d4" fill="url(#g-exp)" strokeWidth={2} />
          <Area type="monotone" dataKey="Actuaciones" stroke="#a78bfa" fill="url(#g-act)" strokeWidth={2} />
          <Area type="monotone" dataKey="Sentencias" stroke="#f43f5e" fill="url(#g-sent)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function PulsoIA({ data }: { data: InformesDashboard['pulso_ia'] }) {
  const items = [
    { label: 'Docs analizados', value: data.adjuntos_analizados, icon: FileText, color: 'text-violet-400' },
    { label: 'Pendientes IA', value: data.adjuntos_pendientes, icon: Sparkles, color: 'text-amber-400' },
    { label: 'Actuaciones SAE IA', value: data.movements_analizados, icon: Brain, color: 'text-cyan-400' },
    { label: 'Audiencias transcriptas', value: data.audiencias_transcriptas, icon: Mic2, color: 'text-rose-400' },
    { label: 'Aprendizajes', value: data.aprendizajes_total, icon: Brain, color: 'text-emerald-400', sub: data.aprendizajes_auto > 0 ? `${data.aprendizajes_auto} auto` : null },
    { label: 'Chunks normativa', value: data.chunks_normativa, icon: BookMarked, color: 'text-amber-300' },
    { label: 'Chunks jurisprudencia', value: data.chunks_jurisprudencia, icon: Gavel, color: 'text-violet-300' },
    { label: 'Chunks audiencias', value: data.chunks_audiencias, icon: Mic2, color: 'text-cyan-300' },
  ]

  return (
    <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-violet-200">Pulso IA</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <Icon className={cn('h-3 w-3', item.color)} />
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">{item.label}</p>
              </div>
              <p className="mt-0.5 text-lg font-bold text-zinc-100 tabular-nums">{item.value.toLocaleString('es-AR')}</p>
              {item.sub && <p className="text-[9px] text-emerald-400">{item.sub}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MapaTribunales({ data }: { data: InformesDashboard['por_organismo'] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Mapa de tribunales</h3>
        </div>
        <p className="text-xs text-zinc-500 py-4 text-center">Ningún expediente tiene organismo cargado todavía.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Mapa de tribunales</h3>
        <span className="text-[10px] text-zinc-500">{data.length} {data.length === 1 ? 'organismo' : 'organismos'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.map((org) => (
          <div
            key={org.organismo_id}
            className={cn(
              'rounded-lg border px-3 py-2.5 transition-colors',
              org.estancados_30d > 0
                ? 'border-amber-500/30 bg-amber-500/[0.04]'
                : 'border-white/5 bg-white/[0.02]'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight">
                  {org.nombre}
                </p>
                {org.tipo && (
                  <p className="text-[10px] text-zinc-500 capitalize mt-0.5">{org.tipo}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-300 tabular-nums">
                {org.count}
              </span>
            </div>
            {org.estancados_30d > 0 && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                {org.estancados_30d} estancado{org.estancados_30d !== 1 ? 's' : ''} {'>'} 30 días
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutCard({
  titulo, icon: Icon, data,
}: {
  titulo: string
  icon: React.ComponentType<{ className?: string }>
  data: { name: string; value: number }[]
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const PALETTE = ['#06b6d4', '#a78bfa', '#f43f5e', '#fbbf24', '#10b981', '#f97316', '#3b82f6', '#ec4899']

  if (total === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
        </div>
        <p className="text-xs text-zinc-500 py-4 text-center">Sin datos.</p>
      </div>
    )
  }

  let cumulative = 0
  const segments = data.map((d, i) => {
    const start = cumulative
    cumulative += d.value
    return {
      ...d,
      start: (start / total) * 360,
      end: (cumulative / total) * 360,
      color: PALETTE[i % PALETTE.length],
    }
  })

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
      </div>
      <div className="flex items-center gap-4">
        <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#27272a" strokeWidth="14" />
          {segments.map((s, i) => {
            const r = 50, cx = 60, cy = 60
            const startRad = ((s.start - 90) * Math.PI) / 180
            const endRad = ((s.end - 90) * Math.PI) / 180
            const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad)
            const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad)
            const largeArc = s.end - s.start > 180 ? 1 : 0
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
              />
            )
          })}
          <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="fill-zinc-100 text-xl font-bold">
            {total}
          </text>
          <text x="60" y="78" textAnchor="middle" className="fill-zinc-500 text-[10px]">
            total
          </text>
        </svg>
        <div className="min-w-0 flex-1 space-y-1">
          {segments.slice(0, 6).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-zinc-300 truncate flex-1">{s.name}</span>
              <span className="text-zinc-500 tabular-nums">{s.value}</span>
            </div>
          ))}
          {segments.length > 6 && (
            <p className="text-[10px] text-zinc-500">+{segments.length - 6} más</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DistribucionEstados({ data, totalActivos }: { data: InformesDashboard['por_estado']; totalActivos: number }) {
  if (data.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Distribución por estado</h3>
      </div>
      <div className="space-y-1.5">
        {data.map((s) => {
          const pct = totalActivos > 0 ? (s.count / Math.max(totalActivos, s.count)) * 100 : 0
          const label = ESTADO_LABEL[s.estado] ?? s.estado
          return (
            <div key={s.estado} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{label}</span>
                <span className="text-zinc-500 tabular-nums">{s.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopList({
  titulo, subtitulo, icon: Icon, accentColor, items, emptyMsg,
}: {
  titulo: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  accentColor: 'amber' | 'rose' | 'violet'
  items: { label: string; value: number }[]
  emptyMsg: string
}) {
  const colorClass = {
    amber: 'text-amber-400 bg-amber-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
  }[accentColor]

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', accentColor === 'amber' ? 'text-amber-400' : accentColor === 'rose' ? 'text-rose-400' : 'text-violet-400')} />
        <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">{subtitulo}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-500 leading-snug py-2">{emptyMsg}</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-300 line-clamp-2 leading-tight flex-1">{item.label}</span>
              <span className={cn('shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums', colorClass)}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PersonasRecurrentes({ data }: { data: InformesDashboard['personas_recurrentes'] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Personas en tus audiencias</h3>
        </div>
        <p className="text-xs text-zinc-500 py-2">Cuando se analicen transcripciones de audiencia, los nombres detectados aparecen acá.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Personas en tus audiencias</h3>
        </div>
        <Link to="/buscar-audiencias" className="text-[11px] text-cyan-400 hover:text-cyan-300">
          Ver todas →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {data.slice(0, 12).map((p, i) => (
          <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-tight">{p.nombre}</p>
            <p className="mt-1 text-[10px] text-zinc-500">{p.apariciones} apar.</p>
          </div>
        ))}
      </div>
    </div>
  )
}
