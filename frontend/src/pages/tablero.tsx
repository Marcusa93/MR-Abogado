import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  useTareas,
  useCreateTarea,
  useUpdateTarea,
  useCompletarTarea,
  useReopenTarea,
  useTareaComentarios,
  useAddTareaComentario,
  type TareaWithRelations,
} from '@/hooks/use-tareas'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuthStore } from '@/stores/auth-store'
import { EtiquetasInput } from '@/components/shared/etiquetas-input'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/date-helpers'
import { timeAgo } from '@/lib/utils/date-helpers'
import {
  Plus, Clock, X, Loader2, FolderOpen, User,
  PlayCircle, CheckCircle2, Save, RotateCcw,
  MessageSquare, Send,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Expediente search
// ---------------------------------------------------------------------------

function useExpedienteSearch(term: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['tablero-exp-search', term],
    queryFn: async () => {
      if (term.length < 2) return []
      const { data } = await (supabase as any)
        .from('expedientes')
        .select('id, numero, caratula')
        .or(`caratula.ilike.%${term}%,numero.ilike.%${term}%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data ?? []) as { id: string; numero: string | null; caratula: string | null }[]
    },
    enabled: term.length >= 2,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORIDAD_CONFIG: Record<string, { label: string; color: string }> = {
  BAJA:    { label: 'Baja',    color: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' },
  MEDIA:   { label: 'Media',   color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  ALTA:    { label: 'Alta',    color: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  URGENTE: { label: 'Urgente', color: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' },
}

const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'
const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400'
const OPCIONAL = 'font-normal normal-case tracking-normal text-zinc-400'

interface ExpRef { id: string; label: string }

// ---------------------------------------------------------------------------
// Expediente combobox
// ---------------------------------------------------------------------------

function ExpedienteCombobox({ value, onChange }: {
  value: ExpRef | null
  onChange: (v: ExpRef | null) => void
}) {
  const [inputText, setInputText] = useState(value?.label ?? '')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const { data: results = [] } = useExpedienteSearch(term)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value) setInputText(value.label)
  }, [value])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setTerm(inputText), 250)
  }, [inputText])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <input
        type="text"
        value={value ? value.label : inputText}
        onChange={e => { if (value) onChange(null); setInputText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar por carátula o número…"
        className="field h-11"
      />
      {value && (
        <button type="button" onClick={() => { onChange(null); setInputText('') }} aria-label="Quitar expediente" className="btn btn-ghost btn-icon shrink-0 border-transparent">
          <X className="h-4 w-4" />
        </button>
      )}
      {open && !value && results.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1.5 max-h-48 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]">
          {results.map(exp => (
            <button
              key={exp.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                const label = exp.caratula || exp.numero || exp.id
                onChange({ id: exp.id, label })
                setInputText(label)
                setOpen(false)
              }}
              className="w-full truncate px-4 py-2.5 text-left text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              {exp.caratula || exp.numero}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comentarios section (dentro del dialog de edición)
// ---------------------------------------------------------------------------

function ComentariosSection({ tareaId }: { tareaId: string }) {
  const { data: comentarios = [], isLoading } = useTareaComentarios(tareaId)
  const addComentario = useAddTareaComentario()
  const [texto, setTexto] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comentarios.length])

  async function handleAdd() {
    const t = texto.trim()
    if (!t) return
    try {
      await addComentario.mutateAsync({ tareaId, contenido: t })
      setTexto('')
    } catch {
      toast.error('No se pudo agregar el comentario')
    }
  }

  return (
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-white/[0.08]">
      <div className="eyebrow flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5" />
        Comentarios {comentarios.length > 0 && `(${comentarios.length})`}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.05]" />)}
        </div>
      ) : comentarios.length === 0 ? (
        <p className="text-xs font-medium text-zinc-500">Sin comentarios todavía.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {comentarios.map(c => (
            <div key={c.id} className="flex gap-2 text-sm">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold uppercase text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                {c.autor?.nombre?.[0] ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {c.autor ? `${c.autor.nombre} ${c.autor.apellido}` : '—'}
                  </span>
                  <span className="text-[10.5px] font-medium tabular-nums text-zinc-500">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words">{c.contenido}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          placeholder="Escribir comentario… (Enter para enviar)"
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!texto.trim() || addComentario.isPending}
          aria-label="Enviar comentario"
          className="btn btn-primary btn-icon shrink-0"
        >
          {addComentario.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TareaEditDialog
// ---------------------------------------------------------------------------

function TareaEditDialog({ tarea, onClose }: { tarea: TareaWithRelations; onClose: () => void }) {
  const updateTarea = useUpdateTarea()
  const completarTarea = useCompletarTarea()
  const reopenTarea = useReopenTarea()
  const { data: members = [] } = useTeamMembers()

  const [titulo, setTitulo] = useState(tarea.titulo)
  const [descripcion, setDescripcion] = useState(tarea.descripcion ?? '')
  const [asignadoA, setAsignadoA] = useState(tarea.asignado_a)
  const [prioridad, setPrioridad] = useState(tarea.prioridad as 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE')
  const [fechaVenc, setFechaVenc] = useState(tarea.fecha_vencimiento ?? '')
  const [etiquetas, setEtiquetas] = useState<string[]>(tarea.etiquetas ?? [])
  const [expediente, setExpediente] = useState<ExpRef | null>(
    tarea.expediente ? { id: tarea.expediente.id, label: tarea.expediente.caratula || tarea.expediente.numero || '' } : null
  )

  const etiquetasOrig = tarea.etiquetas ?? []
  const dirty =
    titulo !== tarea.titulo ||
    descripcion !== (tarea.descripcion ?? '') ||
    asignadoA !== tarea.asignado_a ||
    prioridad !== tarea.prioridad ||
    fechaVenc !== (tarea.fecha_vencimiento ?? '') ||
    (expediente?.id ?? null) !== (tarea.expediente?.id ?? null) ||
    etiquetas.join(',') !== etiquetasOrig.join(',')

  const completada = tarea.estado === 'COMPLETADA'

  async function handleSave() {
    if (!titulo.trim()) { toast.error('El título es obligatorio'); return }
    try {
      await updateTarea.mutateAsync({
        id: tarea.id,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        asignado_a: asignadoA,
        prioridad,
        fecha_vencimiento: fechaVenc || null,
        prevAsignadoA: tarea.asignado_a,
        etiquetas,
      })
      onClose()
    } catch {
      toast.error('No se pudo guardar')
    }
  }

  async function handleComplete() {
    try {
      await completarTarea.mutateAsync(tarea.id)
      onClose()
    } catch {
      toast.error('No se pudo completar')
    }
  }

  async function handleReopen() {
    try {
      await reopenTarea.mutateAsync(tarea.id)
      onClose()
    } catch {
      toast.error('No se pudo reabrir')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="app-card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl dark:bg-[var(--popover)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Editar tarea</h2>
            {completada && (
              <span className={cn(TAG, 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
                Completada
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Título */}
          <div>
            <label className={LABEL}>Título</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              className="field"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className={LABEL}>Descripción</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Detalles de la tarea…"
              className="field resize-none"
            />
          </div>

          {/* Asignado / Prioridad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Asignar a</label>
              <select
                value={asignadoA}
                onChange={e => setAsignadoA(e.target.value)}
                className="field"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Prioridad</label>
              <select
                value={prioridad}
                onChange={e => setPrioridad(e.target.value as typeof prioridad)}
                className="field"
              >
                <option value="BAJA">Baja</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>

          {/* Fecha límite */}
          <div>
            <label className={LABEL}>Fecha límite</label>
            <input
              type="date"
              value={fechaVenc}
              onChange={e => setFechaVenc(e.target.value)}
              className="field"
            />
          </div>

          {/* Expediente */}
          <div>
            <label className={LABEL}>
              Expediente <span className={OPCIONAL}>(opcional)</span>
            </label>
            <ExpedienteCombobox value={expediente} onChange={setExpediente} />
          </div>

          {/* Etiquetas */}
          <div>
            <label className={LABEL}>
              Etiquetas <span className={OPCIONAL}>(Enter o coma para agregar)</span>
            </label>
            <EtiquetasInput value={etiquetas} onChange={setEtiquetas} />
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || updateTarea.isPending}
              className="btn btn-primary"
            >
              {updateTarea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>

            {!completada ? (
              <button
                type="button"
                onClick={handleComplete}
                disabled={completarTarea.isPending}
                className="btn bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {completarTarea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Completar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopenTarea.isPending}
                className="btn btn-ghost"
              >
                {reopenTarea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reabrir
              </button>
            )}
          </div>

          {/* Comentarios */}
          <ComentariosSection tareaId={tarea.id} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nueva tarea dialog
// ---------------------------------------------------------------------------

function NuevaTareaDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateTarea()
  const profile = useAuthStore(s => s.profile)
  const { data: members = [] } = useTeamMembers()

  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    asignado_a: profile?.id ?? '',
    prioridad: 'MEDIA' as 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE',
    fecha_vencimiento: '',
  })
  const [expediente, setExpediente] = useState<ExpRef | null>(null)
  const [etiquetas, setEtiquetas] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) { toast.error('El título es obligatorio'); return }
    if (!form.asignado_a) { toast.error('Asigná la tarea a alguien'); return }
    try {
      await create.mutateAsync({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        asignado_a: form.asignado_a,
        prioridad: form.prioridad,
        fecha_vencimiento: form.fecha_vencimiento || null,
        expediente_id: expediente?.id ?? null,
        created_by: profile?.id ?? '',
        estado: 'PENDIENTE',
        // etiquetas no está en TablesInsert<'tareas'> todavía — cast necesario
        ...({ etiquetas } as any),
      })
      toast.success('Tarea creada')
      onClose()
    } catch {
      toast.error('No se pudo crear la tarea')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="app-card w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl dark:bg-[var(--popover)]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/[0.08]">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Nueva tarea</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={LABEL}>Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="¿Qué hay que hacer?"
              autoFocus
              className="field"
            />
          </div>
          <div>
            <label className={LABEL}>Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              placeholder="Detalles opcionales…"
              className="field resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Asignar a *</label>
              <select
                value={form.asignado_a}
                onChange={e => setForm(f => ({ ...f, asignado_a: e.target.value }))}
                className="field"
              >
                <option value="">— Elegir —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Prioridad</label>
              <select
                value={form.prioridad}
                onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as typeof form.prioridad }))}
                className="field"
              >
                <option value="BAJA">Baja</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Fecha límite</label>
            <input
              type="date"
              value={form.fecha_vencimiento}
              onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
              className="field"
            />
          </div>
          <div>
            <label className={LABEL}>
              Expediente <span className={OPCIONAL}>(opcional)</span>
            </label>
            <ExpedienteCombobox value={expediente} onChange={setExpediente} />
          </div>
          <div>
            <label className={LABEL}>
              Etiquetas <span className={OPCIONAL}>(Enter o coma para agregar)</span>
            </label>
            <EtiquetasInput value={etiquetas} onChange={setEtiquetas} />
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
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear tarea
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TareaCard({
  tarea,
  onComplete,
  onMoveToProgress,
  onClick,
}: {
  tarea: TareaWithRelations
  onComplete: (e: React.MouseEvent) => void
  onMoveToProgress?: (e: React.MouseEvent) => void
  onClick: () => void
}) {
  const venc = tarea.fecha_vencimiento
  const hoy = new Date().toISOString().split('T')[0]
  const vencida = !!venc && venc < hoy && tarea.estado !== 'COMPLETADA'
  const esHoy = venc === hoy
  const pConfig = PRIORIDAD_CONFIG[tarea.prioridad] ?? PRIORIDAD_CONFIG.MEDIA
  const completada = tarea.estado === 'COMPLETADA'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'app-card group w-full space-y-2 rounded-xl p-3 text-left',
        vencida && 'border-red-500/30 dark:border-red-500/30',
        completada && 'opacity-60',
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div
          role="button"
          tabIndex={-1}
          onClick={onComplete}
          onKeyDown={e => e.key === 'Enter' && onComplete(e as any)}
          className={cn(
            'mt-0.5 shrink-0 h-4 w-4 rounded-full border-2 transition-colors flex items-center justify-center',
            completada
              ? 'border-green-500 bg-green-500'
              : 'border-zinc-300 dark:border-zinc-600 hover:border-green-400 dark:hover:border-green-500',
          )}
        >
          {completada && <CheckCircle2 className="h-3 w-3 text-white" />}
        </div>
        <p className={cn(
          'flex-1 text-sm font-semibold leading-snug tracking-tight text-zinc-900 dark:text-white',
          completada && 'line-through text-zinc-400 dark:text-zinc-500',
        )}>
          {tarea.titulo}
        </p>
      </div>

      {/* Descripción preview */}
      {tarea.descripcion && !completada && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-6 leading-snug line-clamp-2">
          {tarea.descripcion}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 pl-6">
        {tarea.expediente ? (
          <Link
            to={`/expedientes/${tarea.expediente.id}`}
            onClick={e => e.stopPropagation()}
            className={cn(TAG, 'max-w-[160px] gap-1 truncate border-cyan-500/30 bg-cyan-500/10 text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300')}
          >
            <FolderOpen className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">
              {tarea.expediente.caratula
                ? tarea.expediente.caratula.length > 22 ? tarea.expediente.caratula.slice(0, 22) + '…' : tarea.expediente.caratula
                : tarea.expediente.numero}
            </span>
          </Link>
        ) : (
          <span className={cn(TAG, 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300')}>
            Libre
          </span>
        )}
        <span className={cn(TAG, pConfig.color)}>
          {pConfig.label}
        </span>
        {venc && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-px text-[10.5px] font-semibold tabular-nums',
            vencida ? 'border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              : esHoy ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'text-zinc-500 dark:text-zinc-400',
          )}>
            <Clock className="h-2.5 w-2.5" />
            {vencida ? 'Vencida ' : ''}{formatDate(venc)}
          </span>
        )}
        {tarea.etiquetas && tarea.etiquetas.length > 0 && tarea.etiquetas.map(tag => (
          <span key={tag} className={cn(TAG, 'border-zinc-500/20 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pl-6">
        <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <User className="h-2.5 w-2.5" />
          {tarea.asignado ? `${tarea.asignado.nombre ?? ''} ${tarea.asignado.apellido ?? ''}`.trim() : '—'}
        </div>
        {onMoveToProgress && !completada && (
          <div
            role="button"
            tabIndex={-1}
            onClick={onMoveToProgress}
            onKeyDown={e => e.key === 'Enter' && onMoveToProgress(e as any)}
            title="Pasar a En progreso"
            className="text-zinc-400 opacity-0 transition-opacity hover:text-cyan-600 group-hover:opacity-100 dark:hover:text-cyan-400"
          >
            <PlayCircle className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function Column({ title, count, accentClass, children }: {
  title: string
  count: number
  accentClass: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 dark:border-white/[0.08]">
        <h2 className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', accentClass)}>{title}</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TableroPage() {
  const profile = useAuthStore(s => s.profile)
  const { data: members = [] } = useTeamMembers()
  const updateTarea = useUpdateTarea()
  const completarTarea = useCompletarTarea()

  const [showNueva, setShowNueva] = useState(false)
  const [editTarea, setEditTarea] = useState<TareaWithRelations | null>(null)
  const [misTareas, setMisTareas] = useState(true)
  const [filtroAsignado, setFiltroAsignado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'libre' | 'expediente'>('todas')

  const asignadoFilter = misTareas ? (profile?.id ?? null) : (filtroAsignado || null)
  const tipoFiltro = filtroTipo === 'todas' ? null : filtroTipo

  const sharedFilters = {
    asignado_a: asignadoFilter,
    tipoFiltro,
    pageSize: 100,
    sortBy: 'fecha_vencimiento' as const,
    sortOrder: 'asc' as const,
  }

  const { data: pendientesRes, isLoading: loadingP } = useTareas({ ...sharedFilters, estado: 'PENDIENTE' })
  const { data: enProgresoRes, isLoading: loadingE } = useTareas({ ...sharedFilters, estado: 'EN_PROGRESO' })
  const { data: completadasRes } = useTareas({
    asignado_a: asignadoFilter,
    tipoFiltro,
    estado: 'COMPLETADA',
    pageSize: 20,
    sortBy: 'created_at',
    sortOrder: 'desc',
  })

  const pendientes = pendientesRes?.data ?? []
  const enProgreso = enProgresoRes?.data ?? []
  const completadas = completadasRes?.data ?? []
  const loading = loadingP || loadingE

  const handleComplete = useCallback(async (tarea: TareaWithRelations, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tarea.estado === 'COMPLETADA') return
    try { await completarTarea.mutateAsync(tarea.id) }
    catch { toast.error('No se pudo completar la tarea') }
  }, [completarTarea])

  const handleMoveToProgress = useCallback(async (tareaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await updateTarea.mutateAsync({ id: tareaId, estado: 'EN_PROGRESO' }) }
    catch { toast.error('No se pudo mover la tarea') }
  }, [updateTarea])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Tablero"
        subtitle="Tareas del equipo — libres y vinculadas a expedientes"
        actions={
          <button
            type="button"
            onClick={() => setShowNueva(true)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            Nueva tarea
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mis tareas / Todas */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMisTareas(true)}
            aria-pressed={misTareas}
            className="chip"
          >
            Mis tareas
          </button>
          <button
            type="button"
            onClick={() => { setMisTareas(false); setFiltroAsignado('') }}
            aria-pressed={!misTareas}
            className="chip"
          >
            Todo el equipo
          </button>
        </div>

        {/* Selector de usuario */}
        {!misTareas && (
          <select
            value={filtroAsignado}
            onChange={e => setFiltroAsignado(e.target.value)}
            className="field h-9 w-auto py-0 pr-8 text-[13px] font-medium"
          >
            <option value="">Todos los usuarios</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
          </select>
        )}

        {/* Tipo: Todas / Libres / Con expediente */}
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {(['todas', 'libre', 'expediente'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltroTipo(t)}
              aria-pressed={filtroTipo === t}
              className="chip"
            >
              {t === 'todas' ? 'Todas' : t === 'libre' ? 'Libres' : 'Con expediente'}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-white/[0.05]" />
              {[0, 1, 2].map(j => <div key={j} className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/[0.05]" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Column title="Pendiente" count={pendientes.length} accentClass="text-amber-700 dark:text-amber-400">
            {pendientes.length === 0
              ? <p className="py-2 text-xs font-medium text-zinc-500">Sin tareas pendientes</p>
              : pendientes.map(t => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  onClick={() => setEditTarea(t)}
                  onComplete={e => handleComplete(t, e)}
                  onMoveToProgress={e => handleMoveToProgress(t.id, e)}
                />
              ))}
          </Column>

          <Column title="En progreso" count={enProgreso.length} accentClass="text-cyan-700 dark:text-cyan-400">
            {enProgreso.length === 0
              ? <p className="py-2 text-xs font-medium text-zinc-500">Sin tareas en progreso</p>
              : enProgreso.map(t => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  onClick={() => setEditTarea(t)}
                  onComplete={e => handleComplete(t, e)}
                />
              ))}
          </Column>

          <Column title="Completadas (últimas 20)" count={completadas.length} accentClass="text-emerald-700 dark:text-emerald-400">
            {completadas.length === 0
              ? <p className="py-2 text-xs font-medium text-zinc-500">Sin tareas completadas recientes</p>
              : completadas.map(t => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  onClick={() => setEditTarea(t)}
                  onComplete={e => { e.stopPropagation() }}
                />
              ))}
          </Column>
        </div>
      )}

      {showNueva && <NuevaTareaDialog onClose={() => setShowNueva(false)} />}
      {editTarea && <TareaEditDialog tarea={editTarea} onClose={() => setEditTarea(null)} />}
    </div>
  )
}
