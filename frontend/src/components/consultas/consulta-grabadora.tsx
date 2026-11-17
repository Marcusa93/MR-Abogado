import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

interface Props {
  onTranscript: (text: string) => void
}

type Modo = 'speech' | 'chunks' | 'detectando'
type Estado = 'idle' | 'grabando' | 'procesando'

const CHUNK_INTERVAL_MS = 8_000

// ── Helper: transcribe un blob de audio vía edge function ────────────────────
async function transcribirChunk(blob: Blob, supabaseUrl: string, token: string): Promise<string> {
  const form = new FormData()
  form.append('audio', blob, `chunk.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
  const res = await fetch(`${supabaseUrl}/functions/v1/consulta-transcribir`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Transcripción falló (${res.status})`)
  const data = await res.json() as { texto?: string; error?: string }
  if (data.error) throw new Error(data.error)
  return data.texto ?? ''
}

export function ConsultaGrabadora({ onTranscript }: Props) {
  const [modo, setModo] = useState<Modo>('detectando')
  const [estado, setEstado] = useState<Estado>('idle')
  const [transcriptAcum, setTranscriptAcum] = useState('')
  const [transcriptParcial, setTranscriptParcial] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [chunksTranscritos, setChunksTranscritos] = useState(0)
  const [segundos, setSegundos] = useState(0)

  const recognitionRef = useRef<any>(null)
  const grabandoRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const headerChunkRef = useRef<Blob | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createClient()

  // ── Detectar soporte ────────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SR) {
      setModo('speech')
      const r = new SR()
      r.continuous = true
      r.interimResults = true
      r.lang = 'es-AR'

      r.onresult = (event: any) => {
        let interino = ''
        let definitivo = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const txt = event.results[i][0].transcript
          if (event.results[i].isFinal) definitivo += txt + ' '
          else interino += txt
        }
        if (definitivo) setTranscriptAcum(prev => prev + definitivo)
        setTranscriptParcial(interino)
      }
      r.onerror = (event: any) => {
        grabandoRef.current = false
        setEstado('idle')
        const msgs: Record<string, string> = {
          'not-allowed': 'Permiso de micrófono denegado.',
          'audio-capture': 'No se detectó micrófono.',
          'network': 'Error de red. Verificá conexión.',
          'no-speech': 'No se detectó voz.',
        }
        setErrorMsg(msgs[event.error] ?? `Error (${event.error})`)
      }
      r.onend = () => {
        if (grabandoRef.current) { grabandoRef.current = false; setEstado('idle') }
      }
      recognitionRef.current = r
    } else {
      setModo('chunks')
    }

    return () => {
      clearInterval(intervalRef.current ?? undefined)
      clearInterval(timerRef.current ?? undefined)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Modo Speech Recognition ─────────────────────────────────────────────────
  const iniciarSpeech = useCallback(() => {
    setTranscriptAcum('')
    setTranscriptParcial('')
    setErrorMsg(null)
    setSegundos(0)
    grabandoRef.current = true
    recognitionRef.current?.start()
    setEstado('grabando')
    timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
  }, [])

  const detenerSpeech = useCallback(() => {
    grabandoRef.current = false
    recognitionRef.current?.stop()
    clearInterval(timerRef.current ?? undefined)
    setEstado('idle')
    setTranscriptParcial('')
  }, [])

  // ── Modo MediaRecorder + chunks ─────────────────────────────────────────────
  const iniciarChunks = useCallback(async () => {
    setErrorMsg(null)
    setTranscriptAcum('')
    setChunksTranscritos(0)
    setSegundos(0)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErrorMsg('No se pudo acceder al micrófono. Revisá los permisos.')
      return
    }
    streamRef.current = stream

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErrorMsg('Sesión expirada'); stream.getTracks().forEach(t => t.stop()); return }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const token = session.access_token

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : ''

    const startSegment = () => {
      chunksRef.current = []
      headerChunkRef.current = null
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          if (!headerChunkRef.current) headerChunkRef.current = e.data
          chunksRef.current.push(e.data)
        }
      }

      mr.onstop = async () => {
        if (chunksRef.current.length === 0) return
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        if (blob.size < 500) return

        try {
          const texto = await transcribirChunk(blob, supabaseUrl, token)
          if (texto) {
            setTranscriptAcum(prev => {
              const sep = prev ? ' ' : ''
              return prev + sep + texto
            })
            setChunksTranscritos(n => n + 1)
          }
        } catch (e) {
          console.warn('[grabadora] chunk error:', e)
          // No interrumpir la grabación por un chunk fallido
        }
      }

      mr.start()
      mediaRecorderRef.current = mr
    }

    startSegment()
    setEstado('grabando')
    timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)

    // Reiniciar cada CHUNK_INTERVAL_MS para producir segmentos independientes
    intervalRef.current = setInterval(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
        setTimeout(startSegment, 150)
      }
    }, CHUNK_INTERVAL_MS)
  }, [supabase])

  const detenerChunks = useCallback(() => {
    clearInterval(intervalRef.current ?? undefined)
    clearInterval(timerRef.current ?? undefined)
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setEstado('procesando')
    // Dar tiempo a que el último chunk se procese
    setTimeout(() => setEstado('idle'), 2000)
  }, [])

  // ── Usar transcripción ──────────────────────────────────────────────────────
  const usar = useCallback(() => {
    const texto = transcriptAcum.trim()
    if (texto) {
      onTranscript(texto)
      setTranscriptAcum('')
      setTranscriptParcial('')
    }
  }, [transcriptAcum, onTranscript])

  const iniciar = modo === 'speech' ? iniciarSpeech : iniciarChunks
  const detener = modo === 'speech' ? detenerSpeech : detenerChunks

  const textoVisible = transcriptAcum + (transcriptParcial ? ' ' + transcriptParcial : '')
  const duracion = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`

  if (modo === 'detectando') return null

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 p-3 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Controles */}
      <div className="flex items-center gap-3 flex-wrap">
        {estado === 'idle' ? (
          <button
            type="button"
            onClick={iniciar}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Iniciar transcripción
          </button>
        ) : estado === 'grabando' ? (
          <button
            type="button"
            onClick={detener}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <MicOff className="h-4 w-4" />
            Detener · {duracion}
          </button>
        ) : (
          <span className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Procesando…
          </span>
        )}

        {estado === 'grabando' && (
          <span className="text-xs text-red-500 font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
            {modo === 'chunks'
              ? chunksTranscritos > 0 ? `${chunksTranscritos} segmento${chunksTranscritos !== 1 ? 's' : ''} transcripto${chunksTranscritos !== 1 ? 's' : ''}` : 'Escuchando…'
              : 'Grabando…'
            }
          </span>
        )}
      </div>

      {/* Texto transcripto en tiempo real */}
      {textoVisible && (
        <div className={cn(
          'rounded-lg border p-3 text-sm leading-relaxed min-h-[80px] max-h-[300px] overflow-y-auto',
          'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
        )}>
          <span>{transcriptAcum}</span>
          {transcriptParcial && (
            <span className="text-zinc-400 dark:text-zinc-500 italic"> {transcriptParcial}</span>
          )}
        </div>
      )}

      {/* Botón guardar */}
      {transcriptAcum && estado === 'idle' && (
        <button
          type="button"
          onClick={usar}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Guardar como contexto de la consulta
        </button>
      )}
    </div>
  )
}
