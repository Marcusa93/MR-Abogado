import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { useChat, type ChatMensaje } from '@/hooks/use-chat'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/date-helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(m: ChatMensaje): string {
  const n = m.perfil?.nombre?.[0] ?? ''
  const a = m.perfil?.apellido?.[0] ?? ''
  return (n + a).toUpperCase() || '?'
}

function nombre(m: ChatMensaje): string {
  const parts = [m.perfil?.nombre, m.perfil?.apellido].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Usuario'
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

// ---------------------------------------------------------------------------
// MensajeRow
// ---------------------------------------------------------------------------

function MensajeRow({ msg, isOwn }: { msg: ChatMensaje; isOwn: boolean }) {
  return (
    <div className={cn('flex gap-2 mb-3', isOwn && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white self-end',
        avatarColor(msg.profile_id),
      )}>
        {initials(msg)}
      </div>
      <div className={cn('max-w-[75%] space-y-0.5', isOwn && 'items-end flex flex-col')}>
        <p className={cn('text-[10px] text-zinc-500', isOwn && 'text-right')}>
          {isOwn ? 'Vos' : nombre(msg)} · {timeAgo(msg.created_at)}
        </p>
        <div className={cn(
          'rounded-2xl px-3 py-2 text-sm leading-snug break-words',
          isOwn
            ? 'bg-[var(--brand-navy)] text-white dark:bg-amber-500/90 dark:text-zinc-900 rounded-tr-sm'
            : 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 rounded-tl-sm',
        )}>
          {msg.contenido}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { mensajes, loading, sending, enviar, profileId } = useChat()
  const [texto, setTexto] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSend() {
    if (!texto.trim() || sending) return
    const txt = texto
    setTexto('')
    await enviar(txt)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-white/10 overflow-hidden"
      style={{ width: 340, height: 480 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/[0.07] bg-zinc-50 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Chat del estudio</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title="En vivo" />
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
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
      <div className="px-3 py-2.5 border-t border-zinc-100 dark:border-white/[0.07] flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje… (Enter para enviar)"
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
// Floating button + portal
// ---------------------------------------------------------------------------

export function ChatEquipo() {
  const [open, setOpen] = useState(false)
  const { mensajes, profileId } = useChat()

  // Count unread: messages since last open (simple: just count others' messages not seen)
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

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))',
        left: 'max(1.25rem, calc(env(safe-area-inset-left) + 0.5rem))',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open
            ? 'var(--brand-navy, #1a3a6b)'
            : 'linear-gradient(135deg, #f59e0b, #d97706)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'background 0.2s, transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'none',
        }}
        title="Chat del estudio"
      >
        {open
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
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(max(1.25rem, env(safe-area-inset-bottom) + 0.75rem) + 60px)',
            left: 'max(1.25rem, calc(env(safe-area-inset-left) + 0.5rem))',
            animation: 'chat-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          <ChatPanel onClose={() => setOpen(false)} />
        </div>
      )}

      <style>{`
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
