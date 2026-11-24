import { Link, useLocation } from 'react-router-dom'
import { Sun, FolderOpen, ClipboardList, CalendarDays, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarBadges } from '@/hooks/use-sidebar-badges'

interface MobileNavProps {
  onOpenMenu: () => void
}

const ITEMS = [
  { href: '/inicio', label: 'Inicio', icon: Sun },
  { href: '/expedientes', label: 'Expedientes', icon: FolderOpen },
  { href: '/consultas', label: 'Consultas', icon: ClipboardList },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, badge: 'agenda' as const },
]

/**
 * Barra inferior para el celular: las cuatro secciones de todos los días a un toque
 * y "Más" abre el menú completo. Solo se ve por debajo de lg (en escritorio está la barra lateral).
 * Marca el <body> con data-bottom-nav para que los botones flotantes (BogaBot, chat, toasts)
 * se corran hacia arriba (ver --bottom-nav-h en index.css).
 */
export function MobileNav({ onOpenMenu }: MobileNavProps) {
  const { pathname } = useLocation()
  const badges = useSidebarBadges()

  return (
    <nav
      data-bottom-nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname.startsWith(href)
          const count = badge === 'agenda' ? badges.turnosHoy : 0
          return (
            <Link
              key={href}
              to={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors',
                active ? 'text-white' : 'text-zinc-500 active:text-zinc-200',
              )}
            >
              {active && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--brand-accent)]" aria-hidden />}
              <span className="relative">
                <Icon className={cn('h-[22px] w-[22px]', active && 'text-[var(--brand-accent)]')} />
                {count > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold tabular-nums text-[#1c2633]">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              {label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold text-zinc-500 active:text-zinc-200"
        >
          <Menu className="h-[22px] w-[22px]" />
          Más
        </button>
      </div>
    </nav>
  )
}
