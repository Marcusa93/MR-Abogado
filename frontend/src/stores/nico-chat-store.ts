import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '@/lib/openrouter'

// ---------------------------------------------------------------------------
// Conversation type
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface NicoChatState {
  isOpen: boolean
  // Active conversation
  activeConversationId: string | null
  messages: ChatMessage[]
  isLoading: boolean
  // Conversation history
  conversations: Conversation[]
  showHistory: boolean
  // Context cache
  cachedContext: string | null
  cachedContextPath: string | null
  cachedContextAt: number
  // Actions
  toggle: () => void
  open: () => void
  close: () => void
  addMessage: (msg: ChatMessage) => void
  updateLastMessage: (content: string) => void
  setLoading: (v: boolean) => void
  clearMessages: () => void
  setCachedContext: (context: string, pathname: string) => void
  invalidateContext: () => void
  // Conversation management
  newConversation: () => void
  saveCurrentConversation: () => void
  loadConversation: (id: string) => void
  deleteConversation: (id: string) => void
  toggleHistory: () => void
}

const CONTEXT_TTL_MS = 3 * 60 * 1000 // 3 minutes
const MAX_CONVERSATIONS = 20

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'Nueva conversación'
  const text = firstUser.content.slice(0, 50)
  return text.length < firstUser.content.length ? text + '...' : text
}

export const useNicoChatStore = create<NicoChatState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      activeConversationId: null,
      messages: [],
      isLoading: false,
      conversations: [],
      showHistory: false,
      cachedContext: null,
      cachedContextPath: null,
      cachedContextAt: 0,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      updateLastMessage: (content: string) =>
        set((s) => {
          const msgs = [...s.messages]
          if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
          }
          return { messages: msgs }
        }),
      setLoading: (isLoading) => set({ isLoading }),
      clearMessages: () => {
        // Save current before clearing (if it has messages)
        const state = get()
        if (state.messages.length > 0) {
          state.saveCurrentConversation()
        }
        set({
          messages: [],
          activeConversationId: null,
          cachedContext: null,
          cachedContextPath: null,
          cachedContextAt: 0,
        })
      },
      setCachedContext: (context: string, pathname: string) =>
        set({ cachedContext: context, cachedContextPath: pathname, cachedContextAt: Date.now() }),
      invalidateContext: () =>
        set({ cachedContext: null, cachedContextPath: null, cachedContextAt: 0 }),

      // ── Conversation management ──────────────────────────────────
      newConversation: () => {
        const state = get()
        if (state.messages.length > 0) {
          state.saveCurrentConversation()
        }
        set({
          messages: [],
          activeConversationId: null,
          showHistory: false,
        })
      },

      saveCurrentConversation: () => {
        const state = get()
        if (state.messages.length === 0) return

        const now = Date.now()
        const existing = state.activeConversationId
          ? state.conversations.find((c) => c.id === state.activeConversationId)
          : null

        if (existing) {
          // Update existing conversation
          set({
            conversations: state.conversations.map((c) =>
              c.id === existing.id
                ? { ...c, messages: state.messages.slice(-50), title: generateTitle(state.messages), updatedAt: now }
                : c
            ),
          })
        } else {
          // Create new conversation
          const newConv: Conversation = {
            id: generateId(),
            title: generateTitle(state.messages),
            messages: state.messages.slice(-50),
            createdAt: now,
            updatedAt: now,
          }
          set({
            activeConversationId: newConv.id,
            conversations: [newConv, ...state.conversations].slice(0, MAX_CONVERSATIONS),
          })
        }
      },

      loadConversation: (id: string) => {
        const state = get()
        // Save current first
        if (state.messages.length > 0 && state.activeConversationId !== id) {
          state.saveCurrentConversation()
        }
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          set({
            messages: conv.messages,
            activeConversationId: conv.id,
            showHistory: false,
          })
        }
      },

      deleteConversation: (id: string) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          ...(s.activeConversationId === id ? { messages: [], activeConversationId: null } : {}),
        })),

      toggleHistory: () => set((s) => ({ showHistory: !s.showHistory })),
    }),
    {
      name: 'nico-chat-storage',
      partialize: (state) => ({
        messages: state.messages.slice(-50),
        isOpen: state.isOpen,
        activeConversationId: state.activeConversationId,
        conversations: state.conversations.slice(0, MAX_CONVERSATIONS),
      }),
    }
  )
)

export function getCachedContextIfValid(pathname: string): string | null {
  const state = useNicoChatStore.getState()
  if (
    state.cachedContext &&
    state.cachedContextPath === pathname &&
    Date.now() - state.cachedContextAt < CONTEXT_TTL_MS
  ) {
    return state.cachedContext
  }
  return null
}
