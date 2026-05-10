import { useState, useEffect } from 'react'
import { useNavigate, useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useCreateExpediente, useTiposTramite } from '@/hooks/use-expedientes'
import { toast } from '@/stores/toast-store'
import { PRIORIDAD_VALUES, PRIORIDAD_LABELS, ESTADO_INTERNO_VALUES, ESTADO_INTERNO_LABELS, type EstadoInterno } from '@/types/enums'
import type { Prioridad } from '@/types/enums'

/** States available when creating a new expediente */
const ESTADOS_CREACION: { value: string; label: string }[] = ESTADO_INTERNO_VALUES.map(
  (v) => ({ value: v, label: ESTADO_INTERNO_LABELS[v] })
)
import { ArrowLeft, Loader2, Save, UserPlus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Client search combobox (reuses the pattern from expediente-combobox)
// ---------------------------------------------------------------------------

import { useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { sanitizeForPostgrest } from '@/lib/utils/sanitize-search'

function useClienteSearch(term: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['clientes', 'search-nuevo', term],
    queryFn: async () => {
      let query = supabase
        .from('clientes')
        .select('id, dni, nombre, apellido')
        .is('deleted_at', null)
        .order('apellido')
        .limit(20)
      if (term.trim().length > 0) {
        const safe = sanitizeForPostgrest(term)
        if (safe.length > 0) {
          const t = `%${safe}%`
          query = query.or(`nombre.ilike.${t},apellido.ilike.${t},dni.ilike.${t}`)
        }
      }
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    staleTime: 15_000,
  })
}

// Fetches a single client by ID — used to show the selected label before search results load
function useClienteById(id: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['clientes', 'by-id', id],
    queryFn: async () => {
      if (!id) return null
      const { data } = await supabase
        .from('clientes')
        .select('id, dni, nombre, apellido')
        .eq('id', id)
        .single()
      return data
    },
    enabled: !!id,
    staleTime: 60_000,
  })
}

function ClienteCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  // Preserva el label del cliente seleccionado independientemente de si results cargó
  const [selectedLabel, setSelectedLabel] = useState('')
  const { data: results } = useClienteSearch(search)
  const containerRef = useRef<HTMLDivElement>(null)
  // Fallback: fetch the selected client by ID if it's not yet in the search results
  const { data: selectedById } = useClienteById(value && !results?.find((c) => c.id === value) ? value : null)
  const selected = results?.find((c) => c.id === value) ?? selectedById

  // Sincronizar selectedLabel cuando results carga y contiene el value actual
  useEffect(() => {
    if (selected) {
      setSelectedLabel(`${selected.apellido} ${selected.nombre} (DNI: ${selected.dni})`)
    }
  }, [selected])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback((v: string) => {
    setInputValue(v)
    setSearch('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(v), 250)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Mostrar el label guardado si value está seteado pero results aún no cargaron
  const displayValue = value && !open ? (selected ? `${selected.apellido} ${selected.nombre} (DNI: ${selected.dni})` : selectedLabel) : (inputValue ?? '')

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={displayValue}
        placeholder="Buscar cliente por nombre o DNI..."
        className={`h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15`}
        onFocus={() => { setOpen(true); if (value) setInputValue('') }}
        onChange={(e) => handleSearch(e.target.value)}
      />
      {open && results && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c.id)
                setSelectedLabel(`${c.apellido} ${c.nombre} (DNI: ${c.dni})`)
                setOpen(false)
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${c.id === value ? 'bg-white/5' : ''}`}
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.apellido} {c.nombre}</span>
              <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">DNI: {c.dni}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'
const errorClass = 'mt-1 text-xs text-rose-500'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NuevoExpedientePage() {
  const navigate = useNavigate()
  const createExpediente = useCreateExpediente()
  const { data: tiposTramite } = useTiposTramite()

  const [clienteId, setClienteId] = useState('')
  const [tipoTramiteId, setTipoTramiteId] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('MEDIA')
  const [estadoInicial, setEstadoInicial] = useState('NUEVA_CONSULTA')
  const [observaciones, setObservaciones] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isDirty = !submitted && (clienteId.length > 0 || observaciones.trim().length > 0)

  // Block in-app navigation when form has data
  const blocker = useBlocker(isDirty)

  // Block browser-level navigation (refresh, close, external links)
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const isValid = clienteId.length > 0 && tipoTramiteId.length > 0

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (clienteId || tipoTramiteId || observaciones) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [clienteId, tipoTramiteId, observaciones])

  const handleSubmit = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      setSubmitted(true)
      await createExpediente.mutateAsync({
        cliente_id: clienteId,
        tipo_tramite_id: tipoTramiteId,
        prioridad,
        estado_interno: estadoInicial as EstadoInterno,
        observaciones: observaciones.trim() || null,
      })
      toast.success('Expediente creado correctamente')
      navigate('/expedientes')
    } catch {
      setSubmitted(false)
      // Error handled by mutation + global toast
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Back + Title */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Nuevo Expediente
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          El numero de expediente se genera automaticamente (EXP-{new Date().getFullYear()}-XXXX).
        </p>
      </div>

      {/* Form */}
      <div className="glass-card rounded-xl p-6">
        <div className="space-y-5">
          {/* Cliente */}
          <div>
            <label className={labelClass}>Cliente *</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <ClienteCombobox value={clienteId} onChange={setClienteId} />
              </div>
              <button
                type="button"
                onClick={() => navigate('/clientes/nuevo')}
                className="flex h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-white/5"
                title="Crear cliente nuevo"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {touched && !clienteId && (
              <p className={errorClass}>Selecciona un cliente</p>
            )}
          </div>

          {/* Tipo tramite */}
          <div>
            <label className={labelClass}>Tipo de trámite *</label>
            <select
              value={tipoTramiteId}
              onChange={(e) => setTipoTramiteId(e.target.value)}
              className={`${inputClass} ${touched && !tipoTramiteId ? 'border-rose-500/50' : ''}`}
            >
              <option value="">Seleccionar...</option>
              {(tiposTramite ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
            {touched && !tipoTramiteId && (
              <p className={errorClass}>Selecciona un tipo de tramite</p>
            )}
          </div>

          {/* Prioridad + Estado */}
          {/* TODO: Responsable (abogado_id) removed — use expediente_miembros instead */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                className={inputClass}
              >
                {PRIORIDAD_VALUES.map((p) => (
                  <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estado inicial</label>
              <p className="mb-1 text-[10px] text-zinc-500">Si el trámite ya fue iniciado en otro lado, seleccioná el estado actual</p>
              <select
                value={estadoInicial}
                onChange={(e) => setEstadoInicial(e.target.value)}
                className={inputClass}
              >
                {ESTADOS_CREACION.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/5 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createExpediente.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-5 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createExpediente.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Crear expediente
          </button>
        </div>
      </div>

      {/* Unsaved changes warning */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="¿Descartar cambios?"
        description="Tenés cambios sin guardar en este formulario. Si salís ahora, se perderán."
        confirmLabel="Salir sin guardar"
        variant="danger"
      />
    </div>
  )
}
