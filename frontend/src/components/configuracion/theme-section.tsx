import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { Sun, Moon, Monitor, Settings } from 'lucide-react'

export function ThemeSection() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Claro' },
    { value: 'dark' as const, icon: Moon, label: 'Oscuro' },
    { value: 'system' as const, icon: Monitor, label: 'Sistema' },
  ]

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="h-5 w-5 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Apariencia
        </h2>
      </div>

      <div className="flex gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
              theme === opt.value
                ? 'border-amber-400 bg-amber-950/30'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            )}
          >
            <opt.icon
              className={cn(
                'h-5 w-5',
                theme === opt.value
                  ? 'text-amber-400'
                  : 'text-zinc-700 dark:text-zinc-300'
              )}
            />
            <span
              className={cn(
                'text-xs font-medium',
                theme === opt.value
                  ? 'text-amber-300'
                  : 'text-zinc-600 dark:text-zinc-300'
              )}
            >
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
