import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type ExpedientesViewMode = 'table' | 'cards'

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  expedientesViewMode: ExpedientesViewMode
  commandPaletteOpen: boolean

  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setExpedientesViewMode: (mode: ExpedientesViewMode) => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      theme: 'system',
      expedientesViewMode: 'table',
      commandPaletteOpen: false,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme
        const next: Theme =
          current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'
        set({ theme: next })
      },

      setExpedientesViewMode: (mode) => set({ expedientesViewMode: mode }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
    }),
    {
      name: 'mr-ui-store',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        expedientesViewMode: state.expedientesViewMode,
        // commandPaletteOpen no se persiste — siempre arranca cerrado
      }),
    }
  )
)
