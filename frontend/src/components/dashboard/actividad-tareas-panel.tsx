import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface TareaCompletada {
  id: string
  titulo: string
  prioridad: string | null
  completada_at: string | null
  completada_por_perfil: { nombre: string | null; apellido: string | null } | null
  expediente: { id: string; numero: string | null; caratula: string | null } | null
}

function fechaRelativa(iso: string | null): string {
  if (!iso) return ''
  const ahoraAR = Date.now() - 3 * 60 * 60 * 1000
  const completada = new Date(iso).getTime()
  const diffMin = Math.round((ahoraAR - completada) / 60000)
  if (diffMin < 2) return 'hace un momento'
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'ayer'
  if (diffD < 7) return `hace ${diffD} días`
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function inicialNombre(nombre: string | null, apellido: string | null): string {
  return `${(apellido ?? '').charAt(0)}${(nombre ?? '').charAt(0)}`.toUpperCase() || '?'
}

const avatarColors = [
  'bg-sky-500/20 text-sky-400',
  'bg-violet-500/20 text-violet-400',
  'bg-amber-500/20 text-amber-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-rose-500/20 text-rose-400',
]

function colorPorNombre(nombre: string | null, apellido: string | null): string {
  const key = `${apellido ?? ''}${nombre ?? ''}`
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

const PRIO_STYLES: Record<string, string> = {
  URGENTE: 'text-rose-400',
  ALTA: 'text-amber-400',
  MEDIA: 'text-sky-400',
  BAJA: 'text-zinc-500',
}

export function ActividadTareasPanel() {
  const supabase = createClient()
  const { data: tareas = [], isLoading } = useQuery<TareaCompletada[]>({
    queryKey: ['actividad-tareas'],
    staleTime: 60_000,
    queryFn: async () => {
      const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString()
      const { data, error } = await (supabase as any)
        .from('tareas')
        .select(
          'id, titulo, prioridad, completada_at, completada_por_perfil:profiles!tareas_completada_por_fkey(nombre, apellido), expediente:expedientes!tareas_expediente_id_fkey(id, numero, caratula)',
        )
        .eq('estado', 'COMPLETADA')
        .gte('completada_at', hace7dias)
        .order('completada_at', { ascending: false })
        .limit(12)
      if (error) throw error
      return (data ?? []) as TareaCompletada[]
    },
  })

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
          <div>
            <p className="dashboard-eyebrow text-[10px]">últimos 7 días</p>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tareas completadas</h3>
          </div>
        </div>
        <Link
          to="/tareas?estado=COMPLETADA"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Ver todas
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 4].map(i => (
            <div key={i} className="h-10 rounded-lg bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : tareas.length === 0 ? (
        <div className="flex flex-col items-center py-6 gap-2 text-zinc-500">
          <CheckCircle2 className="h-8 w-8 opacity-30" />
          <p className="text-xs">Sin tareas completadas en los últimos 7 días.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tareas.map(t => {
            const quien = t.completada_por_perfil
            const nombre = quien
              ? `${quien.apellido ?? ''} ${quien.nombre ?? ''}`.trim() || 'Desconocido'
              : 'Desconocido'
            const color = colorPorNombre(quien?.nombre ?? null, quien?.apellido ?? null)
            const inicial = inicialNombre(quien?.nombre ?? null, quien?.apellido ?? null)

            return (
              <div
                key={t.id}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-white/[0.03] transition-colors"
              >
                {/* Avatar mini */}
                <div className={cn('h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold', color)}>
                  {inicial}
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn('text-[10px] font-semibold shrink-0', PRIO_STYLES[t.prioridad ?? 'MEDIA'] ?? 'text-zinc-500')}>
                      ●
                    </span>
                    <span className="text-xs text-zinc-300 truncate">{t.titulo}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-zinc-600">{nombre}</span>
                    {t.expediente && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <Link
                          to={`/expedientes/${t.expediente.id}`}
                          className="text-[10px] text-zinc-600 hover:text-zinc-400 truncate max-w-[120px] transition-colors"
                        >
                          {(t.expediente.caratula ?? t.expediente.numero ?? 'Exp.').slice(0, 30)}
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Tiempo */}
                <span className="text-[10px] text-zinc-600 shrink-0">{fechaRelativa(t.completada_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
