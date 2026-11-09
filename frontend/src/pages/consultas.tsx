import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useConsultas, useCreateConsulta,
  TIPO_ASUNTO_LABEL, CANAL_LABEL, ESTADO_LABEL,
  type ConsultaEstado, type ConsultaCanal, type ConsultaTipoAsunto,
} from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import {
  Plus, Search, Users,
  ChevronRight, LayoutGrid, List, Clock,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils/date-helpers'

function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function TiempoEstadoBadge({ estadoChangedAt }: { estadoChangedAt: string | null | undefined }) {
  const dias = diasDesde(estadoChangedAt)
  if (dias < 3) return null
  const color = dias > 7
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400'
  return (
    <span className={cn('text-[10px] font-medium flex items-center gap-0.5 shrink-0', color)}>
      <Clock className="h-3 w-3" />
      {dias === 1 ? '1 día' : `${dias} días`}
    </span>
  )
}

// ── Estado badges ───────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<ConsultaEstado, string> = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  en_proceso: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  presupuestada: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  con_claudio: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  requiere_info: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  redactando: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  convertida: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  resuelta: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  descartada: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

const ESTADOS: Array<{ value: ConsultaEstado | ''; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'presupuestada', label: 'Presupuestadas' },
  { value: 'con_claudio', label: 'Con Claudio' },
  { value: 'requiere_info', label: 'Requiere info' },
  { value: 'redactando', label: 'Redactando' },
  { value: 'convertida', label: 'Expediente' },
  { value: 'resuelta', label: 'Resueltas' },
  { value: 'descartada', label: 'Descartadas' },
]

const KANBAN_ESTADOS: ConsultaEstado[] = ['pendiente', 'en_proceso', 'presupuestada', 'con_claudio', 'requiere_info', 'redactando']
const TERMINAL_ESTADOS: ConsultaEstado[] = ['convertida', 'resuelta', 'descartada']

// ── Modal nueva consulta ────────────────────────────────────────────────────

function NuevaConsultaDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateConsulta()
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    email: '',
    canal: 'presencial' as ConsultaCanal,
    tipo_asunto: 'civil' as ConsultaTipoAsunto,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    try {
      const { id } = await create.mutateAsync(form)
      toast.success('Consulta creada')
      onCreated(id)
    } catch {
      toast.error('No se pudo crear la consulta')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[var(--card)] rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Nueva consulta</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Juan"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Apellido</label>
              <input
                type="text"
                value={form.apellido}
                onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
                placeholder="García"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder="381 4XX-XXXX"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="juan@email.com"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cómo llegó</label>
              <select
                value={form.canal}
                onChange={e => setForm(f => ({ ...f, canal: e.target.value as ConsultaCanal }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                {Object.entries(CANAL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tipo de asunto</label>
              <select
                value={form.tipo_asunto}
                onChange={e => setForm(f => ({ ...f, tipo_asunto: e.target.value as ConsultaTipoAsunto }))}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                {Object.entries(TIPO_ASUNTO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-5 py-2 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 rounded-lg transition-colors disabled:opacity-50"
            >
              {create.isPending ? 'Guardando…' : 'Crear consulta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Card de consulta ────────────────────────────────────────────────────────

function ConsultaCard({ consulta, onClick }: { consulta: any; onClick: () => void }) {
  const nombre = [consulta.apellido, consulta.nombre].filter(Boolean).join(', ')
  const asignado = consulta.assigned_profile
    ? [consulta.assigned_profile.nombre, consulta.assigned_profile.apellido].filter(Boolean).join(' ')
    : null
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-zinc-300 dark:hover:border-white/15"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100">{nombre}</span>
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', ESTADO_STYLE[consulta.estado as ConsultaEstado])}>
            {ESTADO_LABEL[consulta.estado as ConsultaEstado]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{(TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto] ?? '').toLowerCase()}</span>
          {consulta.telefono && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{consulta.telefono}</span></>}
          {asignado && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-zinc-700 dark:text-zinc-300">{asignado}</span></>}
          {consulta.diagnostico_at && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-emerald-600 dark:text-emerald-400">diagnóstico listo</span></>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-[11px] text-zinc-400">{timeAgo(consulta.created_at)}</span>
        <TiempoEstadoBadge estadoChangedAt={consulta.estado_changed_at} />
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400" />
    </button>
  )
}

// ── Kanban card compacto ─────────────────────────────────────────────────────

function KanbanCard({ consulta, onClick }: { consulta: any; onClick: () => void }) {
  const nombre = [consulta.apellido, consulta.nombre].filter(Boolean).join(', ')
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-3 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm transition-all space-y-1.5"
    >
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{nombre}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400')}>
          {TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto]}
        </span>
        {consulta.assigned_profile && (
          <span className="text-[10px] text-orange-600 dark:text-orange-400 truncate">
            {[consulta.assigned_profile.apellido, consulta.assigned_profile.nombre].filter(Boolean).join(', ')}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-zinc-400">{timeAgo(consulta.created_at)}</span>
        <TiempoEstadoBadge estadoChangedAt={consulta.estado_changed_at} />
      </div>
    </button>
  )
}

// ── Vista kanban ─────────────────────────────────────────────────────────────

function KanbanView({ onCardClick }: { onCardClick: (id: string) => void }) {
  const { data: consultas = [], isLoading, error } = useConsultas({})

  if (isLoading) return <TableSkeleton rows={3} />
  if (error) return <ErrorState message="No se pudo cargar las consultas" />

  const byEstado: Record<string, any[]> = {}
  for (const c of consultas) {
    if (!byEstado[c.estado]) byEstado[c.estado] = []
    byEstado[c.estado].push(c)
  }

  const cerradas = TERMINAL_ESTADOS.reduce((acc, e) => acc + (byEstado[e]?.length ?? 0), 0)
  const countConvertida = byEstado['convertida']?.length ?? 0
  const countResuelta = byEstado['resuelta']?.length ?? 0
  const countDescartada = byEstado['descartada']?.length ?? 0

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {KANBAN_ESTADOS.map(estado => {
            const cards = byEstado[estado] ?? []
            return (
              <div key={estado} className="w-56 shrink-0 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className={cn('text-xs font-semibold rounded-full px-2 py-0.5', ESTADO_STYLE[estado])}>
                    {ESTADO_LABEL[estado]}
                  </span>
                  <span className="text-xs font-bold text-zinc-400">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2 min-h-[60px] rounded-xl bg-zinc-50 dark:bg-zinc-800/40 p-2">
                  {cards.length === 0 ? (
                    <div className="text-[11px] text-zinc-400 italic text-center py-3">Sin consultas</div>
                  ) : (
                    cards.map((c: any) => (
                      <KanbanCard key={c.id} consulta={c} onClick={() => onCardClick(c.id)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {cerradas > 0 && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-white/10 pt-3">
          {cerradas} cerradas: {countConvertida > 0 && `${countConvertida} expediente${countConvertida > 1 ? 's' : ''}`}
          {countConvertida > 0 && (countResuelta > 0 || countDescartada > 0) && ', '}
          {countResuelta > 0 && `${countResuelta} resuelta${countResuelta > 1 ? 's' : ''}`}
          {countResuelta > 0 && countDescartada > 0 && ', '}
          {countDescartada > 0 && `${countDescartada} descartada${countDescartada > 1 ? 's' : ''}`}
        </div>
      )}
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

type VistaMode = 'lista' | 'kanban'

function getVistaInicial(): VistaMode {
  try {
    const stored = localStorage.getItem('consultas-vista')
    if (stored === 'kanban' || stored === 'lista') return stored
  } catch {}
  return 'lista'
}

export default function ConsultasPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<ConsultaEstado | ''>('')
  const [showNueva, setShowNueva] = useState(params.get('nueva') === '1')
  const [vista, setVista] = useState<VistaMode>(getVistaInicial)

  const { data: consultas, isLoading, error } = useConsultas({ estado, search })

  function handleSetVista(v: VistaMode) {
    setVista(v)
    try { localStorage.setItem('consultas-vista', v) } catch {}
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Consultas</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Potenciales clientes y diagnósticos previos al expediente</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle lista/kanban */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => handleSetVista('lista')}
              className={cn(
                'p-2 transition-colors',
                vista === 'lista'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200',
              )}
              title="Vista lista"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetVista('kanban')}
              className={cn(
                'p-2 transition-colors',
                vista === 'kanban'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200',
              )}
              title="Vista kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowNueva(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900 rounded-lg transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nueva consulta
          </button>
        </div>
      </div>

      {vista === 'kanban' ? (
        <KanbanView onCardClick={id => navigate(`/consultas/${id}`)} />
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, apellido o teléfono…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
              />
            </div>
          </div>

          {/* Tabs de estado */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {ESTADOS.map(e => (
              <button
                key={e.value}
                type="button"
                onClick={() => setEstado(e.value)}
                className={cn(
                  'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  estado === e.value
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white/20 dark:bg-white/10 dark:text-white'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/[0.08] dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>

          {/* Lista */}
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <ErrorState message="No se pudo cargar la lista de consultas" />
          ) : !consultas?.length ? (
            <EmptyState
              icon={Users}
              title="Sin consultas"
              description={estado ? `No hay consultas en estado "${ESTADO_LABEL[estado]}"` : 'Todavía no hay consultas registradas'}
              actionLabel="Nueva consulta"
              onAction={() => setShowNueva(true)}
            />
          ) : (
            <div className="space-y-2">
              {consultas.map(c => (
                <ConsultaCard key={c.id} consulta={c} onClick={() => navigate(`/consultas/${c.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {showNueva && (
        <NuevaConsultaDialog
          onClose={() => setShowNueva(false)}
          onCreated={id => { setShowNueva(false); navigate(`/consultas/${id}`) }}
        />
      )}
    </div>
  )
}
