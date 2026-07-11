import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onTranscript: (text: string) => void
}

type Estado = 'idle' | 'grabando' | 'sin_soporte'

export function ConsultaGrabadora({ onTranscript }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [transcriptParcial, setTranscriptParcial] = useState('')
  const [transcriptFinal, setTranscriptFinal] = useState('')
  const recognitionRef = useRef<any>(null)
  const grabandoRef = useRef(false)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setEstado('sin_soporte')
      return
    }
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
      if (definitivo) setTranscriptFinal(prev => prev + definitivo)
      setTranscriptParcial(interino)
    }

    r.onerror = () => { grabandoRef.current = false; setEstado('idle') }
    r.onend = () => {
      if (grabandoRef.current) { grabandoRef.current = false; setEstado('idle') }
    }

    recognitionRef.current = r
  }, [])

  const iniciar = useCallback(() => {
    setTranscriptFinal('')
    setTranscriptParcial('')
    grabandoRef.current = true
    recognitionRef.current?.start()
    setEstado('grabando')
  }, [])

  const detener = useCallback(() => {
    grabandoRef.current = false
    recognitionRef.current?.stop()
    setEstado('idle')
  }, [])

  const usar = useCallback(() => {
    const texto = transcriptFinal.trim()
    if (texto) {
      onTranscript(texto)
      setTranscriptFinal('')
      setTranscriptParcial('')
    }
  }, [transcriptFinal, onTranscript])

  if (estado === 'sin_soporte') {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 p-3 rounded-lg border border-zinc-200 dark:border-white/10">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        La grabación de voz requiere Chrome o Edge. En Firefox, pegá el texto manualmente.
      </div>
    )
  }

  const textoMostrado = transcriptFinal + transcriptParcial

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {estado === 'idle' ? (
          <button
            type="button"
            onClick={iniciar}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Iniciar grabación
          </button>
        ) : (
          <button
            type="button"
            onClick={detener}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white animate-pulse"
          >
            <MicOff className="h-4 w-4" />
            Detener
          </button>
        )}
        {estado === 'grabando' && (
          <span className="text-xs text-red-500 font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Grabando...
          </span>
        )}
      </div>

      {textoMostrado && (
        <div className={cn(
          'rounded-lg border p-3 text-sm leading-relaxed min-h-[80px] max-h-[200px] overflow-y-auto',
          'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
        )}>
          {transcriptFinal}
          {transcriptParcial && (
            <span className="text-zinc-400 dark:text-zinc-500 italic">{transcriptParcial}</span>
          )}
        </div>
      )}

      {transcriptFinal && estado === 'idle' && (
        <button
          type="button"
          onClick={usar}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Usar como contexto adicional
        </button>
      )}
    </div>
  )
}
