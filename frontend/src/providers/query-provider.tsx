import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@/stores/toast-store'
import { useNicoChatStore } from '@/stores/nico-chat-store'
import { createClient } from '@/lib/supabase/client'

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

/** Detecta errores de sesión expirada de Supabase y redirige al login. */
function isAuthError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase()
  return (
    msg.includes('no api key') ||
    msg.includes('apikey') ||
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('not authenticated') ||
    (typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 401)
  )
}

async function handleAuthError() {
  try {
    await createClient().auth.signOut()
  } finally {
    window.location.href = '/login'
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (isAuthError(error)) return false
              return failureCount < 3
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
          },
        },
        queryCache: new QueryCache({
          onError: (error) => {
            if (isAuthError(error)) {
              handleAuthError()
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error: Error) => {
            if (isAuthError(error)) {
              handleAuthError()
              return
            }
            toast.error('Error al guardar', getErrorMessage(error))
          },
          onSuccess: () => {
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
