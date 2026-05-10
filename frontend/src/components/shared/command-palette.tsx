import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { sanitizeForPostgrest } from '@/lib/utils/sanitize-search'
import { cn } from '@/lib/utils'
import {
  Search,
  FolderOpen,
  Users,
  CheckSquare,
  LayoutDashboard,
  Columns3,
  CalendarDays,
  Bell,
  Settings,
  ClipboardList,
  ArrowRight,
  CornerDownLeft,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string
  type: 'expediente' | 'cliente' | 'tarea' | 'turno' | 'page'
  title: string
  subtitle?: string
  icon: typeof FolderOpen
  href: string
}

// ---------------------------------------------------------------------------
// Quick-access pages
// ---------------------------------------------------------------------------

const PAGES: SearchResult[] = [
  { id: 'p-panel', type: 'page', title: 'Panel del Estudio', icon: ClipboardList, href: '/panel' },
  { id: 'p-dashboard', type: 'page', title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'p-expedientes', type: 'page', title: 'Expedientes', icon: FolderOpen, href: '/expedientes' },
  { id: 'p-clientes', type: 'page', title: 'Clientes', icon: Users, href: '/clientes' },
  { id: 'p-kanban', type: 'page', title: 'Kanban', icon: Columns3, href: '/kanban' },
  { id: 'p-tareas', type: 'page', title: 'Tareas', icon: CheckSquare, href: '/tareas' },
  { id: 'p-agenda', type: 'page', title: 'Agenda / Audiencias', icon: CalendarDays, href: '/agenda' },
  { id: 'p-alertas', type: 'page', title: 'Alertas', icon: Bell, href: '/alertas' },
  { id: 'p-config', type: 'page', title: 'Configuración', icon: Settings, href: '/configuracion' },
]

// ---------------------------------------------------------------------------
// Search hook
// ---------------------------------------------------------------------------

function useCommandSearch(term: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['command-search', term],
    queryFn: async (): Promise<SearchResult[]> => {
      if (term.trim().length < 2) return []

      const safe = sanitizeForPostgrest(term.trim())
      const pattern = `%${safe}%`

      const [expRes, cliRes, tarRes, turRes] = await Promise.all([
        supabase
          .from('expedientes')
          .select('id, numero, caratula, estado_interno')
          .or(`numero.ilike.${pattern},caratula.ilike.${pattern}`)
          .order('updated_at', { ascending: false })
          .limit(6),
        supabase
          .from('clientes')
          .select('id, nombre, apellido, dni')
          .or(`nombre.ilike.${pattern},apellido.ilike.${pattern},dni.ilike.${pattern}`)
          .order('apellido')
          .limit(6),
        supabase
          .from('tareas')
          .select('id, titulo, estado, expediente_id')
          .ilike('titulo', pattern)
          .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
          .order('fecha_vencimiento', { ascending: true })
          .limit(4),
        supabase
          .from('audiencias')
          .select('id, fecha, estado, expediente_id, expediente:expedientes!audiencias_expediente_id_fkey(caratula)')
          .in('estado', ['PENDIENTE', 'CONFIRMADA'])
          .gte('fecha', new Date().toISOString().split('T')[0])
          .order('fecha', { ascending: true })
          .limit(4),
      ])

      const results: SearchResult[] = []

      if (expRes.data) {
        for (const e of expRes.data) {
          results.push({
            id: `exp-${e.id}`,
            type: 'expediente',
            title: e.caratula || e.numero || 'Sin carátula',
            subtitle: e.numero ?? undefined,
            icon: FolderOpen,
            href: `/expedientes/${e.id}`,
          })
        }
      }

      if (cliRes.data) {
        for (const c of cliRes.data) {
          results.push({
            id: `cli-${c.id}`,
            type: 'cliente',
            title: `${c.apellido} ${c.nombre}`,
            subtitle: `DNI: ${c.dni}`,
            icon: Users,
            href: `/clientes/${c.id}`,
          })
        }
      }

      if (tarRes.data) {
        for (const t of tarRes.data) {
          results.push({
            id: `tar-${t.id}`,
            type: 'tarea',
            title: t.titulo,
            subtitle: `Estado: ${t.estado}`,
            icon: CheckSquare,
            href: t.expediente_id ? `/expedientes/${t.expediente_id}` : '/tareas',
          })
        }
      }

      if (turRes.data) {
        for (const t of turRes.data as any[]) {
          results.push({
            id: `tur-${t.id}`,
            type: 'turno' as any,
            title: `Audiencia ${t.fecha}`,
            subtitle: t.expediente?.caratula ?? `Estado: ${t.estado}`,
            icon: CalendarDays,
            href: t.expediente_id ? `/expedientes/${t.expediente_id}` : '/agenda',
          })
        }
      }

      return results
    },
    enabled: term.trim().length >= 2,
    staleTime: 10_000,
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: searchResults, isFetching } = useCommandSearch(debouncedSearch)

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timeout)
  }, [search])

  // Build the results list
  const items = useMemo(() => {
    if (search.trim().length < 2) {
      // Show pages when no search
      return PAGES
    }
    const dbResults = searchResults ?? []
    // Filter pages that match too
    const matchingPages = PAGES.filter((p) =>
      p.title.toLowerCase().includes(search.toLowerCase())
    )
    return [...dbResults, ...matchingPages]
  }, [search, searchResults])

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0)
  }, [items])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setSearch('')
      setDebouncedSearch('')
      setActiveIndex(0)
      // Small delay so the modal renders first
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = useCallback(
    (item: SearchResult) => {
      navigate(item.href)
      onClose()
    },
    [navigate, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % items.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
      } else if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault()
        handleSelect(items[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [items, activeIndex, handleSelect, onClose]
  )

  if (!open) return null

  // Group results by type
  const grouped = items.reduce(
    (acc, item) => {
      const GROUP_LABELS: Record<string, string> = { expediente: 'Expedientes', cliente: 'Clientes', tarea: 'Tareas', turno: 'Turnos', page: 'Páginas' }
      const group = GROUP_LABELS[item.type] ?? 'Otros'
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    },
    {} as Record<string, SearchResult[]>
  )

  let globalIndex = -1

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
        <div
          className="w-full max-w-lg glass-card rounded-xl shadow-2xl shadow-amber-500/5 animate-scale-in overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            {isFetching ? (
              <Loader2 className="h-5 w-5 shrink-0 text-amber-400 animate-spin" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-400" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar expedientes, clientes, tareas, turnos..."
              className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none"
            />
            <kbd className="hidden items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-900 dark:text-zinc-500 sm:inline-flex">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 && search.trim().length >= 2 && !isFetching && (
              <div className="py-8 text-center text-sm text-zinc-900 dark:text-zinc-500">
                No se encontraron resultados para &ldquo;{search}&rdquo;
              </div>
            )}

            {Object.entries(grouped).map(([group, groupItems]) => (
              <Fragment key={group}>
                <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
                  {group}
                </div>
                {groupItems.map((item) => {
                  globalIndex++
                  const idx = globalIndex
                  const Icon = item.icon

                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        idx === activeIndex
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/5'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-60" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-zinc-900 dark:text-zinc-500">{item.subtitle}</p>
                        )}
                      </div>
                      {idx === activeIndex && (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      )}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2.5 text-[11px] text-zinc-900 dark:text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> Seleccionar
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-[10px]">↑↓</span> Navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-[10px]">ESC</span> Cerrar
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
