import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut, Settings, HelpCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingStore } from '@/stores/onboarding-store'
import { createClient } from '@/lib/supabase/client'
import { displayRol } from '@/lib/utils/display-rol'
import { useQueryClient } from '@tanstack/react-query'

export function UserMenu() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const profile = useAuthStore((s) => s.profile)
  const openTour = useOnboardingStore((s) => s.open)

  const initials = profile
    ? `${(profile.nombre?.[0] ?? '').toUpperCase()}${(profile.apellido?.[0] ?? '').toUpperCase()}`
    : '??'

  const fullName = profile
    ? `${profile.nombre} ${profile.apellido}`
    : 'Usuario'

  const role = displayRol(profile)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleSignOut() {
    const supabase = createClient()
    // scope:'local' limpia el token localmente sin depender de red
    // (evita que iOS Safari falle silenciosamente con timeouts)
    await supabase.auth.signOut({ scope: 'local' })
    queryClient.clear()
    useAuthStore.getState().reset()
    navigate('/login', { replace: true })
  }

  // Position dropdown below the button
  const rect = buttonRef.current?.getBoundingClientRect()

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[11px] font-extrabold tracking-wide text-[#1c2633] ring-2 ring-white/10 ring-offset-2 ring-offset-[var(--header-bg)] hover:bg-[var(--brand-accent)] transition-colors"
        title={fullName}
      >
        {initials}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] w-60 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-scale-in dark:border-white/10 dark:bg-[var(--popover)]"
          style={{
            top: rect ? rect.bottom + 8 : 60,
            right: 16,
          }}
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/[0.08]">
            <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">
              {fullName}
            </p>
            <p className="eyebrow mt-1 truncate">
              {role}
            </p>
          </div>

          <div className="py-1">
            <Link
              to="/configuracion"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <Settings className="h-4 w-4" />
              Mi perfil
            </Link>

            {/* En el celular el botón de ayuda no entra en el encabezado: vive acá */}
            <button
              type="button"
              onClick={() => { setOpen(false); openTour() }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white sm:hidden"
            >
              <HelpCircle className="h-4 w-4" />
              Tour de bienvenida
            </button>

            <div className="mx-2 my-1 border-t border-zinc-100 dark:border-white/[0.06]" />

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
