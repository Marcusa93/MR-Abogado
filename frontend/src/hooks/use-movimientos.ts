// Movimientos module removed — stub hooks and types to avoid import errors

export type TipoMovimiento = 'INGRESO' | 'EGRESO'

export type CategoriaMovimiento =
  | 'HONORARIO'
  | 'GASTO_OPERATIVO'
  | 'GASTO_JUDICIAL'
  | 'SUELDO'
  | 'ALQUILER'
  | 'IMPUESTO'
  | 'OTRO_INGRESO'
  | 'OTRO_EGRESO'

export const CATEGORIA_LABELS: Record<CategoriaMovimiento, string> = {
  HONORARIO: 'Honorario',
  GASTO_OPERATIVO: 'Gasto operativo',
  GASTO_JUDICIAL: 'Gasto judicial',
  SUELDO: 'Sueldo',
  ALQUILER: 'Alquiler',
  IMPUESTO: 'Impuesto',
  OTRO_INGRESO: 'Otro ingreso',
  OTRO_EGRESO: 'Otro egreso',
}

export const CATEGORIAS_INGRESO: CategoriaMovimiento[] = ['HONORARIO', 'OTRO_INGRESO']
export const CATEGORIAS_EGRESO: CategoriaMovimiento[] = [
  'GASTO_OPERATIVO',
  'GASTO_JUDICIAL',
  'SUELDO',
  'ALQUILER',
  'IMPUESTO',
  'OTRO_EGRESO',
]

export type MovimientoWithCreator = {
  id: string
  tipo: TipoMovimiento
  categoria: CategoriaMovimiento
  monto: number
  descripcion: string
  fecha: string
  expediente_id: string | null
  metodo_pago: string | null
  comprobante_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  creator: { id: string; nombre: string; apellido: string } | null
  expediente: { id: string; numero: string; caratula: string | null } | null
}

export interface MovimientosFilters {
  tipo?: TipoMovimiento | null
  categoria?: CategoriaMovimiento | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string
  page?: number
  pageSize?: number
}

export const movimientosKeys = {
  all: ['movimientos'] as const,
  list: (filters: MovimientosFilters) => ['movimientos', 'list', filters] as const,
  stats: (month?: string) => ['movimientos', 'stats', month] as const,
}

export function useMovimientos(_filters: MovimientosFilters = {}) {
  return {
    data: { data: [] as MovimientoWithCreator[], count: 0, page: 1, pageSize: 20, totalPages: 0 },
    isLoading: false,
    error: null,
  }
}

export function useMovimientosStats(_month?: string) {
  return {
    data: { ingresos: 0, egresos: 0, balance: 0, count: 0 },
    isLoading: false,
    error: null,
  }
}

export function useCreateMovimiento() {
  return {
    mutateAsync: async (_input: any) => { throw new Error('Módulo de movimientos no disponible') },
    isPending: false,
    mutate: (_input: any) => {},
  }
}

export function useDeleteMovimiento() {
  return {
    mutateAsync: async (_id: string) => { throw new Error('Módulo de movimientos no disponible') },
    isPending: false,
    mutate: (_id: string) => {},
  }
}
