import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNicoChatStore } from '@/stores/nico-chat-store'
import { type ChatMessage } from '@/lib/openrouter'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics'
import { useChatActionExecutor, type ChatAction } from '@/hooks/use-chat-actions'
import { useBogabotAgent, pendingActionToChatAction } from '@/hooks/use-bogabot-agent'
import { displayRol } from '@/lib/utils/display-rol'
import { cn } from '@/lib/utils'
import {
  X,
  Send,
  Loader2,
  Bot,
  Trash2,
  BrainCircuit,
  Mic,
  MicOff,
  CheckCircle2,
  Zap,
  History,
  MessageSquarePlus,
  ExternalLink,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Web Speech API — voice input hook
// ---------------------------------------------------------------------------

const SpeechRecognition =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  null

function useVoiceInput(onResult: (transcript: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const supported = SpeechRecognition !== null

  const toggle = useCallback(() => {
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-AR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript) onResult(transcript)
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening, onResult])

  // Cleanup on unmount
  useEffect(() => {
    return () => recognitionRef.current?.abort()
  }, [])

  return { listening, supported, toggle }
}


// ---------------------------------------------------------------------------
// Page context description (non-data)
// ---------------------------------------------------------------------------

function buildPageDescription(pathname: string): string {
  if (pathname === '/panel' || pathname === '/dashboard') {
    return 'El usuario está viendo el panel general / dashboard del estudio.'
  } else if (pathname.startsWith('/expedientes/') && pathname !== '/expedientes/nuevo') {
    return 'El usuario está viendo el detalle de un expediente específico. Los datos del expediente se incluyen abajo.'
  } else if (pathname === '/expedientes') {
    return 'El usuario está en la lista de expedientes.'
  } else if (pathname === '/tareas') {
    return 'El usuario está viendo la lista de tareas.'
  } else if (pathname === '/clientes') {
    return 'El usuario está en la lista de clientes.'
  } else if (pathname.startsWith('/clientes/') && pathname !== '/clientes/nuevo') {
    return 'El usuario está viendo el detalle de un cliente. Los datos del cliente se incluyen abajo.'
  } else if (pathname === '/agenda') {
    return 'El usuario está en la agenda de audiencias.'
  } else if (pathname === '/kanban') {
    return 'El usuario está viendo el tablero Kanban de expedientes.'
  } else if (pathname === '/alertas') {
    return 'El usuario está revisando las alertas del sistema.'
  } else if (pathname === '/configuracion') {
    return 'El usuario está en la configuración del sistema.'
  }
  return `El usuario está en: ${pathname}`
}

// ---------------------------------------------------------------------------
// Dynamic suggested questions based on page
// ---------------------------------------------------------------------------

const SUGGESTIONS_BY_PAGE: Record<string, string[]> = {
  '/dashboard': [
    '¿Cuántos expedientes tenemos activos?',
    '¿Qué tareas están vencidas?',
    '¿Cuáles son las próximas audiencias?',
    '¿Hay expedientes sin responsable?',
  ],
  '/expedientes': [
    '¿Cuántos expedientes hay por estado?',
    '¿Qué expedientes tienen prioridad urgente?',
    '¿Qué expedientes están en etapa de sentencia o apelación?',
    '¿Qué tipos de trámite manejamos más?',
  ],
  '/clientes': [
    '¿Cuántos clientes activos tenemos?',
    '¿Qué clientes tienen expedientes resueltos?',
    '¿Hay clientes con múltiples expedientes?',
    '¿Cuál es el estado general del estudio?',
  ],
  '/tareas': [
    '¿Qué tareas están vencidas?',
    '¿Qué tareas vencen hoy?',
    '¿Quién tiene más tareas pendientes?',
    '¿Hay tareas sin asignar?',
  ],
  '/alertas': [
    '¿Cuántas alertas activas hay?',
    '¿Qué alertas son urgentes?',
    '¿Hay alertas de audiencias próximas?',
    '¿Qué expedientes tienen alertas pendientes?',
  ],
  '/kanban': [
    '¿Cómo se distribuyen los expedientes por estado?',
    '¿Hay cuellos de botella en algún estado?',
    '¿Qué expedientes llevan más tiempo sin avanzar?',
    '¿Cuántos expedientes hay en cada etapa?',
  ],
  '/agenda': [
    '¿Cuáles son las próximas audiencias?',
    '¿Hay audiencias para hoy?',
    '¿Qué audiencias hay esta semana?',
    '¿Hay audiencias sin organismo asignado?',
  ],
}

const DEFAULT_SUGGESTIONS = [
  '¿Cuántos expedientes tenemos activos?',
  '¿Qué tareas están vencidas?',
  '¿Qué expedientes están en etapa de prueba o alegatos?',
  '¿Cuáles son las próximas audiencias?',
]

// Role-specific suggestions for non-admin users
const ROLE_SUGGESTIONS_BY_PAGE: Record<string, string[]> = {
  '/dashboard': [
    '¿Cuántos expedientes tengo asignados?',
    '¿Qué tareas tengo vencidas?',
    '¿Cuáles son mis próximas audiencias?',
    '¿Hay expedientes míos sin avanzar?',
  ],
  '/expedientes': [
    '¿Cuántos expedientes tengo por estado?',
    '¿Qué expedientes míos tienen prioridad urgente?',
    '¿Cuáles de mis expedientes están en sentencia o apelación?',
    '¿Qué tipos de trámite manejo más?',
  ],
  '/tareas': [
    '¿Qué tareas tengo vencidas?',
    '¿Qué tareas mías vencen hoy?',
    '¿Cuántas tareas tengo pendientes?',
    '¿Hay tareas mías sin fecha de vencimiento?',
  ],
  '/agenda': [
    '¿Cuáles son mis próximas audiencias?',
    '¿Tengo audiencias para hoy?',
    '¿Qué audiencias tengo esta semana?',
    '¿Hay audiencias mías sin organismo asignado?',
  ],
  '/alertas': [
    '¿Tengo alertas activas?',
    '¿Hay alertas urgentes en mis expedientes?',
    '¿Qué expedientes míos tienen alertas pendientes?',
    '¿Hay alertas de audiencias próximas?',
  ],
  '/kanban': [
    '¿Cómo están distribuidos mis expedientes?',
    '¿Tengo expedientes estancados?',
    '¿Cuántos expedientes míos hay en cada etapa?',
    '¿Hay algo urgente en mis casos?',
  ],
}

const DEFAULT_ROLE_SUGGESTIONS = [
  '¿Cuántos expedientes tengo asignados?',
  '¿Qué tareas tengo vencidas?',
  '¿Cuáles son mis próximas audiencias?',
  '¿Hay algo urgente en mis casos?',
]

interface MetricsForSuggestions {
  tareas_vencidas: number
  alertas_activas: number
  turnos_semana: number
  total_expedientes: number
}

function getDynamicSuggestions(
  pathname: string,
  rol?: string,
  metrics?: MetricsForSuggestions | null,
): string[] {
  const isPersonal = rol && rol !== 'ADMIN'
  const prefix = isPersonal ? 'mis ' : ''
  const verbo = isPersonal ? 'tengo' : 'tenemos'

  // Detail pages — always static, context-specific
  if (pathname.startsWith('/expedientes/')) {
    return [
      '¿Cuál es el estado de este expediente?',
      '¿Qué tareas tiene pendientes?',
      '¿Tiene audiencias registradas?',
      '¿Cuáles son los últimos seguimientos?',
    ]
  }
  if (pathname.startsWith('/clientes/')) {
    return [
      '¿Cuántos expedientes tiene este cliente?',
      '¿Hay tareas pendientes para este cliente?',
      '¿Cuál es el estado de sus trámites?',
      '¿Tiene audiencias próximas?',
    ]
  }

  // If we have live metrics, build smart suggestions
  if (metrics) {
    const smart: string[] = []

    if (metrics.tareas_vencidas > 0) {
      smart.push(`${isPersonal ? 'Tengo' : 'Hay'} ${metrics.tareas_vencidas} tarea${metrics.tareas_vencidas > 1 ? 's' : ''} vencida${metrics.tareas_vencidas > 1 ? 's' : ''}, ¿cuáles son?`)
    }
    if (metrics.alertas_activas > 0) {
      smart.push(`${isPersonal ? 'Tengo' : 'Hay'} ${metrics.alertas_activas} alerta${metrics.alertas_activas > 1 ? 's' : ''} activa${metrics.alertas_activas > 1 ? 's' : ''}, ¿qué pasa?`)
    }
    if (metrics.turnos_semana > 0) {
      smart.push(`¿Cuáles son ${prefix}${metrics.turnos_semana} audiencia${metrics.turnos_semana > 1 ? 's' : ''} de esta semana?`)
    }

    // Fill with static fallbacks up to 4 suggestions
    const staticPool = isPersonal
      ? (ROLE_SUGGESTIONS_BY_PAGE[pathname] ?? DEFAULT_ROLE_SUGGESTIONS)
      : (SUGGESTIONS_BY_PAGE[pathname] ?? DEFAULT_SUGGESTIONS)

    for (const s of staticPool) {
      if (smart.length >= 4) break
      if (!smart.includes(s)) smart.push(s)
    }

    return smart.slice(0, 4)
  }

  // No metrics available — static fallback
  if (isPersonal && ROLE_SUGGESTIONS_BY_PAGE[pathname]) return ROLE_SUGGESTIONS_BY_PAGE[pathname]
  if (SUGGESTIONS_BY_PAGE[pathname]) return SUGGESTIONS_BY_PAGE[pathname]
  return isPersonal ? DEFAULT_ROLE_SUGGESTIONS : DEFAULT_SUGGESTIONS
}

// ---------------------------------------------------------------------------
// Chat bubble component
// ---------------------------------------------------------------------------

function ChatBubble({
  message,
  onExecuteAction,
  actionPending,
  executedActions,
  messageIdx,
}: {
  message: ChatMessage
  onExecuteAction?: (action: ChatAction, messageIdx?: number) => void
  actionPending?: boolean
  executedActions?: Set<string>
  messageIdx?: number
}) {
  const navigate = useNavigate()
  const { close: closeChat } = useNicoChatStore()
  const isUser = message.role === 'user'
  const pending = !isUser ? message.pending_action : null
  const cleanContent = message.content.replace(/\*+/g, '')

  // Extraer paths internos del CRM mencionados en el texto del bot
  // (los inserta cuando ve campos `link` en los tool results) para
  // renderizarlos como botones clickables abajo de la respuesta.
  const INTERNAL_PATH_RE = /\/(expedientes|clientes|tareas|alertas|notificaciones-sae|notificaciones|agenda)\/[a-z0-9-]{6,}/gi
  const internalLinks: Array<{ path: string; label: string }> = []
  const seen = new Set<string>()
  for (const m of cleanContent.matchAll(INTERNAL_PATH_RE)) {
    if (!seen.has(m[0])) {
      seen.add(m[0])
      const section = m[1] === 'expedientes' ? 'Abrir expediente'
        : m[1] === 'clientes' ? 'Abrir cliente'
        : m[1] === 'tareas' ? 'Ir a tarea'
        : m[1] === 'alertas' ? 'Ir a alerta'
        : m[1].startsWith('notificaciones') ? 'Ver notificación'
        : 'Abrir'
      internalLinks.push({ path: m[0], label: section })
    }
  }
  // Quitamos los paths del texto plano para que no queden duplicados
  const textForRender = (internalLinks.length > 0 && !isUser)
    ? cleanContent
        .replace(INTERNAL_PATH_RE, '')
        .replace(/Ver en la app:\s*$/gim, '')
        .replace(/—\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : cleanContent

  // Convertir el pending_action a ChatAction
  const chatAction: ChatAction | null = pending && pending.type ? {
    type: pending.type as ChatAction['type'],
    label: pending.label,
    description: pending.description,
    params: Object.fromEntries(
      Object.entries(pending.resolved_args).map(([k, v]) => [k, v == null ? null : String(v)])
    ),
  } : null

  const actionKey = chatAction ? `${chatAction.type}-${JSON.stringify(chatAction.params)}` : ''
  const alreadyExecuted = message.executed || (chatAction ? executedActions?.has(actionKey) : false)

  return (
    <div
      className={cn(
        'flex gap-2',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}
      <div className="max-w-[85%]">
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-gradient-cyan text-zinc-950 rounded-br-md'
              : 'bg-white/10 text-zinc-900 dark:text-zinc-100 rounded-bl-md'
          )}
        >
          <p className="whitespace-pre-wrap break-words">{textForRender}</p>
        </div>

        {/* Botones de navegación interna */}
        {!isUser && internalLinks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {internalLinks.map((l, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { closeChat(); navigate(l.path) }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-200 hover:bg-amber-500/20"
                title={l.path}
              >
                <ExternalLink className="h-3 w-3" />
                {l.label}
              </button>
            ))}
          </div>
        )}

        {/* Trace de tool calls (solo para asistente) */}
        {!isUser && message.tool_trace && message.tool_trace.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            {message.tool_trace.map((t, i) => (
              <span key={i} className="rounded bg-zinc-200/60 dark:bg-white/5 px-1.5 py-0.5">
                <code className="font-mono">{t.name}</code> · {t.output_summary}
              </span>
            ))}
          </div>
        )}

        {/* Card de acción pendiente con botón Confirmar */}
        {chatAction && onExecuteAction && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
              {chatAction.label}
            </p>
            <p className="text-[11px] text-zinc-700 dark:text-zinc-200 mb-2 leading-snug">
              {chatAction.description}
            </p>
            <ActionButton
              action={chatAction}
              onExecute={(a) => onExecuteAction(a, messageIdx)}
              isPending={!!actionPending}
              isExecuted={!!alreadyExecuted}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action button component
// ---------------------------------------------------------------------------

function ActionButton({
  action,
  onExecute,
  isPending,
  isExecuted,
}: {
  action: ChatAction
  onExecute: (action: ChatAction) => void
  isPending: boolean
  isExecuted: boolean
}) {
  return (
    <button
      onClick={() => onExecute(action)}
      disabled={isPending || isExecuted}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
        isExecuted
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50',
        isPending && 'opacity-60 cursor-wait'
      )}
    >
      {isExecuted ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Zap className="h-3.5 w-3.5" />
      )}
      {isExecuted ? 'Ejecutado' : action.label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NicoIAChat() {
  const {
    isOpen, messages, isLoading, toggle, addMessage, markActionExecuted, setLoading,
    clearMessages, conversations, showHistory, newConversation,
    loadConversation, deleteConversation, toggleHistory, saveCurrentConversation,
  } = useNicoChatStore()
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const { data: metrics } = useDashboardMetrics()

  const [input, setInput] = useState('')
  const [executedActions, setExecutedActions] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const actionExecutor = useChatActionExecutor()

  const handleVoiceResult = useCallback((transcript: string) => {
    setInput((prev) => (prev ? prev + ' ' + transcript : transcript))
    inputRef.current?.focus()
  }, [])
  const voice = useVoiceInput(handleVoiceResult)

  // Visible para todos los usuarios autenticados con perfil activo
  // NOTE: siempre mostrar el botón si hay profile — el chat solo requiere
  // la Edge Function al enviar mensajes, no para renderizar el botón.
  const enabled = !!profile

  // Keyboard shortcut: Alt+N to toggle chat
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, toggle])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const lastSentRef = useRef(0)

  const agent = useBogabotAgent()

  // Si la URL es /expedientes/:id, lo pasamos como hint al agente.
  const hintExpedienteId = (() => {
    const m = pathname.match(/^\/expedientes\/([0-9a-f-]{8,})/i)
    return m ? m[1] : undefined
  })()

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim().slice(0, 2000)
      if (!trimmed || isLoading) return

      // Rate limit: 2s mínimo entre mensajes
      const now = Date.now()
      if (now - lastSentRef.current < 2000) return
      lastSentRef.current = now

      const userMsg: ChatMessage = { role: 'user', content: trimmed }
      addMessage(userMsg)
      setInput('')
      setLoading(true)

      try {
        // Tomamos las últimas 20 mensajes como historial (sin system, sin
        // mensajes con pending_action ya ejecutada — la edge function se
        // encarga del system prompt y del contexto del CRM).
        const history = [...messages, userMsg]
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-20)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        const result = await agent.mutateAsync({
          messages: history,
          page_context: buildPageDescription(pathname),
          hint_expediente_id: hintExpedienteId,
        })

        addMessage({
          role: 'assistant',
          content: result.reply || (result.pending_action
            ? `Voy a ${result.pending_action.label.toLowerCase()}: ${result.pending_action.description}`
            : 'Listo.'),
          pending_action: result.pending_action ?? null,
          tool_trace: result.tool_calls.map(t => ({ name: t.name, output_summary: t.output_summary })),
        })
      } catch (err) {
        console.error('[BogaBot]', err)
        addMessage({
          role: 'assistant',
          content: 'No pude procesar tu consulta en este momento. Intentá de nuevo en un segundo.',
        })
      } finally {
        setLoading(false)
      }
    },
    [isLoading, messages, profile, pathname, hintExpedienteId, addMessage, setLoading, agent]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleExecuteAction = useCallback((action: ChatAction, messageIdx?: number) => {
    const actionKey = `${action.type}-${JSON.stringify(action.params)}`
    actionExecutor.mutate(action, {
      onSuccess: (result) => {
        setExecutedActions((prev) => new Set(prev).add(actionKey))
        if (typeof messageIdx === 'number') markActionExecuted(messageIdx)
        addMessage({ role: 'assistant', content: `Listo. ${result.message}` })
      },
      onError: (err) => {
        addMessage({
          role: 'assistant',
          content: `No pude ejecutar la acción: ${err instanceof Error ? err.message : 'error desconocido'}`,
        })
      },
    })
  }, [actionExecutor, addMessage])

  if (!enabled) return null

  const suggestions = getDynamicSuggestions(pathname, profile?.rol, metrics)

  return (
    <>
      {/* Floating button — pill with brain icon + label */}
      <button
        onClick={toggle}
        className={cn(
          'fixed bottom-5 right-5 z-50 flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-105 max-sm:bottom-4 max-sm:right-4 max-sm:scale-90',
          isOpen
            ? 'h-12 w-12 justify-center rounded-full bg-zinc-700 hover:bg-zinc-600'
            : 'rounded-full bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 pl-3 pr-4 py-2.5'
        )}
        title="BogaBot Asistente (Alt+N)"
      >
        {isOpen ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <>
            <BrainCircuit className="h-5 w-5 text-white" />
            <span className="text-sm font-semibold text-white hidden sm:inline">BogaBot</span>
          </>
        )}
      </button>

      {/* Chat window — floating on all sizes */}
      {isOpen && (
        <div className="fixed bottom-20 right-3 left-3 z-50 flex flex-col bg-white dark:bg-zinc-900 h-[min(520px,75vh)] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-2xl animate-fade-in sm:left-auto sm:bottom-24 sm:right-5 sm:h-[min(520px,80vh)] sm:w-[380px] md:w-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 dark:bg-white/20">
                <BrainCircuit className="h-4 w-4 text-amber-600 dark:text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">BogaBot</h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-300">
                  Asistente del CRM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {conversations.length > 0 && (
                <button
                  onClick={toggleHistory}
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    showHistory ? 'bg-amber-500/20 dark:bg-white/20 text-amber-600 dark:text-white' : 'text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white'
                  )}
                  title="Historial de conversaciones"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={newConversation}
                  className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  title="Nueva conversación"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={toggle}
                className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* History panel */}
          {showHistory && (
            <div className="flex-1 overflow-y-auto border-b border-zinc-200 dark:border-white/10">
              <div className="px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                Conversaciones anteriores
              </div>
              {conversations.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-700 dark:text-zinc-300">Sin conversaciones guardadas</p>
              ) : (
                <div className="space-y-0.5 px-1 pb-2">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/5 cursor-pointer"
                      onClick={() => loadConversation(conv.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{conv.title}</p>
                        <p className="text-[10px] text-zinc-700 dark:text-zinc-300">
                          {conv.messages.length} mensaje{conv.messages.length !== 1 ? 's' : ''} · {new Date(conv.updatedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(conv.id)
                        }}
                        className="hidden group-hover:block rounded p-1 text-zinc-700 dark:text-zinc-300 hover:text-red-400"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className={cn('flex-1 overflow-y-auto px-4 py-3 space-y-3', showHistory && 'hidden')}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-950/40">
                  <Bot className="h-7 w-7 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Hola, soy BogaBot
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 max-w-[260px]">
                    Consultame sobre expedientes, clientes, tareas, audiencias o el estado general del estudio.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full px-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-zinc-600 dark:text-zinc-300 hover:bg-white/5 hover:border-amber-500/30 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages
                  .filter((m) => m.role !== 'system')
                  .map((msg, i) => (
                    <ChatBubble
                      key={i}
                      message={msg}
                      messageIdx={i}
                      onExecuteAction={handleExecuteAction}
                      actionPending={actionExecutor.isPending}
                      executedActions={executedActions}
                    />
                  ))}
                {isLoading && messages[messages.length - 1]?.content === '' && (
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-white/10 px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {!showHistory && (
          <form
            onSubmit={handleSubmit}
            className="border-t border-zinc-200 dark:border-white/10 px-3 py-2.5"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voice.listening ? 'Escuchando...' : 'Escribí tu pregunta...'}
                rows={1}
                className={cn(
                  'flex-1 resize-none rounded-xl border bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:bg-white/5 focus:outline-none focus:ring-2 max-h-[100px]',
                  voice.listening
                    ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                    : 'border-white/10 focus:border-amber-500/40 focus:ring-amber-500/15'
                )}
                style={{ minHeight: '38px' }}
              />
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  className={cn(
                    'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl transition-colors',
                    voice.listening
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                      : 'bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                  title={voice.listening ? 'Detener grabación' : 'Hablar'}
                >
                  {voice.listening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-gradient-cyan text-zinc-950 transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300 text-center">Alt+N para abrir/cerrar</p>
          </form>
          )}
        </div>
      )}
    </>
  )
}
