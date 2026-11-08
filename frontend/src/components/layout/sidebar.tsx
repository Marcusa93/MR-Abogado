import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarBadges } from '@/hooks/use-sidebar-badges'
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  CheckSquare,
  CalendarDays,
  Bell,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  BookMarked,
  Gavel,
  Brain,
  Mic2,
  Wallet,
  Sun,
  Sparkles,
  ChevronDown,
  ChevronRight,
  UserCog,
  ClipboardList,
  Calculator,
  Scale,
  Search,
  Briefcase,
  PenLine,
  Newspaper,
  Compass,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useTieneAccesoCaja } from '@/hooks/use-caja'
import { useAccesoEditorial } from '@/hooks/use-editorial'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

type BadgeKey = 'agenda' | 'sae'

type GroupKey = 'principal' | 'estudio' | 'herramientas'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  group: GroupKey
  badgeKey?: BadgeKey
  /** Si true, este item solo se muestra al rol CRITERIO. */
  criterioOnly?: boolean
  /** Si true, este item se oculta al rol CRITERIO. */
  hideForCriterio?: boolean
  adminOnly?: boolean
  cajaOnly?: boolean
  /** Solo con profiles.acceso_editorial (Marco y Claudio) */
  editorialOnly?: boolean
  /** Si true, este item se oculta a la SECRETARIA. */
  hideForSecretaria?: boolean
  /** Si true, este item solo se muestra a SECRETARIA. */
  secretariaOnly?: boolean
}

const GROUP_LABELS: Record<GroupKey, string> = {
  principal: '',
  estudio: 'Estudio',
  herramientas: 'Herramientas',
}

const GROUP_ORDER: GroupKey[] = ['principal', 'estudio', 'herramientas']
const DEFAULT_COLLAPSED: GroupKey[] = ['herramientas']

// Lo de todos los días queda a la vista; el resto, plegado en Herramientas (y en Cmd+K).
const navItems: readonly NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: Sun, group: 'principal' },
  { href: '/notificaciones', label: 'Novedades SAE', icon: Bell, group: 'principal', badgeKey: 'sae' },
  { href: '/criterio', label: 'Mis asignaciones', icon: LayoutDashboard, group: 'principal', criterioOnly: true },
  { href: '/expedientes', label: 'Expedientes', icon: FolderOpen, group: 'principal' },
  { href: '/clientes', label: 'Clientes', icon: Users, group: 'principal' },
  { href: '/consultas', label: 'Consultas', icon: ClipboardList, group: 'principal' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, group: 'principal', badgeKey: 'agenda' },
  { href: '/escritos', label: 'Escritos', icon: PenLine, group: 'principal', hideForSecretaria: true },

  { href: '/direccion', label: 'Dirección', icon: Compass, group: 'estudio', hideForSecretaria: true, hideForCriterio: true, adminOnly: true },
  { href: '/caja', label: 'Caja', icon: Wallet, group: 'estudio', cajaOnly: true },

  { href: '/tareas', label: 'Tareas', icon: CheckSquare, group: 'herramientas' },
  { href: '/mi-trabajo', label: 'Asuntos', icon: Briefcase, group: 'herramientas', hideForSecretaria: true, hideForCriterio: true },
  { href: '/calculadora-plazos', label: 'Calculadora de plazos', icon: Calculator, group: 'herramientas', hideForSecretaria: true },
  { href: '/calculadora-danos', label: 'Estimador de daños', icon: Scale, group: 'herramientas', hideForSecretaria: true },
  { href: '/contactos-profesionales', label: 'Profesionales', icon: UserCog, group: 'herramientas', hideForSecretaria: true },
  { href: '/buscar-audiencias', label: 'Audiencias grabadas', icon: Mic2, group: 'herramientas', hideForSecretaria: true },
  { href: '/normativa', label: 'Normativa', icon: BookMarked, group: 'herramientas', hideForSecretaria: true },
  { href: '/jurisprudencia', label: 'Jurisprudencia', icon: Gavel, group: 'herramientas', hideForSecretaria: true },
  { href: '/aprendizajes', label: 'Aprendizajes', icon: Brain, group: 'herramientas', hideForSecretaria: true },
  { href: '/informes', label: 'Informes', icon: BarChart3, group: 'herramientas', hideForSecretaria: true },
  { href: '/contenidos', label: 'Contenidos', icon: Sparkles, group: 'herramientas' },
  { href: '/editorial', label: 'Editorial', icon: Newspaper, group: 'herramientas', editorialOnly: true },
  { href: '/actividad', label: 'Actividad', icon: Activity, group: 'herramientas', adminOnly: true },
]

const COLLAPSED_GROUPS_KEY = 'sidebar-collapsed-groups-v2'

