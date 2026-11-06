import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Pause, Play, Square, CheckCircle2, AlertCircle, Loader2, RotateCcw, Trash2, WifiOff, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  guardarTramo, borrarTramo, tramosDe, guardarBorrador, leerBorrador, borrarEntrevista,
  type SegmentoEntrevista,
} from '@/lib/consultas/tramos-db'

// Entrevista transcripta por tramos (Whisper vía Groq), sin guardar audio:
//  - el audio se corta en tramos de 12-25 s, en una pausa de la conversación;
//  - cada tramo queda respaldado en este dispositivo hasta que se transcribe
//    (si se corta internet o se cierra la app, se recupera y se reintenta);
//  - al terminar, la IA marca qué dijo el cliente y qué el abogado, y se puede
//    corregir tocando cada intervención.

interface Props {
  consultaId: string
  /** Devuelve true si se guardó: recién ahí se borra el respaldo local. */
  onTranscript: (text: string, meta: { minutos: number }) => Promise<boolean> | boolean | void
}

type Estado = 'idle' | 'grabando' | 'pausa' | 'cerrando' | 'identificando' | 'revision' | 'sin_soporte'
type Hablante = 'C' | 'A' | 'O'

const MIN_TRAMO = 12_000
const MAX_TRAMO = 25_000
const SILENCIO_CORTE = 450
const ETIQUETA: Record<Hablante, string> = { A: 'Abogado', C: 'Cliente', O: 'Otra persona' }
const COLOR: Record<Hablante, string> = {
  A: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  C: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  O: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
}
const SIGUIENTE: Record<Hablante, Hablante> = { C: 'A', A: 'O', O: 'C' }

function formatoMime(): string {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
  if (!MR) return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MR.isTypeSupported?.(m)) return m
  }
  return ''
}

const reloj = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Agrupa segmentos consecutivos del mismo hablante en intervenciones. */
function turnos(segs: SegmentoEntrevista[]): { hablante: Hablante; ids: string[]; texto: string }[] {
  const out: { hablante: Hablante; ids: string[]; texto: string }[] = []
  for (const s of segs) {
    const h = s.hablante ?? 'C'
    const ult = out[out.length - 1]
    if (ult && ult.hablante === h) { ult.ids.push(s.id); ult.texto += ' ' + s.texto }
    else out.push({ hablante: h, ids: [s.id], texto: s.texto })
  }
  return out
}

