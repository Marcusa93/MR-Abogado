import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, FolderOpen, Calculator, CalendarDays,
  ClipboardList, CheckSquare, Plus, Zap, Users,
  ArrowRight,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string
  label: string
  descripcion?: string
  icon: typeof Search
  href?: string
  roles?: string[]
}

const ACCIONES_RAPIDAS: QuickAction[] = [
  { id: 'nuevo-exp',     label: 'Nuevo expediente',         icon: Plus,        href: '/expedientes/nuevo' },
  { id: 'nueva-cons',    label: 'Nueva consulta',           icon: ClipboardList, href: '/consultas' },
  { id: 'agenda',        label: 'Agenda',                   icon: CalendarDays, href: '/agenda' },
  { id: 'tareas',        label: 'Tareas',                   icon: CheckSquare, href: '/tareas' },
  { id: 'clientes',      label: 'Clientes',                 icon: Users,       href: '/clientes' },
  { id: 'calculadora',   label: 'Calculadora de plazos',    icon: Calculator,  href: '/calculadora-plazos' },
  { id: 'expedientes',   label: 'Expedientes',              icon: FolderOpen,  href: '/expedientes' },
]

// ---------------------------------------------------------------------------
// Tipos para resultados de búsqueda
// ---------------------------------------------------------------------------

interface ExpedienteResult {
  id: string
  caratula: string | null
  numero: string | null
  estado_interno: string | null
  clientes: { nombre: string; apellido: string } | null
}

type Item =
  | { kind: 'accion'; data: QuickAction }
  | { kind: 'expediente'; data: ExpedienteResult }

// ---------------------------------------------------------------------------
// Hook de búsqueda de expedientes
// ---------------------------------------------------------------------------

function useExpedientesSearch(query: string) {
  return useQuery({
    queryKey: ['cmd-palette-expedientes', query],
    queryFn: async (): Promise<ExpedienteResult[]> => {
      if (query.length < 2) return []
      const supabase = createClient()
      const { data } = await supabase
        .from('expedientes')
        .select('id, caratula, numero, estado_interno, clientes(nombre, apellido)')
        .or(`caratula.ilike.%${query}%,numero.ilike.%${query}%`)
        .is('deleted_at', null)
        .limit(6)
      return (data ?? []) as ExpedienteResult[]
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const open = useUIStore(s => s.commandPaletteOpen)
  const closeCommandPalette = useUIStore(s => s.closeCommandPalette)
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const { data: expedientes = [] } = useExpedientesSearch(debouncedQuery)

  const esSecretaria = profile?.rol === 'SECRETARIA'

  // Construir lista de items
  const items: Item[] = query.length < 2
    ? ACCIONES_RAPIDAS
        .filter(a => !a.roles || a.roles.includes(profile?.rol ?? ''))
        .map(a => ({ kind: 'accion' as const, data: a }))
    : [
        ...ACCIONES_RAPIDAS
          .filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
          .map(a => ({ kind: 'accion' as const, data: a })),
        ...expedientes.map(e => ({ kind: 'expediente' as const, data: e })),
      ]

  const clampedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))

  const selectItem = useCallback((item: Item) => {
    if (item.kind === 'accion' && item.data.href) {
      navigate(item.data.href)
    } else if (item.kind === 'expediente') {
      navigate(`/expedientes/${item.data.id}`)
    }
    closeCommandPalette()
  }, [navigate, closeCommandPalette])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeCommandPalette()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, items.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault()
        const item = items[clampedIndex]
        if (item) selectItem(item)
        return
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, items, clampedIndex, selectItem, closeCommandPalette])

  if (!open) return null

  const showAcciones = items.some(i => i.kind === 'accion')
  const showExpedientes = items.some(i => i.kind === 'expediente')
  let accionOffset = 0
  let expOffset = items.filter(i => i.kind === 'accion').length

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={closeCommandPalette}
      />

      <div className="relative z-10 w-full max-w-xl rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-scale-in">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-white/10">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="Buscar expediente o ir a..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setDebouncedQuery('') }}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-zinc-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">

          {/* Acciones rápidas */}
          {showAcciones && (
            <div>
              {query.length < 2 && (
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Acciones rápidas
                </p>
              )}
              {items
                .filter(i => i.kind === 'accion')
                .map((item, idx) => {
                  const accion = (item as { kind: 'accion'; data: QuickAction }).data
                  const isSelected = (accionOffset + idx) === clampedIndex
                  const Icon = accion.icon
                  return (
                    <button
                      key={accion.id}
                      type="button"
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setSelectedIndex(accionOffset + idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5'
                      )}
                    >
                      <div className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        isSelected ? 'bg-amber-500/20' : 'bg-zinc-100 dark:bg-white/10'
                      )}>
                        <Icon className={cn('h-3.5 w-3.5', isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400')} />
                      </div>
                      <span className={cn('text-sm font-medium', isSelected ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-300')}>
                        {accion.label}
                      </span>
                      {isSelected && <ArrowRight className="ml-auto h-3.5 w-3.5 text-amber-500" />}
                    </button>
                  )
                })}
            </div>
          )}

          {/* Expedientes */}
          {showExpedientes && (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Expedientes
              </p>
              {items
                .filter(i => i.kind === 'expediente')
                .map((item, idx) => {
                  const exp = (item as { kind: 'expediente'; data: ExpedienteResult }).data
                  const isSelected = (expOffset + idx) === clampedIndex
                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setSelectedIndex(expOffset + idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5'
                      )}
                    >
                      <div className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        isSelected ? 'bg-amber-500/20' : 'bg-zinc-100 dark:bg-white/10'
                      )}>
                        <FolderOpen className={cn('h-3.5 w-3.5', isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', isSelected ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-300')}>
                          {exp.caratula || exp.numero || 'Sin carátula'}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                          {exp.numero && <span className="font-mono mr-2">{exp.numero}</span>}
                          {exp.clientes && `${exp.clientes.nombre} ${exp.clientes.apellido}`}
                          {exp.estado_interno && (
                            <span className="ml-2 opacity-70">· {exp.estado_interno.replace(/_/g, ' ')}</span>
                          )}
                        </p>
                      </div>
                      {isSelected && <ArrowRight className="ml-auto h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    </button>
                  )
                })}
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && debouncedQuery.length >= 2 && (
            <div className="px-4 py-8 text-center">
              <FolderOpen className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sin resultados para <span className="font-medium">"{query}"</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-zinc-100 dark:border-white/10 px-4 py-2">
          <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
            <kbd className="rounded border border-zinc-200 dark:border-white/10 px-1">↑↓</kbd>
            <span>navegar</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
            <kbd className="rounded border border-zinc-200 dark:border-white/10 px-1">↵</kbd>
            <span>abrir</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
            <kbd className="rounded border border-zinc-200 dark:border-white/10 px-1">Esc</kbd>
            <span>cerrar</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
