import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamMembers } from '@/hooks/use-team-members'
import {
  useTeamWorkloadSummary,
  type MemberSummary,
} from '@/hooks/use-workload'
import {
  useMiTrabajoBoard,
  useUpdateAsuntoField,
  type AsuntoItem,
  type AsuntoField,
} from '@/hooks/use-mi-trabajo'
import {
  useAddActividad,
  useAsuntoActividad,
  TIPOS_CONSULTA,
  TIPOS_EXPEDIENTE,
  TIPO_LABELS,
  TIPO_DOT,
  TIPO_BADGE,
} from '@/hooks/use-asunto-actividad'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/date-helpers'
import {
  Loader2, ExternalLink, FolderOpen, FolderPlus, Users,
  Briefcase, AlertCircle, Lock, Clock, Search, X, History,
  PlusCircle, Plus, Calendar,
} from 'lucide-react'
import { NotificacionesHoyPanel } from '@/components/dashboard/notificaciones-hoy-panel'
import { TareasAsignadasPanel } from '@/components/dashboard/tareas-asignadas-panel'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PRIORIDAD: Record<string, { label: string; dot: string; text: string }> = {
  BAJA:    { label: 'Baja',    dot: 'bg-zinc-300 dark:bg-zinc-500',  text: 'text-zinc-500 dark:text-zinc-400'  },
  MEDIA:   { label: 'Media',   dot: 'bg-cyan-400',                   text: 'text-cyan-700 dark:text-cyan-400'  },
  ALTA:    { label: 'Alta',    dot: 'bg-amber-400',                  text: 'text-amber-600 dark:text-amber-400'},
  URGENTE: { label: 'Urgente', dot: 'bg-red-500',                    text: 'text-red-600 dark:text-red-400'    },
}

const PRIO_TOP: Record<string, string> = {
  URGENTE: 'border-t-red-500',
  ALTA:    'border-t-amber-400',
  MEDIA:   'border-t-cyan-400',
  BAJA:    'border-t-zinc-200 dark:border-t-zinc-700',
}

const PRIO_BORDER: Record<string, string> = {
  URGENTE: 'border-l-red-500',
  ALTA:    'border-l-amber-400',
  MEDIA:   'border-l-cyan-300 dark:border-l-cyan-700',
  BAJA:    'border-l-zinc-200 dark:border-l-zinc-700',
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente:           'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  en_proceso:          'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  presupuestada:       'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  con_claudio:         'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  requiere_info:       'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  redactando:          'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  convertida:          'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  resuelta:            'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  descartada:          'border-zinc-500/25 bg-zinc-500/10 text-zinc-500 dark:text-zinc-500',
  NUEVA_CONSULTA:      'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  PARA_INICIAR:        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  INICIADO:            'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  PRUEBA:              'border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300',
  ALEGATOS:            'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  SENTENCIA:           'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  APELACION:           'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  CORTE:               'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  FINALIZADO:          'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  NO_VIABLE_RECHAZADO: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-500 dark:text-zinc-500',
  PAUSADO:             'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
}
const ESTADO_BADGE_DEFAULT = 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'

// Etiqueta con borde (estado, tipo de asunto) y tono por tipo
const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'
const TIPO_TAG = {
  consulta:   'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  expediente: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
}

const ESTADO_CONSULTA: Record<string, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', presupuestada: 'Presupuestada',
  con_claudio: 'Con Claudio', requiere_info: 'Requiere info', redactando: 'Redactando',
  convertida: 'Convertida', resuelta: 'Resuelta', descartada: 'Descartada',
}

const ESTADO_EXPEDIENTE: Record<string, string> = {
  NUEVA_CONSULTA: 'Nueva consulta', PARA_INICIAR: 'Para iniciar', INICIADO: 'Iniciado',
  PRUEBA: 'En prueba', ALEGATOS: 'Alegatos', SENTENCIA: 'Sentencia',
  APELACION: 'Apelación', CORTE: 'Corte', FINALIZADO: 'Finalizado',
  NO_VIABLE_RECHAZADO: 'Rechazado', PAUSADO: 'Pausado',
}

const FUERO_LABEL: Record<string, string> = {
  civil: 'Civil', laboral: 'Laboral', penal: 'Penal', familia: 'Familia',
  administrativo: 'Adm.', comercial: 'Comercial', previsional: 'Previsional', otro: 'Otro',
}

const TIPO_ASUNTO_LABEL: Record<string, string> = {
  laboral_trabajador: 'Laboral (trab.)', laboral_empleador: 'Laboral (emp.)',
  civil: 'Civil', familia: 'Familia', previsional: 'Previsional', penal: 'Penal', otro: 'Otro',
}

