import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonedaCaja = 'ARS' | 'USD'

export const GASTO_CATEGORIAS = [
  { value: 'timbrado', label: 'Timbrado' },
  { value: 'oficios', label: 'Oficios' },
  { value: 'pericia', label: 'Pericia' },
  { value: 'viaticos', label: 'Viáticos' },
  { value: 'cedulas', label: 'Cédulas / Notificaciones' },
  { value: 'fotocopias', label: 'Fotocopias' },
  { value: 'estacionamiento', label: 'Estacionamiento' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Servicios (luz/internet/etc)' },
  { value: 'sueldos', label: 'Sueldos' },
  { value: 'honorarios_externos', label: 'Honorarios externos' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'software', label: 'Software' },
  { value: 'libros_bibliografia', label: 'Libros / Bibliografía' },
  { value: 'otro', label: 'Otro' },
] as const

export const INGRESO_TIPOS = [
  { value: 'abono_mensual', label: 'Abono mensual' },
  { value: 'honorario_expediente', label: 'Honorario de expediente' },
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'pacto_quota_litis', label: 'Pacto de cuota litis' },
  { value: 'otro', label: 'Otro' },
] as const

export interface Gasto {
  id: string
  fecha: string
  monto: number
  moneda: MonedaCaja
  categoria: string
  expediente_id: string | null
  descripcion: string | null
  comprobante_path: string | null
  recuperable: boolean
  recuperado_at: string | null
  cargado_por: string
  created_at: string
}

export interface Ingreso {
  id: string
  fecha: string
  monto: number
  moneda: MonedaCaja
  tipo: string
  categoria: string | null
  cliente_id: string | null
  expediente_id: string | null
  abono_id: string | null
  periodo_year: number | null
  periodo_month: number | null
  descripcion: string | null
  comprobante_path: string | null
  cargado_por: string
  created_at: string
}

export interface AbonoMensual {
  id: string
  cliente_id: string
  monto: number
  moneda: MonedaCaja
  dia_de_cobro: number
  fecha_inicio: string
  fecha_fin: string | null
  activo: boolean
  notas: string | null
  created_by: string
  created_at: string
}

export interface PagoPendiente {
  abono_id: string
  cliente_id: string
  cliente_nombre: string
  cliente_apellido: string
  monto: number
  moneda: MonedaCaja
  dia_de_cobro: number
  vence_el: string
  dias_atraso: number
  estado: 'pagado' | 'por_vencer' | 'pendiente' | 'atrasado'
  ultimo_pago: string | null
}

export interface CajaResumen {
  periodo: { year: number; month: number }
  mes_actual: {
    ingresos_ars: number
    ingresos_usd: number
    gastos_ars: number
    gastos_usd: number
  }
  anio_actual: { ingresos_ars: number; gastos_ars: number }
  gastos_por_categoria_mes: { categoria: string; monto: number }[]
  ingresos_por_tipo_mes: { tipo: string; monto: number }[]
  abonos_activos: number
  abonos_total_mensual_ars: number
  pagos_pendientes_count: number
  pagos_atrasados_count: number
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

export function useTieneAccesoCaja() {
  const supabase = createClient()
  return useQuery<boolean>({
    queryKey: ['caja-acceso'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('can_access_caja')
      if (error) return false
      return Boolean(data)
    },
  })
}

// ---------------------------------------------------------------------------
// Resumen + Pagos pendientes
// ---------------------------------------------------------------------------

export function useCajaResumen() {
  const supabase = createClient()
  return useQuery<CajaResumen>({
    queryKey: ['caja-resumen'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('caja_resumen')
      if (error) throw error
      return data as CajaResumen
    },
  })
}

export function usePagosPendientes(year?: number, month?: number) {
  const supabase = createClient()
  return useQuery<PagoPendiente[]>({
    queryKey: ['caja-pagos-pendientes', year ?? 'now', month ?? 'now'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('caja_pagos_pendientes_mes', {
        p_year: year ?? null, p_month: month ?? null,
      })
      if (error) throw error
      return (data ?? []) as PagoPendiente[]
    },
  })
}

// ---------------------------------------------------------------------------
// Listados
// ---------------------------------------------------------------------------

export function useGastos(month?: { year: number; month: number }) {
  const supabase = createClient()
  return useQuery<Gasto[]>({
    queryKey: ['gastos', month ?? 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from as any)('gastos').select('*').order('fecha', { ascending: false })
      if (month) {
        const start = `${month.year}-${String(month.month).padStart(2, '0')}-01`
        const nextM = month.month === 12 ? 1 : month.month + 1
        const nextY = month.month === 12 ? month.year + 1 : month.year
        const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`
        q = q.gte('fecha', start).lt('fecha', end)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Gasto[]
    },
  })
}

export function useIngresos(month?: { year: number; month: number }) {
  const supabase = createClient()
  return useQuery<Ingreso[]>({
    queryKey: ['ingresos', month ?? 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from as any)('ingresos').select('*').order('fecha', { ascending: false })
      if (month) {
        const start = `${month.year}-${String(month.month).padStart(2, '0')}-01`
        const nextM = month.month === 12 ? 1 : month.month + 1
        const nextY = month.month === 12 ? month.year + 1 : month.year
        const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`
        q = q.gte('fecha', start).lt('fecha', end)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Ingreso[]
    },
  })
}

export function useAbonos() {
  const supabase = createClient()
  return useQuery<AbonoMensual[]>({
    queryKey: ['abonos'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('clientes_abono_mensual')
        .select('*')
        .order('activo', { ascending: false })
        .order('dia_de_cobro', { ascending: true })
      if (error) throw error
      return (data ?? []) as AbonoMensual[]
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations: alta/edición/baja
// ---------------------------------------------------------------------------

export function useCreateGasto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Gasto, 'id' | 'created_at' | 'cargado_por' | 'recuperado_at'> & { cargado_por: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('gastos').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}

export function useCreateIngreso() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Ingreso, 'id' | 'created_at'>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('ingresos').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingresos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-pagos-pendientes'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}

export function useCreateAbono() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<AbonoMensual, 'id' | 'created_at' | 'created_by'> & { created_by: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('clientes_abono_mensual').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['abonos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-pagos-pendientes'] })
    },
  })
}

export function useUpdateGasto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; fecha?: string; monto?: number; moneda?: MonedaCaja; categoria?: string; descripcion?: string | null; recuperable?: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('gastos').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}

export function useUpdateIngreso() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; fecha?: string; monto?: number; moneda?: MonedaCaja; tipo?: string; cliente_id?: string | null; descripcion?: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('ingresos').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingresos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-pagos-pendientes'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}

export function useToggleAbono() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('clientes_abono_mensual').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['abonos'] })
      qc.invalidateQueries({ queryKey: ['caja-pagos-pendientes'] })
    },
  })
}

export function useDeleteGasto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('gastos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}

export function useDeleteIngreso() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('ingresos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingresos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-pagos-pendientes'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}
