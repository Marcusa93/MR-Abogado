import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@/stores/toast-store'
import { useNicoChatStore } from '@/stores/nico-chat-store'

/** Extract a user-friendly error message from Supabase or generic errors. */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return 'Ocurrio un error inesperado'
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
          },
        },
        // MutationCache.onError se ejecuta SIEMPRE para cualquier mutacion
        // que falle, incluso si la mutacion tiene su propio onError.
        // Esto garantiza que el usuario siempre vea feedback visual.
        mutationCache: new MutationCache({
          onError: (error: Error) => {
            toast.error('Error al guardar', getErrorMessage(error))
          },
          onSuccess: () => {
            // Invalidate Nico IA context cache so next chat query fetches fresh data
            useNicoChatStore.getState().invalidateContext()
          },
        }),
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
