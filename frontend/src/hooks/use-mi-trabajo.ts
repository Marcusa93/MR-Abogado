import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsuntoItem {
  id: string
  tipo: 'consulta' | 'expediente'
  cliente_label: string
  titulo: string
  materia: string
  prioridad: string
  estado: string
  next_action: string | null
  blocker: string | null
  folder_url: string | null
  last_activity_at: string
  href: string
  numero: string | null
  convertida_expediente_id: string | null
}

export type AsuntoField = 'next_action' | 'blocker' | 'folder_url' | 'prioridad'

const PRIO_ORDER: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

const TIPO_ASUNTO_LABEL: Record<string, string> = {
  laboral_trabajador: 'Laboral (trab.)',
  laboral_empleador: 'Laboral (emp.)',
  civil: 'Civil',
  familia: 'Familia',
  previsional: 'Previsional',
  penal: 'Penal',
  otro: 'Otro',
}

const ESTADOS_EXCLUIDOS_CONSULTA = ['convertida', 'descartada', 'resuelta']
const ESTADOS_EXCLUIDOS_EXPEDIENTE = ['FINALIZADO', 'NO_VIABLE_RECHAZADO']

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const miTrabajoKeys = {
  board: (profileId: string) => ['mi-trabajo', 'board', profileId] as const,
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useMiTrabajoBoard(profileId: string | undefined) {
  const supabase = createClient()

  return useQuery<AsuntoItem[]>({
    queryKey: profileId ? miTrabajoKeys.board(profileId) : ['mi-trabajo-disabled'],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!profileId) return []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any

      const [consultasRes, miembrosRes] = await Promise.all([
        sb
          .from('consultas')
          .select('id, nombre, apellido, tipo_asunto, estado, prioridad, next_action, blocker, folder_url, updated_at, estado_changed_at, convertida_expediente_id')
          .eq('assigned_to', profileId)
          .not('estado', 'in', `(${ESTADOS_EXCLUIDOS_CONSULTA.map(e => `"${e}"`).join(',')})`),

        sb
          .from('expediente_miembros')
          .select('id, expediente:expedientes(id, numero, caratula, fuero, estado_interno, prioridad, next_action, blocker, folder_url, updated_at, deleted_at, cliente:clientes(nombre, apellido))')
          .eq('profile_id', profileId)
          .eq('activo', true),
      ])

      if (consultasRes.error) throw consultasRes.error
      if (miembrosRes.error) throw miembrosRes.error

      // Consultas → AsuntoItem
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const consultas: AsuntoItem[] = (consultasRes.data ?? []).map((c: any) => ({
        id: c.id,
        tipo: 'consulta' as const,
        cliente_label: c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre,
        titulo: TIPO_ASUNTO_LABEL[c.tipo_asunto] ?? c.tipo_asunto,
        materia: c.tipo_asunto,
        prioridad: c.prioridad ?? 'MEDIA',
        estado: c.estado,
        next_action: c.next_action ?? null,
        blocker: c.blocker ?? null,
        folder_url: c.folder_url ?? null,
        last_activity_at: c.estado_changed_at ?? c.updated_at,
        href: `/consultas/${c.id}`,
        numero: null,
        convertida_expediente_id: c.convertida_expediente_id ?? null,
      }))

      // Expedientes (via miembros) → AsuntoItem
      const seen = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expedientes: AsuntoItem[] = (miembrosRes.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((m: any) => {
          const exp = m.expediente
          if (!exp || exp.deleted_at) return false
          if (ESTADOS_EXCLUIDOS_EXPEDIENTE.includes(exp.estado_interno)) return false
          if (seen.has(exp.id)) return false
          seen.add(exp.id)
          return true
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => {
          const exp = m.expediente
          const cli = exp.cliente
          const clienteLabel = cli
            ? (cli.apellido ? `${cli.apellido}, ${cli.nombre ?? ''}`.trim() : (cli.nombre ?? '—'))
            : '—'
          return {
            id: exp.id,
            tipo: 'expediente' as const,
            cliente_label: clienteLabel,
            titulo: exp.caratula ?? exp.numero ?? '—',
            materia: exp.fuero ?? '—',
            prioridad: exp.prioridad ?? 'MEDIA',
            estado: exp.estado_interno ?? '—',
            next_action: exp.next_action ?? null,
            blocker: exp.blocker ?? null,
            folder_url: exp.folder_url ?? null,
            last_activity_at: exp.updated_at,
            href: `/expedientes/${exp.id}`,
            numero: exp.numero ?? null,
            convertida_expediente_id: null,
          }
        })

      const all = [...consultas, ...expedientes]

      // Ordenar: prioridad desc, luego actividad más antigua primero
      all.sort((a, b) => {
        const pa = PRIO_ORDER[a.prioridad] ?? 2
        const pb = PRIO_ORDER[b.prioridad] ?? 2
        if (pa !== pb) return pa - pb
        return new Date(a.last_activity_at).getTime() - new Date(b.last_activity_at).getTime()
      })

      return all
    },
  })
}

// ---------------------------------------------------------------------------
// Mutation genérica para actualizar un campo de asunto
// ---------------------------------------------------------------------------

export function useUpdateAsuntoField() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tipo,
      id,
      field,
      value,
    }: {
      tipo: 'consulta' | 'expediente'
      id: string
      field: AsuntoField
      value: string | null
    }) => {
      const table = tipo === 'consulta' ? 'consultas' : 'expedientes'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(table)
        .update({ [field]: value ?? null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mi-trabajo'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  })
}
