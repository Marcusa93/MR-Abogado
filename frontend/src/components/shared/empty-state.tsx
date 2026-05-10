import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'py-8' : 'py-16',
        className
      )}
    >
      <div className={cn(
        'flex items-center justify-center rounded-xl bg-white/5',
        size === 'sm' ? 'h-10 w-10' : 'h-14 w-14'
      )}>
        <Icon
          className={cn(
            'text-zinc-900 dark:text-zinc-500',
            size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'
          )}
        />
      </div>
      <h3
        className={cn(
          'font-semibold text-zinc-900 dark:text-zinc-50',
          size === 'sm' ? 'mt-3 text-sm' : 'mt-4 text-base'
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-zinc-600 dark:text-zinc-400 max-w-sm',
            size === 'sm' ? 'mt-1 text-xs' : 'mt-2 text-sm'
          )}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={cn(
            'rounded-lg bg-gradient-cyan font-medium text-zinc-950 hover:opacity-90 transition-colors',
            size === 'sm' ? 'mt-3 px-3 py-1.5 text-xs' : 'mt-4 px-4 py-2 text-sm'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
