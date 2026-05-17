import { useState, useRef, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SnoozeOption {
  label: string
  compute: () => Date
}

function nextNineAM(base: Date): Date {
  const d = new Date(base)
  d.setHours(9, 0, 0, 0)
  if (d <= base) d.setDate(d.getDate() + 1)
  return d
}

function startOfNextMonday(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay() // 0=Dom, 1=Lun, ...
  const daysUntilMonday = ((1 - day + 7) % 7) || 7
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(9, 0, 0, 0)
  return d
}

const OPTIONS: SnoozeOption[] = [
  { label: '1 hora', compute: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: '3 horas', compute: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: 'Mañana 9 AM', compute: () => nextNineAM(new Date()) },
  { label: 'Próximo lunes 9 AM', compute: () => startOfNextMonday(new Date()) },
]

export function SnoozeMenu({
  onSnooze,
  className,
  title = 'Posponer',
}: {
  onSnooze: (until: Date) => void
  className?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={cn(
          'shrink-0 rounded p-1 text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/5 transition-colors',
          className,
        )}
        title={title}
      >
        <Clock className="h-3 w-3" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-[101] w-44 rounded-lg border border-white/10 bg-zinc-900 shadow-2xl py-1 animate-fade-in"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 border-b border-white/5">
            Recordar en
          </div>
          {OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSnooze(opt.compute())
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
