import { useCallback, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// DateInput — date picker with F key shortcut to fill today's date
// Also enforces min date = today by default (can be overridden)
// ---------------------------------------------------------------------------

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  /** Allow past dates (default: false — only today or future) */
  allowPast?: boolean
  /** Custom label shown on F key hint */
  label?: string
}

const today = () => new Date().toISOString().split('T')[0]

export function DateInput({
  value,
  onChange,
  allowPast = false,
  className,
  ...props
}: DateInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'f' || e.key === 'F') {
        // Only trigger if the input is focused and no modifier keys
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          onChange(today())
        }
      }
    },
    [onChange]
  )

  return (
    <div className="relative group">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        min={allowPast ? undefined : today()}
        className={cn(
          'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100',
          'placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15',
          className
        )}
        {...props}
      />
      {/* F key hint — visible on focus */}
      <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 hidden group-focus-within:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1 text-[9px] font-mono text-zinc-700 dark:text-zinc-300">
        F = hoy
      </span>
    </div>
  )
}
