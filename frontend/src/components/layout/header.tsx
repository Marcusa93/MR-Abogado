import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { UserMenu } from './user-menu'
import { NotificationDropdown } from './notification-dropdown'
import { HelpButton } from './help-button'
import { PushToggle } from './push-toggle'
import { SaeHealthBadge } from './sae-health-badge'
import { ChatEquipo } from '@/components/shared/chat-equipo'

const pageTitles: Record<string, string> = {
  '/inicio': 'Inicio',
  '/notificaciones': 'Novedades',
  '/editorial': 'Editorial',
  '/dashboard': 'Indicadores',
  '/direccion': 'Dirección',
  '/mi-trabajo': 'Asuntos',
  '/expedientes': 'Expedientes',
  '/clientes': 'Clientes',
  '/consultas': 'Consultas',
  '/kanban': 'Tablero de Estados',
  '/tareas': 'Tareas',
  '/agenda': 'Agenda',
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

export function Header() {
  const { pathname } = useLocation()
  const title = getPageTitle(pathname)
  const openCommandPalette = useUIStore((s) => s.openCommandPalette)

  return (
    <>
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--sidebar-border)] bg-[var(--header-bg)] px-3 sm:px-6 backdrop-blur-md"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          height: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
        }}
      >
        {/* Izquierda: en el celular, monograma + nombre de la sección (el menú completo
            está en "Más" de la barra inferior); en escritorio, el buscador
            (el título ya lo muestra cada página, repetirlo acá era ruido). */}
        <div className="flex min-w-0 items-center gap-2 lg:flex-1">
          <Link to="/inicio" aria-label="Inicio" className="flex h-10 w-9 shrink-0 items-center justify-center lg:hidden">
            <img src="/logo/mr-monograma-blanco.svg" alt="" className="hidden h-6 w-auto dark:block" />
            <img src="/logo/mr-monograma-azul.svg" alt="" className="h-6 w-auto dark:hidden" />
          </Link>
          <h1 className="truncate text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white lg:hidden">{title}</h1>
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden lg:flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-zinc-200 bg-white/70 px-3.5 text-left text-[13px] font-medium text-zinc-500 transition-colors hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-zinc-200"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Buscar expediente, cliente o sección…</span>
            <kbd className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-white/10 dark:text-zinc-500">⌘K</kbd>
          </button>
        </div>

        {/* Derecha: estado del SAE, avisos, ayuda, chat, novedades, usuario */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 lg:hidden"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>
          <div className="hidden sm:flex items-center gap-1.5">
            <SaeHealthBadge />
          </div>
          <PushToggle />
          <div className="hidden sm:block">
            <HelpButton />
          </div>
          <ChatEquipo />
          <NotificationDropdown />
          <UserMenu />
        </div>
      </header>
    </>
  )
}
