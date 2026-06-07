import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, Send, X, CheckSquare } from 'lucide-react'
import { useChatAdjunto, type ChatMessage } from '@/hooks/use-adjuntos'
import { CrearTareaDialog } from './crear-tarea-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

interface Props {
  adjuntoId: string
  fileName: string
  expedienteId?: string
  onClose: () => void
}

const SUGERENCIAS = [
  '¿Qué montos se reclaman y bajo qué rubros?',
  '¿Qué normativa cita el documento?',
  '¿Qué jurisprudencia se invoca?',
  'Resumime los hechos en 5 puntos.',
]

export function AdjuntoChatPanel({ adjuntoId, fileName, expedienteId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [tareaFromChat, setTareaFromChat] = useState<{ titulo: string; descripcion: string } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chat = useChatAdjunto()

  const handleCrearTareaDesdeRespuesta = (respuesta: string, preguntaPrev: string | null) => {
    // Título derivado de la pregunta previa (acotado) y descripción = la respuesta IA.
    const titulo = preguntaPrev
      ? `Sobre "${fileName}": ${preguntaPrev.slice(0, 80)}${preguntaPrev.length > 80 ? '…' : ''}`
      : `Acción derivada de ${fileName}`
    const descripcion = `📄 Documento: ${fileName}\n\n${preguntaPrev ? `❓ Pregunta: ${preguntaPrev}\n\n` : ''}🤖 Respuesta IA:\n${respuesta}`
    setTareaFromChat({ titulo, descripcion })
  }

  useEffect(() => {
    // Foco automático al input cuando abre
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    // Auto-scroll al final cuando entra un mensaje nuevo
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, chat.isPending])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || chat.isPending) return

    const next: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')

    try {
      const res = await chat.mutateAsync({
        adjuntoId,
        question,
        history: messages, // sin el último user msg para no duplicar
      })
      setMessages([...next, { role: 'assistant', content: res.answer }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar'
      // Si la function indica que falta el texto, lo aviso de forma específica
      if (/no tengo el texto|needs_text/i.test(msg)) {
        toast.error('Analizá el documento con IA primero — todavía no hay texto extraído.')
      } else {
        toast.error(msg)
      }
      // revertir el último mensaje del usuario para que pueda reintentar
      setMessages(messages)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex h-full w-full flex-col border-l border-white/10 bg-zinc-50 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            Preguntar al documento
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          title="Cerrar chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !chat.isPending && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Te respondo preguntas sobre <span className="font-medium text-zinc-700 dark:text-zinc-200">{fileName}</span>.
              Solo digo lo que está en el documento — no inventa.
            </p>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Probá con</p>
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full text-left rounded-md border border-violet-500/15 bg-violet-500/5 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-violet-500/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const prevUser = m.role === 'assistant' && i > 0 && messages[i - 1].role === 'user'
            ? messages[i - 1].content
            : null
          return (
            <div key={i} className="space-y-1">
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'ml-6 bg-cyan-500/15 text-zinc-800 dark:text-zinc-100'
                    : 'mr-6 bg-white/60 dark:bg-white/[0.04] text-zinc-800 dark:text-zinc-100 border border-white/5'
                )}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && expedienteId && (
                <button
                  type="button"
                  onClick={() => handleCrearTareaDesdeRespuesta(m.content, prevUser)}
                  className="ml-0 mr-6 inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                  title="Crear tarea con esta respuesta como descripción"
                >
                  <CheckSquare className="h-2.5 w-2.5" />
                  Crear tarea
                </button>
              )}
            </div>
          )
        })}

        {chat.isPending && (
          <div className="mr-6 inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Pensando…
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={chat.isPending}
            rows={2}
            placeholder="Preguntale al documento…"
            className="flex-1 resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || chat.isPending}
            className="rounded-md bg-violet-500/15 p-2 text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40"
            title="Enviar (Enter)"
          >
            {chat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          Enter para enviar · Shift+Enter para salto de línea
        </p>
      </div>

      {tareaFromChat && expedienteId && (
        <CrearTareaDialog
          open={true}
          onClose={() => setTareaFromChat(null)}
          expedienteId={expedienteId}
          initialValues={{
            titulo: tareaFromChat.titulo,
            descripcion: tareaFromChat.descripcion,
            fechaVencimiento: '',
            prioridad: 'MEDIA',
          }}
        />
      )}
    </div>
  )
}
