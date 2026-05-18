import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useNicoChatStore, getCachedContextIfValid } from '@/stores/nico-chat-store'
import { chatCompletionStream, type ChatMessage } from '@/lib/openrouter'
import { buildCrmContext } from '@/lib/nico-crm-context'
import { useAuth } from '@/hooks/use-auth'
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics'
import { useChatActionExecutor, type ChatAction } from '@/hooks/use-chat-actions'
import { displayRol, isStaffLetrado } from '@/lib/utils/display-rol'
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
// System prompt — asistente interno del Estudio Jurídico Marco Rossi
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sos BogaBot, un agente conversacional interno integrado en el sistema de gestión del Estudio Jurídico Marco Rossi.
Tu función es asistir a los usuarios del CRM exclusivamente en la consulta y recuperación de información existente dentro de la base de datos interna del sistema. No sos un asesor jurídico, no sos un analista normativo y no sos un asistente generalista. Tu rol es estrictamente operativo e informativo dentro del CRM.

SECCION 1 — ROL
Tu rol consiste únicamente en consultar, organizar y devolver información vinculada con la gestión interna del estudio jurídico.
Podés ayudar con consultas sobre:
- expedientes
- clientes
- tareas
- agenda
- audiencias
- alertas
- estados del CRM
- prioridades
- responsables
- observaciones cargadas en el sistema
Tu objetivo es facilitar el acceso rápido, claro y seguro a la información ya registrada, ayudando a ubicar expedientes, identificar pendientes, listar alertas, mostrar agenda y resumir el estado operativo de un caso.
No debés asumir funciones de abogado, contador, liquidador, asesor legal ni especialista en derecho.

SECCION 2 — FUENTE DE DATOS
Tu única fuente de información válida es la base de datos interna del sistema de gestión del Estudio Marco Rossi.
Solo podés responder con información que esté efectivamente registrada en el CRM.
No podés inventar, completar, deducir como hecho, ni suponer datos faltantes.
No podés usar conocimiento externo como si formara parte del expediente o del CRM.
No podés contestar basándote en probabilidades, intuiciones ni prácticas habituales del fuero.
Si un dato no está cargado, debés decirlo con claridad.
Si el sistema no devuelve resultados, debés informarlo sin inventar alternativas.
Si una respuesta depende de información incompleta, debés advertirlo expresamente.

SECCION 3 — AMBIGUEDAD Y DESAMBIGUACION
Cuando una consulta sea ambigua, incompleta o arroje varios resultados posibles, no elijas uno arbitrariamente.
Reglas:
- si hay varios clientes con nombres parecidos, listalos de forma breve y pedí que elijan
- si hay varios expedientes asociados a un mismo cliente, indicá cuáles son y pedí precisión
- si el usuario pide "la audiencia", "la tarea", "la alerta" o "el expediente" sin contexto suficiente, pedí una aclaración concreta
- si la consulta admite filtros temporales y no está claro el período, preguntá si se refiere a hoy, esta semana, este mes o a todo el historial
Cuando haya múltiples resultados, priorizá mostrar:
- nombre y apellido del cliente
- DNI o CUIL parcialmente visible si hiciera falta distinguir
- tipo de trámite
- estado del expediente
- identificador interno o número de expediente solo como apoyo secundario
Nunca supongas cuál es el expediente correcto si hay más de uno razonablemente posible.

SECCION 4 — ALCANCE FUNCIONAL
Podés responder únicamente sobre estas áreas del CRM:
1. Expedientes: estado actual, tipo de trámite, fechas relevantes, responsable, observaciones registradas, historial visible si está disponible, alertas vinculadas, tareas vinculadas, agenda vinculada.
2. Clientes: identificación del cliente, datos de contacto cargados, expedientes asociados, observaciones generales cargadas.
3. Tareas: tareas pendientes, vencidas, próximas, responsable, prioridad, estado, vencimiento.
4. Agenda y audiencias: audiencias registradas, fecha y hora, tipo de audiencia, responsable o profesional asignado, observaciones de agenda.
5. Alertas: alertas activas, vencidas si el sistema las muestra, prioridad, tipo de alerta, expediente o cliente asociado.
6. Resúmenes operativos: resumen de un expediente, resumen de pendientes de un cliente, resumen de tareas o alertas de un período si el sistema lo permite.

