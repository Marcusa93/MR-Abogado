import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TareaRecurrente {
  id: string
  perfil_id: string
  titulo: string
  descripcion: string | null
  frecuencia: 'diaria' | 'lun-vie' | 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes'
  orden: number
  activo: boolean
  creado_por: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIA_A_FRECUENCIA: Record<number, string[]> = {
  0: ['diaria'],                  // domingo: solo diaria
  1: ['diaria', 'lun-vie', 'lunes'],
  2: ['diaria', 'lun-vie', 'martes'],
  3: ['diaria', 'lun-vie', 'miercoles'],
  4: ['diaria', 'lun-vie', 'jueves'],
  5: ['diaria', 'lun-vie', 'viernes'],
  6: ['diaria'],                  // sábado: solo diaria
}

export function esTareaActivaHoy(frecuencia: string): boolean {
  const dia = new Date().getDay()
  return DIA_A_FRECUENCIA[dia]?.includes(frecuencia) ?? false
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useTareasRecurrentesHoy(perfilId?: string) {
  const supabase = createClient()
  const profile = useAuthStore(s => s.profile)
  const targetId = perfilId ?? profile?.id

  return useQuery<TareaRecurrente[]>({
    queryKey: ['tareas-recurrentes-hoy', targetId],
    queryFn: async () => {
      if (!targetId) return []
      const { data, error } = await (supabase as any)
        .from('tareas_recurrentes')
        .select('*')
        .eq('perfil_id', targetId)
        .eq('activo', true)
        .order('orden', { ascending: true })
      if (error) throw error
      return ((data ?? []) as TareaRecurrente[]).filter(t => esTareaActivaHoy(t.frecuencia))
    },
    enabled: !!targetId,
    staleTime: 60_000,
  })
}

export function useCompletadasHoy(perfilId?: string) {
  const supabase = createClient()
  const profile = useAuthStore(s => s.profile)
  const targetId = perfilId ?? profile?.id
  const hoy = hoyISO()

  return useQuery<Set<string>>({
    queryKey: ['tareas-recurrentes-completadas', targetId, hoy],
    queryFn: async () => {
      if (!targetId) return new Set<string>()
      const { data, error } = await (supabase as any)
        .from('tareas_recurrentes_completadas')
        .select('tarea_recurrente_id')
        .eq('perfil_id', targetId)
        .eq('fecha', hoy)
      if (error) throw error
      return new Set<string>((data ?? []).map((r: any) => r.tarea_recurrente_id as string))
    },
    enabled: !!targetId,
    staleTime: 0,
  })
}

export function useMarcarTareaRecurrente() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)

  return useMutation({
    mutationFn: async ({ id, completada, perfilId }: { id: string; completada: boolean; perfilId: string }) => {
      const hoy = hoyISO()
      if (completada) {
        const { error } = await (supabase as any)
          .from('tareas_recurrentes_completadas')
          .upsert({ tarea_recurrente_id: id, perfil_id: perfilId, fecha: hoy })
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('tareas_recurrentes_completadas')
          .delete()
          .eq('tarea_recurrente_id', id)
          .eq('fecha', hoy)
          .eq('perfil_id', profile?.id ?? perfilId)
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-completadas', vars.perfilId, hoyISO()] })
    },
  })
}

export function useTareasRecurrentesAdmin() {
  const supabase = createClient()
  return useQuery<Array<TareaRecurrente & { perfil: { nombre: string | null; apellido: string | null } | null }>>({
    queryKey: ['tareas-recurrentes-admin'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tareas_recurrentes')
        .select('*, perfil:profiles!tareas_recurrentes_perfil_id_fkey(nombre, apellido)')
        .order('perfil_id')
        .order('orden')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useCreateTareaRecurrente() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)

  return useMutation({
    mutationFn: async (payload: {
      perfil_id: string
      titulo: string
      descripcion?: string | null
      frecuencia: TareaRecurrente['frecuencia']
      orden?: number
    }) => {
      const { error } = await (supabase as any)
        .from('tareas_recurrentes')
        .insert({ ...payload, creado_por: profile?.id ?? null })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-admin'] })
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-completadas'] })
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-hoy'] })
    },
  })
}

export function useDeleteTareaRecurrente() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('tareas_recurrentes')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-admin'] })
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-completadas'] })
      qc.invalidateQueries({ queryKey: ['tareas-recurrentes-hoy'] })
    },
  })
}
