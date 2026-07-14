import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useBuscarClientesAutocomplete, clienteNombreDisplay } from '@/hooks/use-clientes'
import { cn } from '@/lib/utils'

// Fallback puntual para resolver el label cuando solo tenemos el id seleccionado
// (no es parte del autocomplete general).
function useClienteById(id: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['clientes', 'by-id', id],
    queryFn: async () => {
      if (!id) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('clientes')
        .select('id, dni, nombre, apellido, razon_social, tipo_persona')
        .eq('id', id)
        .single()
      return data
    },
    enabled: !!id,
    staleTime: 60_000,
  })
}

export interface ClienteComboboxProps {
  value: string
  onChange: (id: string) => void
  className?: string
  placeholder?: string
  /** Si está, marca visualmente este id como "cliente actual" (útil para editar). */
  currentId?: string
  disabled?: boolean
}

/**
 * Selector de cliente con búsqueda en vivo + contador de expedientes y badge
 * de placeholder SAE. Usa la RPC `buscar_clientes_por_termino` (migración 057).
 */
export function ClienteCombobox({
  value,
  onChange,
  className,
  placeholder = 'Buscar por apellido, razón social, DNI o CUIL...',
  currentId,
  disabled = false,
}: ClienteComboboxProps) {
  const [search, setSearch] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const { data: results = [], isFetching } = useBuscarClientesAutocomplete(search, 20)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: selectedById } = useClienteById(value && !results.find(c => c.id === value) ? value : null)
  const selected = results.find(c => c.id === value) ?? selectedById

  useEffect(() => {
    if (selected) {
      const expCount = (selected as any).expedientes_count
      const suffix = typeof expCount === 'number' ? ` · ${expCount} exp.` : ''
      const nombre = clienteNombreDisplay(selected as any)
      const id = (selected as any).tipo_persona === 'juridica'
        ? ((selected as any).cuil ? `CUIT: ${(selected as any).cuil}` : '')
        : (selected.dni ? `DNI: ${selected.dni}` : '')
      setSelectedLabel(`${nombre}${id ? ` (${id})` : ''}${suffix}`)
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

  const displayValue = value && !open
    ? (selected ? clienteNombreDisplay(selected as any) : selectedLabel)
    : inputValue

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <input
        type="text"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50"
        onFocus={() => { setOpen(true); if (value) setInputValue('') }}
        onChange={(e) => handleSearch(e.target.value)}
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-lg max-h-64 overflow-y-auto">
          {isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">Buscando…</div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-zinc-500 italic">
              Ningún cliente coincide. Creá uno nuevo si hace falta.
            </div>
          )}
          {results.map(c => {
            const isPlaceholder = (c as any).es_placeholder
            const expCount = (c as any).expedientes_count ?? 0
            const isCurrent = currentId && c.id === currentId
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.id)
                  const nombre = clienteNombreDisplay(c as any)
                  const idStr = (c as any).tipo_persona === 'juridica'
                    ? (c.cuil ? `CUIT: ${c.cuil}` : '')
                    : (c.dni ? `DNI: ${c.dni}` : '')
                  setSelectedLabel(`${nombre}${idStr ? ` (${idStr})` : ''} · ${expCount} exp.`)
                  setOpen(false)
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-zinc-50 dark:hover:bg-white/5',
                  c.id === value && 'bg-zinc-50 dark:bg-white/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {clienteNombreDisplay(c as any)}
                    </span>
                    {isCurrent && (
                      <span className="px-1 py-0.5 rounded text-[9px] uppercase tracking-wider bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                        actual
                      </span>
                    )}
                    {isPlaceholder && (
                      <span className="px-1 py-0.5 rounded text-[9px] uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 flex-shrink-0">
                        placeholder SAE
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                    {(c as any).tipo_persona === 'juridica'
                      ? (c.cuil ? `CUIT: ${c.cuil}` : 'Persona jurídica')
                      : (c.dni ? `DNI: ${c.dni}` : '')}
                  </span>
                </div>
                <span className={cn(
                  'flex-shrink-0 text-xs px-1.5 py-0.5 rounded',
                  expCount > 0
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
                )}>
                  {expCount} exp.
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
