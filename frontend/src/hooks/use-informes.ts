import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  isEstadoTerminal,
} from '@/types/enums'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EstadoCount {
  estado_interno: string
  count: number
}

export interface MesCount {
  mes: string       // YYYY-MM
  mesLabel: string   // "Ene 2026"
  count: number
}

export interface TipoCount {
  id: string
  nombre: string
  count: number
}

export interface ResumenFinanciero {
  totalExpedientes: number
  enTramite: number
  resueltos: number
  rechazados: number
  tasaExito: number
  montoReclamado: number
  montoOtorgado: number
  totalCobros: number
  cantCobros: number
}

// ---------------------------------------------------------------------------
// Month label formatter
// ---------------------------------------------------------------------------

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMes(dateStr: string): string {
  const d = new Date(dateStr)
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useExpedientesPorEstado() {
  const supabase = createClient()

  return useQuery<EstadoCount[]>({
    queryKey: ['informes', 'por-estado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedientes')
        .select('estado_interno')
        .is('deleted_at', null)

      if (error) throw error

      // Group and count client-side (Supabase doesn't support GROUP BY directly)
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.estado_interno] = (counts[row.estado_interno] ?? 0) + 1
      }

      return Object.entries(counts)
        .map(([estado_interno, count]) => ({ estado_interno, count }))
        .sort((a, b) => b.count - a.count)
    },
    staleTime: 60_000,
  })
}

export function useExpedientesPorMes() {
  const supabase = createClient()

  return useQuery<MesCount[]>({
    queryKey: ['informes', 'por-mes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedientes')
        .select('fecha_alta')
        .not('fecha_alta', 'is', null)
        .order('fecha_alta', { ascending: true })

      if (error) throw error

      // Group by month
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        if (!row.fecha_alta) continue
        const month = row.fecha_alta.slice(0, 7) // YYYY-MM
        counts[month] = (counts[month] ?? 0) + 1
      }

      // Take last 12 months
      return Object.entries(counts)
        .map(([mes, count]) => ({ mes, mesLabel: formatMes(mes + '-01'), count }))
        .slice(-12)
    },
    staleTime: 60_000,
  })
}

export function useExpedientesPorTipo() {
  const supabase = createClient()

  return useQuery<TipoCount[]>({
    queryKey: ['informes', 'por-tipo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedientes')
        .select('tipo_tramite_id, tipos_tramite (id, nombre)')
        .is('deleted_at', null)

      if (error) throw error

      const counts: Record<string, { id: string; nombre: string; count: number }> = {}
      for (const row of data ?? []) {
        const tt = row.tipos_tramite as any
        const id = tt?.id ?? row.tipo_tramite_id ?? ''
        const nombre = tt?.nombre ?? 'Sin tipo'
        const key = id || nombre
        if (!counts[key]) counts[key] = { id, nombre, count: 0 }
        counts[key].count++
      }

      return Object.values(counts)
        .sort((a, b) => b.count - a.count)
    },
    staleTime: 60_000,
  })
}

export function useResumenFinanciero() {
  const supabase = createClient()

  return useQuery<ResumenFinanciero>({
    queryKey: ['informes', 'financiero'],
    queryFn: async () => {
      // Fetch all expedientes (non-archived)
      const { data: exps, error: expErr } = await supabase
        .from('expedientes')
        .select('estado_interno')
        .is('deleted_at', null)

      if (expErr) throw expErr

      const totalExpedientes = exps?.length ?? 0
      const enTramite = exps?.filter(e =>
        !isEstadoTerminal(e.estado_interno)
      ).length ?? 0
      const resueltos = exps?.filter(e => e.estado_interno === 'FINALIZADO').length ?? 0
      const rechazados = exps?.filter(e => e.estado_interno === 'NO_VIABLE_RECHAZADO').length ?? 0
      const finalizados = resueltos + rechazados
      const tasaExito = finalizados > 0 ? Math.round((resueltos / finalizados) * 100) : 0

      return {
        totalExpedientes,
        enTramite,
        resueltos,
        rechazados,
        tasaExito,
        montoReclamado: 0,
        montoOtorgado: 0,
        totalCobros: 0,
        cantCobros: 0,
      }
    },
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Turnos Stats
// ---------------------------------------------------------------------------

export interface TurnosStats {
  total: number
  realizados: number
  pendientes: number
  cancelados: number
  reprogramados: number
}

// ---------------------------------------------------------------------------
// Consultas vs Tomados por mes
// ---------------------------------------------------------------------------

export interface ConsultasVsTomados {
  mes: string
  mesLabel: string
  consultas: number
  tomados: number
}

export function useConsultasVsTomados() {
  const supabase = createClient()

  return useQuery<ConsultasVsTomados[]>({
    queryKey: ['informes', 'consultas-vs-tomados'],
    queryFn: async () => {
      const CONSULTAS = ['NUEVA_CONSULTA', 'EN_ANALISIS', 'A_LA_ESPERA_DE_DOCUMENTACION', 'PAUSADO_POR_CLIENTE']
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

      const { data, error } = await supabase
        .from('expedientes')
        .select('estado_interno, created_at')
        .is('deleted_at', null)

      if (error) throw error

      const byMonth = new Map<string, { consultas: number; tomados: number }>()
      for (const exp of data ?? []) {
        const d = new Date(exp.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!byMonth.has(key)) byMonth.set(key, { consultas: 0, tomados: 0 })
        const entry = byMonth.get(key)!
        if (CONSULTAS.includes(exp.estado_interno)) {
          entry.consultas++
        } else {
          entry.tomados++
        }
      }

      return Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([key, val]) => {
          const [y, m] = key.split('-')
          return { mes: key, mesLabel: `${meses[parseInt(m, 10) - 1]} ${y}`, consultas: val.consultas, tomados: val.tomados }
        })
    },
    staleTime: 60_000,
  })
}

export function useTurnosStats() {
  const supabase = createClient()

  return useQuery<TurnosStats>({
    queryKey: ['informes', 'turnos-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audiencias')
        .select('estado')

      if (error) throw error

      const turnos = data ?? []
      const total = turnos.length
      const realizados = turnos.filter((t) => t.estado === 'REALIZADA' || t.estado === 'REALIZADO').length
      const pendientes = turnos.filter((t) => ['PENDIENTE', 'CONFIRMADA'].includes(t.estado)).length
      const cancelados = turnos.filter((t) => ['CANCELADA', 'CANCELADO'].includes(t.estado)).length
      const reprogramados = turnos.filter((t) => t.estado === 'REPROGRAMADO').length

      return { total, realizados, pendientes, cancelados, reprogramados }
    },
    staleTime: 60_000,
  })
}
