import { Sun, Moon, Monitor } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)

  const icon =
    theme === 'light' ? (
      <Sun className="h-4 w-4" />
    ) : theme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Monitor className="h-4 w-4" />
    )

  const label =
    theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-100 transition-colors"
      title={`Tema: ${label}`}
    >
      {icon}
      <span className="sr-only">Tema: {label}</span>
    </button>
  )
}
