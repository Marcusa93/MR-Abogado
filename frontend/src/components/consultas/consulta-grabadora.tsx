import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Pause, Play, Square, CheckCircle2, AlertCircle, Loader2, RotateCcw, Trash2, WifiOff, Users, Star, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  guardarTramo, borrarTramo, tramosDe, guardarBorrador, leerBorrador, borrarEntrevista,
  type SegmentoEntrevista, type MarcaEntrevista, type ModoEntrevista, type MuestraTono,
} from '@/lib/consultas/tramos-db'

// Entrevista transcripta por tramos (Whisper vía Groq), sin guardar audio:
//  - el audio se corta en tramos de 12-25 s, en una pausa de la conversación;
//  - cada tramo queda respaldado en este dispositivo hasta que se transcribe
//    (si se corta internet o se cierra la app, se recupera y se reintenta);
//  - se mide el tono de voz en el dispositivo (no se guarda audio) y se usa
//    como pista para separar a las personas;
//  - "Marcar" deja una marca en el momento exacto, con nota opcional;
//  - al terminar, la IA marca qué dijo el cliente y qué el abogado (salvo en
//    modo "solo yo") y se corrige tocando cada intervención.

export interface ResultadoEntrevista { texto: string; minutos: number; marcas: string[] }

interface Props {
  consultaId: string
  /** Devuelve true si se guardó: recién ahí se borra el respaldo local. */
  onTranscript: (r: ResultadoEntrevista) => Promise<boolean> | boolean | void
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
const MODOS: { id: ModoEntrevista; label: string }[] = [
  { id: 'cliente', label: 'El cliente y yo' },
  { id: 'terceros', label: 'Con otra persona más' },
  { id: 'solo', label: 'Solo yo (dictado)' },
]

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

/** Frecuencia fundamental por autocorrelación (70-400 Hz). null si no hay voz clara. */
function estimarTono(buf: Float32Array, sr: number): number | null {
  const n = buf.length
  const minLag = Math.floor(sr / 400)
  const maxLag = Math.min(Math.floor(sr / 70), n - 1)
  let r0 = 0
  for (let i = 0; i < n; i++) r0 += buf[i]! * buf[i]!
  if (r0 < 1e-4) return null
  let mejor = 0
  let lagMejor = -1
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0
    for (let i = 0; i < n - lag; i++) c += buf[i]! * buf[i + lag]!
    c /= r0
    if (c > mejor) { mejor = c; lagMejor = lag }
  }
  return mejor > 0.45 && lagMejor > 0 ? sr / lagMejor : null
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]!
}

type Item = { tipo: 'turno'; hablante: Hablante; ids: string[]; texto: string } | { tipo: 'marca'; marca: MarcaEntrevista }

/** Segmentos y marcas en orden; los segmentos consecutivos del mismo hablante se agrupan. */
function armar(segs: SegmentoEntrevista[], marcas: MarcaEntrevista[], modo: ModoEntrevista): Item[] {
  const eventos = [
    ...segs.map((s) => ({ tramo: s.tramo, t: s.inicio ?? 0, orden: 0, s })),
    ...marcas.map((m) => ({ tramo: m.tramo, t: m.seg, orden: 1, m })),
  ].sort((a, b) => a.tramo - b.tramo || a.t - b.t || a.orden - b.orden)
  const out: Item[] = []
  for (const e of eventos) {
    if ('m' in e && e.m) { out.push({ tipo: 'marca', marca: e.m }); continue }
    const s = (e as { s: SegmentoEntrevista }).s
    const h: Hablante = modo === 'solo' ? 'A' : (s.hablante ?? 'C')
    const ult = out[out.length - 1]
    if (ult?.tipo === 'turno' && ult.hablante === h) { ult.ids.push(s.id); ult.texto += ' ' + s.texto }
    else out.push({ tipo: 'turno', hablante: h, ids: [s.id], texto: s.texto })
  }
  return out
}

