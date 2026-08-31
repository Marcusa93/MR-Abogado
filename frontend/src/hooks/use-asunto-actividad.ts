import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import type { AsuntoItem } from '@/hooks/use-mi-trabajo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActividadEntry {
  id: string
  tipo: string
  descripcion: string
  created_at: string
  autor: string
  source: 'actividad' | 'nota' | 'estado' | 'sae'
  readonly: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TIPOS_CONSULTA = ['nota', 'llamada', 'email', 'reunion'] as const
export const TIPOS_EXPEDIENTE = ['nota', 'llamada', 'email', 'reunion', 'documento', 'otro'] as const

export const TIPO_LABELS: Record<string, string> = {
  nota:          'Nota',
  llamada:       'Llamada',
  email:         'Email',
  reunion:       'Reunión',
  documento:     'Documento',
  tarea:         'Tarea',
  cambio_estado: 'Estado cambiado',
  sae:           'Actuación SAE',
  otro:          'Otro',
}

export const TIPO_DOT: Record<string, string> = {
  nota:          'bg-zinc-300 dark:bg-zinc-600',
  llamada:       'bg-blue-400',
  email:         'bg-sky-400',
  reunion:       'bg-indigo-400',
  documento:     'bg-amber-400',
  tarea:         'bg-teal-400',
  cambio_estado: 'bg-purple-400',
  sae:           'bg-green-500',
  otro:          'bg-zinc-300 dark:bg-zinc-600',
}

export const TIPO_BADGE: Record<string, string> = {
  nota:          'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  llamada:       'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  email:         'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
  reunion:       'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300',
  documento:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  tarea:         'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300',
  cambio_estado: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
  sae:           'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  otro:          'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const actividadKey = (tipo: string, id: string) =>
  ['asunto-actividad', tipo, id] as const

// ---------------------------------------------------------------------------
// Hook: fetch activity feed
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAutor(profile: any): string {
  if (!profile) return 'Sistema'
  return [profile.apellido, profile.nombre].filter(Boolean).join(', ').trim() || 'Usuario'
}

export function useAsuntoActividad(item: AsuntoItem | null) {
  const supabase = createClient()

  return useQuery<ActividadEntry[]>({
    queryKey: item ? actividadKey(item.tipo, item.id) : ['asunto-actividad-disabled'],
    enabled: !!item,
    staleTime: 30_000,
    queryFn: async () => {
      if (!item) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any

      if (item.tipo === 'consulta') {
        const { data, error } = await sb
          .from('consulta_actividad')
          .select('id, tipo, descripcion, created_at, created_by:profiles(nombre, apellido)')
          .eq('consulta_id', item.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data ?? []).map((e: any): ActividadEntry => ({
          id: `act-${e.id}`,
          tipo: e.tipo ?? 'nota',
          descripcion: e.descripcion,
          created_at: e.created_at,
          autor: buildAutor(e.created_by),
          source: 'actividad',
          readonly: false,
        }))
      }

      // Expediente: tres fuentes en paralelo
      const [notasRes, estadosRes, saeRes] = await Promise.all([
        sb
          .from('expediente_notas')
          .select('id, contenido, tipo, created_at, created_by:profiles(nombre, apellido)')
          .eq('expediente_id', item.id)
          .eq('eliminada', false)
          .order('created_at', { ascending: false })
          .limit(30),

        sb
          .from('historial_estados_expediente')
          .select('id, estado_anterior, estado_nuevo, motivo, observacion, created_at, changed_by:profiles(nombre, apellido)')
          .eq('expediente_id', item.id)
          .order('created_at', { ascending: false })
          .limit(20),

        sb
          .from('sae_movements')
          .select('id, titulo, tipo_movimiento, fecha, created_at')
          .eq('expediente_id', item.id)
          .order('fecha', { ascending: false })
          .limit(10),
      ])

      const entries: ActividadEntry[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const n of notasRes.data ?? [] as any[]) {
        entries.push({
          id: `nota-${n.id}`,
          tipo: n.tipo ?? 'nota',
          descripcion: n.contenido,
          created_at: n.created_at,
          autor: buildAutor(n.created_by),
          source: 'nota',
          readonly: false,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const h of estadosRes.data ?? [] as any[]) {
        const desc = [
          h.estado_anterior ? `${h.estado_anterior} → ${h.estado_nuevo}` : h.estado_nuevo,
          h.motivo,
          h.observacion,
        ].filter(Boolean).join(': ')
        entries.push({
          id: `estado-${h.id}`,
          tipo: 'cambio_estado',
          descripcion: desc,
          created_at: h.created_at,
          autor: buildAutor(h.changed_by),
          source: 'estado',
          readonly: true,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of saeRes.data ?? [] as any[]) {
        entries.push({
          id: `sae-${s.id}`,
          tipo: 'sae',
          descripcion: s.titulo,
          created_at: s.fecha ? `${s.fecha}T00:00:00` : s.created_at,
          autor: 'SAE',
          source: 'sae',
          readonly: true,
        })
      }

      entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return entries
    },
  })
}

// ---------------------------------------------------------------------------
// Mutation: agregar entrada de actividad
// ---------------------------------------------------------------------------

export function useAddActividad() {
  const supabase = createClient()
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)

  return useMutation({
    mutationFn: async ({
      item,
      tipo,
      descripcion,
    }: {
      item: AsuntoItem
      tipo: string
      descripcion: string
    }) => {
      if (!profile?.id) throw new Error('No autenticado')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any

      if (item.tipo === 'consulta') {
        const { error } = await sb
          .from('consulta_actividad')
          .insert({ consulta_id: item.id, tipo, descripcion, created_by: profile.id })
        if (error) throw error
      } else {
        const { error } = await sb
          .from('expediente_notas')
          .insert({ expediente_id: item.id, tipo, contenido: descripcion, es_privada: false, created_by: profile.id })
        if (error) throw error
      }
    },
    onSuccess: (_, { item }) => {
      qc.invalidateQueries({ queryKey: actividadKey(item.tipo, item.id) })
      qc.invalidateQueries({ queryKey: ['mi-trabajo'] })
      toast.success('Actividad registrada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al registrar'),
  })
}
