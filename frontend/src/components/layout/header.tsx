import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Menu } from 'lucide-react'
import { UserMenu } from './user-menu'
import { NotificationDropdown } from './notification-dropdown'
import { ThemeToggle } from './theme-toggle'
import { HelpButton } from './help-button'
import { PushToggle } from './push-toggle'
import { SaeHealthBadge } from './sae-health-badge'
import { CommandPalette } from '@/components/shared/command-palette'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/expedientes': 'Expedientes',
  '/clientes': 'Clientes',
  '/kanban': 'Tablero de Estados',
  '/tareas': 'Tareas',
  '/agenda': 'Audiencias y Agenda',
  '/alertas': 'Alertas',
  '/informes': 'Informes',
  '/configuracion': 'Configuración',
}

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  for (const [route, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(route)) return title
  }
  return 'Marco Rossi Estudio Jurídico'
}

interface HeaderProps {
  onMobileMenuToggle?: () => void
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { pathname } = useLocation()
  const title = getPageTitle(pathname)

  const [commandOpen, setCommandOpen] = useState(false)

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    },
    []
  )

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--header-bg)] px-4 sm:px-6 backdrop-blur-md">
        {/* Left: hamburger + title */}
        <div className="flex items-center gap-3">
          {onMobileMenuToggle && (
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        </div>

        {/* Center: Search bar */}
        <div className="hidden sm:flex max-w-md flex-1 justify-center px-4">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/8 bg-zinc-50 dark:bg-white/5 px-3 text-sm text-zinc-500 transition-all hover:border-amber-500/30 hover:bg-white dark:hover:bg-white/[0.08] hover:text-zinc-600 dark:hover:text-zinc-400"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-zinc-200 dark:border-white/8 bg-zinc-100 dark:bg-white/5 px-1.5 font-mono text-[10px] font-medium text-zinc-400 dark:text-zinc-500 sm:inline-flex">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>
        </div>

        {/* Right: Notifications + User menu */}
        <div className="flex items-center gap-1.5">
          <SaeHealthBadge />
          <ThemeToggle />
          <HelpButton />
          <PushToggle />
          <NotificationDropdown />
          <UserMenu />
        </div>
      </header>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  )
}