function loadCollapsedGroups(): Set<GroupKey> {
  if (typeof window === 'undefined') return new Set(DEFAULT_COLLAPSED)
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY)
    if (!raw) return new Set(DEFAULT_COLLAPSED)
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed.filter((g): g is GroupKey => GROUP_ORDER.includes(g as GroupKey)))
  } catch {
    return new Set(DEFAULT_COLLAPSED)
  }
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { pathname } = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const badges = useSidebarBadges()
  const { data: tieneAccesoCaja } = useTieneAccesoCaja()
  const { data: accesoEditorial } = useAccesoEditorial()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupKey>>(loadCollapsedGroups)
  const openCommandPalette = useUIStore(s => s.openCommandPalette)

  const toggleGroup = (g: GroupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]))
      }
      return next
    })
  }

  const badgeCounts: Record<BadgeKey, number> = {
    agenda: badges.tareasVencidas,
    sae: badges.saeNotifUnread,
  }

  const badgeColors: Record<BadgeKey, string> = {
    agenda: 'bg-rose-500/90 text-white',
    sae: 'bg-cyan-400 text-cyan-950',
  }

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <Link
        to="/inicio"
        className={cn(
          'flex h-14 items-center border-b border-[var(--sidebar-border)] px-4 hover:opacity-80 transition-opacity',
          isCollapsed ? 'justify-center' : 'gap-3'
        )}
      >
        {isCollapsed ? (
          <>
            <img
              src="/logo/mr-monograma-blanco.svg"
              alt="MR"
              className="hidden dark:block h-8 w-8 object-contain"
            />
            <img
              src="/logo/mr-monograma-azul.svg"
              alt="MR"
              className="block dark:hidden h-8 w-8 object-contain"
            />
          </>
        ) : (
          <div className="animate-fade-in flex items-center gap-2.5">
            <img
              src="/logo/mr-logo-blanco.svg"
              alt="Marco Rossi"
              className="hidden dark:block h-8 object-contain"
            />
            <img
              src="/logo/mr-logo-azul.svg"
              alt="Marco Rossi"
              className="block dark:hidden h-8 object-contain"
            />
          </div>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 no-scrollbar">
        {(() => {
          const esSecretaria = profile?.rol === 'SECRETARIA'
          const esCriterio = profile?.rol === 'CRITERIO'
          const visibleItems = navItems.filter((item) => {
            if (item.adminOnly && profile?.rol !== 'ADMIN' && profile?.rol !== 'DIRECTOR') return false
            if (item.cajaOnly && !tieneAccesoCaja) return false
            if (item.editorialOnly && !accesoEditorial) return false
            if (item.hideForSecretaria && esSecretaria) return false
            if (item.secretariaOnly && !esSecretaria) return false
            if (item.criterioOnly && !esCriterio) return false
            if (item.hideForCriterio && esCriterio) return false
            return true
          })

          return GROUP_ORDER.map((groupKey) => {
            const items = visibleItems.filter((i) => i.group === groupKey)
            if (items.length === 0) return null
            const collapsed = groupKey !== 'principal' && collapsedGroups.has(groupKey)
            const hasActive = items.some((i) => pathname.startsWith(i.href))

            return (
              <div key={groupKey} className="space-y-0.5">
                {!isCollapsed && groupKey !== 'principal' && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="flex w-full items-center gap-1.5 px-3 pt-4 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                    aria-expanded={!collapsed}
                  >
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {GROUP_LABELS[groupKey]}
                    {collapsed && hasActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" title="Sección activa" />
                    )}
                  </button>
                )}
                {isCollapsed && groupKey !== 'principal' && <div className="mx-3 my-2 h-px bg-[var(--sidebar-border)]" />}
                {(!collapsed || isCollapsed) && items.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      title={isCollapsed ? item.label : undefined}
                      data-tour={`nav-${item.href.replace(/^\//, '')}`}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-[7px] text-[13.5px] font-medium transition-colors duration-150',
                        isCollapsed && 'justify-center px-2',
                        groupKey === 'herramientas' && !isCollapsed && 'py-[5px] text-[13px]',
                        isActive
                          ? 'bg-[var(--brand-navy)]/[0.07] text-[var(--brand-navy)] dark:bg-white/[0.06] dark:text-white'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          groupKey === 'herramientas' && !isCollapsed && 'h-4 w-4',
                          isActive
                            ? 'text-[var(--brand-navy)] dark:text-[var(--brand-accent)]'
                            : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                        )}
                      />
                      {!isCollapsed && <span className="animate-fade-in">{item.label}</span>}
                      {item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                        <span
                          className={cn(
                            'ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 font-mono text-[10px] font-semibold leading-none',
                            badgeColors[item.badgeKey],
                            isCollapsed && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 ml-0 text-[9px]'
                          )}
                        >
                          {badgeCounts[item.badgeKey] > 99 ? '99+' : badgeCounts[item.badgeKey]}
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-[var(--brand-accent)]" aria-hidden />
                      )}
                    </Link>
                  )
                })}
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--sidebar-border)] p-2">
        <div className="flex items-center justify-between">
          {/* Cmd+K trigger */}
          <button
            type="button"
            onClick={openCommandPalette}
            title="Buscar o ir a… (Cmd+K)"
            className={cn(
              'flex items-center gap-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors',
              isCollapsed ? 'p-1.5' : 'px-2 py-1.5 flex-1'
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 text-xs truncate">Buscar…</span>
            )}
            {!isCollapsed && (
              <kbd className="rounded border border-zinc-200 dark:border-white/10 px-1 text-[10px] font-medium opacity-60">
                ⌘K
              </kbd>
            )}
          </button>

          {!isCollapsed && (
            <Link
              to="/configuracion"
              title="Configuración"
              className={cn(
                'rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-white/5',
                pathname.startsWith('/configuracion') ? 'text-[var(--brand-accent)]' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200',
              )}
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
