import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ChatActionType } from './use-chat-actions'

const supabase = createClient()

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PendingAction {
  type: string
  label: string
  description: string
  resolved_args: Record<string, unknown>
}

export interface ToolCallTrace {
  name: string
  input: unknown
  output_summary: string
}

export interface AgentResponse {
  reply: string
  pending_action?: PendingAction | null
  tool_calls: ToolCallTrace[]
  iterations: number
  truncated?: boolean
}

export interface AgentRequest {
  messages: AgentMessage[]
  page_context?: string
  hint_expediente_id?: string
}

/**
 * Mapea una pending_action del agent al formato ChatAction que usa
 * useChatActionExecutor.
 */
export function pendingActionToChatAction(p: PendingAction) {
  const params = p.resolved_args as Record<string, string>
  return {
    type: p.type as ChatActionType,
    label: p.label,
    description: p.description,
    params: Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, v == null ? null : String(v)]),
    ),
  }
}

export function useBogabotAgent() {
  return useMutation<AgentResponse, Error, AgentRequest>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<AgentResponse>('bogabot-agent', {
        body: input,
      })
      if (error) throw new Error(error.message || 'Error invocando al asistente')
      if (!data) throw new Error('Respuesta vacía del asistente')
      return data
    },
  })
}
