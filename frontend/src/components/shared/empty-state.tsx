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
        'flex items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10',
        size === 'sm' ? 'h-10 w-10' : 'h-14 w-14'
      )}>
        <Icon
          className={cn(
            'text-cyan-600 dark:text-cyan-400',
            size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'
          )}
        />
      </div>
      <h3
        className={cn(
          'font-bold tracking-tight text-zinc-900 dark:text-white',
          size === 'sm' ? 'mt-3 text-sm' : 'mt-4 text-lg'
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-zinc-600 dark:text-zinc-400 max-w-sm font-medium',
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
            'btn btn-primary',
            size === 'sm' ? 'btn-sm mt-3' : 'mt-5'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
