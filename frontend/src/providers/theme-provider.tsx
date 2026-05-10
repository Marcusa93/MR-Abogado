import { useLayoutEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

function resolveTheme(theme: 'light' | 'dark' | 'system') {
  if (theme === 'light' || theme === 'dark') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme)

  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme)

  useLayoutEffect(() => {
    if (theme === 'system') {
      applyTheme(theme)
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light')
      }
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }

    applyTheme(theme)
  }, [theme])

  return <>{children}</>
}
