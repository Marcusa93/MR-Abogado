import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderMentionParts } from '@/lib/utils/mentions'
import { formatDate, formatDateTime } from '@/lib/utils/date-helpers'
import { ESTADO_TAREA_LABELS, type EstadoTarea } from '@/types/enums'
import { PrioridadBadge, PRIORIDADES } from '@/components/shared/prioridad-badge'
import { useCompletarTarea, useUpdateTarea } from '@/hooks/use-tareas'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import MentionTextarea from '@/components/shared/mention-textarea'
import { cn } from '@/lib/utils'
import {
  X,
  FileText,
  Calendar,
  User,
  CheckSquare,
  Circle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Pencil,
  Save,
  IdCard,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from '@/stores/toast-store'

interface TareaDetalle {
  id: string
  titulo: string
  descripcion: string | null
  estado: string
  prioridad: string
  fecha_vencimiento: string | null
  fecha_completada: string | null
  created_at: string | null
  created_by?: string | null
  asignado_a?: string | null
  archivada?: boolean | null
  expediente:
    | {
        id: string
        numero?: string | null
        numero_expediente?: string | null
        caratula?: string | null
        clientes?: {
          id: string
          nombre: string | null
          apellido: string | null
          dni?: string | null
          cuil?: string | null
          clave_arca?: string | null
        } | null
      }
    | null
  asignado: {
    nombre: string
    apellido: string
  } | null
}

const ESTADO_ICON: Record<string, typeof Circle> = {
  PENDIENTE: Circle,
  EN_PROGRESO: Clock,
  COMPLETADA: CheckCircle2,
  CANCELADA: AlertCircle,
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: 'text-amber-500',
  EN_PROGRESO: 'text-blue-500',
  COMPLETADA: 'text-emerald-500',
  CANCELADA: 'text-zinc-700 dark:text-zinc-300',
}

function buildExpLabel(exp: TareaDetalle['expediente']): string {
  if (!exp) return ''
  if (exp.caratula) return exp.caratula
  if (exp.numero_expediente) return exp.numero_expediente
  const clienteName = exp.clientes
    ? `${exp.clientes.nombre ?? ''} ${exp.clientes.apellido ?? ''}`.trim()
    : ''
  if (exp.numero && clienteName) return `${exp.numero} — ${clienteName}`
  return exp.numero || clienteName || ''
}

interface VerTareaDialogProps {
  open: boolean
  onClose: () => void
  tarea: TareaDetalle | null
}

function CopyableField({
  label,
  value,
  secret = false,
  copied = false,
  onCopy,
}: {
  label: string
  value: string
  secret?: boolean
  copied?: boolean
  onCopy: () => void
}) {
  const displayValue = secret ? '•'.repeat(Math.min(10, value.length)) : value
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        {label}
      </p>
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate flex-1" title={secret ? '••••' : value}>
          {displayValue}
        </span>
        <button
          onClick={onCopy}
          className="shrink-0 rounded p-1 text-zinc-500 hover:text-amber-400 hover:bg-white/5 transition-colors"
          title={`Copiar ${label}`}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}

export function VerTareaDialog({ open, onClose, tarea }: VerTareaDialogProps) {
  const navigate = useNavigate()
  const completarTarea = useCompletarTarea()
  const updateTarea = useUpdateTarea()
  const { data: members } = useTeamMembers()
  const profile = useAuthStore((s) => s.profile)

  const [editing, setEditing] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<string>('MEDIA')
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('')
  const [asignadoA, setAsignadoA] = useState<string>('')
  const [showClaves, setShowClaves] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (tarea) {
      setTitulo(tarea.titulo)
      setDescripcion(tarea.descripcion ?? '')
      setPrioridad(tarea.prioridad)
      setFechaVencimiento(tarea.fecha_vencimiento ?? '')
      setAsignadoA(tarea.asignado_a ?? '')
      setEditing(false)
    }
  }, [tarea])

  if (!open || !tarea) return null

  const Icon = ESTADO_ICON[tarea.estado] ?? Circle
  const iconColor = ESTADO_COLORS[tarea.estado] ?? 'text-zinc-500'
  const canComplete =
    tarea.estado === 'PENDIENTE' || tarea.estado === 'EN_PROGRESO'

  const isAdmin = profile?.rol === 'ADMIN'
  const isOwner = profile?.id === tarea.created_by
  const isAssignee = profile?.id === tarea.asignado_a
  const canEdit = (isAdmin || isOwner || isAssignee) && !tarea.archivada

  const expLabel = buildExpLabel(tarea.expediente)

  const goToExpediente = () => {
    if (!tarea.expediente) return
    onClose()
    navigate(`/expedientes/${tarea.expediente.id}`)
  }

  const handleComplete = async () => {
    await completarTarea.mutateAsync(tarea.id)
    onClose()
  }

  const handleSave = async () => {
    if (!titulo.trim()) return
    await updateTarea.mutateAsync({
      id: tarea.id,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      prioridad: prioridad as 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE',
      fecha_vencimiento: fechaVencimiento || null,
      asignado_a: asignadoA || null,
    })
    setEditing(false)
  }

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(label)
      setTimeout(() => setCopiedKey((c) => (c === label ? null : c)), 1500)
      toast.success(`${label} copiado`)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const handleCancelEdit = () => {
    setTitulo(tarea.titulo)
    setDescripcion(tarea.descripcion ?? '')
    setPrioridad(tarea.prioridad)
    setFechaVencimiento(tarea.fecha_vencimiento ?? '')
    setAsignadoA(tarea.asignado_a ?? '')
    setEditing(false)
  }

  const parts = tarea.descripcion ? renderMentionParts(tarea.descripcion) : []

  const inputClass =
    'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/5 px-5 py-4 gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
              <span className={cn('text-xs font-medium', iconColor)}>
                {ESTADO_TAREA_LABELS[tarea.estado as EstadoTarea] ?? tarea.estado}
              </span>
              {!editing && <PrioridadBadge prioridad={tarea.prioridad} compact />}
            </div>
            {editing ? (
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título de la tarea"
                className={`${inputClass} text-base font-semibold`}
              />
            ) : (
              <h2
                className={cn(
                  'text-base font-semibold text-zinc-900 dark:text-zinc-50 break-words',
                  tarea.estado === 'COMPLETADA' && 'line-through opacity-70'
                )}
              >
                {tarea.titulo}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Expediente vinculado (prominente) */}
          {tarea.expediente ? (
            <button
              onClick={goToExpediente}
              className="group w-full flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-left hover:bg-amber-500/10 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-amber-400/80">
                  Expediente vinculado
                </p>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {expLabel || 'Expediente sin título'}
                </p>
                {tarea.expediente.numero && expLabel !== tarea.expediente.numero && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {tarea.expediente.numero}
                  </p>
                )}
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-amber-400 opacity-60 group-hover:opacity-100" />
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5" />
              Esta tarea no está vinculada a ningún expediente.
            </div>
          )}

          {/* Cliente + datos sensibles */}
          {tarea.expediente?.clientes && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <IdCard className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Cliente
                  </p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {[tarea.expediente.clientes.nombre, tarea.expediente.clientes.apellido]
                      .filter(Boolean)
                      .join(' ') || 'Sin nombre'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pl-5">
                {tarea.expediente.clientes.dni && (
                  <CopyableField
                    label="DNI"
                    value={tarea.expediente.clientes.dni}
                    copied={copiedKey === 'DNI'}
                    onCopy={() => handleCopy('DNI', tarea.expediente!.clientes!.dni!)}
                  />
                )}
                {tarea.expediente.clientes.cuil && (
                  <CopyableField
                    label="CUIL"
                    value={tarea.expediente.clientes.cuil}
                    copied={copiedKey === 'CUIL'}
                    onCopy={() => handleCopy('CUIL', tarea.expediente!.clientes!.cuil!)}
                  />
                )}
              </div>

              {tarea.expediente.clientes.clave_arca && (
                <div className="pl-5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <Key className="h-3 w-3" />
                      Claves
                    </div>
                    <button
                      onClick={() => setShowClaves((v) => !v)}
                      className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      {showClaves ? (
                        <>
                          <EyeOff className="h-3 w-3" /> Ocultar
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" /> Mostrar
                        </>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CopyableField
                      label="Clave ARCA"
                      value={tarea.expediente.clientes.clave_arca}
                      secret={!showClaves}
                      copied={copiedKey === 'Clave ARCA'}
                      onCopy={() =>
                        handleCopy('Clave ARCA', tarea.expediente!.clientes!.clave_arca!)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Descripción */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Descripción
            </p>
            {editing ? (
              <MentionTextarea
                value={descripcion}
                onChange={setDescripcion}
                placeholder="Detalles adicionales... usá @ para mencionar"
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
              />
            ) : tarea.descripcion ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                {parts.map((part, i) =>
                  part.type === 'mention' ? (
                    <span key={i} className="font-medium text-amber-400">
                      {part.content}
                    </span>
                  ) : (
                    <span key={i}>{part.content}</span>
                  )
                )}
              </p>
            ) : (
              <p className="text-sm text-zinc-500 italic">Sin descripción</p>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
            {editing ? (
              <>
                <div>
                  <label className={labelClass}>Prioridad</label>
                  <select
                    value={prioridad}
                    onChange={(e) => setPrioridad(e.target.value)}
                    className={inputClass}
                  >
                    {PRIORIDADES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Vencimiento</label>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Asignar a</label>
                  <select
                    value={asignadoA}
                    onChange={(e) => setAsignadoA(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sin asignar</option>
                    {(members ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.apellido} {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <User className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Asignado a
                    </p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">
                      {tarea.asignado
                        ? `${tarea.asignado.nombre} ${tarea.asignado.apellido}`
                        : 'Sin asignar'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Vencimiento
                    </p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      {tarea.fecha_vencimiento ? formatDate(tarea.fecha_vencimiento) : 'Sin fecha'}
                    </p>
                  </div>
                </div>

                {tarea.fecha_completada && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Completada
                      </p>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">
                        {formatDateTime(tarea.fecha_completada)}
                      </p>
                    </div>
                  </div>
                )}

                {tarea.created_at && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Creada
                      </p>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">
                        {formatDateTime(tarea.created_at)}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3 flex-wrap">
          {editing ? (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={updateTarea.isPending}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={updateTarea.isPending || !titulo.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
              >
                {updateTarea.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Guardar cambios
              </button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
              {tarea.expediente && (
                <button
                  onClick={goToExpediente}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir al expediente
                </button>
              )}
              {canComplete && (
                <button
                  onClick={handleComplete}
                  disabled={completarTarea.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {completarTarea.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckSquare className="h-3.5 w-3.5" />
                  )}
                  Completar
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
