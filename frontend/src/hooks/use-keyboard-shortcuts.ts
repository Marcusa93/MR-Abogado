import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Global keyboard shortcuts for power users.
 *
 * Navigation (with Alt key):
 *   Alt+D → Dashboard
 *   Alt+E → Expedientes
 *   Alt+C → Clientes
 *   Alt+T → Tareas
 *   Alt+K → Kanban/Tablero
 *   Alt+A → Agenda
 *   Alt+I → Informes
 *
 * Actions (with Alt+Shift):
 *   Alt+Shift+N → Nuevo expediente
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return

      // Alt + key = navigation shortcuts
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase()
        const routes: Record<string, string> = {
          d: '/dashboard',
          e: '/expedientes',
          c: '/clientes',
          t: '/tareas',
          k: '/kanban',
          a: '/agenda',
          i: '/informes',
          l: '/alertas',
        }

        if (routes[key]) {
          e.preventDefault()
          navigate(routes[key])
          return
        }

        // Alt+Shift+N = nuevo expediente
        if (e.shiftKey && key === 'n') {
          e.preventDefault()
          navigate('/expedientes/nuevo')
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate])
}
