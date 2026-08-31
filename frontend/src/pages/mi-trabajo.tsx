import { useState, useEffect, useRef, useCallback } from 'react'
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
import { useAddActividad } from '@/hooks/use-asunto-actividad'
import { ActividadDrawer } from '@/components/mi-trabajo/actividad-drawer'
import { cn } from '@/lib/utils'
import {
  Loader2, ExternalLink, FolderOpen, FolderPlus, Users,
  Briefcase, AlertCircle, Lock, Clock, Search, X, History,
  ArrowUpDown, ArrowUp, ArrowDown, PlusCircle, PenLine,
  AlignJustify, LayoutList,
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

// Left border by priority — applied to the first td for visual hierarchy
const PRIO_BORDER: Record<string, string> = {
  URGENTE: 'border-l-red-500',
  ALTA:    'border-l-amber-400',
  MEDIA:   'border-l-blue-300 dark:border-l-blue-700',
  BAJA:    'border-l-zinc-200 dark:border-l-zinc-700',
}

// Estado badge colors independent of priority
const ESTADO_BADGE: Record<string, string> = {
  // Consultas
  pendiente:     'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  en_proceso:    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  presupuestada: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  con_claudio:   'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
  requiere_info: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
  redactando:    'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
  convertida:    'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300',
  resuelta:      'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  descartada:    'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500',
  // Expedientes
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
  administrativo: 'Administrativo', comercial: 'Comercial', previsional: 'Previsional', otro: 'Otro',
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

// Parses "2026-09-05: Texto" → { date, text }. Plain text → { date: null, text }
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

// Urgency score: primary by priority, secondary by days without movement + blocker
// Higher score = more urgent = appears first in default sort
function urgencyScore(item: AsuntoItem): number {
  const prioBase = ({ URGENTE: 3, ALTA: 2, MEDIA: 1, BAJA: 0 }[item.prioridad] ?? 1)
  const movScore = Math.min(daysSince(item.last_activity_at), 999)
  const blockerBonus = item.blocker ? 10 : 0
  return prioBase * 100_000 + movScore * 100 + blockerBonus
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineEdit
// ─────────────────────────────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, placeholder = 'Agregar…', className, renderValue,
}: {
  value: string | null
  onSave: (v: string | null) => void
  placeholder?: string
  className?: string
  renderValue?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const commit = useCallback(() => {
    setEditing(false)
    const v = draft.trim()
    if (v !== (value ?? '')) onSave(v || null)
  }, [draft, value, onSave])

  if (!editing) return (
    <button type="button" onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      title={value ?? placeholder}
      className={cn('text-left w-full py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-white/5 px-1 -ml-1 transition-colors',
        !renderValue && (value ? 'text-zinc-700 dark:text-zinc-300 text-xs truncate' : 'text-zinc-300 dark:text-zinc-600 italic text-xs truncate'),
        className)}>
      {renderValue ?? value ?? placeholder}
    </button>
  )
  return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value ?? '') } }}
      placeholder={placeholder}
      className="w-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none min-w-0" />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NextActionCell — InlineEdit con date badge cuando se usa formato YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────

function NextActionCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const { date, text } = parseNextAction(value)
  const status = nextActionStatus(date)

  const display = value ? (
    <div className="flex flex-col gap-0.5 w-full min-w-0">
      {status && (
        <span className={cn('text-[9px] font-semibold uppercase tracking-wide leading-none', status.cls)}>
          {status.label}
        </span>
      )}
      <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{text}</span>
    </div>
  ) : undefined

  return <InlineEdit value={value} onSave={onSave} placeholder="Próxima acción…" renderValue={display} />
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
// FolderCell
// ─────────────────────────────────────────────────────────────────────────────

function FolderCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const commit = useCallback(() => {
    setEditing(false)
    const v = draft.trim()
    if (v !== (value ?? '')) onSave(v || null)
  }, [draft, value, onSave])

  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value ?? '') } }}
      placeholder="https://drive.google.com/..."
      className="w-28 text-xs bg-zinc-50 dark:bg-zinc-800 border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none" />
  )
  if (value) return (
    <div className="flex items-center gap-1 group">
      <a href={value} target="_blank" rel="noopener noreferrer" title="Abrir carpeta Drive"
        className="p-1 rounded text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
        <FolderOpen className="h-3.5 w-3.5" />
      </a>
      <button type="button" onClick={() => { setDraft(value); setEditing(true) }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-300 hover:text-zinc-500 transition-all text-[10px] leading-none" title="Editar link">
        ✎
      </button>
    </div>
  )
  return (
    <button type="button" onClick={() => { setDraft(''); setEditing(true) }} title="Agregar carpeta Drive"
      className="p-1 rounded text-zinc-200 dark:text-zinc-700 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
      <FolderPlus className="h-3.5 w-3.5" />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickNotePopover — nota rápida sin abrir el drawer completo
// ─────────────────────────────────────────────────────────────────────────────

function QuickNotePopover({ item }: { item: AsuntoItem }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addActividad = useAddActividad()

  useEffect(() => {
    if (!open) return
    setTimeout(() => textareaRef.current?.focus(), 50)
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setText('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || addActividad.isPending) return
    addActividad.mutate(
      { item, tipo: 'nota', descripcion: trimmed },
      { onSuccess: () => { setText(''); setOpen(false) } },
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Nota rápida"
        className="p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors">
        <PenLine className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1.5 w-60 z-30 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/10 shadow-2xl p-2.5 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
            Nota rápida — {item.cliente_label}
          </p>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setOpen(false); setText('') }
            }}
            placeholder="Escribí la nota… (Enter para guardar, Shift+Enter para nueva línea)"
            rows={3}
            className="text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-zinc-400 w-full"
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => { setOpen(false); setText('') }}
              className="text-xs px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={submit} disabled={!text.trim() || addActividad.isPending}
              className="text-xs px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1">
              {addActividad.isPending && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      )}
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
// SortHeader
// ─────────────────────────────────────────────────────────────────────────────

type SortField = 'prioridad' | 'last_activity' | 'cliente' | 'estado'

function SortHeader({ field, label, current, dir, onSort }: {
  field: SortField; label: string; current: SortField; dir: 'asc' | 'desc'; onSort: (f: SortField) => void
}) {
  const active = current === field
  return (
    <th onClick={() => onSort(field)}
      className="px-3 py-2.5 text-left font-medium cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 select-none whitespace-nowrap">
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Action buttons — shared between Row and Card
// ─────────────────────────────────────────────────────────────────────────────

function RowActions({ item, onOpenActividad, size = 'sm' }: {
  item: AsuntoItem; onOpenActividad: () => void; size?: 'sm' | 'md'
}) {
  const btnCls = size === 'sm'
    ? 'p-1 rounded transition-colors inline-flex'
    : 'p-1.5 rounded transition-colors inline-flex'
  const iconCls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div className="flex items-center gap-0.5">
      <QuickNotePopover item={item} />
      <button type="button" onClick={onOpenActividad} title="Historial de actividad"
        className={cn(btnCls, 'relative text-zinc-300 dark:text-zinc-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10')}>
        <History className={iconCls} />
        {item.activity_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 flex items-center justify-center text-[8px] font-bold bg-indigo-500 text-white rounded-full leading-none">
            {item.activity_count > 9 ? '9+' : item.activity_count}
          </span>
        )}
      </button>
      {item.tipo === 'consulta' && !item.convertida_expediente_id && (
        <Link to={`/expedientes/nuevo?desde_consulta=${item.id}`}
          title="Crear caso a partir de esta consulta"
          className={cn(btnCls, 'text-zinc-300 dark:text-zinc-600 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10')}>
          <PlusCircle className={iconCls} />
        </Link>
      )}
      <Link to={item.href} title="Abrir detalle"
        className={cn(btnCls, 'text-zinc-300 dark:text-zinc-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10')}>
        <ExternalLink className={iconCls} />
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AsuntoRow — tabla desktop
// ─────────────────────────────────────────────────────────────────────────────

function AsuntoRow({ item, sinMovimientoDias, compact, onUpdate, onOpenActividad }: {
  item: AsuntoItem; sinMovimientoDias: number; compact: boolean
  onUpdate: (field: AsuntoField, value: string | null) => void
  onOpenActividad: () => void
}) {
  const days = daysSince(item.last_activity_at)
  const isBloqueado = !!item.blocker
  const isSinMovimiento = days >= sinMovimientoDias
  const py = compact ? 'py-1.5' : 'py-3'

  return (
    <tr className={cn('transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02]',
      isBloqueado && 'bg-amber-50/30 dark:bg-amber-900/5',
      isSinMovimiento && !isBloqueado && 'bg-red-50/20 dark:bg-red-900/5')}>

      {/* Asunto — lleva el border de prioridad */}
      <td className={cn('px-4 min-w-[200px] max-w-[260px] border-l-4', py,
        PRIO_BORDER[item.prioridad] ?? 'border-l-transparent')}>
        <div className="flex items-start gap-2 min-w-0">
          <span className={cn('shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded',
            item.tipo === 'consulta'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
              : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')}>
            {item.tipo === 'consulta' ? 'Cta' : 'Exp'}
          </span>
          <div className="min-w-0">
            <span className="block font-medium text-zinc-800 dark:text-zinc-200 text-sm truncate" title={item.cliente_label}>
              {item.cliente_label}
            </span>
            {!compact && (
              <span className="block text-xs text-zinc-400 truncate mt-0.5" title={item.titulo}>
                {item.titulo}
              </span>
            )}
            {item.tipo === 'consulta' && item.convertida_expediente_id && (
              <Link to={`/expedientes/${item.convertida_expediente_id}`}
                className="inline-flex items-center gap-0.5 text-[10px] text-teal-600 dark:text-teal-400 hover:underline mt-0.5">
                → Ver caso
              </Link>
            )}
          </div>
        </div>
      </td>

      {/* Materia */}
      <td className={cn('px-3 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400', py)}>
        {materiaLabel(item)}
      </td>

      {/* Prioridad */}
      <td className={cn('px-3', py)}>
        <PrioCell value={item.prioridad} onChange={v => onUpdate('prioridad', v)} />
      </td>

      {/* Estado — color semántico por estado */}
      <td className={cn('px-3', py)}>
        <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
          ESTADO_BADGE[item.estado] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
          {estadoLabel(item)}
        </span>
      </td>

      {/* Próxima acción con date badge */}
      <td className={cn('px-3 min-w-[160px] max-w-[200px]', py)}>
        <NextActionCell value={item.next_action} onSave={v => onUpdate('next_action', v)} />
      </td>

      {/* Bloqueo */}
      <td className={cn('px-3 min-w-[140px] max-w-[180px]', py)}>
        {isBloqueado ? (
          <div className="flex items-center gap-1 group">
            <Lock className="h-3 w-3 shrink-0 text-amber-500" />
            <InlineEdit value={item.blocker} onSave={v => onUpdate('blocker', v)} placeholder="Bloqueo…"
              className="text-amber-700 dark:text-amber-400" />
            <button type="button" onClick={() => onUpdate('blocker', null)} title="Limpiar bloqueo"
              className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-zinc-300 hover:text-red-400 transition-all">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <InlineEdit value={null} onSave={v => onUpdate('blocker', v)} placeholder="Sin bloqueo" />
        )}
      </td>

      {/* Última actividad */}
      <td className={cn('px-3 whitespace-nowrap text-xs', py)}>
        <span className={activityColor(days, sinMovimientoDias)} title={item.last_activity_at}>
          {relativeTime(item.last_activity_at)}
        </span>
      </td>

      {/* Carpeta Drive */}
      <td className={cn('px-3', py)}>
        <FolderCell value={item.folder_url} onSave={v => onUpdate('folder_url', v)} />
      </td>

      {/* Acciones */}
      <td className={cn('px-3', py)}>
        <RowActions item={item} onOpenActividad={onOpenActividad} />
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AsuntoCard — layout mobile
// ─────────────────────────────────────────────────────────────────────────────

function AsuntoCard({ item, sinMovimientoDias, onOpenActividad }: {
  item: AsuntoItem; sinMovimientoDias: number; onOpenActividad: () => void
}) {
  const days = daysSince(item.last_activity_at)
  const { date, text: naText } = parseNextAction(item.next_action)
  const naStatus = nextActionStatus(date)
  const p = PRIORIDAD[item.prioridad] ?? PRIORIDAD.MEDIA

  return (
    <div className={cn('px-4 py-3.5 border-b border-zinc-100 dark:border-white/5 last:border-0 border-l-4',
      PRIO_BORDER[item.prioridad] ?? 'border-l-transparent',
      item.blocker && 'bg-amber-50/30 dark:bg-amber-900/5',
      !item.blocker && days >= sinMovimientoDias && 'bg-red-50/20 dark:bg-red-900/5')}>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={cn('shrink-0 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded',
            item.tipo === 'consulta'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
              : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')}>
            {item.tipo === 'consulta' ? 'Cta' : 'Exp'}
          </span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">{item.cliente_label}</span>
        </div>
        <span className={cn('h-2 w-2 rounded-full shrink-0', p.dot)} title={p.label} />
      </div>

      {/* Subtitle */}
      <p className="text-xs text-zinc-400 truncate mb-2">{item.titulo}</p>

      {/* Estado + materia */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
          ESTADO_BADGE[item.estado] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500')}>
          {estadoLabel(item)}
        </span>
        <span className="text-[10px] text-zinc-400">{materiaLabel(item)}</span>
        {item.tipo === 'consulta' && item.convertida_expediente_id && (
          <Link to={`/expedientes/${item.convertida_expediente_id}`}
            className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline">
            → Ver caso
          </Link>
        )}
      </div>

      {/* Próxima acción */}
      {naText && (
        <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {naStatus && <span className={cn('text-[9px] font-semibold uppercase tracking-wide shrink-0', naStatus.cls)}>{naStatus.label}</span>}
          <span className="truncate">{naText}</span>
        </div>
      )}

      {/* Bloqueo */}
      {item.blocker && (
        <div className="flex items-center gap-1 mb-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Lock className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.blocker}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-50 dark:border-white/5">
        <span className={cn('text-xs', activityColor(days, sinMovimientoDias))}>
          {relativeTime(item.last_activity_at)}
        </span>
        <RowActions item={item} onOpenActividad={onOpenActividad} size="md" />
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
  const [actividadAsunto, setActividadAsunto] = useState<AsuntoItem | null>(null)

  // Compact mode toggle
  const [compact, setCompact] = useState(false)

  // Filters
  const [search,              setSearch]              = useState('')
  const [filterPrioridad,     setFilterPrioridad]     = useState<string | null>(null)
  const [filterTipo,          setFilterTipo]          = useState<'consulta' | 'expediente' | null>(null)
  const [filterEstado,        setFilterEstado]        = useState<string | null>(null)
  const [filterBloqueados,    setFilterBloqueados]    = useState(false)
  const [filterSinMovimiento, setFilterSinMovimiento] = useState(false)
  const [filterSinCarpeta,    setFilterSinCarpeta]    = useState(false)
  const [sinMovimientoDias,   setSinMovimientoDias]   = useState(SIN_MOVIMIENTO_DEFAULT)

  // Sorting
  const [sortField, setSortField] = useState<SortField>('prioridad')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')

  function handleSort(field: SortField) {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Team summary
  const teamIds = isAdmin && tab === 'equipo' ? team.map(m => m.id) : []
  const { data: teamSummary = {}, isLoading: loadingTeamSummary } = useTeamWorkloadSummary(teamIds)

  // KPIs
  const nUrgente     = items.filter(i => i.prioridad === 'URGENTE').length
  const nAlta        = items.filter(i => i.prioridad === 'ALTA').length
  const nBloqueados  = items.filter(i => !!i.blocker).length
  const nSinMov      = items.filter(i => daysSince(i.last_activity_at) >= sinMovimientoDias).length
  const nSinCarpeta  = items.filter(i => !i.folder_url).length
  const nConsultas   = items.filter(i => i.tipo === 'consulta').length
  const nExpedientes = items.filter(i => i.tipo === 'expediente').length

  const estadosDisponibles = [...new Set(items.map(i => i.estado))].sort()

  // Filter
  const filtered = items.filter(item => {
    if (search) {
      const q = search.toLowerCase()
      if (!item.cliente_label.toLowerCase().includes(q) && !item.titulo.toLowerCase().includes(q)) return false
    }
    if (filterPrioridad && item.prioridad !== filterPrioridad) return false
    if (filterTipo && item.tipo !== filterTipo) return false
    if (filterEstado && item.estado !== filterEstado) return false
    if (filterBloqueados && !item.blocker) return false
    if (filterSinMovimiento && daysSince(item.last_activity_at) < sinMovimientoDias) return false
    if (filterSinCarpeta && item.folder_url) return false
    return true
  })

  // Sort — "prioridad" usa urgency score compuesto (prioridad + días + blocker)
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortField === 'prioridad')      cmp = urgencyScore(b) - urgencyScore(a)
    else if (sortField === 'last_activity') cmp = new Date(a.last_activity_at).getTime() - new Date(b.last_activity_at).getTime()
    else if (sortField === 'cliente')   cmp = a.cliente_label.localeCompare(b.cliente_label, 'es')
    else if (sortField === 'estado')    cmp = estadoLabel(a).localeCompare(estadoLabel(b), 'es')
    return sortDir === 'asc' ? cmp : -cmp
  })

  const hasFilters = !!(search || filterPrioridad || filterTipo || filterEstado || filterBloqueados || filterSinMovimiento || filterSinCarpeta)

  function clearFilters() {
    setSearch(''); setFilterPrioridad(null); setFilterTipo(null); setFilterEstado(null)
    setFilterBloqueados(false); setFilterSinMovimiento(false); setFilterSinCarpeta(false)
  }

  function toggleKpi(field: string, value?: string) {
    if (field === 'prioridad')     setFilterPrioridad(p => p === value ? null : (value ?? null))
    if (field === 'tipo')          setFilterTipo(t => t === value ? null : (value as 'consulta' | 'expediente' | null))
    if (field === 'bloqueados')    setFilterBloqueados(v => !v)
    if (field === 'sinMovimiento') setFilterSinMovimiento(v => !v)
    if (field === 'sinCarpeta')    setFilterSinCarpeta(v => !v)
  }

  function handleUpdate(item: AsuntoItem, field: AsuntoField, value: string | null) {
    updateField.mutate({ tipo: item.tipo, id: item.id, field, value })
  }

  const pageTitle = tab === 'equipo'
    ? 'Panorama del equipo'
    : isViewingSelf ? 'Mi trabajo' : `Trabajo de ${selectedMember?.apellido ?? ''} ${selectedMember?.nombre ?? ''}`

  return (
    <div className="space-y-4">

      {actividadAsunto && (
        <ActividadDrawer item={actividadAsunto} onClose={() => setActividadAsunto(null)} />
      )}

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
          {/* KPI strip */}
          <div className="flex flex-wrap gap-2">
            <KpiChip count={nUrgente}    label="Urgente"    icon={AlertCircle} variant="red"   active={filterPrioridad === 'URGENTE'} onClick={() => toggleKpi('prioridad', 'URGENTE')} />
            <KpiChip count={nAlta}       label="Alta"       icon={AlertCircle} variant="amber" active={filterPrioridad === 'ALTA'}    onClick={() => toggleKpi('prioridad', 'ALTA')} />
            <KpiChip count={nBloqueados} label="Bloqueados" icon={Lock}        variant="amber" active={filterBloqueados}              onClick={() => toggleKpi('bloqueados')} />
            <KpiChip count={nSinMov}     label={`Sin mov. +${sinMovimientoDias}d`} icon={Clock} variant="red" active={filterSinMovimiento} onClick={() => toggleKpi('sinMovimiento')} />
            <KpiChip count={nSinCarpeta} label="Sin carpeta" icon={FolderPlus} variant="zinc"  active={filterSinCarpeta}              onClick={() => toggleKpi('sinCarpeta')} />
            <div className="flex-1" />
            <KpiChip count={nConsultas}   label="Consultas"   variant="zinc"   active={filterTipo === 'consulta'}   onClick={() => toggleKpi('tipo', 'consulta')} />
            <KpiChip count={nExpedientes} label="Expedientes" variant="indigo" active={filterTipo === 'expediente'} onClick={() => toggleKpi('tipo', 'expediente')} />
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente o asunto…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-zinc-400" />
            </div>

            <select value={filterEstado ?? ''} onChange={e => setFilterEstado(e.target.value || null)}
              className="text-sm rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">Todos los estados</option>
              {estadosDisponibles.map(est => (
                <option key={est} value={est}>{ESTADO_CONSULTA[est] ?? ESTADO_EXPEDIENTE[est] ?? est}</option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              <span>Sin mov.</span>
              <input type="number" min={7} max={365} value={sinMovimientoDias}
                onChange={e => setSinMovimientoDias(Number(e.target.value) || 30)}
                className="w-14 text-center rounded border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <span>días</span>
            </div>

            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}

            {/* Compact toggle — solo visible en desktop */}
            <button type="button" onClick={() => setCompact(c => !c)}
              title={compact ? 'Vista expandida' : 'Vista compacta'}
              className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors ml-auto">
              {compact ? <LayoutList className="h-3.5 w-3.5" /> : <AlignJustify className="h-3.5 w-3.5" />}
              {compact ? 'Expandida' : 'Compacta'}
            </button>
          </div>

          {/* Tabla + cards */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/8 bg-white dark:bg-zinc-900 overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-center text-sm text-zinc-400 italic py-12">
                {hasFilters ? 'Ningún asunto coincide con los filtros activos.' : 'Sin asuntos activos asignados.'}
              </p>
            ) : (
              <>
                {/* Tabla — desktop (sticky header dentro del scroll container) */}
                <div className="hidden md:block overflow-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-white/5 text-xs text-zinc-400 uppercase tracking-wide shadow-[0_1px_0_0_theme(colors.zinc.100)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                      <tr>
                        <SortHeader field="cliente"       label="Cliente / Asunto" current={sortField} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Materia</th>
                        <SortHeader field="prioridad"     label="Prioridad"        current={sortField} dir={sortDir} onSort={handleSort} />
                        <SortHeader field="estado"        label="Estado"           current={sortField} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Próxima acción</th>
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Bloqueo</th>
                        <SortHeader field="last_activity" label="Última act."      current={sortField} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Carpeta</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-white/[0.03]">
                      {sorted.map(item => (
                        <AsuntoRow key={`${item.tipo}-${item.id}`} item={item}
                          sinMovimientoDias={sinMovimientoDias}
                          compact={compact}
                          onUpdate={(field, value) => handleUpdate(item, field, value)}
                          onOpenActividad={() => setActividadAsunto(item)} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards — mobile */}
                <div className="md:hidden">
                  {sorted.map(item => (
                    <AsuntoCard key={`${item.tipo}-${item.id}`} item={item}
                      sinMovimientoDias={sinMovimientoDias}
                      onOpenActividad={() => setActividadAsunto(item)} />
                  ))}
                </div>
              </>
            )}

            {sorted.length > 0 && (
              <div className="px-4 py-2 border-t border-zinc-50 dark:border-white/3 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {sorted.length === items.length ? `${items.length} asuntos` : `${sorted.length} de ${items.length} asuntos`}
                </span>
                <span className="hidden md:block text-xs text-zinc-300 dark:text-zinc-600">
                  Click en prioridad, próxima acción, bloqueo o carpeta para editar · PenLine para nota rápida
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
