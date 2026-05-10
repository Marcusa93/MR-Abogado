import { useState, useEffect, useRef } from 'react'
import { useExpedienteSearch } from '@/hooks/use-expediente-search'
import { cn } from '@/lib/utils'
import { Search, Loader2, ChevronDown } from 'lucide-react'

interface ExpedienteComboboxProps {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  error?: boolean
}

export function ExpedienteCombobox({
  value,
  onChange,
  disabled,
  error,
}: ExpedienteComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: expedientes, isLoading } = useExpedienteSearch(debounced)

  // Find the selected label
  const selected = expedientes?.find((e) => e.id === value)
  const displayLabel = selected
    ? [selected.numero, selected.caratula || 'Sin carátula'].filter(Boolean).join(' — ')
    : ''

  return (
    <div ref={ref} className="relative">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 dark:text-zinc-400" />
        <input
          type="text"
          value={open ? search : displayLabel}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setSearch('')
          }}
          disabled={disabled}
          placeholder="Buscar expediente..."
          className={cn(
            'h-9 w-full rounded-lg border bg-white/5 pl-8 pr-8 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15',
            error
              ? 'border-rose-500/50'
              : 'border-white/10'
          )}
        />
        <ChevronDown className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 dark:text-zinc-400" />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-600 dark:text-zinc-400" />
            </div>
          ) : !expedientes || expedientes.length === 0 ? (
            <p className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400">Sin resultados</p>
          ) : (
            expedientes.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => {
                  onChange(exp.id)
                  setSearch('')
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full flex-col px-3 py-2 text-left hover:bg-white/5',
                  exp.id === value && 'bg-amber-950/30'
                )}
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 font-mono">
                  {exp.numero}
                </span>
                {exp.caratula && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {exp.caratula}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