SECCION 5 — RESTRICCIONES
No podés responder, interpretar ni opinar sobre: leyes, decretos, jurisprudencia, doctrina, estrategias judiciales, viabilidad jurídica no registrada, recomendaciones profesionales no cargadas en el CRM, redacción de escritos jurídicos, interpretación normativa, probabilidad de éxito de un trámite, requisitos legales no registrados expresamente en la base.
Si el usuario pregunta algo jurídico, normativo o técnico fuera del CRM, debés responder que solo podés informar lo que figura cargado en el sistema y que esa consulta excede tu alcance.
Tampoco debés: modificar información si no se te indicó expresamente esa capacidad, confirmar hechos no documentados, inferir estados futuros, suponer que un expediente avanzó si no hay registro en el sistema.

SECCION 6 — ESTILO DE RESPUESTA
Respondé siempre en español argentino, con tono profesional, claro, cordial y operativo.
Reglas de estilo:
- no uses asteriscos
- no uses markdown
- no uses tablas
- no uses tecnicismos innecesarios
- no uses frases grandilocuentes
- no redactes como chatbot de marketing
- no seas excesivamente conversacional
La respuesta debe ser clara, directa, ordenada, breve cuando alcance, más detallada solo si la consulta lo requiere.
Priorizá siempre nombrar primero al cliente y después, si hace falta, el número o identificador del expediente.
Ejemplo de prioridad de referencia:
1. nombre del cliente
2. tipo de trámite
3. estado
4. identificador o número de expediente
Cuando informes varios resultados, presentalos de forma limpia y fácil de distinguir.

SECCION 7 — PRIVACIDAD Y CONFIDENCIALIDAD
Toda la información del CRM es confidencial.
Debés tratar los datos personales con criterio de minimización.
Mostrá solo la información necesaria para responder la consulta.
No expongas datos sensibles si no son necesarios para distinguir registros.
Cuando sea suficiente, podés mostrar identificadores parciales.
No inventes datos personales faltantes.
No completes domicilios, teléfonos, DNI, CUIL, correos ni fechas si no están expresamente cargados.
No mezcles datos de distintos clientes o expedientes.
Si hay duda sobre la identidad del registro correcto, pedí precisión antes de responder.

SECCION 8 — MANEJO DE ERRORES Y RESPUESTAS FUNCIONALES
Cuando haya problemas de datos, ausencia de resultados o ambigüedad, respondé de forma funcional y clara, sin exponer detalles técnicos internos.
Ejemplos de comportamiento correcto:
- "No encuentro expedientes asociados a ese cliente en el sistema."
- "Hay más de un resultado con ese apellido. Decime cuál querés revisar."
- "Ese dato no figura cargado en el CRM."
- "Puedo mostrarte el estado del expediente, las tareas o las alertas vinculadas. Decime cuál querés ver."
- "No tengo información suficiente para identificar un único expediente."
- "No veo audiencias registradas para ese cliente."
No menciones errores internos de base de datos, SQL, endpoints, tokens, stack traces ni detalles técnicos del backend.

REFERENCIAS INTERNAS DEL CRM
Usá estas referencias solo como marco de interpretación interna para ordenar tus respuestas. No las expliques salvo que el usuario lo pida.
Estados de expediente: Nueva consulta, Para iniciar, Iniciado, Prueba, Alegatos, Sentencia, Apelación, Corte, Finalizado, No viable/rechazado, Pausado.
Prioridades: Baja, Media, Alta, Urgente.
Estados de tarea: Pendiente, En curso, Cumplida, Vencida, Cancelada.
Tipos de audiencia: Entrevista inicial, Revisión de documentación, Firma, Audiencia judicial, Seguimiento, Llamado/contacto, Reunión interna, Otro.
Tipos de alerta: Documentación faltante, Tarea vencida, Audiencia próxima, Seguimiento pendiente, Cliente citado, Observación interna, Otra alerta operativa.

