import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Plazos IA por vencer (próximos 7 días) ──────────────────────────────────

export interface PlazoProximo {
  movement_id: string
  expediente_id: string
  expediente_numero: string | null
  expediente_caratula: string | null
  numero_sae: string | null
  movimiento_titulo: string
  movimiento_fecha: string
  plazo: {
    dias: number
    habiles: boolean
    vence_aprox: string
    descripcion: string
  }
  diasRestantes: number
  prioridad: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAJA'
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00')
  const b = new Date(toIso + 'T00:00:00')
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

function priorityFromDays(days: number): PlazoProximo['prioridad'] {
  if (days <= 1) return 'URGENTE'
  if (days <= 3) return 'ALTA'
  if (days <= 7) return 'MEDIA'
  return 'BAJA'
}

export function usePlazosProximos() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sae-plazos-proximos'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

      // Filtramos en memoria porque vence_aprox vive dentro del jsonb ai_extracted.plazos[]
      const { data, error } = await supabase
        .from('sae_movements')
        .select(`
          id,
          expediente_id,
          titulo,
          fecha,
          ai_extracted,
          expedientes!inner(numero, caratula, numero_sae, deleted_at)
        `)
        .not('ai_extracted', 'is', null)
        .order('fecha', { ascending: false })
        .limit(200)
      if (error) throw error

      const plazos: PlazoProximo[] = []
      const rows = (data ?? []) as unknown as Array<{
        id: string
        expediente_id: string
        titulo: string
        fecha: string
        ai_extracted: { plazos?: Array<{ dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }> } | null
        expedientes: { numero: string | null; caratula: string | null; numero_sae: string | null; deleted_at: string | null } | { numero: string | null; caratula: string | null; numero_sae: string | null; deleted_at: string | null }[]
      }>
      for (const m of rows) {
        const exp = Array.isArray(m.expedientes) ? m.expedientes[0] : m.expedientes
        if (!exp || exp.deleted_at) continue
        const ps = m.ai_extracted?.plazos ?? []
        for (const p of ps) {
          if (!p.vence_aprox) continue
          if (p.vence_aprox < today || p.vence_aprox > in7days) continue
          const restantes = daysBetween(p.vence_aprox, today)
          plazos.push({
            movement_id: m.id,
            expediente_id: m.expediente_id,
            expediente_numero: exp.numero,
            expediente_caratula: exp.caratula,
            numero_sae: exp.numero_sae,
            movimiento_titulo: m.titulo,
            movimiento_fecha: m.fecha,
            plazo: {
              dias: p.dias,
              habiles: p.habiles,
              vence_aprox: p.vence_aprox,
              descripcion: p.descripcion,
            },
            diasRestantes: restantes,
            prioridad: priorityFromDays(restantes),
          })
        }
      }

      // Ordenar por fecha de vencimiento ascendente (más urgente arriba)
      plazos.sort((a, b) => a.plazo.vence_aprox.localeCompare(b.plazo.vence_aprox))
      return plazos
    },
    staleTime: 60_000,
  })
}

// ─── Actuaciones SAE de últimas 48h ──────────────────────────────────────────

export interface ActuacionReciente {
  id: string
  expediente_id: string
  expediente_numero: string | null
  expediente_caratula: string | null
  titulo: string
  tipo_movimiento: string
  fecha: string
  created_at: string
  ai_summary: string | null
  ai_suggested_action: { tipo: string; titulo: string; prioridad: string } | null
  numero_sae: string | null
}

export function useActuacionesRecientes() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sae-actuaciones-recientes'],
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 86400000).toISOString()

      const { data, error } = await supabase
        .from('sae_movements')
        .select(`
          id, expediente_id, titulo, tipo_movimiento, fecha, created_at,
          ai_summary, ai_suggested_action,
          expedientes!inner(numero, caratula, numero_sae, deleted_at)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(15)
      if (error) throw error

      const result: ActuacionReciente[] = []
      const rows = (data ?? []) as unknown as Array<{
        id: string
        expediente_id: string
        titulo: string
        tipo_movimiento: string
        fecha: string
        created_at: string
        ai_summary: string | null
        ai_suggested_action: { tipo: string; titulo: string; prioridad: string } | null
        expedientes: { numero: string | null; caratula: string | null; numero_sae: string | null; deleted_at: string | null } | { numero: string | null; caratula: string | null; numero_sae: string | null; deleted_at: string | null }[]
      }>
      for (const m of rows) {
        const exp = Array.isArray(m.expedientes) ? m.expedientes[0] : m.expedientes
        if (!exp || exp.deleted_at) continue
        result.push({
          id: m.id,
          expediente_id: m.expediente_id,
          expediente_numero: exp.numero,
          expediente_caratula: exp.caratula,
          titulo: m.titulo,
          tipo_movimiento: m.tipo_movimiento,
          fecha: m.fecha,
          created_at: m.created_at,
          ai_summary: m.ai_summary,
          ai_suggested_action: m.ai_suggested_action,
          numero_sae: exp.numero_sae,
        })
      }
      return result
    },
    staleTime: 60_000,
  })
}
