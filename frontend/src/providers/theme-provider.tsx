import { useLayoutEffect } from 'react'

// Forzamos dark mode permanente. Decisión de producto: la app solo
// se ve bien en dark, mantener light era fuente constante de bugs
// de contraste. Si en el futuro volvemos a soportar light, restaurar
// el switch desde git history (commit anterior a a04b6a6).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add('dark')
    root.dataset.theme = 'dark'
    root.style.colorScheme = 'dark'
  }, [])

  return <>{children}</>
}
