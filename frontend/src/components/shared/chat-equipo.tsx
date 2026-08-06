import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { useChat, useTeamProfiles, type ChatMensaje, type TeamProfile } from '@/hooks/use-chat'
import { useDraggable } from '@/hooks/use-draggable'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/date-helpers'

const BTN_SIZE = { w: 52, h: 52 }
const PANEL_W = 340
const PANEL_H = 480

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(m: ChatMensaje): string {
  const n = m.perfil?.nombre?.[0] ?? ''
  const a = m.perfil?.apellido?.[0] ?? ''
  return (n + a).toUpperCase() || '?'
}

function displayName(m: ChatMensaje): string {
  const parts = [m.perfil?.nombre, m.perfil?.apellido].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Usuario'
}

function profileFullName(p: TeamProfile): string {
  return [p.nombre, p.apellido].filter(Boolean).join(' ')
}

const AVATAR_COLORS = [
  'bg-amber-500', 'bg-sky-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-rose-500', 'bg-cyan-500',
]

function avatarColor(profileId: string): string {
  let hash = 0
  for (let i = 0; i < profileId.length; i++) hash = (hash * 31 + profileId.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/** Calcula dónde abrir el panel relativo a la posición del botón */
function panelStyle(btnX: number, btnY: number): React.CSSProperties {
  const W = window.innerWidth
  const H = window.innerHeight
  const gap = 8

  const left = btnX + PANEL_W + gap > W
    ? Math.max(8, btnX + BTN_SIZE.w - PANEL_W)
    : btnX

  const top = btnY - PANEL_H - gap < 0
    ? Math.min(H - PANEL_H - gap, btnY + BTN_SIZE.h + gap)
    : btnY - PANEL_H - gap

  return { position: 'fixed', left, top, animation: 'chat-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }
}

/** Renderiza el texto con @menciones resaltadas */
function renderConMenciones(texto: string): React.ReactNode {
  const parts = texto.split(/(@\S[^@]*)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-amber-600 dark:text-amber-400 font-semibold">{part}</span>
      : part
  )
}

// ---------------------------------------------------------------------------
// MentionDropdown
// ---------------------------------------------------------------------------

function MentionDropdown({
  profiles,
  query,
  selectedIdx,
  onSelect,
}: {
  profiles: TeamProfile[]
  query: string
  selectedIdx: number
  onSelect: (p: TeamProfile) => void
}) {
  const filtered = profiles.filter((p) => {
    const full = profileFullName(p).toLowerCase()
    return full.includes(query.toLowerCase())
  }).slice(0, 6)

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 shadow-xl overflow-hidden z-10">
      {filtered.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(p) }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
            i === selectedIdx
              ? 'bg-amber-50 dark:bg-amber-500/20'
              : 'hover:bg-zinc-50 dark:hover:bg-white/5',
          )}
        >
          <div className={cn(
            'h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white',
            avatarColor(p.id),
          )}>
            {(p.nombre?.[0] ?? '').toUpperCase()}{(p.apellido?.[0] ?? '').toUpperCase()}
          </div>
          <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate">
            {profileFullName(p)}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MensajeRow
// ---------------------------------------------------------------------------

function MensajeRow({ msg, isOwn }: { msg: ChatMensaje; isOwn: boolean }) {
  return (
    <div className={cn('flex gap-2 mb-3', isOwn && 'flex-row-reverse')}>
      <div className={cn(
        'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white self-end',
        avatarColor(msg.profile_id),
      )}>
        {initials(msg)}
      </div>
      <div className={cn('max-w-[75%] space-y-0.5', isOwn && 'items-end flex flex-col')}>
        <p className={cn('text-[10px] text-zinc-500', isOwn && 'text-right')}>
          {isOwn ? 'Vos' : displayName(msg)} · {timeAgo(msg.created_at)}
        </p>
        <div className={cn(
          'rounded-2xl px-3 py-2 text-sm leading-snug break-words',
          isOwn
            ? 'bg-[var(--brand-navy)] text-white dark:bg-amber-500/90 dark:text-zinc-900 rounded-tr-sm'
            : 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 rounded-tl-sm',
        )}>
          {renderConMenciones(msg.contenido)}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

function ChatPanel({ onClose, isMobile = false }: { onClose: () => void; isMobile?: boolean }) {
  const { mensajes, loading, sending, enviar, profileId } = useChat()
  const { data: teamProfiles = [] } = useTeamProfiles()

  const [texto, setTexto] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)
  // Map: "@Nombre Apellido" → profileId — for resolving picks on send
  const [mentionMap, setMentionMap] = useState<Map<string, string>>(new Map())

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  useEffect(() => { inputRef.current?.focus() }, [])

  // Detect @mention trigger from cursor position
  function detectMention(value: string) {
    const cursor = inputRef.current?.selectionStart ?? value.length
    const textToCursor = value.slice(0, cursor)
    const match = textToCursor.match(/@([\w\s]*)$/)
    if (match !== null) {
      setMentionQuery(match[1])
      setShowMentions(true)
      setMentionIdx(0)
    } else {
      setShowMentions(false)
      setMentionQuery('')
    }
  }

  function insertMention(p: TeamProfile) {
    const cursor = inputRef.current?.selectionStart ?? texto.length
    const before = texto.slice(0, cursor)
    const after = texto.slice(cursor)
    const beforeMention = before.replace(/@([\w\s]*)$/, '')
    const tag = `@${profileFullName(p)}`
    const newText = beforeMention + tag + ' ' + after

    setTexto(newText)
    setMentionMap((prev) => new Map(prev).set(tag, p.id))
    setShowMentions(false)
    setMentionQuery('')

    // Restore focus and cursor after React re-renders
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = beforeMention.length + tag.length + 1
        inputRef.current.setSelectionRange(pos, pos)
        inputRef.current.focus()
        // Resize
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 80) + 'px'
      }
    })
  }

  function resolveMenciones(): string[] {
    const ids: string[] = []
    for (const [tag, id] of mentionMap) {
      if (texto.includes(tag)) ids.push(id)
    }
    return ids
  }

  async function handleSend() {
    if (!texto.trim() || sending) return
    const txt = texto
    const mIds = resolveMenciones()
    setTexto('')
    setMentionMap(new Map())
    setShowMentions(false)
    await enviar(txt, mIds)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentions) {
      const filtered = teamProfiles.filter((p) =>
        profileFullName(p).toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)

      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && filtered.length > 0)) {
        e.preventDefault()
        const pick = filtered[mentionIdx]
        if (pick) insertMention(pick)
        return
      }
      if (e.key === 'Escape') { setShowMentions(false); return }
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden',
        isMobile ? 'h-full w-full' : 'rounded-2xl border border-zinc-200 dark:border-white/10',
      )}
      style={isMobile ? undefined : { width: PANEL_W, height: PANEL_H }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/[0.07] bg-zinc-50 dark:bg-white/[0.03] shrink-0"
        style={isMobile ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } : undefined}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Chat del estudio</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title="En vivo" />
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-400">Nadie escribió aún.<br />Sé el primero.</p>
          </div>
        ) : (
          mensajes.map((m) => (
            <MensajeRow key={m.id} msg={m} isOwn={m.profile_id === profileId} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-3 py-2.5 border-t border-zinc-100 dark:border-white/[0.07] flex gap-2 items-end relative shrink-0"
        style={isMobile ? { paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' } : undefined}
      >
        {showMentions && (
          <MentionDropdown
            profiles={teamProfiles}
            query={mentionQuery}
            selectedIdx={mentionIdx}
            onSelect={insertMention}
          />
        )}
        <textarea
          ref={inputRef}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value.slice(0, 2000))
            detectMention(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje… @ para mencionar"
          rows={1}
          style={{ resize: 'none', maxHeight: 80 }}
          className="flex-1 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 overflow-y-auto"
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 80) + 'px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!texto.trim() || sending}
          className="shrink-0 rounded-xl p-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Floating button (draggable)
// ---------------------------------------------------------------------------

export function ChatEquipo() {
  const [open, setOpen] = useState(false)
  const { mensajes, profileId } = useChat()

  const { pos, isDragging, wasDrag, handlers } = useDraggable('chat-equipo-pos', BTN_SIZE)

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [lastSeenCount, setLastSeenCount] = useState<number>(() => {
    const v = sessionStorage.getItem('chat_seen_count')
    return v ? parseInt(v, 10) : 0
  })
  const othersTotal = mensajes.filter((m) => m.profile_id !== profileId).length
  useEffect(() => {
    if (open) {
      setLastSeenCount(othersTotal)
      sessionStorage.setItem('chat_seen_count', String(othersTotal))
    }
  }, [open, othersTotal])
  const unread = Math.max(0, othersTotal - lastSeenCount)

  const defaultBtnStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))',
    left: 'max(1.25rem, calc(env(safe-area-inset-left) + 0.5rem))',
  }

  const btnStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : defaultBtnStyle

  const computedPanelStyle: React.CSSProperties = pos
    ? panelStyle(pos.x, pos.y)
    : {
        position: 'fixed',
        bottom: 'calc(max(1.25rem, env(safe-area-inset-bottom) + 0.75rem) + 60px)',
        left: 'max(1.25rem, calc(env(safe-area-inset-left) + 0.5rem))',
        animation: 'chat-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
      }

  return createPortal(
    <>
      {/* Floating button */}
      <button
        {...handlers}
        onClick={() => { if (wasDrag()) return; setOpen((v) => !v) }}
        style={{
          ...btnStyle,
          zIndex: 50,
          width: BTN_SIZE.w,
          height: BTN_SIZE.h,
          borderRadius: '50%',
          border: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open
            ? 'var(--brand-navy, #1a3a6b)'
            : 'linear-gradient(135deg, #f59e0b, #d97706)',
          boxShadow: isDragging
            ? '0 8px 30px rgba(0,0,0,0.4)'
            : '0 4px 20px rgba(0,0,0,0.3)',
          transition: isDragging ? 'none' : 'background 0.2s, box-shadow 0.2s',
          transform: open && !isDragging ? 'rotate(90deg)' : 'none',
          touchAction: 'none',
          userSelect: 'none',
        }}
        title="Chat del estudio (arrastrá para mover)"
      >
        {open && !isDragging
          ? <X style={{ color: 'white', width: 20, height: 20 }} />
          : <MessageCircle style={{ color: 'white', width: 22, height: 22 }} />
        }
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', color: 'white',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white',
            pointerEvents: 'none',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={isMobile ? { position: 'fixed', inset: 0, zIndex: 51 } : { ...computedPanelStyle, zIndex: 51 }}>
          <ChatPanel onClose={() => setOpen(false)} isMobile={isMobile} />
        </div>
      )}

      <style>{`
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>,
    document.body,
  )
}
