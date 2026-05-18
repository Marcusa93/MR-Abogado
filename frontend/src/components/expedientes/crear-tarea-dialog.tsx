import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCreateTarea } from '@/hooks/use-tareas'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuth } from '@/hooks/use-auth'
import { ExpedienteCombobox } from '@/components/shared/expediente-combobox'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS } from '@/types/enums'
import { toast } from '@/stores/toast-store'
import MentionTextarea from '@/components/shared/mention-textarea'
import { X, Loader2 } from 'lucide-react'

function useTiposTarea() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['catalogo', 'catalogo_tipos_tarea'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_tipos_tarea')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

interface CrearTareaDialogProps {
  open: boolean
  onClose: () => void
  expedienteId?: string
  initialValues?: {
    titulo?: string
    descripcion?: string
    fechaVencimiento?: string
    prioridad?: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  }
}

export function CrearTareaDialog({
  open,
  onClose,
  expedienteId,
  initialValues,
}: CrearTareaDialogProps) {
  const createTarea = useCreateTarea()
  const { data: members } = useTeamMembers()
  const { data: tiposTarea } = useTiposTarea()
  const { profile } = useAuth()

  const [tipoTareaId, setTipoTareaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState('MEDIA')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [asignadoA, setAsignadoA] = useState('')
  const [expId, setExpId] = useState(expedienteId ?? '')
  const [touched, setTouched] = useState(false)

  // Apply initialValues whenever the dialog opens (or values change)
  useEffect(() => {
    if (!open || !initialValues) return
    if (initialValues.titulo) setTitulo(initialValues.titulo)
    if (initialValues.descripcion) setDescripcion(initialValues.descripcion)
    if (initialValues.fechaVencimiento) setFechaVencimiento(initialValues.fechaVencimiento)
    if (initialValues.prioridad) setPrioridad(initialValues.prioridad)
  }, [open, initialValues])

  if (!open) return null

  const effectiveExpId = expedienteId ?? expId
  const isValid = titulo.trim().length > 0 && effectiveExpId.length > 0

  const handleConfirm = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      await createTarea.mutateAsync({
        expediente_id: effectiveExpId,
        tipo_tarea_id: tipoTareaId || null,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        prioridad: prioridad as 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE',
        estado: 'PENDIENTE',
        fecha_vencimiento: fechaVencimiento || null,
        asignado_a: asignadoA || '',
        created_by: profile?.id ?? '',
      })
      toast.success('Tarea creada')
      resetAndClose()
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  const resetAndClose = () => {
    setTipoTareaId('')
    setTitulo('')
    setDescripcion('')
    setPrioridad('MEDIA')
    setFechaVencimiento('')
    setAsignadoA('')
    setExpId(expedienteId ?? '')
    setTouched(false)
    createTarea.reset()
    onClose()
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={resetAndClose} />

      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Nueva tarea
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Crea una tarea y asignala a un miembro del equipo.
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1 text-zinc-600 dark:text-zinc-400 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Expediente (solo si no viene como prop) */}
          {!expedienteId && (
            <div>
              <label className={labelClass}>Expediente *</label>
              <ExpedienteCombobox
                value={expId}
                onChange={setExpId}
                error={touched && !expId}
              />
              {touched && !expId && (
                <p className="mt-1 text-xs text-rose-400">Selecciona un expediente</p>
              )}
            </div>
          )}

          {/* Tipo de tarea (from catalog) */}
          {tiposTarea && tiposTarea.length > 0 && (
            <div>
              <label className={labelClass}>Tipo de tarea</label>
              <select
                value={tipoTareaId}
                onChange={(e) => {
                  const id = e.target.value
                  setTipoTareaId(id)
                  if (id) {
                    const tipo = tiposTarea.find((t) => t.id === id)
                    if (tipo && !titulo.trim()) setTitulo(tipo.nombre)
                  }
                }}
                className={inputClass}
              >
                <option value="">Seleccionar tipo...</option>
                {tiposTarea.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Titulo */}
          <div>
            <label className={labelClass}>Título *</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={`${inputClass} ${touched && !titulo.trim() ? 'border-rose-500/50' : ''}`}
            />
            {touched && !titulo.trim() && (
              <p className="mt-1 text-xs text-rose-400">El titulo es obligatorio</p>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className={labelClass}>Descripción</label>
            <MentionTextarea
              value={descripcion}
              onChange={setDescripcion}
              placeholder="Detalles adicionales... usá @ para mencionar"
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>

          {/* Prioridad + Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value)}
                className={inputClass}
              >
                {PRIORIDAD_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORIDAD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Fecha de vencimiento{' '}
                <span className="text-zinc-700 dark:text-zinc-300 font-normal">(F = hoy)</span>
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'f' || e.key === 'F') {
                    e.preventDefault()
                    setFechaVencimiento(new Date().toISOString().split('T')[0])
                  }
                }}
                className={inputClass}
              />
            </div>
          </div>

          {/* Asignado */}
          <div>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={resetAndClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={createTarea.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createTarea.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  )
}
