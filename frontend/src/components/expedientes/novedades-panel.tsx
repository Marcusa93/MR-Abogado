import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useCreateTarea } from '@/hooks/use-tareas'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { Mic, MicOff, Send, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import type { TablesInsert } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TareaPropuesta {
  titulo: string
  descripcion: string | null
  fecha_vencimiento: string | null
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
}

interface Propuesta {
  nota: string
  tareas_propuestas: TareaPropuesta[]
}

interface Novedad {
  id: string
  expediente_id: string
  user_id: string
  texto_original: string
  nota: string
  tareas_ids: string[]
  created_at: string
  profiles: { nombre: string | null; apellido: string | null } | null
}

// ─── Query keys ───────────────────────────────────────────────────────────────

const novedadesKeys = {
  byExpediente: (id: string) => ['expediente_novedades', id] as const,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORIDAD_CLS: Record<string, string> = {
  URGENTE: 'bg-red-500/15 text-red-400',
  ALTA: 'bg-amber-500/15 text-amber-400',
  MEDIA: 'bg-sky-500/15 text-sky-400',
  BAJA: 'bg-zinc-500/15 text-zinc-400',
}

function formatLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Argentina/Tucuman',
  })
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function TareaEditRow({
  tarea,
  onChange,
  onRemove,
}: {
  tarea: TareaPropuesta
  onChange: (t: TareaPropuesta) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-start gap-2">
        <input
          className="flex-1 rounded bg-white/5 px-2 py-1 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-white/20"
          value={tarea.titulo}
          onChange={e => onChange({ ...tarea, titulo: e.target.value })}
          placeholder="Título de la tarea"
        />
        <button
          onClick={onRemove}
          className="mt-0.5 text-zinc-500 hover:text-red-400 transition-colors"
          title="Eliminar tarea"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-white/20"
          value={tarea.prioridad}
          onChange={e => onChange({ ...tarea, prioridad: e.target.value as TareaPropuesta['prioridad'] })}
        >
          {(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="date"
          className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-white/20"
          value={tarea.fecha_vencimiento ?? ''}
          onChange={e => onChange({ ...tarea, fecha_vencimiento: e.target.value || null })}
        />
        {tarea.descripcion && (
          <span className="text-xs text-zinc-500 truncate flex-1">{tarea.descripcion}</span>
        )}
      </div>
    </div>
  )
}

function NovedadItem({ novedad }: { novedad: Novedad }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-zinc-200 leading-relaxed">{novedad.nota}</p>
        {novedad.texto_original !== novedad.nota && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            title="Ver texto original"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {expanded && (
        <p className="text-xs text-zinc-500 italic border-t border-white/8 pt-1.5">
          {novedad.texto_original}
        </p>
      )}
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Clock className="h-3 w-3" />
        <span>{formatLocalDate(novedad.created_at)}</span>
        {novedad.tareas_ids.length > 0 && (
          <span className="ml-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
            {novedad.tareas_ids.length} {novedad.tareas_ids.length === 1 ? 'tarea' : 'tareas'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NovedadesPanel({ expedienteId }: { expedienteId: string }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  const createTarea = useCreateTarea()

  const [texto, setTexto] = useState('')
  const [escuchando, setEscuchando] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'confirmando'>('idle')
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [tareasEditadas, setTareasEditadas] = useState<TareaPropuesta[]>([])
  const [guardando, setGuardando] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Fetch novedades
  const { data: novedades = [], isLoading } = useQuery({
    queryKey: novedadesKeys.byExpediente(expedienteId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('expediente_novedades')
        .select(`*, profiles:user_id (nombre, apellido)`)
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Novedad[]
    },
  })

  // Speech recognition
  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Tu navegador no soporta dictado por voz.')
      return
    }

    if (escuchando && recognitionRef.current) {
      recognitionRef.current.stop()
      setEscuchando(false)
      return
    }

    const rec = new SR()
    rec.lang = 'es-AR'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((r: any) => r.isFinal)
        .map((r: any) => r[0].transcript)
        .join(' ')
      setTexto(prev => (prev ? prev + ' ' + transcript : transcript))
    }
    rec.onerror = () => setEscuchando(false)
    rec.onend = () => setEscuchando(false)
    recognitionRef.current = rec
    rec.start()
    setEscuchando(true)
  }

  // Analyze via edge function
  const analizarMutation = useMutation({
    mutationFn: async (t: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sin sesión')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/expediente-novedad`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ expediente_id: expedienteId, texto: t }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error al analizar')
      return json as Propuesta & { ok: true }
    },
    onSuccess: (data) => {
      setPropuesta(data)
      setTareasEditadas(data.tareas_propuestas)
      setEstado('confirmando')
    },
    onError: (err) => {
      toast.error('Error al analizar', err instanceof Error ? err.message : 'Error desconocido')
      setEstado('idle')
    },
  })

  const handleAnalizar = () => {
    if (!texto.trim()) return
    setEstado('procesando')
    analizarMutation.mutate(texto.trim())
  }

  // Confirm: save novedad + create tasks
  const handleConfirmar = async () => {
    if (!propuesta || !profile) return
    setGuardando(true)

    try {
      // 1. Create tasks first to get their IDs
      const tareasCreadas: string[] = []
      for (const t of tareasEditadas) {
        if (!t.titulo.trim()) continue
        const result = await createTarea.mutateAsync({
          expediente_id: expedienteId,
          titulo: t.titulo.trim(),
          descripcion: t.descripcion ?? undefined,
          fecha_vencimiento: t.fecha_vencimiento ?? undefined,
          prioridad: t.prioridad,
          asignado_a: profile.id,
          created_by: profile.id,
        } as TablesInsert<'tareas'>)
        tareasCreadas.push(result.id)
      }

      // 2. Save novedad with task IDs
      const { error } = await (supabase as any)
        .from('expediente_novedades')
        .insert({
          expediente_id: expedienteId,
          user_id: profile.id,
          texto_original: texto.trim(),
          nota: propuesta.nota,
          tareas_ids: tareasCreadas,
        })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: novedadesKeys.byExpediente(expedienteId) })
      toast.success(`Novedad guardada${tareasCreadas.length ? ` · ${tareasCreadas.length} ${tareasCreadas.length === 1 ? 'tarea creada' : 'tareas creadas'}` : ''}`)

      setTexto('')
      setPropuesta(null)
      setTareasEditadas([])
      setEstado('idle')
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  const handleCancelar = () => {
    setPropuesta(null)
    setTareasEditadas([])
    setEstado('idle')
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (estado === 'confirmando' && propuesta) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Nota generada</p>
          <p className="text-sm text-zinc-200 leading-relaxed">{propuesta.nota}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Tareas propuestas ({tareasEditadas.length})
            </p>
            <button
              onClick={() => setTareasEditadas(prev => [...prev, {
                titulo: '', descripcion: null, fecha_vencimiento: null, prioridad: 'MEDIA',
              }])}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </button>
          </div>

          {tareasEditadas.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">No se detectaron tareas en el texto.</p>
          ) : (
            <div className="space-y-2">
              {tareasEditadas.map((t, i) => (
                <TareaEditRow
                  key={i}
                  tarea={t}
                  onChange={updated => setTareasEditadas(prev => prev.map((x, j) => j === i ? updated : x))}
                  onRemove={() => setTareasEditadas(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleConfirmar}
            disabled={guardando}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar y guardar
          </button>
          <button
            onClick={handleCancelar}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Input area */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <textarea
          className="w-full resize-none rounded bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none min-h-[80px]"
          placeholder="¿Qué pasó en este expediente? Dictá o escribí la novedad..."
          value={texto}
          onChange={e => setTexto(e.target.value)}
          disabled={estado === 'procesando'}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && texto.trim()) {
              handleAnalizar()
            }
          }}
        />
        <div className="flex items-center justify-between">
          <button
            onClick={toggleMic}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              escuchando
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200',
            )}
          >
            {escuchando ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {escuchando ? 'Detener' : 'Dictado'}
          </button>
          <button
            onClick={handleAnalizar}
            disabled={!texto.trim() || estado === 'procesando'}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-navy)] dark:bg-white hover:opacity-90 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white dark:text-[var(--brand-navy)] transition-opacity"
          >
            {estado === 'procesando'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            {estado === 'procesando' ? 'Analizando...' : 'Analizar'}
          </button>
        </div>
      </div>

      {/* Log */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : novedades.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-6">
            Sin novedades registradas. Dictá la primera actualización.
          </p>
        ) : (
          novedades.map(n => <NovedadItem key={n.id} novedad={n} />)
        )}
      </div>
    </div>
  )
}
