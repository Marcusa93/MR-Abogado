import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface Member { id: string; nombre: string | null; apellido: string | null }

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  members: Member[]
  className?: string
}

export function AsignadosSelect({ value, onChange, members, className }: Props) {
  const selected = value
    .map(id => members.find(m => m.id === id))
    .filter((m): m is Member => !!m)

  const available = members.filter(m => !value.includes(m.id))

  return (
    <div className={cn('space-y-2', className)}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(m => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {m.nombre} {m.apellido}
              <button
                type="button"
                onClick={() => onChange(value.filter(v => v !== m.id))}
                className="ml-0.5 text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <select
          value=""
          onChange={e => {
            if (!e.target.value) return
            onChange([...value, e.target.value])
            e.target.value = ''
          }}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">+ Agregar persona…</option>
          {available.map(m => (
            <option key={m.id} value={m.id}>
              {m.apellido}, {m.nombre}
            </option>
          ))}
        </select>
      )}
      {selected.length === 0 && available.length === 0 && (
        <p className="text-xs text-zinc-400 italic">No hay miembros disponibles.</p>
      )}
    </div>
  )
}
