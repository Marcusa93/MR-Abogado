import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { useTranscribirAudio } from '@/hooks/use-escritos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Botón de dictado por voz: graba, transcribe (edge function transcribir-audio,
// la misma de escritos) y entrega el texto a quien lo use.

export function DictarBoton({ onTexto, disabled, className, label = 'Dictar' }: {
  onTexto: (texto: string) => void
  disabled?: boolean
  className?: string
  label?: string
}) {
  const transcribir = useTranscribirAudio()
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
  }, [])

  const empezar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        if (blob.size < 1000) return
        try {
          const texto = (await transcribir.mutateAsync(blob)).trim()
          if (texto) onTexto(texto)
          else toast.info('No se entendió el audio', 'Probá de nuevo, más cerca del micrófono.')
        } catch (e) {
          toast.error('No se pudo transcribir', e instanceof Error ? e.message : undefined)
        }
      }
      mr.start(); mediaRef.current = mr
      setSegundos(0); setGrabando(true)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono', 'Revisá los permisos del navegador.')
    }
  }

  const detener = () => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setGrabando(false)
  }

  const base = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40'
  if (transcribir.isPending) {
    return <span className={cn(base, 'text-cyan-700 dark:text-cyan-300', className)}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribiendo…</span>
  }
  if (grabando) {
    return (
      <button type="button" onClick={detener} className={cn(base, 'animate-pulse bg-rose-500/15 text-rose-700 dark:text-rose-300', className)}>
        <Square className="h-3 w-3" fill="currentColor" />
        {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')} · detener
      </button>
    )
  }
  return (
    <button type="button" onClick={empezar} disabled={disabled} title="Dictar por voz"
      className={cn(base, 'bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300', className)}>
      <Mic className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
