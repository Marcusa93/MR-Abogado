import { RouterProvider } from 'react-router-dom'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import { ToastContainer } from '@/components/shared/toast-container'
import { router } from '@/router'

export default function App() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
        <ToastContainer />
      </ThemeProvider>
    </QueryProvider>
  )
}
