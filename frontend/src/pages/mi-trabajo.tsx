import { useState, useEffect, useRef } from 'react'
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
  PlusCircle, Plus,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PRIORIDAD: Record<string, { label: string; dot: string; text: string }> = {
  BAJA:    { label: 'Baja',    dot: 'bg-zinc-300 dark:bg-zinc-500',  text: 'text-zinc-500 dark:text-zinc-400'  },
  MEDIA:   { label: 'Media',   dot: 'bg-blue-400',                   text: 'text-blue-600 dark:text-blue-400'  },
  ALTA:    { label: 'Alta',    dot: 'bg-amber-400',                  text: 'text-amber-600 dark:text-amber-400'},
  URGENTE: { label: 'Urgente', dot: 'bg-red-500',                    text: 'text-red-600 dark:text-red-400'    },
}

const PRIO_TOP: Record<string, string> = {
  URGENTE: 'border-t-red-500',
  ALTA:    'border-t-amber-400',
  MEDIA:   'border-t-blue-400',
  BAJA:    'border-t-zinc-200 dark:border-t-zinc-700',
}

const PRIO_BORDER: Record<string, string> = {
  URGENTE: 'border-l-red-500',
  ALTA:    'border-l-amber-400',
  MEDIA:   'border-l-blue-300 dark:border-l-blue-700',
  BAJA:    'border-l-zinc-200 dark:border-l-zinc-700',
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente:           'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  en_proceso:          'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  presupuestada:       'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  con_claudio:         'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
  requiere_info:       'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
  redactando:          'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
  convertida:          'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300',
  resuelta:            'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  descartada:          'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500',
  NUEVA_CONSULTA:      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  PARA_INICIAR:        'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  INICIADO:            'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  PRUEBA:              'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300',
  ALEGATOS:            'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300',
  SENTENCIA:           'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  APELACION:           'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
  CORTE:               'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300',
  FINALIZADO:          'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  NO_VIABLE_RECHAZADO: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500',
  PAUSADO:             'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
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
  return 'text-zinc-400'
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
  if (diff <= 7)  return { label: `En ${diff}d`, cls: 'text-blue-500 dark:text-blue-400' }
  return { label: `En ${Math.ceil(diff / 7)}sem`, cls: 'text-zinc-400' }
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
        className={cn('text-xs bg-transparent border-none cursor-pointer focus:outline-none py-0 pl-0 pr-4 appearance-none', p.text)}>
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
  const base: Record<string, string> = {
    red:    'border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10',
    amber:  'border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10',
    blue:   'border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10',
    zinc:   'border-zinc-200 dark:border-white/8 text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50',
    indigo: 'border-indigo-200 dark:border-indigo-800/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10',
  }
  return (
    <button type="button" onClick={onClick}
      className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all shrink-0', base[variant],
        active && 'ring-2 ring-current ring-offset-1 ring-offset-white dark:ring-offset-zinc-950 font-semibold',
        count === 0 && 'opacity-35 pointer-events-none')}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-bold tabular-nums text-base leading-none">{count}</span>
      <span className="text-xs">{label}</span>
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
        'w-full text-left rounded-xl border-2 border-t-[3px] p-3.5 flex flex-col gap-2',
        'transition-all duration-150 cursor-pointer bg-white dark:bg-zinc-900',
        PRIO_TOP[item.prioridad] ?? 'border-t-zinc-200',
        selected
          ? 'border-blue-400 dark:border-blue-500 shadow-md ring-1 ring-blue-200 dark:ring-blue-900/40'
          : 'border-zinc-200 dark:border-white/8 hover:border-zinc-300 dark:hover:border-white/14 hover:shadow-sm',
        item.blocker && !selected && 'bg-amber-50/30 dark:bg-amber-900/5',
        !item.blocker && days >= sinMovimientoDias && !selected && 'bg-red-50/20 dark:bg-red-900/5',
      )}>

      {/* Top row: tipo + days */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
          item.tipo === 'consulta'
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
            : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')}>
          {item.tipo === 'consulta' ? 'Consulta' : 'Expediente'}
        </span>
        <span className={cn('text-xs font-bold tabular-nums shrink-0', activityColor(days, sinMovimientoDias))}>
          {days === 0 ? 'hoy' : `${days}d`}
        </span>
      </div>

      {/* Cliente */}
      <div>
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-snug line-clamp-2">
          {item.cliente_label}
        </h3>
        {item.titulo && item.titulo !== item.cliente_label && (
          <p className="text-[10px] text-zinc-400 truncate mt-0.5">{item.titulo}</p>
        )}
      </div>

      {/* Estado */}
      <span className={cn('self-start inline-block px-2 py-0.5 rounded-full text-[10px] font-medium',
        ESTADO_BADGE[item.estado] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
        {estadoLabel(item)}
      </span>

      {/* Próxima acción */}
      {naText && (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">{naText}</p>
      )}

      {/* Bloqueo */}
      {item.blocker && (
        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.blocker}</span>
        </div>
      )}

      {/* Footer */}
      {item.activity_count > 0 && (
        <div className="flex items-center gap-1 mt-auto pt-2 border-t border-zinc-50 dark:border-white/5 text-[10px] text-zinc-400">
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
        'w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-zinc-50 dark:border-white/5 transition-colors',
        selected
          ? 'bg-blue-50 dark:bg-blue-900/10 border-l-2 border-l-blue-500 pl-2.5'
          : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]',
      )}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', p.dot)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium truncate leading-tight',
          selected ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-800 dark:text-zinc-200')}>
          {item.cliente_label}
        </p>
        <p className="text-[10px] text-zinc-400 truncate">{estadoLabel(item)}</p>
      </div>
      <span className={cn('text-[10px] tabular-nums font-medium shrink-0',
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
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">

      {/* Drag handle (mobile) */}
      <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
        <div className="h-1 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-white/5 flex items-start gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
              item.tipo === 'consulta'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')}>
              {item.tipo === 'consulta' ? 'Consulta' : 'Expediente'}
            </span>
            <Link to={item.href} title="Abrir detalle completo"
              className="text-zinc-400 hover:text-blue-500 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate">
            {item.cliente_label}
          </h2>
          {item.titulo && item.titulo !== item.cliente_label && (
            <p className="text-xs text-zinc-400 truncate mt-0.5">{item.titulo}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Stats rápidas */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1.5">Prioridad</p>
            <PrioCell value={item.prioridad} onChange={v => onUpdate('prioridad', v)} />
          </div>
          <div>
            <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1.5">Estado</p>
            <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium',
              ESTADO_BADGE[item.estado] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
              {estadoLabel(item)}
            </span>
          </div>
          <div>
            <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1.5">Última act.</p>
            <span className={cn('text-xs font-medium', activityColor(days, sinMovimientoDias))}>
              {relativeTime(item.last_activity_at)}
            </span>
          </div>
          <div>
            <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1.5">Materia</p>
            <span className="text-xs text-zinc-500">{materiaLabel(item)}</span>
          </div>
        </div>

        <div className="h-px bg-zinc-100 dark:bg-white/5" />

        {/* Campos editables */}
        <div className="space-y-4">

          {/* Próxima acción */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
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
              className="w-full text-sm rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-400 transition-colors"
            />
          </div>

          {/* Bloqueo */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
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
                'w-full text-sm rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 placeholder:text-zinc-400 transition-colors',
                blocker
                  ? 'border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-200 focus:ring-amber-400'
                  : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:ring-blue-400',
              )}
            />
          </div>

          {/* Carpeta Drive */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
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
                className="flex-1 text-sm rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-400 transition-colors"
              />
              {folderUrl.trim() && (
                <a href={folderUrl.trim()} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-10 shrink-0 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-400 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                  <FolderOpen className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Crear/ver expediente (consultas) */}
          {item.tipo === 'consulta' && !item.convertida_expediente_id && (
            <Link to={`/expedientes/nuevo?desde_consulta=${item.id}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800/40 bg-teal-50 dark:bg-teal-900/10 text-teal-700 dark:text-teal-300 text-sm hover:bg-teal-100 dark:hover:bg-teal-900/20 transition-colors font-medium">
              <PlusCircle className="h-4 w-4 shrink-0" />
              Convertir en expediente
            </Link>
          )}
          {item.tipo === 'consulta' && item.convertida_expediente_id && (
            <Link to={`/expedientes/${item.convertida_expediente_id}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800/40 bg-teal-50 dark:bg-teal-900/10 text-teal-700 dark:text-teal-300 text-sm hover:bg-teal-100 dark:hover:bg-teal-900/20 transition-colors">
              <ExternalLink className="h-4 w-4 shrink-0" />
              Ver expediente vinculado
            </Link>
          )}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-white/5" />

        {/* Timeline de actividad */}
        <div>
          <h4 className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">
            Actividad
            {item.activity_count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-full text-[9px] font-bold">
                {item.activity_count}
              </span>
            )}
          </h4>

          {loadingEntries ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-zinc-400 italic text-center py-6">Sin actividad registrada.</p>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-zinc-100 dark:bg-white/6" />
              {entries.map(entry => (
                <div key={entry.id} className="relative pl-5">
                  <div className={cn('absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-900',
                    TIPO_DOT[entry.tipo] ?? 'bg-zinc-300 dark:bg-zinc-600')} />
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className={cn('text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded',
                        TIPO_BADGE[entry.tipo] ?? TIPO_BADGE.otro)}>
                        {TIPO_LABELS[entry.tipo] ?? entry.tipo}
                      </span>
                      <span className="text-[10px] text-zinc-400">{formatDateTime(entry.created_at)}</span>
                      {entry.autor && entry.autor !== 'Sistema' && entry.autor !== 'SAE' && (
                        <span className="text-[10px] text-zinc-400">· {entry.autor}</span>
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
      <div className="border-t border-zinc-100 dark:border-white/5 px-4 py-3 shrink-0 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-sm">
        <div className="flex gap-2 items-center">
          <select
            value={notaTipo}
            onChange={e => setNotaTipo(e.target.value)}
            className="shrink-0 text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-2 focus:outline-none cursor-pointer">
            {tipos.map(t => <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>)}
          </select>
          <input
            type="text"
            value={notaText}
            onChange={e => setNotaText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNota() }}
            placeholder="Nota rápida — Enter para guardar"
            className="flex-1 min-w-0 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={submitNota}
            disabled={!notaText.trim() || addActividad.isPending}
            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
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
      'shrink-0 w-[192px] rounded-2xl border p-3 flex flex-col gap-2 border-l-4',
      'border-zinc-200 dark:border-white/8 bg-white dark:bg-zinc-900',
      PRIO_BORDER[item.prioridad] ?? 'border-l-transparent',
    )}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
            {item.cliente_label}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded',
              item.tipo === 'consulta'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')}>
              {item.tipo === 'consulta' ? 'Cta' : 'Exp'}
            </span>
            <span className={cn('text-[9px]', activityColor(days, sinMovimientoDias))}>
              {relativeTime(item.last_activity_at)}
            </span>
          </div>
        </div>
        <PrioCell value={item.prioridad} onChange={v => onUpdate('prioridad', v)} />
      </div>

      <span className={cn('self-start inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        ESTADO_BADGE[item.estado] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
        {estadoLabel(item)}
      </span>

      {naText && (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{naText}</p>
      )}

      {item.blocker && (
        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.blocker}</span>
        </div>
      )}

      <div className="flex items-center gap-1 mt-auto pt-2 border-t border-zinc-50 dark:border-white/5">
        <button type="button" onClick={onOpenDetail}
          className="flex-1 text-[10px] text-zinc-400 hover:text-indigo-500 flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors">
          <History className="h-3 w-3" />
          Detalle
        </button>
        <Link to={item.href}
          className="flex-1 text-[10px] text-zinc-400 hover:text-blue-500 flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
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
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
          Foco del día
        </span>
        <div className="flex-1 h-px bg-zinc-100 dark:bg-white/5" />
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
    <div className={cn('rounded-xl border bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3 transition-colors',
      hasVencidas ? 'border-red-200 dark:border-red-900/40' : 'border-zinc-200 dark:border-white/8')}>
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
      {isLoading
        ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-zinc-300" /></div>
        : summary
          ? <div className="grid grid-cols-3 gap-2 text-center">
              {([['tareas', 'Tareas', hasVencidas], ['consultas', 'Consultas', false], ['miembros', 'Expedientes', false]] as [keyof MemberSummary, string, boolean][]).map(([k, label, venc]) => (
                <div key={label} className={cn('rounded-lg p-2', venc ? 'bg-red-50 dark:bg-red-900/10' : 'bg-zinc-50 dark:bg-zinc-800/50')}>
                  <p className={cn('text-xl font-bold tabular-nums', venc ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200')}>{summary[k]}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          : null}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-zinc-400">{total} ítems activos</span>
        <button type="button" onClick={onSelect}
          className="text-xs px-3 py-1 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/3 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
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

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{pageTitle}</h1>
          {tab === 'personal' && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {isLoading ? 'Cargando…'
                : `${items.length} ${items.length === 1 ? 'asunto activo' : 'asuntos activos'}${!isViewingSelf ? ' — vista de administrador' : ''}`}
            </p>
          )}
        </div>
        {isAdmin && team.length > 1 && tab === 'personal' && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-zinc-500 whitespace-nowrap">Ver como:</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
              {team.map(m => (
                <option key={m.id} value={m.id}>{m.apellido} {m.nombre}{m.id === profile?.id ? ' (yo)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex border-b border-zinc-200 dark:border-white/8">
          {(['personal', 'equipo'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
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
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente o asunto…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-400" />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              <input type="number" min={7} max={365} value={sinMovimientoDias}
                onChange={e => setSinMovimientoDias(Number(e.target.value) || 30)}
                className="w-12 text-center rounded border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs" />
              <span>días</span>
            </div>

            <select value={sortField} onChange={e => setSortField(e.target.value as SortField)}
              className="text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
              <option value="urgencia">Ordenar: Urgencia</option>
              <option value="sin_movimiento">Sin movimiento</option>
              <option value="cliente">A-Z</option>
              <option value="estado">Estado</option>
            </select>

            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>

          {/* Contenido principal */}
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 italic py-16">
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
                    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40"
                      onClick={() => setPanelKey(null)} aria-hidden="true" />
                    <div className="fixed inset-x-0 bottom-0 top-[5%] z-50 rounded-t-2xl overflow-hidden shadow-2xl">
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
                <div className="hidden md:flex rounded-xl border border-zinc-200 dark:border-white/8 overflow-hidden bg-white dark:bg-zinc-900"
                  style={{ height: 'calc(100svh - 310px)', minHeight: '500px' }}>

                  {/* Lista compacta izquierda */}
                  <div className="w-[240px] shrink-0 border-r border-zinc-100 dark:border-white/5 overflow-y-auto">
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
                <span className="text-xs text-zinc-400">
                  {sorted.length === items.length
                    ? `${items.length} asuntos`
                    : `${sorted.length} de ${items.length} asuntos`}
                </span>
                {panelItem && (
                  <button type="button" onClick={() => setPanelKey(null)}
                    className="hidden md:flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
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