const SIN_MOVIMIENTO_DEFAULT = 30

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function relativeTime(iso: string): string {
  const d = daysSince(iso)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7)   return `hace ${d}d`
  if (d < 30)  return `hace ${Math.floor(d / 7)}sem`
  if (d < 365) return `hace ${Math.floor(d / 30)}m`
  return `hace ${Math.floor(d / 365)}a`
}

function activityColor(d: number, threshold: number): string {
  if (d >= threshold)                    return 'text-red-500 dark:text-red-400 font-semibold'
  if (d >= Math.floor(threshold * 0.6)) return 'text-amber-500 dark:text-amber-400'
  return 'text-zinc-500'
}

function estadoLabel(item: AsuntoItem): string {
  if (item.tipo === 'consulta') return ESTADO_CONSULTA[item.estado] ?? item.estado
  return ESTADO_EXPEDIENTE[item.estado] ?? item.estado.replace(/_/g, ' ').toLowerCase()
}

function materiaLabel(item: AsuntoItem): string {
  if (item.tipo === 'consulta') return TIPO_ASUNTO_LABEL[item.materia] ?? item.materia
  return FUERO_LABEL[item.materia] ?? item.materia
}

function parseNextAction(raw: string | null): { date: Date | null; text: string } {
  if (!raw) return { date: null, text: '' }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[:\s]\s*(.+)$/)
  if (m) return { date: new Date(m[1]), text: m[2].trim() }
  return { date: null, text: raw }
}

