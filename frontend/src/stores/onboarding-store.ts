import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingState {
  completed: boolean
  isOpen: boolean
  open: () => void
  /** Cierra sin marcar como completado (volverá a aparecer la próxima vez). */
  justClose: () => void
  /** Cierra y marca como completado (no vuelve a aparecer automáticamente). */
  close: () => void
  markCompleted: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      isOpen: false,
      open: () => set({ isOpen: true }),
      justClose: () => set({ isOpen: false }),
      close: () => set({ isOpen: false, completed: true }),
      markCompleted: () => set({ completed: true, isOpen: false }),
    }),
    {
      name: 'mr-onboarding',
      partialize: (s) => ({ completed: s.completed }),
    },
  ),
)
