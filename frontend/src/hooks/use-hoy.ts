import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface HoyAudiencia {
  id: string
  hora: string
  tipo: string | null
  expediente_id: string
  expediente_caratula: string | null
  expediente_numero: string | null
  cliente_nombre: string | null
  cliente_apellido: string | null
  organismo: string | null
  estado: string
}

export interface HoyTarea {
  id: string
  titulo: string
  descripcion: string | null
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  fecha_vencimiento: string | null
  expediente_id: string | null
  expediente_caratula: string | null
  estado: string
  vencida: boolean
}

export interface HoyContenido {
  id: string
  titulo: string
  categoria: string
  estado: string
  publicar_el: string | null
}

export interface HoyData {
  fecha: string
  usuario: { nombre: string | null; apellido: string | null; rol: string }
  audiencias_hoy: HoyAudiencia[]
  tareas_pendientes: HoyTarea[]
  tareas_hoy_count: number
  tareas_vencidas_count: number
  contenidos_pendientes: HoyContenido[]
  consultas_nuevas_count: number
}

export function useHoy() {
  const supabase = createClient()
  return useQuery<HoyData>({
    queryKey: ['hoy-en-el-estudio'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('hoy_en_el_estudio')
      if (error) throw error
      return data as HoyData
    },
  })
}
