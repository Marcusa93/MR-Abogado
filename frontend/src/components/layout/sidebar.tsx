import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarBadges } from '@/hooks/use-sidebar-badges'
import { displayRol } from '@/lib/utils/display-rol'
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Columns3,
  CheckSquare,
  CalendarDays,
  Bell,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  BookMarked,
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

type BadgeKey = 'tareas' | 'alertas' | 'agenda' | 'sae-notif'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  badgeKey?: BadgeKey
  adminOnly?: boolean
}

const navItems: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/expedientes', label: 'Expedientes', icon: FolderOpen },
  { href: '/kanban', label: 'Tablero', icon: Columns3 },
  { href: '/tareas', label: 'Tareas', icon: CheckSquare, badgeKey: 'tareas' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, badgeKey: 'agenda' },
  { href: '/alertas', label: 'Alertas', icon: Bell, badgeKey: 'alertas' },
  { href: '/notificaciones-sae', label: 'Notif. SAE', icon: Bell, badgeKey: 'sae-notif' },
  { href: '/informes', label: 'Informes', icon: BarChart3 },
  { href: '/normativa', label: 'Normativa', icon: BookMarked },
  { href: '/actividad', label: 'Actividad', icon: Activity, adminOnly: true },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { pathname } = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const badges = useSidebarBadges()

  const badgeCounts: Record<BadgeKey, number> = {
    tareas: badges.tareasVencidas,
    alertas: badges.alertasPendientes,
    agenda: badges.turnosHoy,
    'sae-notif': badges.saeNotifUnread,
  }

  const badgeColors: Record<BadgeKey, string> = {
    tareas: 'bg-rose-500 text-white',
    alertas: 'bg-[var(--brand-accent)] text-white',
    agenda: 'bg-[var(--brand-accent)] text-white',
    'sae-notif': 'bg-cyan-500 text-white',
  }

  const getInitials = () => {
    if (!profile) return 'U'
    const first = profile.nombre?.[0] ?? ''
    const last = profile.apellido?.[0] ?? ''
    return (first + last).toUpperCase() || 'U'
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
        to="/dashboard"
        className={cn(
          'flex h-16 items-center border-b border-[var(--sidebar-border)] px-4 hover:opacity-80 transition-opacity',
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
        {navItems.filter((item) => !item.adminOnly || profile?.rol === 'ADMIN').map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              title={isCollapsed ? item.label : undefined}
              data-tour={`nav-${item.href.replace(/^\//, '').split('-')[0]}`}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                isCollapsed && 'justify-center px-2',
                isActive
                  ? 'bg-[var(--brand-navy)]/10 text-[var(--brand-navy)] dark:bg-[var(--brand-accent)]/15 dark:text-[var(--brand-ice)]'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-200'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors',
                  isActive
                    ? 'text-[var(--brand-navy)] dark:text-[var(--brand-ice)]'
                    : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                )}
              />
              {!isCollapsed && (
                <span className="animate-fade-in">{item.label}</span>
              )}
              {item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                <span
                  className={cn(
                    'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none',
                    badgeColors[item.badgeKey],
                    isCollapsed && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 ml-0 text-[9px]'
                  )}
                >
                  {badgeCounts[item.badgeKey] > 99 ? '99+' : badgeCounts[item.badgeKey]}
                </span>
              )}
              {isActive && !isCollapsed && !item.badgeKey && (
                <div className="ml-auto h-5 w-1 rounded-full bg-[var(--brand-accent)]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--sidebar-border)] p-3">
        {profile && !isCollapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2 animate-fade-in">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy)]/10 dark:bg-[var(--brand-accent)]/15 text-xs font-bold text-[var(--brand-navy)] dark:text-[var(--brand-ice)]">
              {getInitials()}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {profile.nombre} {profile.apellido}
              </span>
              <span className="truncate text-xs text-zinc-500">
                {displayRol(profile)}
              </span>
            </div>
          </div>
        )}
        {profile && isCollapsed && (
          <div className="mb-2 flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-navy)]/10 dark:bg-[var(--brand-accent)]/15 text-xs font-bold text-[var(--brand-navy)] dark:text-[var(--brand-ice)]">
              {getInitials()}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end">
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
