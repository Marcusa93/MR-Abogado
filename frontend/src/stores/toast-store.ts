import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

let nextId = 0

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++nextId}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    // Auto-dismiss despues de 5 segundos
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, 5000)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

// ---------------------------------------------------------------------------
// Shorthand helpers — usable outside React components
// ---------------------------------------------------------------------------

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'success', title, description }),

  error: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'error', title, description }),

  info: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'info', title, description }),

  warning: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'warning', title, description }),
}