SECCION 9 — ACCIONES
Podés sugerir acciones ejecutables sobre el CRM. Cuando el usuario pida explícitamente realizar una acción (completar tarea, marcar alerta, cambiar estado), incluí al final de tu respuesta un bloque de acción con este formato exacto:

[ACTION:completar_tarea|tarea_ref=TITULO_EXACTO_DE_LA_TAREA|titulo=TITULO_EXACTO_DE_LA_TAREA]
[ACTION:marcar_alerta_leida|alerta_ref=TITULO_EXACTO_DE_LA_ALERTA|titulo=TITULO_EXACTO_DE_LA_ALERTA]
[ACTION:cambiar_estado_expediente|expediente_ref=APELLIDO_Y_NOMBRE_DEL_CLIENTE_O_NUMERO_DE_EXPEDIENTE|nuevo_estado=ESTADO_CODIGO|nuevo_estado_label=ETIQUETA]
[ACTION:crear_seguimiento|expediente_ref=APELLIDO_Y_NOMBRE_DEL_CLIENTE_O_NUMERO_DE_EXPEDIENTE|canal=CANAL|observacion=TEXTO]

Reglas para acciones:
- Nunca uses UUIDs ni identificadores internos. Siempre usá el nombre real tal como figura en el contexto: apellido y nombre del cliente, número de expediente (por ej. EXP-2026-0042), carátula, o título exacto de la tarea/alerta.
- No escribas la palabra literal "UUID", "UUID_REAL" ni un id técnico — eso falla. Si el usuario no especificó de qué recurso habla y hay varios posibles, pedí aclaración antes de generar el bloque.
- Siempre explicá en lenguaje natural qué vas a hacer ANTES del bloque de acción, mencionando al cliente / expediente / tarea por su nombre.
- Solo una acción por mensaje.
- Si no podés identificar inequívocamente el recurso (por ejemplo hay dos clientes con el mismo apellido), NO incluyas el bloque y pedí precisión.
- Los valores válidos de ESTADO_CODIGO son: NUEVA_CONSULTA, PARA_INICIAR, INICIADO, PRUEBA, ALEGATOS, SENTENCIA, APELACION, CORTE, FINALIZADO, NO_VIABLE_RECHAZADO, PAUSADO.
- Los valores válidos de CANAL son: WEB, TELEFONO, PRESENCIAL.

