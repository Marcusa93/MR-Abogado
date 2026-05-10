import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PwaInstallState {
  /** Usuario descartó el prompt o confirmó que ya lo instaló */
  dismissed: boolean
  /** Cerrar definitivamente y recordar */
  dismiss: () => void
  /** Reabrir (p.ej. desde el tour / botón de ayuda) */
  reopen: () => void
}

export const usePwaInstallStore = create<PwaInstallState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
      reopen: () => set({ dismissed: false }),
    }),
    {
      name: 'mr-pwa-install',
      partialize: (s) => ({ dismissed: s.dismissed }),
    },
  ),
)
