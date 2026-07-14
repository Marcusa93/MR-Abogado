import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

const supabase = createClient()

export interface PlazoPropuesto {
  id: string
  profile_id: string
  sae_notif_id: string
  expediente_id: string | null
  numero_expediente: string | null
  caratula: string | null
  tipo: string | null
  titulo: string | null
  plazo_sugerido: {
    tipo_acto: string
    dias: number
    es_habiles: boolean
    base_legal: string | null
    fecha_actuacion: string
    fecha_vencimiento: string
    confianza: 'alta' | 'media' | 'baja'
    estado: 'pendiente' | 'confirmado' | 'descartado'
  }
  created_at: string
  expediente?: { id: string; caratula: string | null; numero: string | null } | null
}

export function usePlazoPropuestos() {
  const profile = useAuthStore(s => s.profile)
  return useQuery<PlazoPropuesto[]>({
    queryKey: ['plazos-propuestos', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('sae_notificaciones')
        .select('id, profile_id, sae_notif_id, expediente_id, numero_expediente, caratula, tipo, titulo, plazo_sugerido, created_at, expediente:expedientes(id, caratula, numero)')
        .eq('profile_id', profile.id)
        .not('plazo_sugerido', 'is', null)
        .eq('plazo_sugerido->>estado', 'pendiente')
        .order('plazo_sugerido->>fecha_vencimiento', { ascending: true })
        .limit(20)
      if (error) throw error
      return (data ?? []) as PlazoPropuesto[]
    },
    enabled: !!profile?.id,
  })
}

export function useConfirmarPlazo() {
  const qc = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  return useMutation({
    mutationFn: async ({ notifId, plazo, expedienteId, tituloTarea }: {
      notifId: string
      plazo: PlazoPropuesto['plazo_sugerido']
      expedienteId: string | null
      tituloTarea: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const updatedPlazo = { ...plazo, estado: 'confirmado' }
      const { error: upErr } = await db
        .from('sae_notificaciones')
        .update({ plazo_sugerido: updatedPlazo })
        .eq('id', notifId)
      if (upErr) throw upErr

      if (expedienteId && profile?.id) {
        const { error: tareaErr } = await db.from('tareas').insert({
          titulo: tituloTarea,
          fecha_vencimiento: plazo.fecha_vencimiento,
          es_plazo_judicial: true,
          expediente_id: expedienteId,
          asignado_a: profile.id,
          estado: 'PENDIENTE',
          prioridad: 'ALTA',
          created_by: profile.id,
        })
        if (tareaErr) throw tareaErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plazos-propuestos'] })
      qc.invalidateQueries({ queryKey: ['tareas'] })
    },
  })
}

export function useDescartarPlazo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ notifId, plazo }: { notifId: string; plazo: PlazoPropuesto['plazo_sugerido'] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('sae_notificaciones')
        .update({ plazo_sugerido: { ...plazo, estado: 'descartado' } })
        .eq('id', notifId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plazos-propuestos'] })
    },
  })
}
