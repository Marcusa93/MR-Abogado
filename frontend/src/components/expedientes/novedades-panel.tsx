import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useCreateTarea } from '@/hooks/use-tareas'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import {
  Mic, MicOff, Send, Loader2, Plus, Trash2,
  ChevronDown, ChevronUp, Clock, Sparkles, CheckSquare,
} from 'lucide-react'
import type { TablesInsert } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  nombre: string | null
  apellido: string | null
}

interface TareaPropuesta {
  _key: string  // stable identity for React keys (not persisted)
  titulo: string
  descripcion: string | null
  fecha_vencimiento: string | null
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  asignado_a: string
}

interface Propuesta {
  nota: string
  tareas_propuestas: Omit<TareaPropuesta, '_key'>[]
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

let _keyCounter = 0
const newKey = () => `k${++_keyCounter}`

function formatLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Argentina/Tucuman',
  })
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ─── TareaEditRow ─────────────────────────────────────────────────────────────

function TareaEditRow({
  tarea,
  profiles,
  profilesLoading,
  onChange,
  onRemove,
  disabled,
}: {
  tarea: TareaPropuesta
  profiles: Profile[]
  profilesLoading: boolean
  onChange: (t: TareaPropuesta) => void
  onRemove: () => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-start gap-2">
        <input
          className="flex-1 rounded bg-white/5 px-2 py-1 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
          value={tarea.titulo}
          onChange={e => onChange({ ...tarea, titulo: e.target.value })}
          placeholder="Título de la tarea"
          disabled={disabled}
        />
        <button
          onClick={onRemove}
          disabled={disabled}
          className="mt-0.5 text-zinc-500 hover:text-red-400 disabled:opacity-40 transition-colors"
          title="Eliminar tarea"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
          value={tarea.prioridad}
          onChange={e => onChange({ ...tarea, prioridad: e.target.value as TareaPropuesta['prioridad'] })}
          disabled={disabled}
        >
          {(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="date"
          className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
          value={tarea.fecha_vencimiento ?? ''}
          onChange={e => onChange({ ...tarea, fecha_vencimiento: e.target.value || null })}
          disabled={disabled}
        />
        <select
          className="flex-1 min-w-[120px] rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
          value={tarea.asignado_a}
          onChange={e => onChange({ ...tarea, asignado_a: e.target.value })}
          disabled={disabled || profilesLoading}
        >
          {profilesLoading ? (
            <option value="">Cargando...</option>
          ) : (
            profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.apellido ?? ''}{p.nombre ? `, ${p.nombre}` : ''}
              </option>
            ))
          )}
        </select>
      </div>
      {tarea.descripcion && (
        <p className="text-xs text-zinc-500">{tarea.descripcion}</p>
      )}
    </div>
  )
}

// ─── NovedadItem ──────────────────────────────────────────────────────────────

