import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerfilCarga {
  id: string
  nombre: string | null
  apellido: string | null
  rol: string | null
  tareas_abiertas: number
  consultas_asignadas: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useCargaEquipo() {
  const supabase = createClient()
  return useQuery<PerfilCarga[]>({
    queryKey: ['carga-equipo'],
    queryFn: async () => {
      const { data: perfiles, error: perfErr } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, rol')
        .eq('activo', true)
        .in('rol', ['ABOGADO', 'STAFF', 'SECRETARIA', 'DIRECTOR'])
        .order('apellido', { ascending: true })
      if (perfErr) throw perfErr

      if (!perfiles || perfiles.length === 0) return []

      const [tareasRes, consultasRes] = await Promise.all([
        (supabase as any)
          .from('tareas')
          .select('assigned_to, estado')
          .not('estado', 'in', '(completada,COMPLETADA)')
          .not('assigned_to', 'is', null),

        (supabase as any)
          .from('consultas')
          .select('assigned_to')
          .not('estado', 'in', '(convertida,resuelta,descartada)')
          .not('assigned_to', 'is', null),
      ])

      const tareasPorPerfil = new Map<string, number>()
      for (const t of tareasRes.data ?? []) {
        if (t.assigned_to) {
          tareasPorPerfil.set(t.assigned_to, (tareasPorPerfil.get(t.assigned_to) ?? 0) + 1)
        }
      }

      const consultasPorPerfil = new Map<string, number>()
      for (const c of consultasRes.data ?? []) {
        if (c.assigned_to) {
          consultasPorPerfil.set(c.assigned_to, (consultasPorPerfil.get(c.assigned_to) ?? 0) + 1)
        }
      }

      return perfiles.map(p => ({
        id: p.id,
        nombre: p.nombre,
        apellido: p.apellido,
        rol: p.rol,
        tareas_abiertas: tareasPorPerfil.get(p.id) ?? 0,
        consultas_asignadas: consultasPorPerfil.get(p.id) ?? 0,
      }))
    },
    staleTime: 2 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

function iniciales(nombre: string | null, apellido: string | null): string {
  const n = (nombre ?? '').charAt(0).toUpperCase()
  const a = (apellido ?? '').charAt(0).toUpperCase()
  return `${a}${n}` || '??'
}

function tareasColor(n: number): string {
  if (n === 0) return 'text-emerald-400'
  if (n <= 3) return 'text-amber-400'
  return 'text-rose-400'
}

function tareasBg(n: number): string {
  if (n === 0) return 'bg-emerald-500/10'
  if (n <= 3) return 'bg-amber-500/10'
  return 'bg-rose-500/10'
}

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  DIRECTOR: 'Director',
  ABOGADO: 'Abogado',
  SECRETARIA: 'Secretaria',
  STAFF: 'Staff',
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function CargaEquipoPanel() {
  const { profile } = useAuth()
  const { data: carga = [], isLoading } = useCargaEquipo()

  const isAdminOrDirector = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'
  if (!isAdminOrDirector) return null

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
        <div>
          <p className="dashboard-eyebrow text-[10px]">equipo</p>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Carga del equipo</h3>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-zinc-100 dark:bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : carga.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">Sin miembros activos.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {carga.map(p => (
            <div
              key={p.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] dark:bg-white/[0.03] px-3 py-3 text-center"
            >
              {/* Avatar */}
              <div className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-zinc-700 dark:text-zinc-200',
                tareasBg(p.tareas_abiertas),
              )}>
                {iniciales(p.nombre, p.apellido)}
              </div>

              {/* Nombre */}
              <div className="min-w-0 w-full">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                  {[p.apellido, p.nombre].filter(Boolean).join(', ') || '—'}
                </p>
                <p className="text-[10px] text-zinc-500">{ROL_LABEL[p.rol ?? ''] ?? p.rol}</p>
              </div>

              {/* Carga */}
              <div className="w-full space-y-0.5">
                <p className={cn('text-xs font-bold tabular-nums', tareasColor(p.tareas_abiertas))}>
                  {p.tareas_abiertas} {p.tareas_abiertas === 1 ? 'tarea' : 'tareas'}
                </p>
                {p.consultas_asignadas > 0 && (
                  <p className="text-[10px] text-zinc-500 tabular-nums">
                    {p.consultas_asignadas} {p.consultas_asignadas === 1 ? 'consulta' : 'consultas'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
