import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DiasInhabiles, FeriaPeriod } from '@/lib/utils/judicial-calendar'

export type AmbitoInhabil = 'nacional' | 'provincial' | 'judicial'

export interface DiaInhabil {
  id: number
  fecha: string
  ambito: AmbitoInhabil
  descripcion: string
  fuente: 'api' | 'ley' | 'manual'
  referencia: string | null
  inhabil: boolean
}

export interface Feria extends FeriaPeriod {
  id: number
  anio: number
  temporada: string
  descripcion: string | null
}

// Tablas nuevas, todavía fuera de database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export const calendarioKeys = { all: ['calendario-judicial'] as const }

/** Días inhábiles + ferias: lo mismo que usa la procuración para calcular plazos. */
export function useCalendarioJudicial() {
  const q = useQuery({
    queryKey: calendarioKeys.all,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const [{ data: dias, error: e1 }, { data: ferias, error: e2 }] = await Promise.all([
        db().from('dias_inhabiles').select('id, fecha, ambito, descripcion, fuente, referencia, inhabil').order('fecha'),
        db().from('feria_judicial').select('id, anio, temporada, inicio, fin, descripcion').order('inicio'),
      ])
      if (e1) throw e1
      if (e2) throw e2
      return { dias: (dias ?? []) as DiaInhabil[], ferias: (ferias ?? []) as Feria[] }
    },
  })
  const inhabiles = useMemo<DiasInhabiles | undefined>(() => {
    if (!q.data) return undefined
    const habilitados = new Set(q.data.dias.filter((d) => !d.inhabil).map((d) => d.fecha))
    return {
      fechas: new Set(q.data.dias.filter((d) => d.inhabil && !habilitados.has(d.fecha)).map((d) => d.fecha)),
      anios: new Set(q.data.dias.filter((d) => d.ambito === 'nacional').map((d) => Number(d.fecha.slice(0, 4)))),
    }
  }, [q.data])
  return { ...q, inhabiles }
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: calendarioKeys.all })
    qc.invalidateQueries({ queryKey: ['ferias-judiciales'] })
  }
}

export function useAgregarDiaInhabil() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (v: { fecha: string; ambito: AmbitoInhabil; descripcion: string; referencia?: string }) => {
      const { data: { user } } = await createClient().auth.getUser()
      const { error } = await db().from('dias_inhabiles').upsert({
        fecha: v.fecha, ambito: v.ambito, descripcion: v.descripcion.trim(), referencia: v.referencia?.trim() || null,
        fuente: 'manual', inhabil: true, created_by: user?.id ?? null,
      }, { onConflict: 'fecha,ambito' })
      if (error) throw error
    },
    onSuccess: inv,
  })
}

/** inhabil=false: el Poder Judicial trabajó ese día (no adhirió al feriado o al puente). */
export function useMarcarDia() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (v: { id: number; inhabil: boolean }) => {
      const { error } = await db().from('dias_inhabiles').update({ inhabil: v.inhabil }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: inv,
  })
}

export function useBorrarDia() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await db().from('dias_inhabiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: inv,
  })
}

export function useAgregarFeria() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (v: { inicio: string; fin: string; temporada: 'verano' | 'invierno'; descripcion: string }) => {
      const { error } = await db().from('feria_judicial').insert({
        anio: Number(v.inicio.slice(0, 4)), temporada: v.temporada, inicio: v.inicio, fin: v.fin, descripcion: v.descripcion.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: inv,
  })
}

export function useBorrarFeria() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await db().from('feria_judicial').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: inv,
  })
}

/** Trae los nacionales de la API oficial (decretos) para el año pedido. */
export function useSincronizarNacionales() {
  const inv = useInvalidar()
  return useMutation({
    mutationFn: async (anios: number[]) => {
      const { data, error } = await createClient().functions.invoke('calendario-judicial', { body: { anios } })
      if (error) throw error
      return data as { guardados: Record<string, number> }
    },
    onSuccess: inv,
  })
}
