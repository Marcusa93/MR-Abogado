import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { isDirector } from '@/lib/utils/display-rol'
import { Briefcase, CheckSquare, CalendarClock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AbogadoStats {
  id: string
  nombre: string
  apellido: string
  rol: string
  expedientes: number
  tareas_pendientes: number
  tareas_vencidas: number
  audiencias_proximas: number
}

function useAbogadosStats(enabled: boolean) {
  const supabase = createClient()
  return useQuery<AbogadoStats[]>({
    queryKey: ['abogados-stats'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, rol')
        .in('rol', ['DIRECTOR', 'ABOGADO', 'COLABORADOR'])
        .order('apellido', { ascending: true })

      const rows: AbogadoStats[] = []
      for (const p of (profiles ?? []) as any[]) {
        const [links, miembros, own] = await Promise.all([
          (supabase.from as any)('expediente_sae_links')
            .select('expediente_id')
            .eq('profile_id', p.id),
          supabase
            .from('expediente_miembros')
            .select('expediente_id')
            .eq('profile_id', p.id),
          supabase
            .from('expedientes')
            .select('id')
            .or(`abogado_responsable_id.eq.${p.id},created_by.eq.${p.id}`)
            .is('deleted_at', null),
        ])

        const expIdSet = new Set<string>()
        for (const row of ((links.data ?? []) as Array<{ expediente_id: string }>)) expIdSet.add(row.expediente_id)
        for (const row of ((miembros.data ?? []) as Array<{ expediente_id: string }>)) expIdSet.add(row.expediente_id)
        for (const row of ((own.data ?? []) as Array<{ id: string }>)) expIdSet.add(row.id)
        const expIds = [...expIdSet]

        // Tareas asignadas pendientes / vencidas
        const { data: tareas } = await supabase
          .from('tareas')
          .select('id, estado, fecha_vencimiento')
          .eq('asignado_a', p.id)
          .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
        const tareasArr = (tareas ?? []) as any[]
        const pendientes = tareasArr.length
        const vencidas = tareasArr.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < today).length

        // Audiencias en próximos 14 días en expedientes vinculados al abogado
        let audCount = 0
        if (expIds.length > 0) {
          const { count } = await supabase
            .from('audiencias')
            .select('id', { count: 'exact', head: true })
            .in('expediente_id', expIds)
            .gte('fecha', today)
            .lte('fecha', in14)
            .neq('estado', 'CANCELADA')
          audCount = count ?? 0
        }

        rows.push({
          id: p.id,
          nombre: p.nombre ?? '',
          apellido: p.apellido ?? '',
          rol: p.rol,
          expedientes: expIds.length,
          tareas_pendientes: pendientes,
          tareas_vencidas: vencidas,
          audiencias_proximas: audCount,
        })
      }
      return rows
    },
  })
}

export function AbogadosPanel() {
  const profile = useAuthStore((s) => s.profile)
  const visible = isDirector(profile)
  const { data, isLoading } = useAbogadosStats(visible)

  if (!visible) return null

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 shadow-sm">
      <header className="border-b border-zinc-200 dark:border-white/5 px-4 py-3 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Expedientes por abogado
        </h2>
        <span className="ml-auto text-[11px] text-zinc-500 dark:text-zinc-400">
          Vista del director del estudio
        </span>
      </header>

      <div className="p-3 sm:p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 py-3 text-center">
            No hay otros usuarios cargados en el estudio.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((a) => {
              const fullName = `${a.apellido}, ${a.nombre}`.trim()
              const initials = ((a.nombre?.[0] ?? '') + (a.apellido?.[0] ?? '')).toUpperCase()
              return (
                <li key={a.id}>
                  <Link
                    to={`/expedientes?abogado_id=${a.id}`}
                    className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                        {fullName}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400">
                        {a.rol === 'DIRECTOR' ? 'Director' : a.rol === 'ABOGADO' ? 'Abogado' : 'Colaborador'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 text-xs shrink-0">
                      <Stat icon={Briefcase} value={a.expedientes} label="Expedientes" tone="amber" />
                      <Stat
                        icon={CheckSquare}
                        value={a.tareas_pendientes}
                        label="Tareas"
                        tone={a.tareas_vencidas > 0 ? 'rose' : 'cyan'}
                        hint={a.tareas_vencidas > 0 ? `${a.tareas_vencidas} vencidas` : undefined}
                      />
                      <Stat icon={CalendarClock} value={a.audiencias_proximas} label="Audiencias" tone="violet" />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 flex justify-end">
          <Link
            to="/expedientes"
            className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            Ver todos los expedientes del estudio →
          </Link>
        </div>
      </div>
    </section>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  tone: 'amber' | 'cyan' | 'violet' | 'rose'
  hint?: string
}) {
  const toneClasses: Record<string, string> = {
    amber: 'text-amber-600 dark:text-amber-300',
    cyan: 'text-cyan-600 dark:text-cyan-300',
    violet: 'text-violet-600 dark:text-violet-300',
    rose: 'text-rose-600 dark:text-rose-300',
  }
  return (
    <div className="flex flex-col items-end gap-0.5" title={hint || label}>
      <div className={cn('flex items-center gap-1 font-bold', toneClasses[tone])}>
        <Icon className="h-3 w-3" />
        <span className="text-sm">{value}</span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hidden sm:inline">
        {hint ?? label}
      </span>
    </div>
  )
}
