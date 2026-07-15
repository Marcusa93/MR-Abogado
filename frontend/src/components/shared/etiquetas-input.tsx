import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EtiquetasInputProps {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  className?: string
}

export function EtiquetasInput({
  value,
  onChange,
  placeholder = 'ej: cobro, urgente, trámite…',
  className,
}: EtiquetasInputProps) {
  const [text, setText] = useState('')

  function commit() {
    const raw = text.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (raw.length === 0) return
    onChange([...new Set([...value, ...raw])])
    setText('')
  }

  function remove(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  return (
    <div className={cn('rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 flex flex-wrap gap-1.5', className)}>
      {value.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-100 shrink-0"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Backspace' && !text && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => { if (text.trim()) commit() }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
      />
    </div>
  )
}