export function ConsultaGrabadora({ consultaId, onTranscript }: Props) {
  const [estado, setEstado] = useState<Estado>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && formatoMime() ? 'idle' : 'sin_soporte')
  const [modo, setModo] = useState<ModoEntrevista>('cliente')
  const [segmentos, setSegmentos] = useState<SegmentoEntrevista[]>([])
  const [marcas, setMarcas] = useState<MarcaEntrevista[]>([])
  const [notaMarca, setNotaMarca] = useState<{ id: string; texto: string } | null>(null)
  const [pendientes, setPendientes] = useState(0)
  const [sinConexion, setSinConexion] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [nivel, setNivel] = useState(0)
  const [transcurrido, setTranscurrido] = useState(0)
  const [recuperable, setRecuperable] = useState<{ segmentos: number; tramos: number } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const recRef = useRef<{ rec: MediaRecorder; idx: number; tonos: MuestraTono[] } | null>(null)
  const tramoInicio = useRef(0)
  const ultimaVoz = useRef(0)
  const siguienteTramo = useRef(0)
  const inicioEntrevista = useRef(0)
  const acumulado = useRef(0)
  const desde = useRef(0)
  const timer = useRef<number | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const cola = useRef<{ id: string; idx: number; blob: Blob; tonos: MuestraTono[] }[]>([])
  const procesando = useRef(false)
  const segsRef = useRef<SegmentoEntrevista[]>([])
  const marcasRef = useRef<MarcaEntrevista[]>([])
  const modoRef = useRef<ModoEntrevista>('cliente')
  const montado = useRef(true)
  const mime = useRef(formatoMime())

  const persistir = useCallback(() => {
    void guardarBorrador({
      consultaId, segmentos: segsRef.current, marcas: marcasRef.current, modo: modoRef.current,
      siguienteTramo: siguienteTramo.current, inicio: inicioEntrevista.current, actualizado: Date.now(),
    })
  }, [consultaId])

  const setSegs = useCallback((s: SegmentoEntrevista[]) => { segsRef.current = s; setSegmentos(s); persistir() }, [persistir])
  const setMarcasYGuardar = useCallback((m: MarcaEntrevista[]) => { marcasRef.current = m; setMarcas(m); persistir() }, [persistir])
  const cambiarModo = (m: ModoEntrevista) => { modoRef.current = m; setModo(m); persistir() }

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
          const form = new FormData()
          form.append('audio', t.blob, 'tramo')
          form.append('previo', segsRef.current.slice(-6).map((s) => s.texto).join(' '))
          const { data, error } = await createClient().functions.invoke('consulta-transcribir', { body: form })
          if (error) {
            const ctx = (error as { context?: Response }).context
            const status = ctx?.status ?? 0
            let msg = error.message
            try { msg = ((await ctx?.json()) as { error?: string })?.error ?? msg } catch { /* sin cuerpo */ }
            if (status === 400 || status === 401 || status === 413) {
              setErrorMsg(status === 401 ? 'Se cerró la sesión. Volvé a ingresar: los tramos quedan guardados en este dispositivo.' : msg)
              if (status === 401) break
              cola.current.shift(); void borrarTramo(t.id); continue
            }
            throw new Error(msg)
          }
          const crudos = (data as { segmentos?: ({ texto: string; inicio: number; fin: number } | string)[] })?.segmentos ?? []
          const nuevos: SegmentoEntrevista[] = crudos.map((x, i) => {
            const seg = typeof x === 'string' ? { texto: x, inicio: 0, fin: 0 } : x
            const tonos = t.tonos.filter((m) => m.t >= seg.inicio * 1000 && m.t <= (seg.fin || 9e9) * 1000).map((m) => m.f)
            return { id: `${t.idx}-${i}`, tramo: t.idx, texto: seg.texto, inicio: seg.inicio, tono: tonos.length >= 3 ? mediana(tonos) : null }
          })
          const todos = [...segsRef.current.filter((s) => s.tramo !== t.idx), ...nuevos]
            .sort((a, b) => a.tramo - b.tramo || (a.inicio ?? 0) - (b.inicio ?? 0))
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

  const encolar = useCallback((idx: number, blob: Blob, tonos: MuestraTono[]) => {
    const t = { id: `${consultaId}-${inicioEntrevista.current}-${idx}`, idx, blob, tonos }
    cola.current.push(t)
    cola.current.sort((a, b) => a.idx - b.idx)
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
    const actual = { rec, idx: siguienteTramo.current++, tonos: [] as MuestraTono[] }
    const partes: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(partes, { type: rec.mimeType || mime.current })
      // Se manda aunque parezca silencio: el servidor descarta lo que no es voz
      if (blob.size > 2000) encolar(actual.idx, blob, actual.tonos)
    }
    rec.start(1000)
    recRef.current = actual
    tramoInicio.current = Date.now()
    persistir()
    // El nuevo arranca antes de cortar el anterior: no se pierde nada entre tramos
    if (anterior && anterior.rec.state !== 'inactive') anterior.rec.stop()
  }, [encolar, persistir])

  function liberar() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null }
    const actual = recRef.current
    recRef.current = null
    if (actual && actual.rec.state !== 'inactive') actual.rec.stop()
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

    // Nivel (para cortar en pausas) y tono de voz (pista para separar personas)
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ctxRef.current = ctx
    const analizador = ctx.createAnalyser()
    analizador.fftSize = 2048
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
      piso = rms < piso ? rms * 0.6 + piso * 0.4 : piso * 0.998 + rms * 0.002
      const umbral = Math.max(0.012, piso * 2.5)
      const ahora = Date.now()
      if (rms > umbral) {
        ultimaVoz.current = ahora
        const f = estimarTono(buf, ctx.sampleRate)
        if (f && recRef.current) recRef.current.tonos.push({ t: ahora - tramoInicio.current, f })
      }
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

  const marcar = useCallback(() => {
    const actual = recRef.current
    if (!actual) return
    const m: MarcaEntrevista = { id: crypto.randomUUID(), tramo: actual.idx, seg: (Date.now() - tramoInicio.current) / 1000, nota: '' }
    setMarcasYGuardar([...marcasRef.current, m])
    setNotaMarca({ id: m.id, texto: '' })
  }, [setMarcasYGuardar])

  const guardarNota = () => {
    if (!notaMarca) return
    setMarcasYGuardar(marcasRef.current.map((m) => (m.id === notaMarca.id ? { ...m, nota: notaMarca.texto.trim() } : m)))
    setNotaMarca(null)
  }

  const identificar = useCallback(async (segs: SegmentoEntrevista[]) => {
    if (!segs.length || modoRef.current === 'solo') { setEstado('revision'); return }
    setEstado('identificando')
    try {
      const { data, error } = await createClient().functions.invoke('consulta-transcribir', {
        body: { accion: 'hablantes', terceros: modoRef.current === 'terceros', segmentos: segs.map((s) => ({ texto: s.texto, tono: s.tono ?? null })) },
      })
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
    if (notaMarca) guardarNota()
    if (estado === 'grabando') { acumulado.current += Date.now() - desde.current; liberar() }
    setNivel(0)
    setEstado('cerrando')
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
  }, [estado, procesarCola, identificar, notaMarca]) // eslint-disable-line react-hooks/exhaustive-deps

  const recuperar = useCallback(async () => {
    const [b, t] = await Promise.all([leerBorrador(consultaId), tramosDe(consultaId)])
    setRecuperable(null)
    if (b) {
      inicioEntrevista.current = b.inicio
      segsRef.current = b.segmentos; setSegmentos(b.segmentos)
      marcasRef.current = b.marcas ?? []; setMarcas(b.marcas ?? [])
      modoRef.current = b.modo ?? 'cliente'; setModo(b.modo ?? 'cliente')
    }
    siguienteTramo.current = Math.max(b?.siguienteTramo ?? 0, ...t.map((x) => x.idx + 1), 0)
    cola.current = t.map((x) => ({ id: x.id, idx: x.idx, blob: x.blob, tonos: x.tonos ?? [] }))
    setPendientes(cola.current.length)
    setEstado('pausa')
    void procesarCola()
  }, [consultaId, procesarCola])

  const reiniciar = () => {
    cola.current = []
    segsRef.current = []; marcasRef.current = []
    setSegmentos([]); setMarcas([]); setPendientes(0); setTranscurrido(0); setNotaMarca(null)
    acumulado.current = 0; inicioEntrevista.current = 0; siguienteTramo.current = 0
    setEstado('idle')
  }

  const descartar = useCallback(async () => {
    if (!window.confirm('¿Descartar la transcripción? Se borra también el respaldo de este dispositivo.')) return
    liberar()
    await borrarEntrevista(consultaId)
    reiniciar(); setRecuperable(null); setErrorMsg(null)
  }, [consultaId])

  const cambiarHablante = (ids: string[], h: Hablante) => {
    const sig: Hablante = modo === 'terceros' ? ({ C: 'A', A: 'O', O: 'C' } as const)[h] : h === 'C' ? 'A' : 'C'
    const set = new Set(ids)
    setSegs(segsRef.current.map((s) => (set.has(s.id) ? { ...s, hablante: sig } : s)))
  }

  /** Todo a un solo hablante: para cuando la IA separó de más. */
  const todoA = (h: Hablante) => setSegs(segsRef.current.map((s) => ({ ...s, hablante: h })))

  const guardar = useCallback(async () => {
    const items = armar(segsRef.current, marcasRef.current, modoRef.current)
    const texto = items.map((it) => it.tipo === 'marca'
      ? `★ MARCA${it.marca.nota ? `: ${it.marca.nota}` : ''}`
      : modoRef.current === 'solo' ? it.texto.trim() : `${ETIQUETA[it.hablante]}: ${it.texto.trim()}`).join('\n\n')
    if (!texto.trim()) return
    setGuardando(true)
    const ok = await onTranscript({
      texto,
      minutos: Math.max(1, Math.round(transcurrido / 60_000)),
      marcas: marcasRef.current.map((m) => m.nota || 'Momento marcado como importante'),
    })
    setGuardando(false)
    if (ok === false) return
    await borrarEntrevista(consultaId)
    reiniciar()
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
  const items = estado === 'revision' ? armar(segmentos, marcas, modo) : []
  const turnos = items.filter((i) => i.tipo === 'turno')
  const hablantesUsados = new Set(turnos.map((t) => (t.tipo === 'turno' ? t.hablante : 'A')))
  // Si todos los tonos medidos son parecidos, probablemente habló una sola persona
  const tonos = segmentos.map((s) => s.tono).filter((t): t is number => !!t).sort((a, b) => a - b)
  const unaVoz = modo !== 'solo' && hablantesUsados.size > 1 && tonos.length >= 4 && tonos.length >= segmentos.length * 0.6
    && tonos[Math.floor(tonos.length * 0.9)]! / tonos[Math.floor(tonos.length * 0.1)]! < 1.25

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

      {/* Quiénes hablan */}
      {(estado === 'idle' || estado === 'pausa') && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-zinc-500">¿Quiénes hablan?</p>
          <div className="grid grid-cols-1 gap-1 rounded-xl bg-zinc-500/10 p-1 sm:grid-cols-3">
            {MODOS.map((m) => (
              <button key={m.id} type="button" onClick={() => cambiarModo(m.id)}
                className={cn('min-h-9 rounded-lg px-2 text-xs font-medium',
                  modo === m.id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controles */}
      {(estado === 'idle' || enCurso) && (
        <div className="flex flex-wrap items-center gap-2">
          {estado === 'idle' && (
            <button type="button" onClick={arrancar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <Mic className="h-4 w-4" /> {modo === 'solo' ? 'Empezar dictado' : 'Empezar entrevista'}
            </button>
          )}
          {estado === 'grabando' && (
            <>
              <button type="button" onClick={marcar}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <Star className="h-4 w-4" /> Marcar
              </button>
              <button type="button" onClick={pausar}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 dark:border-white/15 dark:text-zinc-200">
                <Pause className="h-4 w-4" /> Pausar
              </button>
            </>
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
              {marcas.length > 0 && <span className="text-amber-600 dark:text-amber-400">· {marcas.length} ★</span>}
            </span>
          )}
        </div>
      )}

      {/* Nota de la marca recién puesta: opcional, no frena la grabación */}
      {notaMarca && enCurso && (
        <form onSubmit={(e) => { e.preventDefault(); guardarNota() }} className="flex gap-2">
          <input autoFocus value={notaMarca.texto} onChange={(e) => setNotaMarca({ ...notaMarca, texto: e.target.value })}
            placeholder="Nota de la marca (opcional), ej.: pedir recibos"
            className="min-h-10 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-base text-zinc-900 focus:outline-none sm:text-sm dark:border-amber-500/30 dark:bg-white/5 dark:text-zinc-100" />
          <button type="submit" className="min-h-10 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white">Listo</button>
        </form>
      )}

      {estado === 'grabando' && !notaMarca && (
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
      {estado !== 'revision' && (segmentos.length > 0 || marcas.length > 0) && (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-zinc-800/60 dark:text-zinc-200">
          {armar(segmentos, marcas, 'solo').map((it, i) => it.tipo === 'marca'
            ? <span key={it.marca.id} className="mx-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Star className="h-3 w-3" />{it.marca.nota || 'Marca'}</span>
            : <span key={i}>{it.texto} </span>)}
        </div>
      )}

      {/* Revisión: quién dijo qué */}
      {estado === 'revision' && (
        <div className="space-y-3">
          {turnos.length === 0 ? (
            <p className="text-xs text-zinc-500">No se obtuvo texto.</p>
          ) : (
            <>
              {unaVoz && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Todas las voces tienen un tono muy parecido: puede que haya hablado una sola persona (o dos con voz similar).</span>
                  <button type="button" onClick={() => todoA('A')} className="min-h-8 rounded-lg bg-amber-600 px-2.5 font-medium text-white">Habló una sola persona</button>
                </div>
              )}
              {modo !== 'solo' && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <Users className="h-3.5 w-3.5" /> Tocá la etiqueta para cambiar quién habla.
                  {hablantesUsados.size > 1 && !unaVoz && (
                    <button type="button" onClick={() => todoA('A')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-zinc-300 px-2 text-zinc-600 dark:border-white/15 dark:text-zinc-300">
                      <User className="h-3 w-3" /> Habló una sola persona
                    </button>
                  )}
                </div>
              )}
              <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-white/10">
                {items.map((it, i) => it.tipo === 'marca' ? (
                  <p key={it.marca.id} className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5" /> {it.marca.nota || 'Momento marcado'}
                  </p>
                ) : modo === 'solo' ? (
                  <p key={i} className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{it.texto}</p>
                ) : (
                  <div key={it.ids[0] ?? i} className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                    <button type="button" onClick={() => cambiarHablante(it.ids, it.hablante)}
                      className={cn('h-fit w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:w-24 sm:text-center', COLOR[it.hablante])}>
                      {ETIQUETA[it.hablante]}
                    </button>
                    <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{it.texto}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {turnos.length > 0 && (
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
