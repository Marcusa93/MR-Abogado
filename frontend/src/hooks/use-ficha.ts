import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { Ficha, PropuestaFicha } from '@/lib/expedientes/ficha'

// La tabla todavía no está en database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export const fichaKeys = {
  ficha: (id: string) => ['ficha', id] as const,
  propuestas: (id: string) => ['ficha', id, 'propuestas'] as const,
}

export function useFicha(expedienteId: string) {
  return useQuery({
    queryKey: fichaKeys.ficha(expedienteId),
    queryFn: async () => {
      const { data, error } = await db().from('expediente_fichas').select('*').eq('expediente_id', expedienteId).maybeSingle()
      if (error) throw error
      return (data ?? null) as Ficha | null
    },
  })
}

export function usePropuestasFicha(expedienteId: string) {
  return useQuery({
    queryKey: fichaKeys.propuestas(expedienteId),
    queryFn: async () => {
      const { data, error } = await db().from('expediente_ficha_propuestas')
        .select('id, expediente_id, origen, titulo, cambios, created_at')
        .eq('expediente_id', expedienteId).eq('estado', 'pendiente').order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PropuestaFicha[]
    },
  })
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke('expediente-ficha', { body })
  if (error) {
    let msg = 'No se pudo completar'
    try { msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? msg } catch { /* */ }
    throw new Error(msg)
  }
  return data as T
}

/** La IA arma la ficha completa desde el SAE, los escritos y las notas. */
export function useArmarFicha(expedienteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invocar<{ ok: true }>({ accion: 'armar', expediente_id: expedienteId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ficha', expedienteId] })
      qc.invalidateQueries({ queryKey: ['expedientes'] })
    },
  })
}

/** El abogado cuenta algo; la IA lo ubica en la ficha y deja una propuesta. */
export function useDictarFicha(expedienteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (texto: string) => invocar<{ ok: true; propuesta_id: string | null }>({ accion: 'dictar', expediente_id: expedienteId, texto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: fichaKeys.propuestas(expedienteId) }),
  })
}

/** Guarda cambios hechos a mano (o el resultado de aplicar una propuesta). */
export function useGuardarFicha(expedienteId: string) {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (cambios: Partial<Omit<Ficha, 'expediente_id' | 'updated_at'>>) => {
      const { error } = await db().from('expediente_fichas')
        .upsert({ expediente_id: expedienteId, ...cambios, updated_by: userId ?? null })
      if (error) throw error
    },
    onMutate: async (cambios) => {
      await qc.cancelQueries({ queryKey: fichaKeys.ficha(expedienteId) })
      const previa = qc.getQueryData<Ficha | null>(fichaKeys.ficha(expedienteId))
      if (previa) qc.setQueryData(fichaKeys.ficha(expedienteId), { ...previa, ...cambios })
      return { previa }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previa !== undefined) qc.setQueryData(fichaKeys.ficha(expedienteId), ctx.previa) },
    onSettled: () => qc.invalidateQueries({ queryKey: fichaKeys.ficha(expedienteId) }),
  })
}

export function useResolverPropuesta(expedienteId: string) {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: 'aplicada' | 'descartada' }) => {
      const { error } = await db().from('expediente_ficha_propuestas')
        .update({ estado, resuelta_at: new Date().toISOString(), resuelta_por: userId ?? null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fichaKeys.propuestas(expedienteId) }),
  })
}