function nextActionStatus(date: Date | null): { label: string; cls: string } | null {
  if (!date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.floor((date.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)   return { label: `Vencida hace ${-diff}d`, cls: 'text-red-500 dark:text-red-400' }
  if (diff === 0) return { label: 'Hoy',    cls: 'text-amber-500 dark:text-amber-400 font-semibold' }
  if (diff === 1) return { label: 'Mañana', cls: 'text-amber-500 dark:text-amber-400' }
  if (diff <= 7)  return { label: `En ${diff}d`, cls: 'text-cyan-600 dark:text-cyan-400' }
  return { label: `En ${Math.ceil(diff / 7)}sem`, cls: 'text-zinc-500' }
}

function urgencyScore(item: AsuntoItem): number {
  const prioBase = ({ URGENTE: 3, ALTA: 2, MEDIA: 1, BAJA: 0 }[item.prioridad] ?? 1)
  const movScore = Math.min(daysSince(item.last_activity_at), 999)
  const blockerBonus = item.blocker ? 10 : 0
  return prioBase * 100_000 + movScore * 100 + blockerBonus
}

// ─────────────────────────────────────────────────────────────────────────────
// PrioCell
// ─────────────────────────────────────────────────────────────────────────────

function PrioCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const p = PRIORIDAD[value] ?? PRIORIDAD.MEDIA
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', p.dot)} />
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn('cursor-pointer appearance-none border-none bg-transparent py-0 pl-0 pr-4 text-xs font-semibold focus:outline-none', p.text)}>
        {Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiChip
// ─────────────────────────────────────────────────────────────────────────────

function KpiChip({ count, label, icon: Icon, active, variant = 'zinc', onClick }: {
  count: number; label: string; icon?: typeof AlertCircle; active: boolean
  variant?: 'red' | 'amber' | 'blue' | 'zinc' | 'indigo'; onClick: () => void
}) {
  // Pastilla del sitio: el color de alerta (rojo / ámbar) queda en el ícono y la cifra
  const tono: Record<string, string> = {
    red:    'text-red-600 dark:text-red-400',
    amber:  'text-amber-600 dark:text-amber-400',
    blue:   'text-cyan-700 dark:text-cyan-400',
    zinc:   '',
    indigo: '',
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('chip', count === 0 && 'pointer-events-none opacity-35')}>
      {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', !active && tono[variant])} />}
      <span className={cn('text-[13px] font-extrabold leading-none tabular-nums', !active && tono[variant])}>{count}</span>
      <span>{label}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AsuntoGridCard — tarjeta visual para el grid
// ─────────────────────────────────────────────────────────────────────────────

function AsuntoGridCard({ item, selected, sinMovimientoDias, onSelect }: {
  item: AsuntoItem; selected: boolean; sinMovimientoDias: number; onSelect: () => void
}) {
  const days = daysSince(item.last_activity_at)
  const { text: naText } = parseNextAction(item.next_action)

  return (
    <button type="button" onClick={onSelect}
      className={cn(
        'app-card flex w-full cursor-pointer flex-col gap-2 border-t-[3px] p-3.5 text-left',
        PRIO_TOP[item.prioridad] ?? 'border-t-zinc-200',
        selected && 'border-cyan-500/60 ring-1 ring-cyan-500/30 dark:border-cyan-400/50',
        item.blocker && !selected && 'border-amber-500/35 dark:border-amber-500/30',
        !item.blocker && days >= sinMovimientoDias && !selected && 'border-red-500/30 dark:border-red-500/25',
      )}>

      {/* Top row: tipo + days */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(TAG, 'text-[10px] font-bold uppercase tracking-[0.08em]', TIPO_TAG[item.tipo])}>
          {item.tipo === 'consulta' ? 'Consulta' : 'Expediente'}
        </span>
        <span className={cn('text-xs font-bold tabular-nums shrink-0', activityColor(days, sinMovimientoDias))}>
          {days === 0 ? 'hoy' : `${days}d`}
        </span>
      </div>

      {/* Cliente */}
      <div>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug tracking-tight text-zinc-900 dark:text-white">
          {item.cliente_label}
        </h3>
        {item.titulo && item.titulo !== item.cliente_label && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.titulo}</p>
        )}
      </div>

      {/* Estado */}
      <span className={cn(TAG, 'self-start', ESTADO_BADGE[item.estado] ?? ESTADO_BADGE_DEFAULT)}>
        {estadoLabel(item)}
      </span>

      {/* Próxima acción */}
      {naText && (
        <p className="line-clamp-1 text-[11px] text-zinc-500 dark:text-zinc-400">{naText}</p>
      )}

      {/* Bloqueo */}
      {item.blocker && (
        <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.blocker}</span>
        </div>
      )}

      {/* Footer */}
      {item.activity_count > 0 && (
        <div className="mt-auto flex items-center gap-1 border-t border-zinc-100 pt-2 text-[11px] font-medium tabular-nums text-zinc-500 dark:border-white/[0.06]">
          <History className="h-2.5 w-2.5" />
          {item.activity_count}
        </div>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CompactListRow — fila compacta para la barra lateral cuando hay panel abierto
// ─────────────────────────────────────────────────────────────────────────────

function CompactListRow({ item, selected, sinMovimientoDias, onSelect }: {
  item: AsuntoItem; selected: boolean; sinMovimientoDias: number; onSelect: () => void
}) {
  const days = daysSince(item.last_activity_at)
  const p = PRIORIDAD[item.prioridad] ?? PRIORIDAD.MEDIA

  return (
    <button type="button" onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 border-b border-zinc-100 px-3 py-2.5 text-left transition-colors dark:border-white/[0.05]',
        selected
          ? 'border-l-2 border-l-cyan-500 bg-cyan-500/10 pl-2.5'
          : 'hover:bg-zinc-50 dark:hover:bg-white/[0.04]',
      )}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', p.dot)} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[13px] font-semibold leading-tight',
          selected ? 'text-cyan-700 dark:text-cyan-300' : 'text-zinc-800 dark:text-zinc-200')}>
          {item.cliente_label}
        </p>
        <p className="truncate text-[11px] text-zinc-500">{estadoLabel(item)}</p>
      </div>
      <span className={cn('shrink-0 text-[11px] font-semibold tabular-nums',
        activityColor(days, sinMovimientoDias))}>
        {days}d
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AsuntoDetailPanel — panel combinado de edición + actividad
// ─────────────────────────────────────────────────────────────────────────────

function AsuntoDetailPanel({ item, onClose, onUpdate, sinMovimientoDias }: {
  item: AsuntoItem
  onClose: () => void
  onUpdate: (field: AsuntoField, value: string | null) => void
  sinMovimientoDias: number
}) {
  const { data: entries = [], isLoading: loadingEntries } = useAsuntoActividad(item)
  const addActividad = useAddActividad()

  const tipos = item.tipo === 'consulta' ? [...TIPOS_CONSULTA] : [...TIPOS_EXPEDIENTE]
  const [notaTipo, setNotaTipo] = useState<string>(tipos[0])
  const [notaText, setNotaText] = useState('')

  // Editable field states — se sincronizan cuando cambia el ítem
  const [nextAction, setNextAction] = useState(item.next_action ?? '')
  const [blocker, setBlocker] = useState(item.blocker ?? '')
  const [folderUrl, setFolderUrl] = useState(item.folder_url ?? '')

  useEffect(() => {
    setNextAction(item.next_action ?? '')
    setBlocker(item.blocker ?? '')
    setFolderUrl(item.folder_url ?? '')
  }, [item.id, item.next_action, item.blocker, item.folder_url])

  const days = daysSince(item.last_activity_at)
  const { date: naDate } = parseNextAction(item.next_action)
  const naStatus = nextActionStatus(naDate)

  function commitField(field: AsuntoField, raw: string) {
    onUpdate(field, raw.trim() || null)
  }

  function submitNota() {
    const trimmed = notaText.trim()
    if (!trimmed || addActividad.isPending) return
    addActividad.mutate(
      { item, tipo: notaTipo, descripcion: trimmed },
      { onSuccess: () => setNotaText('') },
    )
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[var(--card)]">

      {/* Drag handle (mobile) */}
      <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
        <div className="h-1 w-12 rounded-full bg-zinc-200 dark:bg-white/15" />
      </div>

      {/* Header */}
      <div className="flex shrink-0 items-start gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-white/[0.08]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(TAG, 'text-[10px] font-bold uppercase tracking-[0.08em]', TIPO_TAG[item.tipo])}>
              {item.tipo === 'consulta' ? 'Consulta' : 'Expediente'}
            </span>
            <Link to={item.href} title="Abrir detalle completo"
              className="text-zinc-400 transition-colors hover:text-[var(--brand-accent)]">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <h2 className="mt-1 truncate text-lg font-extrabold leading-tight tracking-tight text-zinc-900 dark:text-white">
            {item.cliente_label}
          </h2>
          {item.titulo && item.titulo !== item.cliente_label && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{item.titulo}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="btn btn-ghost btn-icon shrink-0 border-transparent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Stats rápidas */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="eyebrow mb-1.5">Prioridad</p>
            <PrioCell value={item.prioridad} onChange={v => onUpdate('prioridad', v)} />
          </div>
          <div>
            <p className="eyebrow mb-1.5">Estado</p>
            <span className={cn(TAG, 'text-[11px]', ESTADO_BADGE[item.estado] ?? ESTADO_BADGE_DEFAULT)}>
              {estadoLabel(item)}
            </span>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Última act.</p>
            <span className={cn('text-xs font-semibold', activityColor(days, sinMovimientoDias))}>
              {relativeTime(item.last_activity_at)}
            </span>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Materia</p>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{materiaLabel(item)}</span>
          </div>
        </div>

        <div className="h-px bg-zinc-100 dark:bg-white/[0.08]" />

        {/* Campos editables */}
        <div className="space-y-4">

          {/* Próxima acción */}
          <div>
            <label className="eyebrow mb-1.5 flex items-center gap-2">
              Próxima acción
              {naStatus && (
                <span className={cn('lowercase normal-case tracking-normal font-medium text-[10px]', naStatus.cls)}>
                  — {naStatus.label}
                </span>
              )}
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              onBlur={() => commitField('next_action', nextAction)}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitField('next_action', nextAction); e.currentTarget.blur() }
              }}
              placeholder="Ej: 2026-09-15: Enviar TCL al juzgado"
              className="field h-11"
            />
          </div>

          {/* Bloqueo */}
          <div>
            <label className="eyebrow mb-1.5 flex items-center gap-2">
              Bloqueo
              {blocker && (
                <button type="button"
                  onClick={() => { setBlocker(''); onUpdate('blocker', null) }}
                  className="text-red-400 hover:text-red-500 text-[10px] normal-case tracking-normal font-medium transition-colors">
                  — limpiar
                </button>
              )}
            </label>
            <input
              type="text"
              value={blocker}
              onChange={e => setBlocker(e.target.value)}
              onBlur={() => commitField('blocker', blocker)}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitField('blocker', blocker); e.currentTarget.blur() }
              }}
              placeholder="¿Qué frena el avance?"
              className={cn(
                'field h-11',
                blocker && 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
              )}
            />
          </div>

          {/* Carpeta Drive */}
          <div>
            <label className="eyebrow mb-1.5 block">
              Carpeta Drive
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderUrl}
                onChange={e => setFolderUrl(e.target.value)}
                onBlur={() => commitField('folder_url', folderUrl)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { commitField('folder_url', folderUrl); e.currentTarget.blur() }
                }}
                placeholder="https://drive.google.com/…"
                className="field h-11 min-w-0 flex-1"
              />
              {folderUrl.trim() && (
                <a href={folderUrl.trim()} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost btn-icon h-11 w-11 shrink-0">
                  <FolderOpen className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Crear/ver expediente (consultas) */}
          {item.tipo === 'consulta' && !item.convertida_expediente_id && (
            <Link to={`/expedientes/nuevo?desde_consulta=${item.id}`}
              className="btn btn-secondary w-full justify-start">
              <PlusCircle className="h-4 w-4 shrink-0" />
              Convertir en expediente
            </Link>
          )}
          {item.tipo === 'consulta' && item.convertida_expediente_id && (
            <Link to={`/expedientes/${item.convertida_expediente_id}`}
              className="btn btn-ghost w-full justify-start">
              <ExternalLink className="h-4 w-4 shrink-0" />
              Ver expediente vinculado
            </Link>
          )}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-white/[0.08]" />

        {/* Timeline de actividad */}
        <div>
          <h4 className="eyebrow mb-3 flex items-center gap-2">
            Actividad
            {item.activity_count > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-zinc-200 px-1 text-[9px] font-bold tabular-nums tracking-normal text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                {item.activity_count}
              </span>
            )}
          </h4>

          {loadingEntries ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-xs font-medium text-zinc-500">Sin actividad registrada.</p>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-zinc-200 dark:bg-white/[0.08]" />
              {entries.map(entry => (
                <div key={entry.id} className="relative pl-5">
                  <div className={cn('absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[var(--card)]',
                    TIPO_DOT[entry.tipo] ?? 'bg-zinc-300 dark:bg-zinc-600')} />
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className={cn('rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.06em]',
                        TIPO_BADGE[entry.tipo] ?? TIPO_BADGE.otro)}>
                        {TIPO_LABELS[entry.tipo] ?? entry.tipo}
                      </span>
                      <span className="text-[10.5px] tabular-nums text-zinc-500">{formatDateTime(entry.created_at)}</span>
                      {entry.autor && entry.autor !== 'Sistema' && entry.autor !== 'SAE' && (
                        <span className="text-[10.5px] text-zinc-500">· {entry.autor}</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                      {entry.descripcion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nota rápida — sticky al pie */}
      <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[var(--card)]">
        <div className="flex gap-2 items-center">
          <select
            value={notaTipo}
            onChange={e => setNotaTipo(e.target.value)}
            className="field h-10 w-auto shrink-0 cursor-pointer py-0 pr-8 text-xs font-medium">
            {tipos.map(t => <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>)}
          </select>
          <input
            type="text"
            value={notaText}
            onChange={e => setNotaText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNota() }}
            placeholder="Nota rápida — Enter para guardar"
            className="field h-10 min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={submitNota}
            disabled={!notaText.trim() || addActividad.isPending}
            aria-label="Guardar nota"
            className="btn btn-primary btn-icon h-10 w-10 shrink-0">
            {addActividad.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FocoCard + FocoDia — strip horizontal con los 3 asuntos más urgentes
// ─────────────────────────────────────────────────────────────────────────────

function FocoCard({ item, sinMovimientoDias, onOpenDetail, onUpdate }: {
  item: AsuntoItem; sinMovimientoDias: number
  onOpenDetail: () => void
  onUpdate: (field: AsuntoField, value: string | null) => void
}) {
  const days = daysSince(item.last_activity_at)
  const { text: naText } = parseNextAction(item.next_action)

  return (
    <div className={cn(
      'app-card flex w-[192px] shrink-0 flex-col gap-2 border-l-4 p-3',
      PRIO_BORDER[item.prioridad] ?? 'border-l-transparent',
    )}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">
            {item.cliente_label}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn(TAG, 'px-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em]', TIPO_TAG[item.tipo])}>
              {item.tipo === 'consulta' ? 'Cta' : 'Exp'}
            </span>
            <span className={cn('text-[10.5px] font-medium tabular-nums', activityColor(days, sinMovimientoDias))}>
              {relativeTime(item.last_activity_at)}
            </span>
          </div>
        </div>
        <PrioCell value={item.prioridad} onChange={v => onUpdate('prioridad', v)} />
      </div>

      <span className={cn(TAG, 'self-start', ESTADO_BADGE[item.estado] ?? ESTADO_BADGE_DEFAULT)}>
        {estadoLabel(item)}
      </span>

      {naText && (
        <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{naText}</p>
      )}

      {item.blocker && (
        <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.blocker}</span>
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-zinc-100 pt-2 dark:border-white/[0.06]">
        <button type="button" onClick={onOpenDetail}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
          <History className="h-3 w-3" />
          Detalle
        </button>
        <Link to={item.href}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
          <ExternalLink className="h-3 w-3" />
          Abrir
        </Link>
      </div>
    </div>
  )
}

function FocoDia({ items, sinMovimientoDias, onOpenDetail, onUpdate }: {
  items: AsuntoItem[]; sinMovimientoDias: number
  onOpenDetail: (item: AsuntoItem) => void
  onUpdate: (item: AsuntoItem, field: AsuntoField, value: string | null) => void
}) {
  if (items.length < 4) return null
  const top = [...items].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 3)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="eyebrow whitespace-nowrap">
          Foco del día
        </span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/[0.08]" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {top.map(item => (
          <FocoCard
            key={`${item.tipo}-${item.id}`}
            item={item}
            sinMovimientoDias={sinMovimientoDias}
            onOpenDetail={() => onOpenDetail(item)}
            onUpdate={(field, value) => onUpdate(item, field, value)}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamMemberCard
// ─────────────────────────────────────────────────────────────────────────────

type TeamMember = { id: string; nombre: string | null; apellido: string | null; rol: string }

function TeamMemberCard({ member, summary, isLoading, onSelect }: {
  member: TeamMember; summary: MemberSummary | undefined; isLoading: boolean; onSelect: () => void
}) {
  const initials = [(member.apellido?.[0] ?? ''), (member.nombre?.[0] ?? '')].join('').toUpperCase() || '?'
  const nombre = [member.apellido, member.nombre].filter(Boolean).join(', ')
  const hasVencidas = (summary?.tareasVencidas ?? 0) > 0
  const total = (summary?.tareas ?? 0) + (summary?.consultas ?? 0) + (summary?.miembros ?? 0)
  return (
    <div className={cn('app-card flex flex-col gap-3 p-4',
      hasVencidas && 'border-red-500/30 dark:border-red-500/30')}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-[var(--brand-navy)]/10 dark:bg-[var(--brand-accent)]/15 flex items-center justify-center text-sm font-bold text-[var(--brand-navy)] dark:text-[var(--brand-ice)] shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">{nombre}</p>
          <p className="text-xs lowercase text-zinc-500">{member.rol}</p>
        </div>
        {hasVencidas && (
          <span className={cn(TAG, 'tabular-nums border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300')}>
            {summary!.tareasVencidas} venc.
          </span>
        )}
      </div>
      {isLoading
        ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-zinc-400" /></div>
        : summary
          ? <div className="grid grid-cols-3 gap-2 text-center">
              {([['tareas', 'Tareas', hasVencidas], ['consultas', 'Consultas', false], ['miembros', 'Expedientes', false]] as [keyof MemberSummary, string, boolean][]).map(([k, label, venc]) => (
                <div key={label} className={cn('rounded-xl p-2', venc ? 'bg-red-500/10' : 'bg-zinc-50 dark:bg-white/[0.04]')}>
                  <p className={cn('text-xl font-extrabold tracking-tight tabular-nums', venc ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-white')}>{summary[k]}</p>
                  <p className="mt-0.5 text-[10.5px] font-semibold text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
          : null}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs font-medium tabular-nums text-zinc-500">{total} ítems activos</span>
        <button type="button" onClick={onSelect}
          className="btn btn-ghost btn-sm">
          Ver detalle →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type SortField = 'urgencia' | 'sin_movimiento' | 'cliente' | 'estado'

export default function MiTrabajoPage() {
  const profile = useAuthStore(s => s.profile)
  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'

  const [tab, setTab] = useState<'personal' | 'equipo'>('personal')
  const { data: team = [] } = useTeamMembers()
  const [selectedId, setSelectedId] = useState<string>(profile?.id ?? '')
  useEffect(() => { if (profile?.id && !selectedId) setSelectedId(profile.id) }, [profile?.id, selectedId])
  const isViewingSelf = selectedId === profile?.id
  const selectedMember = team.find(m => m.id === selectedId)

  const { data: items = [], isLoading } = useMiTrabajoBoard(selectedId)
  const updateField = useUpdateAsuntoField()

  // Panel de detalle — almacena la clave, el ítem se deriva de `items`
  const [panelKey, setPanelKey] = useState<{ id: string; tipo: AsuntoItem['tipo'] } | null>(null)
  const panelItem = panelKey
    ? (items.find(i => i.id === panelKey.id && i.tipo === panelKey.tipo) ?? null)
    : null

  // Si el ítem del panel desaparece (ej: cambia a estado excluido), cierra el panel
  useEffect(() => {
    if (panelKey && !panelItem) setPanelKey(null)
  }, [panelKey, panelItem])

  function openPanel(item: AsuntoItem) {
    setPanelKey({ id: item.id, tipo: item.tipo })
  }

  // Filters
  const [search,              setSearch]              = useState('')
  const [filterPrioridad,     setFilterPrioridad]     = useState<string | null>(null)
  const [filterTipo,          setFilterTipo]          = useState<'consulta' | 'expediente' | null>(null)
  const [filterBloqueados,    setFilterBloqueados]    = useState(false)
  const [filterSinMovimiento, setFilterSinMovimiento] = useState(false)
  const [sinMovimientoDias,   setSinMovimientoDias]   = useState(SIN_MOVIMIENTO_DEFAULT)
  const [sortField,           setSortField]           = useState<SortField>('urgencia')

  // Team summary
  const teamIds = isAdmin && tab === 'equipo' ? team.map(m => m.id) : []
  const { data: teamSummary = {}, isLoading: loadingTeamSummary } = useTeamWorkloadSummary(teamIds)

  // KPIs
  const nUrgente    = items.filter(i => i.prioridad === 'URGENTE').length
  const nAlta       = items.filter(i => i.prioridad === 'ALTA').length
  const nBloqueados = items.filter(i => !!i.blocker).length
  const nSinMov     = items.filter(i => daysSince(i.last_activity_at) >= sinMovimientoDias).length
  const nConsultas  = items.filter(i => i.tipo === 'consulta').length
  const nExp        = items.filter(i => i.tipo === 'expediente').length

  // Filter + sort
  const filtered = items.filter(item => {
    if (search) {
      const q = search.toLowerCase()
      if (!item.cliente_label.toLowerCase().includes(q) && !item.titulo.toLowerCase().includes(q)) return false
    }
    if (filterPrioridad && item.prioridad !== filterPrioridad) return false
    if (filterTipo && item.tipo !== filterTipo) return false
    if (filterBloqueados && !item.blocker) return false
    if (filterSinMovimiento && daysSince(item.last_activity_at) < sinMovimientoDias) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'urgencia')       return urgencyScore(b) - urgencyScore(a)
    if (sortField === 'sin_movimiento') return daysSince(b.last_activity_at) - daysSince(a.last_activity_at)
    if (sortField === 'cliente')        return a.cliente_label.localeCompare(b.cliente_label, 'es')
    if (sortField === 'estado')         return estadoLabel(a).localeCompare(estadoLabel(b), 'es')
    return 0
  })

  const hasFilters = !!(search || filterPrioridad || filterTipo || filterBloqueados || filterSinMovimiento)

  function clearFilters() {
    setSearch(''); setFilterPrioridad(null); setFilterTipo(null)
    setFilterBloqueados(false); setFilterSinMovimiento(false)
  }

  function toggleKpi(field: string, value?: string) {
    if (field === 'prioridad')     setFilterPrioridad(p => p === value ? null : (value ?? null))
    if (field === 'tipo')          setFilterTipo(t => t === value ? null : (value as 'consulta' | 'expediente' | null))
    if (field === 'bloqueados')    setFilterBloqueados(v => !v)
    if (field === 'sinMovimiento') setFilterSinMovimiento(v => !v)
  }

  function handleUpdate(item: AsuntoItem, field: AsuntoField, value: string | null) {
    updateField.mutate({ tipo: item.tipo, id: item.id, field, value })
  }

  const pageTitle = tab === 'equipo'
    ? 'Panorama del equipo'
    : isViewingSelf ? 'Mi trabajo' : `Trabajo de ${selectedMember?.apellido ?? ''} ${selectedMember?.nombre ?? ''}`

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const todayLabel = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {tab === 'personal' && isViewingSelf ? (
            <>
              <div className="eyebrow mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {todayLabel}
              </div>
              <h1 className="page-title">
                {greeting}, {profile?.nombre ?? profile?.apellido ?? 'Doctor'}
              </h1>
              {!isLoading && (
                <p className="page-subtitle">
                  {items.length === 0 ? 'Sin asuntos activos' : `${items.length} ${items.length === 1 ? 'asunto activo' : 'asuntos activos'}`}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="page-title">{pageTitle}</h1>
              {tab === 'personal' && (
                <p className="page-subtitle">
                  {isLoading ? 'Cargando…'
                    : `${items.length} ${items.length === 1 ? 'asunto activo' : 'asuntos activos'}${!isViewingSelf ? ' — vista de administrador' : ''}`}
                </p>
              )}
            </>
          )}
        </div>
        {isAdmin && team.length > 1 && tab === 'personal' && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="whitespace-nowrap text-xs font-semibold text-zinc-500">Ver como:</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="field h-9 w-auto max-w-[220px] cursor-pointer py-0 pr-8 text-[13px] font-medium">
              {team.map(m => (
                <option key={m.id} value={m.id}>{m.apellido} {m.nombre}{m.id === profile?.id ? ' (yo)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex border-b border-zinc-200 dark:border-white/[0.08]">
          {(['personal', 'equipo'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn('-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                tab === t ? 'border-[var(--brand-navy)] text-[var(--brand-navy)] dark:border-[var(--brand-accent)] dark:text-white' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200')}>
              {t === 'personal' ? <Briefcase className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {t === 'personal' ? 'Mis asuntos' : 'Equipo'}
            </button>
          ))}
        </div>
      )}

      {/* TAB: EQUIPO */}
      {tab === 'equipo' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {team.map(m => (
            <TeamMemberCard key={m.id} member={m} summary={teamSummary[m.id]} isLoading={loadingTeamSummary}
              onSelect={() => { setSelectedId(m.id); setTab('personal') }} />
          ))}
        </div>
      )}

      {/* TAB: PERSONAL */}
      {tab === 'personal' && (
        <>
          {/* Tareas asignadas — lo primero que se ve al entrar */}
          {selectedId && (
            <TareasAsignadasPanel
              profileId={selectedId}
              isSelf={isViewingSelf}
              nombre={selectedMember ? `${selectedMember.nombre ?? ''} ${selectedMember.apellido ?? ''}`.trim() : undefined}
            />
          )}

          {/* Notificaciones del día */}
          <NotificacionesHoyPanel />

          {/* Foco del día */}
          {!isLoading && items.length >= 4 && (
            <FocoDia
              items={items}
              sinMovimientoDias={sinMovimientoDias}
              onOpenDetail={openPanel}
              onUpdate={handleUpdate}
            />
          )}

          {/* KPI strip */}
          <div className="flex flex-wrap gap-2">
            <KpiChip count={nUrgente}    label="Urgente"    icon={AlertCircle} variant="red"   active={filterPrioridad === 'URGENTE'} onClick={() => toggleKpi('prioridad', 'URGENTE')} />
            <KpiChip count={nAlta}       label="Alta"       icon={AlertCircle} variant="amber" active={filterPrioridad === 'ALTA'}    onClick={() => toggleKpi('prioridad', 'ALTA')} />
            <KpiChip count={nBloqueados} label="Bloqueados" icon={Lock}        variant="amber" active={filterBloqueados}              onClick={() => toggleKpi('bloqueados')} />
            <KpiChip count={nSinMov}     label={`Sin mov. +${sinMovimientoDias}d`} icon={Clock} variant="red" active={filterSinMovimiento} onClick={() => toggleKpi('sinMovimiento')} />
            <div className="flex-1" />
            <KpiChip count={nConsultas} label="Consultas"   variant="zinc"   active={filterTipo === 'consulta'}   onClick={() => toggleKpi('tipo', 'consulta')} />
            <KpiChip count={nExp}       label="Expedientes" variant="indigo" active={filterTipo === 'expediente'} onClick={() => toggleKpi('tipo', 'expediente')} />
          </div>

          {/* Barra de filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative min-w-[160px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente o asunto…"
                className="field h-11 pl-10" />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Clock className="h-3 w-3" />
              <input type="number" min={7} max={365} value={sinMovimientoDias}
                onChange={e => setSinMovimientoDias(Number(e.target.value) || 30)}
                className="field h-9 w-14 px-1 py-0 text-center text-xs tabular-nums" />
              <span>días</span>
            </div>

            <select value={sortField} onChange={e => setSortField(e.target.value as SortField)}
              className="field h-11 w-auto cursor-pointer py-0 pr-8 text-[13px] font-medium">
              <option value="urgencia">Ordenar: Urgencia</option>
              <option value="sin_movimiento">Sin movimiento</option>
              <option value="cliente">A-Z</option>
              <option value="estado">Estado</option>
            </select>

            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="btn btn-ghost btn-sm border-transparent">
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>

          {/* Contenido principal */}
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-16 text-center text-sm font-medium text-zinc-500">
              {hasFilters ? 'Ningún asunto coincide con los filtros.' : 'Sin asuntos activos asignados.'}
            </p>
          ) : (
            <>
              {/* Mobile: grid completo + bottom sheet al seleccionar */}
              <div className="md:hidden space-y-2">
                {sorted.map(item => (
                  <AsuntoGridCard
                    key={`${item.tipo}-${item.id}`}
                    item={item}
                    selected={panelItem?.id === item.id && panelItem?.tipo === item.tipo}
                    sinMovimientoDias={sinMovimientoDias}
                    onSelect={() => openPanel(item)}
                  />
                ))}

                {panelItem && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
                      onClick={() => setPanelKey(null)} aria-hidden="true" />
                    <div className="fixed inset-x-0 bottom-0 top-[5%] z-50 overflow-hidden rounded-t-3xl shadow-2xl dark:border-t dark:border-white/10">
                      <AsuntoDetailPanel
                        item={panelItem}
                        onClose={() => setPanelKey(null)}
                        onUpdate={(field, value) => handleUpdate(panelItem, field, value)}
                        sinMovimientoDias={sinMovimientoDias}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Desktop: grid (sin selección) o split pane (con selección) */}
              {!panelItem ? (
                <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {sorted.map(item => (
                    <AsuntoGridCard
                      key={`${item.tipo}-${item.id}`}
                      item={item}
                      selected={false}
                      sinMovimientoDias={sinMovimientoDias}
                      onSelect={() => openPanel(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="app-card hidden md:flex"
                  style={{ height: 'calc(100svh - 310px)', minHeight: '500px' }}>

                  {/* Lista compacta izquierda */}
                  <div className="w-[240px] shrink-0 overflow-y-auto border-r border-zinc-100 dark:border-white/[0.06]">
                    {sorted.map(item => (
                      <CompactListRow
                        key={`${item.tipo}-${item.id}`}
                        item={item}
                        selected={panelItem.id === item.id && panelItem.tipo === item.tipo}
                        sinMovimientoDias={sinMovimientoDias}
                        onSelect={() => openPanel(item)}
                      />
                    ))}
                  </div>

                  {/* Panel de detalle derecho */}
                  <div className="flex-1 overflow-hidden">
                    <AsuntoDetailPanel
                      item={panelItem}
                      onClose={() => setPanelKey(null)}
                      onUpdate={(field, value) => handleUpdate(panelItem, field, value)}
                      sinMovimientoDias={sinMovimientoDias}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium tabular-nums text-zinc-500">
                  {sorted.length === items.length
                    ? `${items.length} asuntos`
                    : `${sorted.length} de ${items.length} asuntos`}
                </span>
                {panelItem && (
                  <button type="button" onClick={() => setPanelKey(null)}
                    className="btn btn-ghost btn-sm hidden border-transparent md:inline-flex">
                    <X className="h-3 w-3" />
                    Cerrar panel
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
