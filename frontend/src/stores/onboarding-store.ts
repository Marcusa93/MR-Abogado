import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingState {
  /** Ya completó o cerró el tour en esta máquina */
  completed: boolean
  /** El tour está visible ahora mismo */
  isOpen: boolean
  open: () => void
  close: () => void
  markCompleted: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      markCompleted: () => set({ completed: true, isOpen: false }),
    }),
    {
      name: 'mr-onboarding',
      partialize: (s) => ({ completed: s.completed }),
    },
  ),
)
