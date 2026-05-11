import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCreateTurno } from '@/hooks/use-turnos'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { X, Loader2 } from 'lucide-react'

function useOrganismos() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['catalogo', 'organismos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organismos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

interface CrearTurnoDialogProps {
  open: boolean
  onClose: () => void
  expedienteId: string
  initialValues?: {
    fecha?: string
    hora?: string
    notas?: string
  }
}

export function CrearTurnoDialog({
  open,
  onClose,
  expedienteId,
  initialValues,
}: CrearTurnoDialogProps) {
  const createTurno = useCreateTurno()
  const { profile } = useAuth()
  const { data: organismos } = useOrganismos()

  const [tipoAudiencia, setTipoAudiencia] = useState('')
  const [organismoId, setOrganismoId] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [notas, setNotas] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open || !initialValues) return
    if (initialValues.fecha) setFecha(initialValues.fecha)
    if (initialValues.hora) setHora(initialValues.hora)
    if (initialValues.notas) setNotas(initialValues.notas)
  }, [open, initialValues])

  if (!open) return null

  const isValid = fecha.length > 0

  const handleConfirm = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      await (createTurno as any).mutateAsync({
        expediente_id: expedienteId,
        tipo_audiencia_id: tipoAudiencia || null,
        organismo_id: organismoId || null,
        fecha,
        hora: hora || null,
        estado: 'PENDIENTE',
        notas: notas.trim() || null,
      })
      toast.success('Audiencia creada')
      resetAndClose()
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  const resetAndClose = () => {
    setTipoAudiencia('')
    setOrganismoId('')
    setFecha('')
    setHora('')
    setNotas('')
    setTouched(false)
    ;(createTurno as any).reset?.()
    onClose()
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={resetAndClose} />

      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Nueva audiencia
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Registra una audiencia para este expediente.
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
          {/* Tipo audiencia */}
          <div>
            <label className={labelClass}>Tipo de audiencia</label>
            <input
              type="text"
              value={tipoAudiencia}
              onChange={(e) => setTipoAudiencia(e.target.value)}
              placeholder="Ej: Audiencia inicial, Pericial..."
              className={inputClass}
            />
          </div>

          {/* Organismo */}
          {organismos && organismos.length > 0 && (
            <div>
              <label className={labelClass}>Organismo</label>
              <select
                value={organismoId}
                onChange={(e) => setOrganismoId(e.target.value)}
                className={inputClass}
              >
                <option value="">Seleccionar organismo...</option>
                {organismos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Fecha * <span className="text-zinc-900 dark:text-zinc-500 font-normal">(F = hoy)</span>
              </label>
              <input
                type="date"
                value={fecha}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setFecha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'f' || e.key === 'F') {
                    e.preventDefault()
                    setFecha(new Date().toISOString().split('T')[0])
                  }
                }}
                className={`${inputClass} ${touched && !fecha ? 'border-rose-500/50' : ''}`}
              />
              {touched && !fecha && (
                <p className="mt-1 text-xs text-rose-400">La fecha es obligatoria</p>
              )}
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

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Informacion adicional del turno..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
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
            disabled={(createTurno as any).isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(createTurno as any).isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Crear audiencia
          </button>
        </div>
      </div>
    </div>
  )
}