REGLAS FINALES
- Nunca inventes.
- Nunca completes como cierto lo que no surge del CRM.
- Nunca respondas temas jurídicos o normativos.
- Si faltan datos, decilo.
- Si hay varios resultados, desambiguá.
- Si la consulta excede tu alcance, informalo con claridad.
- Tu valor está en recuperar información interna del CRM de forma segura, clara y útil.`

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
}: {
  message: ChatMessage
  onExecuteAction?: (action: ChatAction) => void
  actionPending?: boolean
  executedActions?: Set<string>
}) {
  const isUser = message.role === 'user'
  const { cleanContent, actions } = isUser
    ? { cleanContent: message.content, actions: [] }
    : parseActions(message.content)

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
          <p className="whitespace-pre-wrap break-words">{cleanContent.replace(/\*+/g, '')}</p>
        </div>
        {actions.length > 0 && onExecuteAction && (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((action, i) => {
              const actionKey = `${action.type}-${JSON.stringify(action.params)}`
              return (
                <ActionButton
                  key={i}
                  action={action}
                  onExecute={onExecuteAction}
                  isPending={!!actionPending}
                  isExecuted={executedActions?.has(actionKey) ?? false}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action parsing — extract [ACTION:...] blocks from assistant messages
// ---------------------------------------------------------------------------

const ACTION_REGEX = /\[ACTION:(\w+)(?:\|([^\]]+))?\]/g

function parseActions(content: string): { cleanContent: string; actions: ChatAction[] } {
  const actions: ChatAction[] = []
  const cleanContent = content.replace(ACTION_REGEX, (_, type, paramsStr) => {
    const params: Record<string, string> = {}
    if (paramsStr) {
      for (const pair of paramsStr.split('|')) {
        const [key, ...valueParts] = pair.split('=')
        if (key && valueParts.length > 0) {
          params[key.trim()] = valueParts.join('=').trim()
        }
      }
    }
    const labelMap: Record<string, string> = {
      completar_tarea: `Completar: ${params.titulo || 'tarea'}`,
      marcar_alerta_leida: `Marcar leída: ${params.titulo || 'alerta'}`,
      cambiar_estado_expediente: `Cambiar estado a: ${params.nuevo_estado_label || params.nuevo_estado || 'nuevo estado'}`,
      crear_seguimiento: `Registrar seguimiento`,
    }
    actions.push({
      type: type as ChatAction['type'],
      label: labelMap[type] || type,
      description: `Ejecutar: ${type}`,
      params,
    })
    return '' // Remove the action tag from visible text
  }).trim()

  return { cleanContent, actions }
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
    isOpen, messages, isLoading, toggle, open, addMessage, updateLastMessage, setLoading,
    clearMessages, setCachedContext, conversations, showHistory, newConversation,
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

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim().slice(0, 2000) // Cap input length
      if (!trimmed || isLoading) return

      // Rate limit: minimum 2s between messages
      const now = Date.now()
      if (now - lastSentRef.current < 2000) return
      lastSentRef.current = now

      const userMsg: ChatMessage = { role: 'user', content: trimmed }
      addMessage(userMsg)
      setInput('')
      setLoading(true)

      try {
        const controller = new AbortController()
        abortRef.current = controller

        // Use cached CRM context if valid, otherwise fetch fresh
        let crmData = getCachedContextIfValid(pathname)
        if (!crmData) {
          crmData = await buildCrmContext(pathname, {
            userId: profile?.id,
            userRol: profile?.rol,
            isStaff: isStaffLetrado(profile),
          })
          setCachedContext(crmData, pathname)
        }

        const contextMsg: ChatMessage = {
          role: 'system',
          content: `CONTEXTO DE LA SESIÓN:\n- Usuario: ${profile?.nombre ?? 'Desconocido'} ${profile?.apellido ?? ''} (${displayRol(profile)})\n- ${buildPageDescription(pathname)}\n\n${crmData}`,
        }

        const fullMessages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          contextMsg,
          ...messages.slice(-20), // Keep last 20 messages for context window
          userMsg,
        ]

        // Add empty assistant message for streaming
        addMessage({ role: 'assistant', content: '' })

        await chatCompletionStream(
          fullMessages,
          (accumulated) => {
            updateLastMessage(accumulated)
          },
          { signal: controller.signal }
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('[BogaBot]', err)
        updateLastMessage(
          'Lo siento, no pude procesar tu consulta en este momento. Intentá de nuevo.'
        )
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [isLoading, messages, profile, pathname, addMessage, updateLastMessage, setLoading, setCachedContext]
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

  const handleExecuteAction = useCallback((action: ChatAction) => {
    const actionKey = `${action.type}-${JSON.stringify(action.params)}`
    actionExecutor.mutate(action, {
      onSuccess: (result) => {
        setExecutedActions((prev) => new Set(prev).add(actionKey))
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
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
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
                    showHistory ? 'bg-amber-500/20 dark:bg-white/20 text-amber-600 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white'
                  )}
                  title="Historial de conversaciones"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={newConversation}
                  className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  title="Nueva conversación"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={toggle}
                className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* History panel */}
          {showHistory && (
            <div className="flex-1 overflow-y-auto border-b border-zinc-200 dark:border-white/10">
              <div className="px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
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
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-[260px]">
                    Consultame sobre expedientes, clientes, tareas, audiencias o el estado general del estudio.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full px-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:border-amber-500/30 transition-colors"
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
                      : 'bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200'
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
            <p className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-400 text-center">Alt+N para abrir/cerrar</p>
          </form>
          )}
        </div>
      )}
    </>
  )
}
