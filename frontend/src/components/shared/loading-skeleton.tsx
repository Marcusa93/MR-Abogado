import { cn } from '@/lib/utils'

export function TableSkeleton({
  rows = 8,
  columns = 7,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-slate-900 overflow-hidden animate-pulse', className)}>
      {/* Header */}
      <div className="flex gap-4 border-b border-white/5 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-white/10" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex gap-4 border-b border-white/5 px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: columns }).map((_, col) => (
            <div
              key={col}
              className="h-3 flex-1 rounded bg-white/5"
              style={{ maxWidth: col === 0 ? '40px' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

const WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-4/5', 'w-3/5']

export function ListSkeleton({
  items = 5,
  className,
}: {
  items?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3 animate-pulse', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="glass-card rounded-lg p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className={cn('h-3 rounded bg-white/10', WIDTHS[i % WIDTHS.length])} />
              <div className="h-2.5 w-1/3 rounded bg-white/5" />
            </div>
            <div className="h-5 w-16 rounded-full bg-white/5 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 rounded bg-white/10" />
        <div className="h-6 w-32 rounded-full bg-white/5" />
        <div className="h-6 w-20 rounded-full bg-white/5" />
      </div>
      <div className="h-10 w-full rounded bg-white/5" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 rounded-xl border border-white/10 bg-slate-900"
          />
        ))}
      </div>
    </div>
  )
}
