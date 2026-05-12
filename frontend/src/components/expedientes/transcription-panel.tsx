import { useState, useRef } from 'react'
import {
  useAudienciaTranscripts,
  useTranscribeSaeAttachment,
  useTranscribeUpload,
  useUploadAudienciaAudio,
  useAnalyzeTranscript,
  hasAudioAttachment,
  type SaeMovement,
  type AudienciaTranscript,
} from '@/hooks/use-sae'
import {
  Mic, Upload, Loader2, AlertCircle, Sparkles, Users, ListChecks, ArrowRight,
  ChevronDown, ChevronUp, Headphones,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'

interface Props {
  movement?: SaeMovement
  audienciaId?: string
}

function detectAudioFileName(movement: SaeMovement): string | null {
  const rp = movement.raw_payload as { archivos?: Array<Record<string, unknown>>; vinculos?: Array<Record<string, unknown>> } | null
  if (!rp) return null
  const items = [...(Array.isArray(rp.archivos) ? rp.archivos : []), ...(Array.isArray(rp.vinculos) ? rp.vinculos : [])]
  const exts = [
    '.mp3', '.m4a', '.wav', '.ogg', '.opus', '.flac', '.aac', '.wma',
    '.mp4', '.mpeg', '.mpga', '.webm', '.mov', '.avi', '.mkv', '.flv', '.3gp',
  ]
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const candidates = [item.nombre, item.name, item.filename, item.fileName, item.label]
    for (const c of candidates) {
      if (typeof c !== 'string') continue
      if (exts.some(ext => c.toLowerCase().endsWith(ext))) return c
    }
  }
  return null
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function TranscriptionPanel({ movement, audienciaId }: Props) {
  const movementId = movement?.id
  const targetId = movementId ?? audienciaId ?? ''
  const audioFileName = movement ? detectAudioFileName(movement) : null
  const hasAudio = movement ? hasAudioAttachment(movement) : false

  const { data: transcripts = [], isLoading } = useAudienciaTranscripts({
    movement_id: movementId,
    audiencia_id: audienciaId,
  })
  const transcribeSae = useTranscribeSaeAttachment()
  const transcribeUpload = useTranscribeUpload()
  const uploadAudio = useUploadAudienciaAudio()
  const analyze = useAnalyzeTranscript()
  const [expanded, setExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTranscribeSaeAttachment = () => {
    if (!movementId || !audioFileName) return
    transcribeSae.mutate(
      { movement_id: movementId, file_name: audioFileName },
      {
        onSuccess: () => toast.success('Transcripción completada'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error en transcripción'),
      },
    )
  }

  const handleUpload = (file: File) => {
    if (!targetId) return
    uploadAudio.mutate(
      { file, targetId },
      {
        onSuccess: ({ storage_path, file_name }) => {
          transcribeUpload.mutate(
            {
              storage_path,
              file_name,
              movement_id: movementId,
              audiencia_id: audienciaId,
            },
            {
              onSuccess: () => toast.success('Transcripción completada'),
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Error en transcripción'),
            },
          )
        },
        onError: (err) => toast.error(`Error subiendo audio: ${err instanceof Error ? err.message : ''}`),
      },
    )
  }

  const handleAnalyze = (t: AudienciaTranscript) => {
    analyze.mutate(
      { transcript_id: t.id, movement_id: movementId, audiencia_id: audienciaId },
      {
        onSuccess: () => toast.success('Análisis IA completado'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error en análisis'),
      },
    )
  }

  const isBusyTranscribing = transcribeSae.isPending || transcribeUpload.isPending || uploadAudio.isPending

  return (
    <div className="mt-3 rounded-lg border border-violet-500/15 bg-violet-500/[0.03] overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-violet-500/[0.05] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Headphones className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-xs font-medium text-violet-200">Transcripción de audiencia</span>
          {transcripts.length > 0 && (
            <span className="text-[10px] text-zinc-500">
              · {transcripts.length} {transcripts.length === 1 ? 'transcripción' : 'transcripciones'}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-3 py-3 space-y-3 border-t border-violet-500/10">
          {/* Acciones para crear nueva transcripción */}
          <div className="flex items-center gap-2 flex-wrap">
            {hasAudio && audioFileName && movementId && (
              <button
                onClick={handleTranscribeSaeAttachment}
                disabled={isBusyTranscribing}
                className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                title={`Transcribir el adjunto SAE: ${audioFileName}`}
              >
                {transcribeSae.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
                Transcribir audio del SAE
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusyTranscribing}
              className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              title="Subir un archivo de audio (MP3, M4A, WAV, etc.). Máx 25 MB."
            >
              {(uploadAudio.isPending || transcribeUpload.isPending) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Subir audio
            </button>
            <span className="text-[10px] text-zinc-600">
              ~$0.36 USD por hora · máx 25 MB por archivo
            </span>
          </div>

          {/* Lista de transcripciones */}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            </div>
          ) : transcripts.length === 0 ? (
            <p className="text-[11px] text-zinc-500 text-center py-2">
              Sin transcripciones todavía. Tocá "Transcribir" o "Subir audio" arriba.
            </p>
          ) : (
            <div className="space-y-3">
              {transcripts.map((t) => (
                <TranscriptCard
                  key={t.id}
                  transcript={t}
                  onAnalyze={() => handleAnalyze(t)}
                  isAnalyzing={analyze.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TranscriptCard({ transcript, onAnalyze, isAnalyzing }: { transcript: AudienciaTranscript; onAnalyze: () => void; isAnalyzing: boolean }) {
  const [textExpanded, setTextExpanded] = useState(false)
  const t = transcript

  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] text-zinc-400 truncate" title={t.audio_filename ?? ''}>
            {t.audio_filename ?? 'Sin nombre'}
          </span>
          {t.audio_duration_seconds && (
            <span className="text-[10px] text-zinc-500">· {formatDuration(t.audio_duration_seconds)}</span>
          )}
          <span className="text-[10px] text-zinc-600">· {formatDate(t.created_at)}</span>
        </div>
        {t.status === 'transcribing' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Transcribiendo
          </span>
        )}
        {t.status === 'error' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300" title={t.error_message ?? ''}>
            <AlertCircle className="h-2.5 w-2.5" />
            Error
          </span>
        )}
      </div>

      {t.error_message && (
        <p className="text-[11px] text-red-400/80 break-words leading-snug">{t.error_message}</p>
      )}

      {t.transcript && (
        <div>
          <p className={cn('text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed', !textExpanded && 'line-clamp-4')}>
            {t.transcript}
          </p>
          {t.transcript.length > 300 && (
            <button onClick={() => setTextExpanded(v => !v)} className="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300">
              {textExpanded ? 'Ver menos' : 'Ver completo'}
            </button>
          )}
        </div>
      )}

      {/* Acciones IA */}
      {t.transcript && !t.ai_analysis && (
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Procesar con IA
        </button>
      )}

      {/* Análisis IA */}
      {t.ai_analysis && (
        <div className="mt-2 rounded-md border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-400" />
            <p className="text-[11px] uppercase tracking-wider font-medium text-violet-300">Análisis IA</p>
          </div>
          {t.ai_analysis.resumen && (
            <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">{t.ai_analysis.resumen}</p>
          )}
          {t.ai_analysis.partes_presentes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1 flex items-center gap-1">
                <Users className="h-2.5 w-2.5" />Partes presentes
              </p>
              <div className="flex flex-wrap gap-1">
                {t.ai_analysis.partes_presentes.map((p, i) => (
                  <span key={i} className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300">{p}</span>
                ))}
              </div>
            </div>
          )}
          {t.ai_analysis.decisiones.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300 font-medium mb-1 flex items-center gap-1">
                <ListChecks className="h-2.5 w-2.5" />Decisiones
              </p>
              <ul className="space-y-0.5">
                {t.ai_analysis.decisiones.map((d, i) => (
                  <li key={i} className="text-xs text-zinc-300 leading-snug">• {d}</li>
                ))}
              </ul>
            </div>
          )}
          {t.ai_analysis.proximos_pasos.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-medium mb-1 flex items-center gap-1">
                <ArrowRight className="h-2.5 w-2.5" />Próximos pasos
              </p>
              <ul className="space-y-0.5">
                {t.ai_analysis.proximos_pasos.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-300 leading-snug">• {p}</li>
                ))}
              </ul>
            </div>
          )}
          {t.ai_analysis.puntos_clave.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium mb-1">Puntos clave</p>
              <ul className="space-y-0.5">
                {t.ai_analysis.puntos_clave.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-300 leading-snug">{i + 1}. {p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
