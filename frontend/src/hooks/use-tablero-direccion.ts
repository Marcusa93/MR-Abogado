import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type TipoAtencion =
  | 'plazo_vencido' | 'audiencia_sin_abogado' | 'sin_movimiento' | 'para_iniciar'
  | 'estado_desactualizado' | 'sin_responsable' | 'tareas_atrasadas' | 'ficha_novedades' | 'consultas_dormidas'

export interface ItemLista { id: string; caratula: string; detalle?: string; n?: number }

export interface ItemAtencion {
  prioridad: 1 | 2 | 3
  tipo: TipoAtencion
  titulo: string
  detalle: string
  expediente_id: string | null
  caratula: string | null
  lista: ItemLista[] | { profile_id: string } | null
}

export interface MiembroEquipo {
  id: string
  nombre: string
  rol: string
  expedientes: number
  tareas_abiertas: number
  tareas_vencidas: number
  completadas_7d: number
  audiencias_15d: number
}

export interface Deudor { cliente_id: string; nombre: string; vencido_ars: number; vencido_usd: number; ultimo_pago: string | null }

export interface TableroDireccion {
  generado: string
  numeros: { en_tramite: number; consultas: number; tareas_vencidas: number; audiencias_15d: number }
  atencion: ItemAtencion[]
  equipo: MiembroEquipo[]
  datos: { sin_caratula: number; sin_sae: number; sin_responsable: number }
  plata: null | {
    ingresos_mes_ars: number
    ingresos_mes_usd: number
    ingresos_mes_anterior_ars: number
    por_cobrar_ars: number
    por_cobrar_usd: number
    vencido_ars: number
    vencido_usd: number
    deudores: Deudor[]
  }
}

export const tableroDireccionKey = ['tablero-direccion'] as const

export function useTableroDireccion() {
  return useQuery({
    queryKey: tableroDireccionKey,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (createClient() as any).rpc('tablero_direccion')
      if (error) throw error
      return data as TableroDireccion
    },
    staleTime: 60_000,
  })
}
