import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useConsultas, useCreateConsulta, useConsultasConteo,
  TIPO_ASUNTO_LABEL, CANAL_LABEL, ESTADO_LABEL,
  type ConsultaEstado, type ConsultaCanal, type ConsultaTipoAsunto,
} from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { PageHeader } from '@/components/shared/page-header'
import {
  Plus, Search, Users, X,
  ChevronRight, LayoutGrid, List, Clock, CheckCircle2,
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
    <span className={cn('flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums', color)} title="Días en este estado">
      <Clock className="h-3 w-3" />
      {dias === 1 ? '1 día' : `${dias} días`}
    </span>
  )
}

// ── Estado badges ───────────────────────────────────────────────────────────

const ESTADO_STYLE: Record<ConsultaEstado, string> = {
  pendiente: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  en_proceso: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  presupuestada: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  con_claudio: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  requiere_info: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  redactando: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300',
  convertida: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  resuelta: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  descartada: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
}

const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="app-card w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl dark:bg-[var(--popover)]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/[0.08]">
          <div>
            <p className="eyebrow">Consultas</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Nueva consulta</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Nombre *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Juan"
                className="field h-11"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Apellido</label>
              <input
                type="text"
                value={form.apellido}
                onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
                placeholder="García"
                className="field h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder="381 4XX-XXXX"
                className="field h-11"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="juan@email.com"
                className="field h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Cómo llegó</label>
              <select
                value={form.canal}
                onChange={e => setForm(f => ({ ...f, canal: e.target.value as ConsultaCanal }))}
                className="field h-11"
              >
                {Object.entries(CANAL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Tipo de asunto</label>
              <select
                value={form.tipo_asunto}
                onChange={e => setForm(f => ({ ...f, tipo_asunto: e.target.value as ConsultaTipoAsunto }))}
                className="field h-11"
              >
                {Object.entries(TIPO_ASUNTO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <button type="button" onClick={onClose} className="btn btn-ghost border-transparent">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="btn btn-primary"
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
  const estado = consulta.estado as ConsultaEstado
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card group flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
    >
      <div className="min-w-0 flex-1">
        {/* El nombre va solo en su línea: en el celular no compite con la etiqueta de estado */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">{nombre}</span>
          <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-zinc-500">{timeAgo(consulta.created_at)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          <span className={cn(TAG, ESTADO_STYLE[estado])}>{ESTADO_LABEL[estado]}</span>
          <span>{TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto] ?? ''}</span>
          {consulta.telefono && <><span className="text-zinc-400 dark:text-zinc-600" aria-hidden>·</span><span className="tabular-nums">{consulta.telefono}</span></>}
          {asignado && <><span className="text-zinc-400 dark:text-zinc-600" aria-hidden>·</span><span className="text-zinc-700 dark:text-zinc-300">{asignado}</span></>}
          {consulta.diagnostico_at && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Diagnóstico listo
            </span>
          )}
          <span className="ml-auto"><TiempoEstadoBadge estadoChangedAt={consulta.estado_changed_at} /></span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-[var(--brand-accent)] dark:text-zinc-600" />
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
      className="app-card w-full space-y-2 rounded-xl p-3 text-left"
    >
      <div className="truncate text-[13px] font-bold tracking-tight text-zinc-900 dark:text-white">{nombre}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(TAG, 'border-zinc-500/20 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>
          {TIPO_ASUNTO_LABEL[consulta.tipo_asunto as ConsultaTipoAsunto]}
        </span>
        {consulta.assigned_profile && (
          <span className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {[consulta.assigned_profile.apellido, consulta.assigned_profile.nombre].filter(Boolean).join(', ')}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium tabular-nums text-zinc-500">{timeAgo(consulta.created_at)}</span>
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
              <div key={estado} className="flex w-60 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className={cn(TAG, 'px-2.5 py-0.5 text-[11px]', ESTADO_STYLE[estado])}>
                    {ESTADO_LABEL[estado]}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-zinc-500">{cards.length}</span>
                </div>
                <div className="flex min-h-[60px] flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {cards.length === 0 ? (
                    <div className="py-3 text-center text-[11px] font-medium text-zinc-500">Sin consultas</div>
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
  // Cuántas hay abiertas en cada estado (consulta liviana, ya la usa el tablero)
  const { data: conteo } = useConsultasConteo()
  const abiertas = conteo ? Object.values(conteo).reduce((a, n) => a + n, 0) : null

  function handleSetVista(v: VistaMode) {
    setVista(v)
    try { localStorage.setItem('consultas-vista', v) } catch {}
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow={abiertas == null ? 'Antes del expediente' : `${abiertas} ${abiertas === 1 ? 'abierta' : 'abiertas'}`}
        title="Consultas"
        subtitle="Potenciales clientes y diagnósticos previos al expediente"
        actions={
          <>
            <div className="segmented" role="group" aria-label="Vista">
              <button type="button" onClick={() => handleSetVista('lista')} aria-pressed={vista === 'lista'} title="Vista lista">
                <List className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => handleSetVista('kanban')} aria-pressed={vista === 'kanban'} title="Vista tablero">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={() => setShowNueva(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              Nueva consulta
            </button>
          </>
        }
      />

      {vista === 'kanban' ? (
        <KanbanView onCardClick={id => navigate(`/consultas/${id}`)} />
      ) : (
        <>
          {/* Búsqueda */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              placeholder="Buscar por nombre, apellido o teléfono…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field h-11 pl-10"
            />
          </div>

          {/* Estados: en el celular se desliza de lado sin cortar la pantalla */}
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {ESTADOS.map(e => {
              const n = e.value ? conteo?.[e.value] : undefined
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setEstado(e.value)}
                  aria-pressed={estado === e.value}
                  className="chip"
                >
                  {e.label}
                  {!!n && <span className="chip-count">{n}</span>}
                </button>
              )
            })}
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
