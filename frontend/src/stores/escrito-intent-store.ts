import { create } from 'zustand'

// Coordina el salto "Redactar respuesta" desde una actuación hacia la solapa
// Escritos, pre-apuntando el generador a esa providencia.
interface EscritoIntentState {
  /** Tab a la que el detail del expediente debe saltar (ej. 'escritos'). */
  pendingTab: string | null
  /** Movimiento SAE al que el nuevo escrito debe responder. */
  respondeA: string | null
  redactarRespuesta: (movimientoId: string) => void
  consumirRespondeA: () => string | null
  clearPendingTab: () => void
}

export const useEscritoIntent = create<EscritoIntentState>((set, get) => ({
  pendingTab: null,
  respondeA: null,
  redactarRespuesta: (movimientoId) => set({ pendingTab: 'escritos', respondeA: movimientoId }),
  consumirRespondeA: () => {
    const v = get().respondeA
    set({ respondeA: null })
    return v
  },
  clearPendingTab: () => set({ pendingTab: null }),
}))
