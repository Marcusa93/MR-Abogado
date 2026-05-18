import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  useExpedientesPorEstado,
  useExpedientesPorMes,
  useExpedientesPorTipo,
  useResumenFinanciero,
  useTurnosStats,
  useConsultasVsTomados,
} from '@/hooks/use-informes'
import { getEstadoConfig } from '@/components/shared/estado-badge'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { exportExpedientesToCSV } from '@/lib/utils/export-csv'
import { exportInformePDF } from '@/lib/utils/export-pdf'
import { toast } from '@/stores/toast-store'
import {
  Download,
  FileText,
  Briefcase,
  TrendingUp,
  DollarSign,
  BarChart3,
  CalendarDays,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Color map for PieChart — hex values matching estado-badge colors
// ---------------------------------------------------------------------------

const ESTADO_HEX: Record<string, string> = {
  NUEVA_CONSULTA: '#94a3b8',      // slate-400
  PARA_INICIAR: '#fbbf24',        // amber-400
  INICIADO: '#60a5fa',            // blue-400
  PRUEBA: '#818cf8',              // indigo-400
  ALEGATOS: '#a78bfa',            // violet-400
  SENTENCIA: '#22d3ee',           // cyan-400
  APELACION: '#fb923c',           // orange-400
  CORTE: '#fb7185',               // rose-400
  FINALIZADO: '#34d399',          // emerald-400
  NO_VIABLE_RECHAZADO: '#f87171', // red-400
  PAUSADO: '#a1a1aa',             // zinc-400
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function GlassTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 shadow-lg backdrop-blur-sm">
      {label && <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color || '#d4a853' }}>
          {p.name ?? 'Expedientes'}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom SVG Donut (replaces Recharts PieChart — React 19 compat)
// ---------------------------------------------------------------------------

function SVGDonut({ data, total }: { data: { name: string; value: number; fill: string }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const cx = 100, cy = 100, outerR = 90, innerR = 55, gap = 0.02 // gap in radians

  // Build arc segments
  const segments: { path: string; fill: string; name: string; value: number }[] = []
  let angle = -Math.PI / 2 // start at top

  data.forEach((d) => {
    const sweep = (d.value / total) * (2 * Math.PI) - gap
    if (sweep <= 0) return
    const startAngle = angle + gap / 2
    const endAngle = startAngle + sweep

    const x1o = cx + outerR * Math.cos(startAngle)
    const y1o = cy + outerR * Math.sin(startAngle)
    const x2o = cx + outerR * Math.cos(endAngle)
    const y2o = cy + outerR * Math.sin(endAngle)
    const x2i = cx + innerR * Math.cos(endAngle)
    const y2i = cy + innerR * Math.sin(endAngle)
    const x1i = cx + innerR * Math.cos(startAngle)
    const y1i = cy + innerR * Math.sin(startAngle)

    const largeArc = sweep > Math.PI ? 1 : 0

    const path = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x2i} ${y2i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1i} ${y1i}`,
      'Z',
    ].join(' ')

    segments.push({ path, fill: d.fill, name: d.name, value: d.value })
    angle += (d.value / total) * (2 * Math.PI)
  })

  return (
    <div style={{ height: 280 }}>
      <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
        <svg viewBox="0 0 200 200" width="200" height="200">
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.fill}
              opacity={hover === null || hover === i ? 1 : 0.4}
              style={{ transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-800 dark:text-white">{total}</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-300">Total</p>
          </div>
        </div>
        {/* Tooltip on hover */}
        {hover !== null && segments[hover] && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 shadow-lg backdrop-blur-sm pointer-events-none">
            <p className="text-sm font-semibold" style={{ color: segments[hover].fill }}>
              {segments[hover].name}: {segments[hover].value}
            </p>
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-[11px] text-zinc-600 dark:text-zinc-400">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clickable horizontal bar chart for Tipo de Trámite
// ---------------------------------------------------------------------------

const BAR_COLORS = ['#d4a853', '#a78bfa', '#fbbf24', '#60a5fa', '#2dd4bf', '#fb7185', '#34d399', '#818cf8', '#38bdf8', '#4ade80']

function TipoBarChart({ data, onBarClick }: { data: { id: string; nombre: string; count: number }[]; onBarClick: (tipoId: string) => void }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="space-y-2" style={{ minHeight: 280 }}>
      {data.map((item, i) => (
        <button
          key={item.id || i}
          onClick={() => item.id && onBarClick(item.id)}
          className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
        >
          <span className="w-[120px] shrink-0 truncate text-[11px] text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            {item.nombre}
          </span>
          <div className="flex-1 h-5 rounded bg-slate-800/50 overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${(item.count / maxCount) * 100}%`,
                backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {item.count}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format currency
// ---------------------------------------------------------------------------

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function InformesPage() {
  const navigate = useNavigate()
  const { data: porEstado, isLoading: l1, isError: e1, refetch: r1 } = useExpedientesPorEstado()
  const { data: porMes, isLoading: l2, isError: e2, refetch: r2 } = useExpedientesPorMes()
  const { data: porTipo, isLoading: l3, isError: e3, refetch: r3 } = useExpedientesPorTipo()
  const { data: financiero, isLoading: l4, isError: e4, refetch: r4 } = useResumenFinanciero()
  const { data: turnosStats } = useTurnosStats()
  const { data: consultasVsTomados } = useConsultasVsTomados()

  const isLoading = l1 || l2 || l3 || l4
  const isError = e1 || e2 || e3 || e4

  const handleExportCSV = async () => {
    try {
      await exportExpedientesToCSV()
      toast.success('CSV exportado')
    } catch {
      toast.error('Error al exportar CSV')
    }
  }

  const handleExportPDF = async () => {
    try {
      await exportInformePDF({
        porEstado: porEstado ?? [],
        porTipo: porTipo ?? [],
        financiero: financiero ?? null,
      })
      toast.success('PDF generado')
    } catch {
      toast.error('Error al generar PDF')
    }
  }

  // Pie chart data
  const pieData = (porEstado ?? []).filter(item => item.count > 0).map((item) => ({
    name: getEstadoConfig(item.estado_interno).label,
    value: item.count,
    fill: ESTADO_HEX[item.estado_interno] ?? '#94a3b8',
  }))
  const totalExp = pieData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            Informes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Reportes y estadísticas del estudio — datos históricos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : isError ? (
        <ErrorState
          message="Error al cargar los informes"
          onRetry={() => { r1(); r2(); r3(); r4() }}
        />
      ) : (
        <>
          {/* Row 1: Pie + Bar */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Expedientes por Estado — Donut */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Expedientes por Estado</h3>
              </div>
              {totalExp === 0 ? (
                <div className="flex h-[280px] items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-zinc-200 dark:border-zinc-700">
                      <span className="text-sm text-zinc-400">0</span>
                    </div>
                    <p className="text-xs text-zinc-400">Los datos aparecerán al registrar expedientes</p>
                  </div>
                </div>
              ) : (
                <SVGDonut data={pieData} total={totalExp} />
              )}
            </div>

            {/* Expedientes por Mes — Barras */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Expedientes por Mes</h3>
              </div>
              {!porMes || porMes.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center">
                  <p className="text-xs text-zinc-400">Los datos aparecerán al registrar expedientes</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porMes} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="mesLabel" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<GlassTooltip />} />
                    <Bar dataKey="count" name="Expedientes" fill="#d4a853" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Row 2: Tipo + Financiero */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Expedientes por Tipo — Barras horizontales clickeables */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Por Tipo de Trámite</h3>
              </div>
              <TipoBarChart
                data={porTipo ?? []}
                onBarClick={(tipoId) => navigate(`/expedientes?tipo_tramite_id=${tipoId}`)}
              />
            </div>

            {/* Resumen Financiero */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Resumen Financiero</h3>
              </div>
              {financiero && (
                <div className="space-y-4">
                  {/* KPI cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatCard label="Total Expedientes" value={financiero.totalExpedientes} />
                    <StatCard label="En Trámite" value={financiero.enTramite} color="text-amber-400" />
                    <StatCard label="Resueltos" value={financiero.resueltos} color="text-emerald-400" />
                    <StatCard label="Tasa de Éxito" value={`${financiero.tasaExito}%`} color="text-amber-400" />
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <FinRow label="Monto reclamado" value={fmtMoney(financiero.montoReclamado)} />
                    <FinRow label="Monto otorgado" value={fmtMoney(financiero.montoOtorgado)} color="text-emerald-400" />
                    <FinRow label="Honorarios cobrados" value={fmtMoney(financiero.totalCobros)} color="text-amber-400" />
                    <FinRow label="Cobros realizados" value={String(financiero.cantCobros)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Consultas vs Tomados */}
          {consultasVsTomados && consultasVsTomados.length > 0 && (
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Consultas vs Tomados por mes</h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={consultasVsTomados} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis dataKey="mesLabel" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<GlassTooltip />} />
                  <Bar dataKey="consultas" name="Consultas" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tomados" name="Tomados" fill="#d4a853" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Consultas (en análisis)</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Tomados (iniciados+)</span>
              </div>
            </div>
          )}

          {/* Row 4: Turnos Stats */}
          {turnosStats && (
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Informe de Audiencias</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg bg-zinc-100 dark:bg-white/5 p-3 text-center">
                  <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{turnosStats.total}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Total asignados</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{turnosStats.realizados}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Realizados</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{turnosStats.pendientes}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Pendientes</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{turnosStats.cancelados}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Cancelados</p>
                </div>
                <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{turnosStats.reprogramados}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">Reprogramados</p>
                </div>
              </div>
              {turnosStats.total > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                  <span>Tasa de asistencia:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {Math.round((turnosStats.realizados / turnosStats.total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-50 dark:bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? 'text-zinc-800 dark:text-zinc-100'}`}>{value}</p>
    </div>
  )
}

function FinRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold ${color ?? 'text-zinc-800 dark:text-zinc-200'}`}>{value}</span>
    </div>
  )
}
