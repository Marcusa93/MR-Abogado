import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { useTeamMembers } from '@/hooks/use-team-members'
import { getAtTriggerPosition, insertMention, renderMentionParts } from '@/lib/utils/mentions'
import { displayRol } from '@/lib/utils/display-rol'

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  disabled?: boolean
}

interface TeamMember {
  id: string
  email?: string | null
  nombre: string
  apellido: string
  rol: string
}

export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  disabled,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { data: members = [] } = useTeamMembers()

  const filtered = trigger
    ? (members as TeamMember[]).filter((m) => {
        const q = trigger.query.toLowerCase()
        return (
          m.nombre.toLowerCase().includes(q) ||
          m.apellido.toLowerCase().includes(q) ||
          `${m.nombre} ${m.apellido}`.toLowerCase().includes(q)
        )
      }).slice(0, 6)
    : []

  const showPopover = trigger !== null && filtered.length > 0

  const selectMember = useCallback(
    (member: TeamMember) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const cursorPos = textarea.selectionStart
      const { newText, newCursor } = insertMention(value, cursorPos, member)
      onChange(newText)
      setTrigger(null)
      setSelectedIndex(0)
      // Restore focus and cursor after React re-render
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursor, newCursor)
      })
    },
    [value, onChange],
  )

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    onChange(newValue)
    const cursorPos = e.target.selectionStart
    const result = getAtTriggerPosition(newValue, cursorPos)
    setTrigger(result)
    if (result) setSelectedIndex(0)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!showPopover) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectMember(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setTrigger(null)
    }
  }

  // Close popover on click outside
  useEffect(() => {
    if (!showPopover) return
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setTrigger(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPopover])

  // Render overlay with styled mentions
  const overlayParts = renderMentionParts(value)

  return (
    <div className="relative">
      {/* Invisible textarea for actual editing */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
        style={{ color: 'transparent', caretColor: 'var(--foreground)' }}
      />
      {/* Visual overlay showing formatted mentions */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100"
      >
        {overlayParts.map((part, i) =>
          part.type === 'mention' ? (
            <span key={i} className="font-semibold text-amber-600 dark:text-amber-400">{part.content}</span>
          ) : (
            <span key={i}>{part.content}</span>
          )
        )}
      </div>
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl"
        >
          {filtered.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                i === selectedIndex
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/5'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                selectMember(member)
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {member.nombre[0]}
                {member.apellido[0]}
              </span>
              <span className="flex-1 truncate">
                {member.nombre} {member.apellido}
              </span>
              <span className="text-xs text-zinc-900 dark:text-zinc-500">{displayRol(member)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
