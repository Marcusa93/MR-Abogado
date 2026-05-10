// ---------------------------------------------------------------------------
// Chat Actions — executable CRM actions from the Alba Asistente chat
// ---------------------------------------------------------------------------

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TablesInsert } from '@/types/database.types'

export type ChatActionType =
  | 'completar_tarea'
  | 'marcar_alerta_leida'
  | 'cambiar_estado_expediente'
  | 'crear_seguimiento'

export interface ChatAction {
  type: ChatActionType
  label: string
  description: string
  params: Record<string, string>
}

// ---------------------------------------------------------------------------
// UUID detection + ref resolvers
// The LLM sometimes sends the literal string "UUID" instead of a real id.
// We always resolve refs (names / numbers / titles) to a real UUID before
// touching the database.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v.trim())
}

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

async function resolveExpedienteId(
  supabase: SupabaseClient,
  ref: string | undefined | null,
): Promise<string> {
  const raw = (ref ?? '').trim()
  if (!raw) {
    throw new Error('Falta indicar de qué expediente se trata. Decime apellido y nombre del cliente o número de expediente.')
  }
  if (isUuid(raw)) return raw

  const like = `%${raw.replace(/[%_\\]/g, '')}%`

  // 1) match exacto por numero
  const byNumero = await supabase
    .from('expedientes')
    .select('id, numero, caratula, clientes!expedientes_cliente_id_fkey(nombre, apellido)')
    .ilike('numero', like)
    .limit(5)
  if (byNumero.data && byNumero.data.length === 1) return byNumero.data[0].id as string
  if (byNumero.data && byNumero.data.length > 1) {
    throw new Error(`Hay ${byNumero.data.length} expedientes que coinciden con "${raw}". Necesito más precisión.`)
  }

  // 2) match por caratula
  const byCaratula = await supabase
    .from('expedientes')
    .select('id, numero, caratula, clientes!expedientes_cliente_id_fkey(nombre, apellido)')
    .ilike('caratula', like)
    .limit(5)
  if (byCaratula.data && byCaratula.data.length === 1) return byCaratula.data[0].id as string
  if (byCaratula.data && byCaratula.data.length > 1) {
    throw new Error(`Hay ${byCaratula.data.length} expedientes cuya carátula coincide con "${raw}". Necesito más precisión.`)
  }

  // 3) match por apellido + nombre del cliente (tokens)
  const tokens = normalize(raw).split(/\s+/).filter((t) => t.length >= 3)
  if (tokens.length > 0) {
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, nombre, apellido')
      .limit(200)
    const matches = (clientes ?? []).filter((c: any) => {
      const full = normalize(`${c.apellido ?? ''} ${c.nombre ?? ''}`)
      return tokens.every((t) => full.includes(t))
    })
    if (matches.length >= 1) {
      const clienteIds = matches.map((c: any) => c.id)
      const { data: exps } = await supabase
        .from('expedientes')
        .select('id, cliente_id')
        .in('cliente_id', clienteIds)
        .is('deleted_at', null)
        .limit(5)
      if (exps && exps.length === 1) return exps[0].id as string
      if (exps && exps.length > 1) {
        throw new Error(`El cliente "${raw}" tiene ${exps.length} expedientes activos. Indicame cuál (por número de expediente).`)
      }
    }
  }

  throw new Error(`No encontré ningún expediente que coincida con "${raw}". Verificá el nombre del cliente o el número.`)
}

async function resolveTareaId(
  supabase: SupabaseClient,
  ref: string | undefined | null,
): Promise<string> {
  const raw = (ref ?? '').trim()
  if (!raw) throw new Error('Falta indicar el título de la tarea.')
  if (isUuid(raw)) return raw

  const like = `%${raw.replace(/[%_\\]/g, '')}%`
  const { data } = await supabase
    .from('tareas')
    .select('id, titulo')
    .ilike('titulo', like)
    .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
    .limit(5)

  if (!data || data.length === 0) {
    throw new Error(`No encontré ninguna tarea pendiente que coincida con "${raw}".`)
  }
  if (data.length > 1) {
    throw new Error(`Hay ${data.length} tareas pendientes que coinciden con "${raw}". Necesito más precisión.`)
  }
  return data[0].id as string
}

