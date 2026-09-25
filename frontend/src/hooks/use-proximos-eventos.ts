import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type TipoEvento = 'audiencia' | 'reunion'

export interface ProximoEvento {
  id: string
  tipo: TipoEvento
  fecha: string       // YYYY-MM-DD
  hora: string | null // HH:MM
  titulo: string
  subtitulo: string | null
  expediente_id: string | null
  expediente_numero: string | null
  estado: string
}

function isoHoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoShift(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00Z')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function useProximosEventos(days = 30) {
  const supabase = createClient()
  const hoy = isoHoy()
  const hasta = isoShift(hoy, days)

  return useQuery<ProximoEvento[]>({
    queryKey: ['proximos-eventos', hoy, days],
    queryFn: async () => {
      const [audRes, reuRes] = await Promise.all([
        supabase
          .from('audiencias' as never)
          .select(`
            id, fecha, hora, estado,
            expedientes!inner(id, caratula, numero),
            catalogo_tipos_audiencia(nombre),
            organismos(nombre)
          `)
          .gte('fecha', hoy)
          .lte('fecha', hasta)
          .in('estado', ['PENDIENTE', 'CONFIRMADA'])
          .order('fecha')
          .order('hora')
          .limit(120),
        (supabase as any)
          .from('consultas')
          .select('id, nombre, apellido, tipo_asunto, fecha_turno')
          .not('fecha_turno', 'is', null)
          .gte('fecha_turno', hoy + 'T00:00:00')
          .lte('fecha_turno', hasta + 'T23:59:59')
          .not('estado', 'in', '(CERRADA,CANCELADA)')
          .order('fecha_turno')
          .limit(120),
      ])

      const eventos: ProximoEvento[] = []

      for (const a of (audRes.data ?? []) as any[]) {
        const exp = a.expedientes
        const tipo = a.catalogo_tipos_audiencia?.nombre ?? null
        const organismo = a.organismos?.nombre ?? null
        eventos.push({
          id: a.id,
          tipo: 'audiencia',
          fecha: a.fecha,
          hora: a.hora ? String(a.hora).slice(0, 5) : null,
          titulo: exp?.caratula ?? exp?.numero ?? 'Sin carátula',
          subtitulo: [tipo, organismo].filter(Boolean).join(' · ') || null,
          expediente_id: exp?.id ?? null,
          expediente_numero: exp?.numero ?? null,
          estado: a.estado,
        })
      }

      for (const r of (reuRes.data ?? []) as any[]) {
        const dt = new Date(r.fecha_turno)
        const fecha = dt.toISOString().slice(0, 10)
        const hora = dt.toLocaleTimeString('es-AR', {
          hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'America/Argentina/Tucuman',
        })
        eventos.push({
          id: r.id,
          tipo: 'reunion',
          fecha,
          hora,
          titulo: [r.apellido, r.nombre].filter(Boolean).join(', ') || 'Consulta',
          subtitulo: r.tipo_asunto ?? null,
          expediente_id: null,
          expediente_numero: null,
          estado: 'pendiente',
        })
      }

      eventos.sort((a, b) => {
        const da = a.fecha + (a.hora ?? '99:99')
        const db = b.fecha + (b.hora ?? '99:99')
        return da.localeCompare(db)
      })

      return eventos
    },
    staleTime: 2 * 60_000,
  })
}
