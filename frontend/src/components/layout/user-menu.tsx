import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { displayRol } from '@/lib/utils/display-rol'

export function UserMenu() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

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
    await supabase.auth.signOut()
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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
        title={fullName}
      >
        {initials}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl animate-scale-in"
          style={{
            top: rect ? rect.bottom + 8 : 60,
            right: 16,
          }}
        >
          <div className="border-b border-zinc-200 dark:border-zinc-700/50 px-4 py-3">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {fullName}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {role}
            </p>
          </div>

          <div className="py-1">
            <Link
              to="/configuracion"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Mi perfil
            </Link>

            <div className="border-t border-zinc-100 dark:border-zinc-800 mx-2" />

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-b-xl"
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
