// Honorarios module removed — stub hooks to avoid import errors

export function useAcuerdosHonorarios(_expedienteId: string | undefined) {
  return { data: [], isLoading: false, error: null }
}

export function useCreateAcuerdoHonorario() {
  return {
    mutateAsync: async (_input: any) => { throw new Error('Módulo de honorarios no disponible') },
    isPending: false,
  }
}

export function useCobrosHonorarios(_expedienteId: string | undefined) {
  return { data: [], isLoading: false, error: null }
}

export function useCreateCobroHonorario() {
  return {
    mutateAsync: async (_input: any) => { throw new Error('Módulo de honorarios no disponible') },
    isPending: false,
  }
}