function NovedadItem({
  novedad,
  tareasMap,
}: {
  novedad: Novedad
  tareasMap: Map<string, string>
}) {
  const [expanded, setExpanded] = useState(false)
  const tareasDelItem = novedad.tareas_ids
    .map(id => tareasMap.get(id))
    .filter((t): t is string => !!t)

  return (
    <div className="app-card p-3 space-y-1.5">
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

      {tareasDelItem.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-white/8 pt-1.5">
          {tareasDelItem.map((titulo, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <CheckSquare className="h-3 w-3 shrink-0 text-emerald-500" />
              <span>{titulo}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Clock className="h-3 w-3" />
        <span>{formatLocalDate(novedad.created_at)}</span>
        {novedad.tareas_ids.length > 0 && tareasDelItem.length === 0 && (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
            {novedad.tareas_ids.length} {novedad.tareas_ids.length === 1 ? 'tarea' : 'tareas'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NovedadesPanel({
  expedienteId,
  onBriefNeeded,
}: {
  expedienteId: string
  onBriefNeeded?: () => void
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const profile = useAuthStore(s => s.profile)
  const createTarea = useCreateTarea()

  const [texto, setTexto] = useState('')
  const [textoOriginal, setTextoOriginal] = useState('')
  const [verOriginal, setVerOriginal] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'confirmando'>('idle')
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [tareasEditadas, setTareasEditadas] = useState<TareaPropuesta[]>([])
  const [guardando, setGuardando] = useState(false)
  const [briefPendiente, setBriefPendiente] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Stop speech recognition on unmount to prevent state updates on dead component
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  // Novedades
  const { data: novedades = [], isLoading } = useQuery({
    queryKey: novedadesKeys.byExpediente(expedienteId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('expediente_novedades')
        .select('*, profiles:user_id (nombre, apellido)')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Novedad[]
    },
  })

  // Tareas del expediente (para mostrar títulos en el log)
  const allTareasIds = novedades.flatMap(n => n.tareas_ids)
  const { data: tareasData = [] } = useQuery({
    queryKey: ['tareas-novedad', expedienteId, allTareasIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase
        .from('tareas')
        .select('id, titulo')
        .in('id', allTareasIds)
      return (data ?? []) as { id: string; titulo: string }[]
    },
    enabled: allTareasIds.length > 0,
  })
  const tareasMap = new Map(tareasData.map(t => [t.id, t.titulo]))

  // Profiles activos para asignar tareas
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles-activos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido')
        .eq('activo', true)
        .order('apellido')
      return (data ?? []) as Profile[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Speech recognition
  const toggleMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) { toast.error('Tu navegador no soporta dictado por voz.'); return }
    if (escuchando && recognitionRef.current) {
      recognitionRef.current.stop(); setEscuchando(false); return
    }
    const rec = new SR()
    rec.lang = 'es-AR'; rec.continuous = true; rec.interimResults = false
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((r: any) => r.isFinal).map((r: any) => r[0].transcript).join(' ')
      setTexto(prev => prev ? prev + ' ' + transcript : transcript)
    }
    rec.onerror = () => setEscuchando(false)
    rec.onend = () => setEscuchando(false)
    recognitionRef.current = rec; rec.start(); setEscuchando(true)
  }, [escuchando])

  // Analyze — pass texto as argument so onSuccess doesn't rely on closure
  const analizarMutation = useMutation({
    mutationFn: async ({ textoEnviado }: { textoEnviado: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sin sesión')
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/expediente-novedad`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ expediente_id: expedienteId, texto: textoEnviado }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error al analizar')
      return { ...json as Propuesta & { ok: true }, textoEnviado }
    },
    onSuccess: ({ textoEnviado, ...data }) => {
      setTextoOriginal(textoEnviado)
      setVerOriginal(false)
      setPropuesta(data)
      setTareasEditadas(
        data.tareas_propuestas.map(t => ({ ...t, _key: newKey(), asignado_a: profile?.id ?? '' }))
      )
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
    analizarMutation.mutate({ textoEnviado: texto.trim() })
  }

  // Confirm — novedad first, then tareas, then update tareas_ids.
  // This prevents orphaned tareas if the novedad insert fails.
  const handleConfirmar = async () => {
    if (!propuesta || !profile) return
    setGuardando(true)
    try {
      // 1. Insert novedad with empty tareas_ids
      const { data: novedadInsertada, error: novedadError } = await (supabase as any)
        .from('expediente_novedades')
        .insert({
          expediente_id: expedienteId,
          user_id: profile.id,
          texto_original: textoOriginal,
          nota: propuesta.nota.trim(),
          tareas_ids: [],
        })
        .select('id')
        .single()
      if (novedadError) throw novedadError

      // 2. Create tareas
      const tareasCreadas: string[] = []
      for (const t of tareasEditadas) {
        if (!t.titulo.trim()) continue
        const result = await createTarea.mutateAsync({
          expediente_id: expedienteId,
          titulo: t.titulo.trim(),
          descripcion: t.descripcion ?? undefined,
          fecha_vencimiento: t.fecha_vencimiento ?? undefined,
          prioridad: t.prioridad,
          asignado_a: t.asignado_a || profile.id,
          created_by: profile.id,
        } as TablesInsert<'tareas'>)
        tareasCreadas.push(result.id)
      }

      // 3. Link tareas to novedad
      if (tareasCreadas.length > 0) {
        await (supabase as any)
          .from('expediente_novedades')
          .update({ tareas_ids: tareasCreadas })
          .eq('id', novedadInsertada.id)
      }

      queryClient.invalidateQueries({ queryKey: novedadesKeys.byExpediente(expedienteId) })
      toast.success(`Novedad guardada${tareasCreadas.length ? ` · ${tareasCreadas.length} ${tareasCreadas.length === 1 ? 'tarea creada' : 'tareas creadas'}` : ''}`)

      setTexto('')
      setTextoOriginal('')
      setPropuesta(null)
      setTareasEditadas([])
      setEstado('idle')
      setBriefPendiente(true)
    } catch (err) {
      toast.error('Error al guardar', err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  const handleCancelar = () => {
    setPropuesta(null); setTareasEditadas([]); setEstado('idle')
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (estado === 'confirmando' && propuesta) {
    return (
      <div className="space-y-4">
        {/* Original text */}
        <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-1">
          <button
            onClick={() => setVerOriginal(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full text-left"
          >
            {verOriginal ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Tu texto original
          </button>
          {verOriginal && (
            <p className="text-xs text-zinc-400 italic pt-1">{textoOriginal}</p>
          )}
        </div>

        {/* Generated note — editable, auto-grows */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Nota generada</p>
          <textarea
            className="w-full resize-none overflow-hidden rounded bg-white/5 px-2 py-1.5 text-sm text-zinc-200 leading-relaxed outline-none focus:ring-1 focus:ring-white/20"
            value={propuesta.nota}
            onChange={e => {
              setPropuesta({ ...propuesta, nota: e.target.value })
              autoResize(e.target)
            }}
            ref={el => { if (el) autoResize(el) }}
            rows={3}
            disabled={guardando}
          />
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Tareas propuestas ({tareasEditadas.length})
            </p>
            <button
              onClick={() => setTareasEditadas(prev => [...prev, {
                _key: newKey(), titulo: '', descripcion: null, fecha_vencimiento: null,
                prioridad: 'MEDIA', asignado_a: profile?.id ?? '',
              }])}
              disabled={guardando}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>

          {tareasEditadas.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">No se detectaron tareas en el texto.</p>
          ) : (
            <div className="space-y-2">
              {tareasEditadas.map((t) => (
                <TareaEditRow
                  key={t._key}
                  tarea={t}
                  profiles={profiles}
                  profilesLoading={profilesLoading}
                  disabled={guardando}
                  onChange={updated => setTareasEditadas(prev => prev.map(x => x._key === t._key ? updated : x))}
                  onRemove={() => setTareasEditadas(prev => prev.filter(x => x._key !== t._key))}
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
            disabled={guardando}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors"
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
      {/* Brief update banner */}
      {briefPendiente && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>El contexto del expediente cambió. Regenerá el brief para mantenerlo actualizado.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onBriefNeeded && (
              <button
                onClick={() => { setBriefPendiente(false); onBriefNeeded() }}
                className="rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                Ir a Visión IA
              </button>
            )}
            <button
              onClick={() => setBriefPendiente(false)}
              className="text-violet-400 hover:text-violet-200 transition-colors text-xs"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <textarea
          className="w-full resize-none rounded bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none min-h-[80px]"
          placeholder="¿Qué pasó en este expediente? Dictá o escribí la novedad..."
          value={texto}
          onChange={e => setTexto(e.target.value)}
          disabled={estado === 'procesando'}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && texto.trim()) handleAnalizar()
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
            {estado === 'procesando' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
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
          novedades.map(n => (
            <NovedadItem key={n.id} novedad={n} tareasMap={tareasMap} />
          ))
        )}
      </div>
    </div>
  )
}
