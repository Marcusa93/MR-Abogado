import { useState, useRef, useEffect } from 'react'
import {
  X, Mic, Square, SquareCheck, Upload, Loader2, Type, Link2, Film, Clapperboard,
  Sparkles, Copy, Check, Clock,
} from 'lucide-react'
import {
  useGenerarGuionReel, useUpdateContenido, parseGuionReel, cuerpoConDone,
  type GuionReel, type Contenido,
} from '@/hooks/use-contenidos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Dialog de creación: grabar/subir audio, o pegar texto/URL → guion de Reel
// ─────────────────────────────────────────────────────────────────────────────

type Modo = 'audio' | 'texto' | 'url'

export function GuionReelDialog({ onClose }: { onClose: () => void }) {
  const generar = useGenerarGuionReel()
  const [modo, setModo] = useState<Modo>('audio')
  const [stage, setStage] = useState<string | null>(null)

  // Audio
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Texto / URL
  const [texto, setTexto] = useState('')
  const [url, setUrl] = useState('')
  const [contexto, setContexto] = useState('')

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mediaRef.current = mr
      setAudioBlob(null)
      setElapsed(0)
      setRecording(true)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }

  const onPickFile = (f: File) => {
    if (f.size > 50 * 1024 * 1024) { toast.error('El audio supera 50 MB.'); return }
    setAudioBlob(f)
    setElapsed(0)
  }

  const puedeGenerar =
    modo === 'audio' ? !!audioBlob && !recording :
    modo === 'texto' ? texto.trim().length > 10 :
    /^https?:\/\//i.test(url.trim())

  const handleGenerar = () => {
    if (!puedeGenerar) return
    const input =
      modo === 'audio' ? { audio: audioBlob!, contexto: contexto.trim() || undefined, onStage: setStage } :
      modo === 'texto' ? { texto: texto.trim(), contexto: contexto.trim() || undefined, onStage: setStage } :
      { url: url.trim(), contexto: contexto.trim() || undefined, onStage: setStage }
    generar.mutate(input, {
      onSuccess: () => { setStage(null); toast.success('Guion de Reel generado'); onClose() },
      onError: (e) => { setStage(null); toast.error(e instanceof Error ? e.message : 'No se pudo generar el guion') },
    })
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const busy = generar.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
            <Clapperboard className="h-5 w-5 text-fuchsia-400" />
            Guion de Reel
          </h3>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Decí (o escribí) el tema que querés grabar y la IA arma un guion estructurado con hooks,
          escenas y sugerencias visuales para que Samira lo edite.
        </p>

        {/* Selector de modo */}
        <div className="flex gap-1.5 mb-4">
          {([['audio', 'Audio', Mic], ['texto', 'Texto', Type], ['url', 'Link', Link2]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              disabled={busy}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
                modo === m ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Cuerpo según modo */}
        {modo === 'audio' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 mb-4">
            <input ref={fileRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = '' }} />
            <div className="flex flex-col items-center gap-3">
              {recording ? (
                <button onClick={stopRecording}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-300 ring-4 ring-rose-500/20 animate-pulse">
                  <Square className="h-6 w-6" fill="currentColor" />
                </button>
              ) : (
                <button onClick={startRecording} disabled={busy}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-4 ring-fuchsia-500/15 hover:bg-fuchsia-500/30 disabled:opacity-50">
                  <Mic className="h-6 w-6" />
                </button>
              )}
              <div className="text-center">
                {recording ? (
                  <p className="text-sm font-medium text-rose-300 tabular-nums">● {mm}:{ss} — grabando</p>
                ) : audioBlob ? (
                  <p className="text-sm text-emerald-300">Audio listo {elapsed > 0 ? `(${mm}:${ss})` : ''} — podés generar o regrabar</p>
                ) : (
                  <p className="text-sm text-zinc-400">Apretá para grabar tu idea</p>
                )}
              </div>
              {!recording && (
                <button onClick={() => fileRef.current?.click()} disabled={busy}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
                  <Upload className="h-3.5 w-3.5" /> o subir un audio (ej. de WhatsApp)
                </button>
              )}
            </div>
          </div>
        )}

        {modo === 'texto' && (
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} disabled={busy} rows={5}
            placeholder="Escribí el tema o la idea del Reel. Ej: quiero hablar de qué pasa cuando te clonan la tarjeta y el banco te empieza a informar deudas…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/15 resize-none mb-4" />
        )}

        {modo === 'url' && (
          <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} type="url"
            placeholder="https://… link de la noticia o artículo"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/15 mb-4" />
        )}

        {/* Contexto opcional */}
        <input value={contexto} onChange={(e) => setContexto(e.target.value)} disabled={busy}
          placeholder="Ángulo o indicación extra (opcional). Ej: tono más urgente, para gente joven…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-500 focus:border-fuchsia-500/40 focus:outline-none mb-4" />

        {stage && (
          <div className="flex items-center gap-2 text-xs text-fuchsia-200 mb-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {stage}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
          <button onClick={onClose} disabled={busy}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleGenerar} disabled={!puedeGenerar || busy}
            className="flex items-center gap-1.5 rounded-lg bg-fuchsia-500/20 px-5 py-2 text-sm font-medium text-fuchsia-200 hover:bg-fuchsia-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generar guion
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Visor estructurado del guion: lo que ve Samira para grabar/editar
// ─────────────────────────────────────────────────────────────────────────────

export function GuionReelViewer({ contenido, onClose }: { contenido: Contenido; onClose: () => void }) {
  const guion = parseGuionReel(contenido)
  const update = useUpdateContenido()
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState<Set<number>>(() => new Set(guion?.done ?? []))
  if (!guion) return null

  const total = guion.escenas.length
  const hechas = guion.escenas.filter((e) => done.has(e.n)).length
  const pct = total ? Math.round((hechas / total) * 100) : 0
  const completo = total > 0 && hechas === total

  const toggleEscena = (n: number) => {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      update.mutate({ id: contenido.id, cuerpo: cuerpoConDone(contenido.cuerpo, [...next]) })
      return next
    })
  }

  const copiarTexto = async () => {
    await navigator.clipboard.writeText(guionAPlano(guion))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl animate-scale-in max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fuchsia-300/80">
              <Clapperboard className="h-3.5 w-3.5" /> Guion de Reel
            </p>
            <h3 className="text-lg font-semibold text-zinc-50 mt-0.5 truncate">{guion.titulo}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {guion.duracion_estimada && (
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Clock className="h-3 w-3" /> {guion.duracion_estimada}
                </span>
              )}
              {total > 0 && (
                <span className={cn('text-xs', completo ? 'text-emerald-300' : 'text-zinc-400')}>
                  {completo ? '✓ Todo grabado' : `${hechas} de ${total} escenas listas`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={copiarTexto} title="Copiar guion como texto"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Barra de progreso de grabación */}
        {total > 0 && (
          <div className="h-1 w-full bg-white/5">
            <div
              className={cn('h-full transition-all duration-300', completo ? 'bg-emerald-500' : 'bg-fuchsia-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* Cuerpo scrolleable */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {/* Hooks */}
          {guion.hooks.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-amber-300/80 mb-2">Hooks · primeros 3 segundos</p>
              <div className="space-y-1.5">
                {guion.hooks.map((h, i) => (
                  <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-100">
                    {h}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Escenas — shot list tildable */}
          {guion.escenas.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wider text-zinc-400">Shot list · tildá lo que ya grabaste</p>
                {hechas > 0 && !completo && (
                  <button onClick={() => { setDone(new Set()); update.mutate({ id: contenido.id, cuerpo: cuerpoConDone(contenido.cuerpo, []) }) }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300">Reiniciar</button>
                )}
              </div>
              <div className="space-y-2.5">
                {guion.escenas.map((e) => {
                  const ok = done.has(e.n)
                  return (
                    <div key={e.n} className={cn('rounded-lg border p-3 transition-colors',
                      ok ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]')}>
                      <div className="flex items-start gap-2.5">
                        <button onClick={() => toggleEscena(e.n)} title={ok ? 'Marcar como pendiente' : 'Marcar como grabada'}
                          className="mt-0.5 shrink-0">
                          {ok
                            ? <SquareCheck className="h-5 w-5 text-emerald-400" />
                            : <Square className="h-5 w-5 text-zinc-500 hover:text-zinc-300" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                              ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-fuchsia-500/20 text-fuchsia-200')}>{e.n}</span>
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Escena {e.n}</span>
                          </div>
                          {e.a_camara && (
                            <p className={cn('text-sm mb-2 leading-relaxed', ok ? 'text-zinc-400 line-through' : 'text-zinc-100')}>
                              <span className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-0.5 no-underline">A cámara</span>
                              {e.a_camara}
                            </p>
                          )}
                          <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2', ok && 'opacity-60')}>
                            {e.visual && (
                              <div className="rounded-md bg-cyan-500/[0.07] border border-cyan-500/15 px-2.5 py-1.5">
                                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-cyan-300/80 mb-0.5"><Film className="h-3 w-3" /> Visual</span>
                                <p className="text-xs text-cyan-100/90">{e.visual}</p>
                              </div>
                            )}
                            {e.texto_pantalla && (
                              <div className="rounded-md bg-violet-500/[0.07] border border-violet-500/15 px-2.5 py-1.5">
                                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-300/80 mb-0.5"><Type className="h-3 w-3" /> Texto en pantalla</span>
                                <p className="text-xs text-violet-100/90">{e.texto_pantalla}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Cierre + CTA */}
          {(guion.cierre || guion.cta) && (
            <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="text-[11px] uppercase tracking-wider text-emerald-300/80 mb-1.5">Cierre y llamada a la acción</p>
              {guion.cierre && <p className="text-sm text-zinc-100 mb-1">{guion.cierre}</p>}
              {guion.cta && <p className="text-xs text-emerald-200/90">{guion.cta}</p>}
            </section>
          )}

          {/* Notas de edición */}
          {guion.notas_edicion && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">Notas de edición</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{guion.notas_edicion}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// Guion → texto plano para copiar/pegar
function guionAPlano(g: GuionReel): string {
  const lines: string[] = []
  lines.push(`🎬 ${g.titulo}`)
  if (g.duracion_estimada) lines.push(`⏱ ${g.duracion_estimada}`)
  lines.push('')
  if (g.hooks.length) {
    lines.push('HOOKS:')
    g.hooks.forEach((h, i) => lines.push(`  ${i + 1}. ${h}`))
    lines.push('')
  }
  g.escenas.forEach((e) => {
    lines.push(`ESCENA ${e.n}`)
    if (e.a_camara) lines.push(`  A cámara: ${e.a_camara}`)
    if (e.visual) lines.push(`  Visual: ${e.visual}`)
    if (e.texto_pantalla) lines.push(`  Texto en pantalla: ${e.texto_pantalla}`)
    lines.push('')
  })
  if (g.cierre) lines.push(`CIERRE: ${g.cierre}`)
  if (g.cta) lines.push(`CTA: ${g.cta}`)
  if (g.notas_edicion) { lines.push(''); lines.push(`NOTAS DE EDICIÓN: ${g.notas_edicion}`) }
  return lines.join('\n')
}
