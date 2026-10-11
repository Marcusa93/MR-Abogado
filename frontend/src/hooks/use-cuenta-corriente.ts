import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import type { MonedaCaja } from '@/hooks/use-caja'

// Cuenta corriente por cliente / expediente (migración 20261011145711).
// Debe: honorarios pactados (honorarios_cargos), abonos devengados, gastos
// recuperables. Haber: pagos (ingresos) y gastos recuperados.

export interface MovimientoCC {
  clase: 'cargo' | 'pago'
  tipo: string
  ref_tabla: 'honorarios_cargos' | 'clientes_abono_mensual' | 'gastos' | 'ingresos'
  ref_id: string
  cliente_id: string | null
  expediente_id: string | null
  expediente_caratula: string | null
  expediente_numero: string | null
  fecha: string
  vencimiento: string | null
  concepto: string
  debe: number
  haber: number
  moneda: MonedaCaja
}

export interface SaldoCliente {
  cliente_id: string
  nombre: string | null
  apellido: string | null
  saldo_ars: number
  saldo_usd: number
  vencido_ars: number
  vencido_usd: number
  ultimo_pago: string | null
  proximo_vencimiento: string | null
}

export const cuentaCorrienteKeys = {
  all: ['cuenta-corriente'] as const,
  movimientos: (f: { clienteId?: string; expedienteId?: string }) => ['cuenta-corriente', 'movimientos', f] as const,
  saldos: () => ['cuenta-corriente', 'saldos'] as const,
}

export function useCuentaCorriente(filtro: { clienteId?: string; expedienteId?: string }) {
  const supabase = createClient()
  return useQuery({
    queryKey: cuentaCorrienteKeys.movimientos(filtro),
    enabled: !!(filtro.clienteId || filtro.expedienteId),
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from('cuenta_corriente_movimientos').select('*')
      if (filtro.expedienteId) q = q.eq('expediente_id', filtro.expedienteId)
      else q = q.eq('cliente_id', filtro.clienteId)
      const { data, error } = await q.order('fecha', { ascending: true }).order('clase', { ascending: true })
      if (error) throw error
      return ((data ?? []) as MovimientoCC[]).map((m) => ({ ...m, debe: Number(m.debe), haber: Number(m.haber) }))
    },
  })
}

export function useCuentasSaldos() {
  const supabase = createClient()
  return useQuery({
    queryKey: cuentaCorrienteKeys.saldos(),
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('cuentas_corrientes_saldos')
      if (error) throw error
      return ((data ?? []) as SaldoCliente[]).map((s) => ({
        ...s,
        saldo_ars: Number(s.saldo_ars), saldo_usd: Number(s.saldo_usd),
        vencido_ars: Number(s.vencido_ars), vencido_usd: Number(s.vencido_usd),
      }))
    },
  })
}

export interface NuevoCargo {
  cliente_id: string
  expediente_id: string | null
  tipo: 'honorario' | 'cuota' | 'anticipo' | 'regulacion' | 'otro'
  concepto: string
  /** Monto total; si hay cuotas, se divide en partes iguales */
  monto: number
  moneda: MonedaCaja
  fecha: string
  /** Vencimiento (de la primera cuota si hay varias) */
  vencimiento: string | null
  cuotas: number
  notas: string | null
}

function sumarMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate()
  fecha.setUTCDate(Math.min(d, ultimo))
  return fecha.toISOString().slice(0, 10)
}

/** Carga un cargo o un plan de N cuotas mensuales (redondeo en la última). */
export function useCrearCargo() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NuevoCargo) => {
      const n = Math.max(1, Math.min(60, Math.round(c.cuotas)))
      const planId = n > 1 ? crypto.randomUUID() : null
      const base = Math.floor((c.monto / n) * 100) / 100
      const filas = Array.from({ length: n }, (_, i) => {
        const monto = i === n - 1 ? Math.round((c.monto - base * (n - 1)) * 100) / 100 : base
        const vence = c.vencimiento ? sumarMeses(c.vencimiento, i) : null
        return {
          cliente_id: c.cliente_id,
          expediente_id: c.expediente_id,
          tipo: n > 1 ? 'cuota' : c.tipo,
          concepto: n > 1 ? `${c.concepto} — cuota ${i + 1}/${n}` : c.concepto,
          monto,
          moneda: c.moneda,
          fecha: n > 1 && vence ? (i === 0 ? c.fecha : vence) : c.fecha,
          vencimiento: vence,
          plan_id: planId,
          cuota_numero: n > 1 ? i + 1 : null,
          cuotas_total: n > 1 ? n : null,
          notas: c.notas,
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('honorarios_cargos').insert(filas)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cuentaCorrienteKeys.all }),
  })
}

export function useEliminarCargo() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('honorarios_cargos')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cuentaCorrienteKeys.all }),
  })
}

/** Registra un pago (ingreso) imputado al cliente y, si corresponde, al expediente. */
export function useRegistrarPago() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (p: {
      cliente_id: string; expediente_id: string | null; fecha: string; monto: number
      moneda: MonedaCaja; tipo: string; descripcion: string | null
    }) => {
      if (!user?.id) throw new Error('Sesión no disponible')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('ingresos').insert({
        fecha: p.fecha, monto: p.monto, moneda: p.moneda, tipo: p.tipo, categoria: null,
        cliente_id: p.cliente_id, expediente_id: p.expediente_id,
        abono_id: null, periodo_year: null, periodo_month: null,
        descripcion: p.descripcion, comprobante_path: null, cargado_por: user.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cuentaCorrienteKeys.all })
      qc.invalidateQueries({ queryKey: ['ingresos'] })
      qc.invalidateQueries({ queryKey: ['caja-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-por-expediente'] })
    },
  })
}
