import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, X, FolderPlus, Search } from 'lucide-react'
import { useConvertirConsultaAExpediente } from '@/hooks/use-consultas'
import { useSearchClientes } from '@/hooks/use-clientes'
import type { Consulta } from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const FUERO_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin asignar' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'civil', label: 'Civil y Comercial' },
  { value: 'familia', label: 'Familia' },
  { value: 'previsional', label: 'Previsional' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'penal', label: 'Penal' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'documentos_locaciones', label: 'Doc. y Locaciones' },
  { value: 'otro', label: 'Otro' },
]

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface Props {
  consulta: Consulta
  onClose: () => void
  onSuccess: (expId: string) => void
}

export function ConvertirExpedienteModal({ consulta, onClose, onSuccess }: Props) {
  const navigate = useNavigate()
  const convertir = useConvertirConsultaAExpediente()

  const [clienteQuery, setClienteQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [fuero, setFuero] = useState('')
  const [observaciones, setObservaciones] = useState(
    consulta.hechos_ordenados ?? consulta.notas_libres ?? ''
  )
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(clienteQuery), 300)
    return () => clearTimeout(timer)
  }, [clienteQuery])

  const { data: resultados = [] } = useSearchClientes(debouncedQuery)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleConvertir() {
    if (!clienteId) {
      toast.error('Seleccionar un cliente')
      return
    }
    try {
      const expId = await convertir.mutateAsync({
        consulta_id: consulta.id,
        cliente_id: clienteId,
        fuero: fuero || null,
        observaciones: observaciones.trim() || null,
      })
      toast.success('Expediente creado')
      onSuccess(expId)
      navigate(`/expedientes/${expId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo convertir')
    }
  }

  const nombreCliente = consulta.apellido
    ? `${consulta.apellido}, ${consulta.nombre}`
    : consulta.nombre

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Convertir en expediente — {nombreCliente}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Buscar cliente */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Cliente del expediente
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={clienteId ? clienteNombre : clienteQuery}
                  onChange={e => {
                    setClienteQuery(e.target.value)
                    setClienteId(null)
                    setClienteNombre('')
                    setShowDropdown(true)
                  }}
                  onFocus={() => !clienteId && setShowDropdown(true)}
                  placeholder="Buscar por nombre, apellido o DNI…"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 pl-8 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {clienteId && (
                  <button
                    type="button"
                    onClick={() => { setClienteId(null); setClienteNombre(''); setClienteQuery('') }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showDropdown && !clienteId && debouncedQuery.length >= 2 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 shadow-lg max-h-48 overflow-y-auto">
                  {resultados.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-zinc-500">
                      Sin resultados.{' '}
                      <a href="/clientes/nuevo" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                        Crear cliente nuevo
                      </a>
                    </div>
                  ) : (
                    resultados.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClienteId(c.id)
                          setClienteNombre(`${c.apellido}, ${c.nombre}${c.dni ? ` — ${c.dni}` : ''}`)
                          setShowDropdown(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {c.apellido}, {c.nombre}
                        </span>
                        {c.dni && <span className="text-xs text-zinc-500">DNI {c.dni}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {!clienteId && debouncedQuery.length < 2 && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Escribí al menos 2 caracteres para buscar.{' '}
                <a href="/clientes/nuevo" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  Crear cliente nuevo
                </a>
              </p>
            )}
          </div>

          {/* Fuero */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Fuero
            </label>
            <select
              value={fuero}
              onChange={e => setFuero(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {FUERO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Observaciones iniciales
            </label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              rows={4}
              placeholder="Descripción del caso, antecedentes…"
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end border-t border-zinc-200 dark:border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConvertir}
            disabled={convertir.isPending || !clienteId}
            className={cn(
              'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              'bg-emerald-600 hover:bg-emerald-700 text-white',
            )}
          >
            {convertir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            Convertir
          </button>
        </div>
      </div>
    </div>
  )
}
