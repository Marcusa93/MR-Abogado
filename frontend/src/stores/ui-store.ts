import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type ExpedientesViewMode = 'table' | 'cards'

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  commandPaletteOpen: boolean
  expedientesViewMode: ExpedientesViewMode

  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setExpedientesViewMode: (mode: ExpedientesViewMode) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      theme: 'system',
      commandPaletteOpen: false,
      expedientesViewMode: 'table',

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme
        const next: Theme =
          current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'
        set({ theme: next })
      },

      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setExpedientesViewMode: (mode) => set({ expedientesViewMode: mode }),
    }),
    {
      name: 'mr-ui-store',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        expedientesViewMode: state.expedientesViewMode,
      }),
    }
  )
)