export function ConsultaGrabadora({ consultaId, onTranscript }: Props) {
  const [estado, setEstado] = useState<Estado>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && formatoMime() ? 'idle' : 'sin_soporte')
  const [segmentos, setSegmentos] = useState<SegmentoEntrevista[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [sinConexion, setSinConexion] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [nivel, setNivel] = useState(0)
  const [transcurrido, setTranscurrido] = useState(0)
  const [recuperable, setRecuperable] = useState<{ segmentos: number; tramos: number } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const tramoInicio = useRef(0)
  const ultimaVoz = useRef(0)
  const siguienteTramo = useRef(0)
  const inicioEntrevista = useRef(0)
  const acumulado = useRef(0) // ms grabados antes de la última pausa
  const desde = useRef(0)
  const timer = useRef<number | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const cola = useRef<{ id: string; idx: number; blob: Blob }[]>([])
  const procesando = useRef(false)
  const segsRef = useRef<SegmentoEntrevista[]>([])
  const montado = useRef(true)
  const mime = useRef(formatoMime())

  const setSegs = useCallback((s: SegmentoEntrevista[]) => {
    segsRef.current = s
    setSegmentos(s)
    void guardarBorrador({ consultaId, segmentos: s, siguienteTramo: siguienteTramo.current, inicio: inicioEntrevista.current, actualizado: Date.now() })
  }, [consultaId])

  // ── ¿Quedó una entrevista sin terminar en este dispositivo? ───────────────
  useEffect(() => {
    montado.current = true
    void (async () => {
      const [b, t] = await Promise.all([leerBorrador(consultaId), tramosDe(consultaId)])
      if ((b?.segmentos.length ?? 0) > 0 || t.length > 0) setRecuperable({ segmentos: b?.segmentos.length ?? 0, tramos: t.length })
    })()
    return () => { montado.current = false; liberar() }
  }, [consultaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cola de transcripción: en orden, con reintentos ───────────────────────
  const procesarCola = useCallback(async () => {
    if (procesando.current) return
    procesando.current = true
    let espera = 0
    try {
      while (cola.current.length && montado.current) {
        const t = cola.current[0]!
        setPendientes(cola.current.length)
        try {
          const previo = segsRef.current.slice(-6).map((s) => s.texto).join(' ')
          const form = new FormData()
          form.append('audio', t.blob, 'tramo')
          form.append('previo', previo)
          const { data, error } = await createClient().functions.invoke('consulta-transcribir', { body: form })
          if (error) {
            const ctx = (error as { context?: Response }).context
            const status = ctx?.status ?? 0
            let msg = error.message
            try { msg = ((await ctx?.json()) as { error?: string })?.error ?? msg } catch { /* sin cuerpo */ }
            // 4xx que no se arreglan reintentando: se informa y se sigue con el resto
            if (status === 400 || status === 401 || status === 413) {
              setErrorMsg(status === 401 ? 'Se cerró la sesión. Volvé a ingresar: los tramos quedan guardados en este dispositivo.' : msg)
              if (status === 401) break
              cola.current.shift(); void borrarTramo(t.id); continue
            }
            throw new Error(msg)
          }
          const nuevos = ((data as { segmentos?: string[] })?.segmentos ?? []).map((texto, i) => ({ id: `${t.idx}-${i}`, tramo: t.idx, texto }))
          // Inserta respetando el orden de los tramos (por si se recuperaron tarde)
          const todos = [...segsRef.current.filter((s) => s.tramo !== t.idx), ...nuevos].sort((a, b) => a.tramo - b.tramo || Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]))
          setSegs(todos)
          cola.current.shift()
          void borrarTramo(t.id)
          setSinConexion(false)
          espera = 0
        } catch {
          setSinConexion(true)
          espera = Math.min(espera ? espera * 2 : 4000, 30_000)
          await new Promise((r) => setTimeout(r, espera))
        }
      }
    } finally {
      procesando.current = false
      if (montado.current) setPendientes(cola.current.length)
    }
  }, [setSegs])

  const encolar = useCallback((blob: Blob) => {
    const idx = siguienteTramo.current++
    const t = { id: `${consultaId}-${inicioEntrevista.current}-${idx}`, idx, blob }
    cola.current.push(t)
    setPendientes(cola.current.length)
    void guardarTramo({ ...t, consultaId, creado: Date.now() })
    void procesarCola()
  }, [consultaId, procesarCola])

  // ── Grabación por tramos ──────────────────────────────────────────────────
  const nuevoTramo = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const anterior = recRef.current
    const rec = new MediaRecorder(stream, { mimeType: mime.current, audioBitsPerSecond: 32_000 })
    const partes: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(partes, { type: rec.mimeType || mime.current })
      // Se manda aunque parezca silencio: el servidor descarta lo que no es voz
      if (blob.size > 2000) encolar(blob)
    }
    rec.start(1000)
    recRef.current = rec
    tramoInicio.current = Date.now()
    // El nuevo arranca antes de cortar el anterior: no se pierde nada entre tramos
    if (anterior && anterior.state !== 'inactive') anterior.stop()
  }, [encolar])

  function liberar() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null }
    const rec = recRef.current
    recRef.current = null
    if (rec && rec.state !== 'inactive') rec.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    void wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  const pedirPantallaEncendida = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      if (wl) wakeLock.current = await wl.request('screen')
    } catch { /* no disponible */ }
  }

  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible' && estado === 'grabando') void pedirPantallaEncendida() }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [estado])

  const arrancar = useCallback(async () => {
    setErrorMsg(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (e) {
      const n = (e as DOMException)?.name
      setErrorMsg(n === 'NotAllowedError'
        ? 'Permiso de micrófono denegado. Habilitalo en la configuración del navegador (el candado de la barra de dirección).'
        : n === 'NotFoundError' ? 'No se detectó micrófono.' : 'No se pudo acceder al micrófono.')
      return
    }
    streamRef.current = stream
    if (!inicioEntrevista.current) inicioEntrevista.current = Date.now()

    // Medidor de nivel para cortar los tramos en una pausa
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ctxRef.current = ctx
    const analizador = ctx.createAnalyser()
    analizador.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analizador)
    const buf = new Float32Array(analizador.fftSize)
    let piso = 0.01

    nuevoTramo()
    desde.current = Date.now()
    ultimaVoz.current = Date.now()
    setEstado('grabando')
    void pedirPantallaEncendida()

    timer.current = window.setInterval(() => {
      analizador.getFloatTimeDomainData(buf)
      let suma = 0
      for (const v of buf) suma += v * v
      const rms = Math.sqrt(suma / buf.length)
      // Piso de ruido adaptativo: baja rápido, sube despacio
      piso = rms < piso ? rms * 0.6 + piso * 0.4 : piso * 0.998 + rms * 0.002
      const umbral = Math.max(0.012, piso * 2.5)
      const ahora = Date.now()
      if (rms > umbral) ultimaVoz.current = ahora
      setNivel(Math.min(1, rms * 12))
      setTranscurrido(acumulado.current + (ahora - desde.current))
      const dur = ahora - tramoInicio.current
      if ((dur >= MIN_TRAMO && ahora - ultimaVoz.current >= SILENCIO_CORTE) || dur >= MAX_TRAMO) nuevoTramo()
    }, 100)
  }, [nuevoTramo])

  const pausar = useCallback(() => {
    acumulado.current += Date.now() - desde.current
    liberar()
    setNivel(0)
    setEstado('pausa')
  }, [])

  const identificar = useCallback(async (segs: SegmentoEntrevista[]) => {
    if (!segs.length) { setEstado('revision'); return }
    setEstado('identificando')
    try {
      const { data, error } = await createClient().functions.invoke('consulta-transcribir', { body: { accion: 'hablantes', segmentos: segs.map((s) => s.texto) } })
      if (error) throw error
      const et = (data as { etiquetas?: Hablante[] })?.etiquetas ?? []
      setSegs(segs.map((s, i) => ({ ...s, hablante: et[i] ?? 'C' })))
    } catch {
      setErrorMsg('No se pudo identificar quién habla. Podés marcarlo a mano tocando cada intervención.')
      setSegs(segs.map((s) => ({ ...s, hablante: s.hablante ?? 'C' })))
    }
    setEstado('revision')
  }, [setSegs])

  const terminar = useCallback(async () => {
    if (estado === 'grabando') { acumulado.current += Date.now() - desde.current; liberar() }
    setNivel(0)
    setEstado('cerrando')
    // Espera a que se transcriban los tramos pendientes (incluido el último)
    await new Promise((r) => setTimeout(r, 400))
    void procesarCola()
    const limite = Date.now() + 90_000
    while ((cola.current.length || procesando.current) && Date.now() < limite && montado.current) {
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!montado.current) return
    if (cola.current.length) {
      setErrorMsg(`Quedaron ${cola.current.length} tramos sin transcribir (sin conexión). Están guardados en este dispositivo: podés guardar lo que hay o reintentar más tarde desde esta misma consulta.`)
    }
    await identificar(segsRef.current)
  }, [estado, procesarCola, identificar])

  const recuperar = useCallback(async () => {
    const [b, t] = await Promise.all([leerBorrador(consultaId), tramosDe(consultaId)])
    setRecuperable(null)
    if (b) {
      inicioEntrevista.current = b.inicio
      siguienteTramo.current = Math.max(b.siguienteTramo, ...t.map((x) => x.idx + 1), 0)
      segsRef.current = b.segmentos
      setSegmentos(b.segmentos)
    } else {
      siguienteTramo.current = Math.max(0, ...t.map((x) => x.idx + 1))
    }
    cola.current = t.map((x) => ({ id: x.id, idx: x.idx, blob: x.blob }))
    setPendientes(cola.current.length)
    setEstado('pausa')
    void procesarCola()
  }, [consultaId, procesarCola])

  const descartar = useCallback(async () => {
    if (!window.confirm('¿Descartar la transcripción? Se borra también el respaldo de este dispositivo.')) return
    liberar()
    cola.current = []
    await borrarEntrevista(consultaId)
    segsRef.current = []
    setSegmentos([]); setPendientes(0); setRecuperable(null); setTranscurrido(0); setErrorMsg(null)
    acumulado.current = 0; inicioEntrevista.current = 0; siguienteTramo.current = 0
    setEstado('idle')
  }, [consultaId])

  const cambiarHablante = (ids: string[], h: Hablante) => {
    const set = new Set(ids)
    setSegs(segsRef.current.map((s) => (set.has(s.id) ? { ...s, hablante: SIGUIENTE[h] } : s)))
  }

  const guardar = useCallback(async () => {
    const texto = turnos(segsRef.current).map((t) => `${ETIQUETA[t.hablante]}: ${t.texto.trim()}`).join('\n\n')
    if (!texto.trim()) return
    setGuardando(true)
    const ok = await onTranscript(texto, { minutos: Math.max(1, Math.round(transcurrido / 60_000)) })
    setGuardando(false)
    if (ok === false) return
    cola.current = []
    await borrarEntrevista(consultaId)
    segsRef.current = []
    setSegmentos([]); setTranscurrido(0); acumulado.current = 0; inicioEntrevista.current = 0; siguienteTramo.current = 0
    setEstado('idle')
  }, [consultaId, onTranscript, transcurrido])

  // ── Vista ─────────────────────────────────────────────────────────────────
  if (estado === 'sin_soporte') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        Este navegador no permite grabar audio. Usá Chrome, Edge o Safari actualizados.
      </div>
    )
  }

  const enCurso = estado === 'grabando' || estado === 'pausa'
  const listaTurnos = estado === 'revision' ? turnos(segmentos) : []

  return (
    <div className="space-y-3">
      {recuperable && estado === 'idle' && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p>Hay una entrevista sin terminar guardada en este dispositivo
            {recuperable.segmentos ? ` (${recuperable.segmentos} fragmentos de texto` : ' ('}
            {recuperable.tramos ? `${recuperable.segmentos ? ', ' : ''}${recuperable.tramos} tramos de audio sin transcribir` : ''}).</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={recuperar} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 font-medium text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Retomar
            </button>
            <button type="button" onClick={descartar} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 px-3 dark:border-amber-500/30">
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Controles */}
      {(estado === 'idle' || enCurso) && (
        <div className="flex flex-wrap items-center gap-2">
          {estado === 'idle' && (
            <button type="button" onClick={arrancar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <Mic className="h-4 w-4" /> Empezar entrevista
            </button>
          )}
          {estado === 'grabando' && (
            <button type="button" onClick={pausar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 dark:border-white/15 dark:text-zinc-200">
              <Pause className="h-4 w-4" /> Pausar
            </button>
          )}
          {estado === 'pausa' && (
            <button type="button" onClick={arrancar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <Play className="h-4 w-4" /> Seguir
            </button>
          )}
          {enCurso && (
            <button type="button" onClick={terminar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
              <Square className="h-3.5 w-3.5" /> Terminar
            </button>
          )}
          {enCurso && (
            <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-zinc-500">
              {estado === 'grabando' && (
                <span className="flex h-4 items-end gap-0.5" aria-hidden>
                  {[0.15, 0.35, 0.6, 0.85].map((u) => (
                    <span key={u} className={cn('w-1 rounded-sm transition-all', nivel > u ? 'bg-red-500' : 'bg-zinc-300 dark:bg-zinc-600')} style={{ height: `${25 + u * 75}%` }} />
                  ))}
                </span>
              )}
              {estado === 'grabando' ? 'Escuchando' : 'En pausa'} · {reloj(transcurrido)}
            </span>
          )}
        </div>
      )}

      {estado === 'grabando' && (
        <p className="text-[11px] text-zinc-500">
          No se graba el audio: cada 15-20 segundos el tramo se transcribe y se borra. Dejá la pantalla encendida y el teléfono cerca de los dos.
        </p>
      )}

      {(pendientes > 0 || sinConexion) && estado !== 'revision' && (
        <p className={cn('flex items-center gap-1.5 text-xs', sinConexion ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500')}>
          {sinConexion ? <WifiOff className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {sinConexion
            ? `Sin conexión: ${pendientes} ${pendientes === 1 ? 'tramo guardado' : 'tramos guardados'} en este dispositivo. Se reintenta solo.`
            : `Transcribiendo ${pendientes === 1 ? 'el último tramo' : `${pendientes} tramos`}…`}
        </p>
      )}

      {(estado === 'cerrando' || estado === 'identificando') && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {estado === 'cerrando' ? 'Terminando de transcribir…' : 'Identificando quién habla…'}
        </p>
      )}

      {/* Texto en vivo */}
      {estado !== 'revision' && segmentos.length > 0 && (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-zinc-800/60 dark:text-zinc-200">
          {segmentos.map((s) => s.texto).join(' ')}
        </div>
      )}

      {/* Revisión: quién dijo qué */}
      {estado === 'revision' && (
        <div className="space-y-3">
          {listaTurnos.length === 0 ? (
            <p className="text-xs text-zinc-500">No se obtuvo texto.</p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Users className="h-3.5 w-3.5" /> Revisá quién habla: tocá la etiqueta para cambiarla (Cliente → Abogado → Otra persona).
              </p>
              <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-white/10">
                {listaTurnos.map((t, i) => (
                  <div key={t.ids[0] ?? i} className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                    <button type="button" onClick={() => cambiarHablante(t.ids, t.hablante)}
                      className={cn('h-fit w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:w-24 sm:text-center', COLOR[t.hablante])}>
                      {ETIQUETA[t.hablante]}
                    </button>
                    <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{t.texto}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {listaTurnos.length > 0 && (
              <button type="button" onClick={guardar} disabled={guardando}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Guardar en la consulta
              </button>
            )}
            <button type="button" onClick={() => { setErrorMsg(null); setEstado('pausa') }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 dark:border-white/15 dark:text-zinc-200">
              <Mic className="h-4 w-4" /> Seguir grabando
            </button>
            <button type="button" onClick={descartar}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-500 hover:text-red-600">
              <Trash2 className="h-4 w-4" /> Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
