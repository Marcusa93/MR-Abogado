import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, CalendarPlus, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type TipoReunion = 'presencial' | 'web' | 'turno'

const TIPO_LABELS: Record<TipoReunion, string> = {
  presencial: 'Reunión presencial',
  web: 'Videollamada / Web',
  turno: 'Audiencia inicial',
}

const TIPO_ASUNTO_OPTIONS = [
  { value: 'civil',              label: 'Civil' },
  { value: 'laboral_trabajador', label: 'Laboral (trabajador)' },
  { value: 'laboral_empleador',  label: 'Laboral (empleador)' },
  { value: 'familia',            label: 'Familia' },
  { value: 'previsional',        label: 'Previsional' },
  { value: 'penal',              label: 'Penal' },
  { value: 'otro',               label: 'Otro' },
]

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

function useAgendarReunion() {
  const supabase = createClient()
  const profile = useAuthStore((s) => s.profile)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      nombre: string
      apellido: string
      telefono: string
      tipo_reunion: TipoReunion
      tipo_asunto: string
      fecha: string
      hora: string
      notas: string
    }) => {
      if (!profile?.id) throw new Error('Sin sesión')

      const fechaTurno = data.hora
        ? new Date(`${data.fecha}T${data.hora}:00`).toISOString()
        : new Date(`${data.fecha}T00:00:00`).toISOString()

      const { error } = await (supabase as any).from('consultas').insert({
        nombre: data.nombre.trim(),
        apellido: data.apellido.trim() || null,
        telefono: data.telefono.trim() || null,
        canal: data.tipo_reunion,
        tipo_asunto: data.tipo_asunto,
        notas_libres: data.notas.trim() || null,
        fecha_turno: fechaTurno,
        estado: 'pendiente',
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-turnos'] })
      qc.invalidateQueries({ queryKey: ['consultas'] })
      toast.success('Reunión agendada')
    },
    onError: (e: Error) => toast.error('No se pudo agendar', e.message),
  })
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  /** Fecha inicial (ISO YYYY-MM-DD) — se puede pasar desde el calendario */
  defaultFecha?: string
}

export function AgendarReuniónModal({ open, onClose, defaultFecha }: Props) {
  const hoy = new Date().toISOString().slice(0, 10)
  const mutation = useAgendarReunion()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [tipoReunion, setTipoReunion] = useState<TipoReunion>('presencial')
  const [tipoAsunto, setTipoAsunto] = useState('civil')
  const [fecha, setFecha] = useState(defaultFecha ?? hoy)
  const [hora, setHora] = useState('')
  const [notas, setNotas] = useState('')

  if (!open) return null

  function reset() {
    setNombre(''); setApellido(''); setTelefono('')
    setTipoReunion('presencial'); setTipoAsunto('civil')
    setFecha(defaultFecha ?? hoy); setHora(''); setNotas('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !fecha) return
    await mutation.mutateAsync({ nombre, apellido, telefono, tipo_reunion: tipoReunion, tipo_asunto: tipoAsunto, fecha, hora, notas })
    reset()
    onClose()
  }

  const inputClass = 'h-9 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/15 placeholder:text-zinc-400'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border-0 sm:border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-500">
              <CalendarPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Agendar reunión</h2>
              <p className="text-[11px] text-zinc-500">Se crea como consulta pendiente</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

          {/* Tipo */}
          <div>
            <p className={labelClass}>Tipo de reunión</p>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(TIPO_LABELS) as TipoReunion[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoReunion(t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    tipoReunion === t
                      ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20'
                  }`}
                >
                  {TIPO_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha <span className="text-rose-400">*</span></label>
              <input
                type="date"
                value={fecha}
                min={hoy}
                onChange={(e) => setFecha(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre <span className="text-rose-400">*</span></label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="María"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Apellido</label>
              <input
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="García"
                className={inputClass}
              />
            </div>
          </div>

          {/* Teléfono + Asunto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Teléfono</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="381 000 0000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Asunto</label>
              <select
                value={tipoAsunto}
                onChange={(e) => setTipoAsunto(e.target.value)}
                className={inputClass}
              >
                {TIPO_ASUNTO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Contexto breve..."
              rows={2}
              className={`${inputClass} h-auto py-2 resize-none`}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { reset(); onClose() }}
              className="rounded-lg border border-zinc-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !nombre.trim() || !fecha}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Agendar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