async function resolveAlertaId(
  supabase: SupabaseClient,
  ref: string | undefined | null,
): Promise<string> {
  const raw = (ref ?? '').trim()
  if (!raw) throw new Error('Falta indicar el título de la alerta.')
  if (isUuid(raw)) return raw

  const like = `%${raw.replace(/[%_\\]/g, '')}%`
  const { data } = await supabase
    .from('alertas')
    .select('id, titulo')
    .ilike('titulo', like)
    .is('resuelta_at', null)
    .limit(5)

  if (!data || data.length === 0) {
    throw new Error(`No encontré ninguna alerta activa que coincida con "${raw}".`)
  }
  if (data.length > 1) {
    throw new Error(`Hay ${data.length} alertas activas que coinciden con "${raw}". Necesito más precisión.`)
  }
  return data[0].id as string
}

// ---------------------------------------------------------------------------
// Action executor hook
// ---------------------------------------------------------------------------

export function useChatActionExecutor() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (action: ChatAction) => {
      const now = new Date().toISOString()

      switch (action.type) {
        case 'completar_tarea': {
          const tareaId = await resolveTareaId(
            supabase,
            action.params.tarea_id || action.params.tarea_ref || action.params.titulo,
          )
          const { error } = await supabase
            .from('tareas')
            .update({
              estado: 'COMPLETADA',
              fecha_completada: now,
              updated_at: now,
            })
            .eq('id', tareaId)
          if (error) throw error
          return { message: `Tarea completada correctamente.` }
        }

        case 'marcar_alerta_leida': {
          const alertaId = await resolveAlertaId(
            supabase,
            action.params.alerta_id || action.params.alerta_ref || action.params.titulo,
          )
          const { error } = await supabase
            .from('alertas')
            .update({ estado: 'resuelta', resuelta_at: now })
            .eq('id', alertaId)
          if (error) throw error
          return { message: `Alerta marcada como leída.` }
        }

        case 'cambiar_estado_expediente': {
          const expedienteId = await resolveExpedienteId(
            supabase,
            action.params.expediente_id || action.params.expediente_ref,
          )
          const nuevoEstado = (action.params.nuevo_estado || '').trim()
          if (!nuevoEstado) {
            throw new Error('Falta indicar el nuevo estado del expediente.')
          }
          const { error } = await supabase
            .from('expedientes')
            .update({
              estado_interno: nuevoEstado,
              updated_at: now,
            })
            .eq('id', expedienteId)
          if (error) throw error
          return { message: `Estado del expediente actualizado a "${action.params.nuevo_estado_label || nuevoEstado}".` }
        }

        case 'crear_seguimiento': {
          const expedienteId = await resolveExpedienteId(
            supabase,
            action.params.expediente_id || action.params.expediente_ref,
          )
          const { data: { user } } = await supabase.auth.getUser()
          const canal = (action.params.canal as TablesInsert<'seguimientos'>['canal']) || 'WEB'
          const { error } = await supabase
            .from('seguimientos')
            .insert({
              expediente_id: expedienteId,
              fecha_control: now.split('T')[0],
              canal,
              estado_organismo_reportado: action.params.estado_anses || 'Sin cambios',
              observacion: action.params.observacion || 'Seguimiento creado desde Alba Asistente',
              created_by: user?.id ?? '',
            })
          if (error) throw error
          return { message: `Seguimiento registrado correctamente.` }
        }

        default:
          throw new Error(`Acción no soportada: ${action.type}`)
      }
    },
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['tareas'] })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
      queryClient.invalidateQueries({ queryKey: ['expedientes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['seguimientos'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Action detection — extracts actionable items from CRM context
// ---------------------------------------------------------------------------

export interface DetectedActions {
  tareasVencidas: { id: string; titulo: string; cliente: string }[]
  alertasActivas: { id: string; titulo: string }[]
}

export async function detectAvailableActions(): Promise<DetectedActions> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [tareasRes, alertasRes] = await Promise.all([
    supabase
      .from('tareas')
      .select('id, titulo, expediente:expedientes!tareas_expediente_id_fkey (clientes!expedientes_cliente_id_fkey (apellido, nombre))')
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      .lt('fecha_vencimiento', today)
      .limit(5),
    supabase
      .from('alertas')
      .select('id, titulo')
      .is('resuelta_at', null)
      .limit(5),
  ])

  return {
    tareasVencidas: (tareasRes.data ?? []).map((t: any) => ({
      id: t.id,
      titulo: t.titulo,
      cliente: `${t.expediente?.clientes?.apellido ?? ''} ${t.expediente?.clientes?.nombre ?? ''}`.trim(),
    })),
    alertasActivas: (alertasRes.data ?? []).map((a: any) => ({
      id: a.id,
      titulo: a.titulo,
    })),
  }
}
