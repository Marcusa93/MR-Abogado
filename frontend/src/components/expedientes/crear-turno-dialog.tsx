import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCreateTurno, useAssignAudienciaUsers } from '@/hooks/use-turnos'
import { toast } from '@/stores/toast-store'
import { X, Loader2, UserCheck } from 'lucide-react'

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

function useTiposAudiencia() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['catalogo', 'tipos_audiencia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_tipos_audiencia')
        .select('id, nombre')
        .eq('activo', true)
        .order('orden')
      if (error) throw error
      return data ?? []
    },
    staleTime: 10 * 60_000,
  })
}

function useExpedientesActivos(enabled: boolean) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['expedientes-activos-lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedientes')
        .select('id, numero, caratula')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(150)
      if (error) throw error
      return (data ?? []).map((e) => ({
        id: e.id,
        label: e.caratula ? `${e.caratula} (${e.numero})` : e.numero,
      }))
    },
    enabled,
    staleTime: 2 * 60_000,
  })
}

type ProfileOption = { id: string; label: string }

function useActiveProfiles() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['profiles-activos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, nombre_completo')
        .eq('activo', true)
        .order('apellido')
      if (error) throw error
      return (data ?? []).map((p): ProfileOption => ({
        id: p.id,
        label: p.nombre_completo ?? [p.nombre, p.apellido].filter(Boolean).join(' ') ?? p.id,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

interface CrearTurnoDialogProps {
  open: boolean
  onClose: () => void
  /** Si se omite, el diálogo muestra un selector de expediente */
  expedienteId?: string
  /** Cuando viene de una actuación SAE, se guarda el vínculo */
  saeMovementId?: string
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
  saeMovementId,
  initialValues,
}: CrearTurnoDialogProps) {
  const createTurno = useCreateTurno()
  const assignUsers = useAssignAudienciaUsers()
  const { data: organismos } = useOrganismos()
  const { data: tiposAudiencia } = useTiposAudiencia()
  const { data: profiles = [] } = useActiveProfiles()
  const needsExpediente = !expedienteId
  const { data: expedientes } = useExpedientesActivos(open && needsExpediente)

  const [tipoAudienciaId, setTipoAudienciaId] = useState('')
  const [organismoId, setOrganismoId] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [notas, setNotas] = useState('')
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([])
  const [touched, setTouched] = useState(false)

  // For expediente selector
  const [expedienteQuery, setExpedienteQuery] = useState('')
  const [selectedExpedienteId, setSelectedExpedienteId] = useState('')

  useEffect(() => {
    if (!open || !initialValues) return
    if (initialValues.fecha) setFecha(initialValues.fecha)
    if (initialValues.hora) setHora(initialValues.hora)
    if (initialValues.notas) setNotas(initialValues.notas)
  }, [open, initialValues])

  if (!open) return null

  const resolvedExpedienteId = expedienteId ?? selectedExpedienteId
  const isValid = fecha.length > 0 && resolvedExpedienteId.length > 0

  const toggleProfile = (id: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const handleConfirm = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      const audiencia = await (createTurno as any).mutateAsync({
        expediente_id: resolvedExpedienteId,
        tipo_audiencia_id: tipoAudienciaId || null,
        organismo_id: organismoId || null,
        fecha,
        hora: hora || null,
        estado: 'PENDIENTE',
        notas: notas.trim() || null,
        sae_movement_id: saeMovementId ?? null,
      })

      if (selectedProfileIds.length > 0 && audiencia?.id) {
        await assignUsers.mutateAsync({
          audienciaId: audiencia.id,
          profileIds: selectedProfileIds,
        })
      }

      toast.success('Audiencia creada')
      resetAndClose()
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  const resetAndClose = () => {
    setTipoAudienciaId('')
    setOrganismoId('')
    setFecha('')
    setHora('')
    setNotas('')
    setSelectedProfileIds([])
    setTouched(false)
    setExpedienteQuery('')
    setSelectedExpedienteId('')
    ;(createTurno as any).reset?.()
    onClose()
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
  const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300'

  const isPending = (createTurno as any).isPending || assignUsers.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={resetAndClose} />

      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-white dark:bg-zinc-900/80 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {saeMovementId ? 'Agendar audiencia' : 'Nueva audiencia'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
              {saeMovementId
                ? 'Desde actuación SAE. Revisá y completá los datos.'
                : needsExpediente
                  ? 'Seleccioná el expediente y completá los datos.'
                  : 'Registra una audiencia para este expediente.'}
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Selector de expediente (solo cuando no se pasa expedienteId) */}
          {needsExpediente && (
            <div>
              <label className={labelClass}>Expediente *</label>
              <input
                type="text"
                list="expedientes-datalist"
                value={expedienteQuery}
                onChange={(e) => {
                  const val = e.target.value
                  setExpedienteQuery(val)
                  const match = expedientes?.find((ex) => ex.label === val)
                  setSelectedExpedienteId(match?.id ?? '')
                }}
                placeholder="Buscar por caratula o número..."
                className={`${inputClass} ${touched && !selectedExpedienteId ? 'border-rose-500/50' : ''}`}
              />
              <datalist id="expedientes-datalist">
                {expedientes?.map((ex) => (
                  <option key={ex.id} value={ex.label} />
                ))}
              </datalist>
              {touched && !selectedExpedienteId && (
                <p className="mt-1 text-xs text-rose-400">Seleccioná un expediente</p>
              )}
            </div>
          )}

          {/* Tipo audiencia */}
          <div>
            <label className={labelClass}>Tipo de audiencia</label>
            {tiposAudiencia && tiposAudiencia.length > 0 ? (
              <select
                value={tipoAudienciaId}
                onChange={(e) => setTipoAudienciaId(e.target.value)}
                className={inputClass}
              >
                <option value="">Seleccionar tipo...</option>
                {tiposAudiencia.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={tipoAudienciaId}
                onChange={(e) => setTipoAudienciaId(e.target.value)}
                placeholder="Ej: Audiencia inicial, Pericial..."
                className={inputClass}
              />
            )}
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
                Fecha * <span className="text-zinc-700 dark:text-zinc-300 font-normal">(F = hoy)</span>
              </label>
              <input
                type="date"
                value={fecha}
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

          {/* Asignar usuarios */}
          {profiles.length > 0 && (
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" />
                  Asignar a
                </span>
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {profiles.map((p) => {
                  const selected = selectedProfileIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProfile(p.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-white/5 border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              {selectedProfileIds.length > 0 && (
                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedProfileIds.length} usuario{selectedProfileIds.length !== 1 ? 's' : ''} recibirá{selectedProfileIds.length !== 1 ? 'n' : ''} notificación
                </p>
              )}
            </div>
          )}
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
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Crear audiencia
          </button>
        </div>
      </div>
    </div>
  )
}
