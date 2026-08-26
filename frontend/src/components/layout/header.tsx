import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { UserMenu } from './user-menu'
import { NotificationDropdown } from './notification-dropdown'
import { HelpButton } from './help-button'
import { PushToggle } from './push-toggle'
import { SaeHealthBadge } from './sae-health-badge'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/expedientes': 'Expedientes',
  '/clientes': 'Clientes',
  '/consultas': 'Consultas',
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

  return (
    <>
      <header
        className="flex shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--header-bg)] px-3 sm:px-6 backdrop-blur-md"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          height: 'calc(4rem + env(safe-area-inset-top, 0px))',
        }}
      >
        {/* Left: hamburger + title */}
        <div className="flex items-center gap-3">
          {onMobileMenuToggle && (
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        </div>

        <div className="flex-1" />

        {/* Right: Notifications + User menu */}
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          <div className="hidden sm:flex items-center gap-1.5">
            <SaeHealthBadge />
            <PushToggle />
          </div>
          <HelpButton />
          <NotificationDropdown />
          <UserMenu />
        </div>
      </header>
    </>
  )
}
