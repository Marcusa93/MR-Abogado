import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { isDirector } from '@/lib/utils/display-rol'
import { Briefcase, Edit2, Check, X, Loader2 } from 'lucide-react'
import { toast } from '@/stores/toast-store'

interface Props {
  expedienteId: string
  abogadoResponsableId: string | null
  abogadoResponsableLabel: string | null
}

export function AbogadoResponsableSelector({
  expedienteId,
  abogadoResponsableId,
  abogadoResponsableLabel,
}: Props) {
  const profile = useAuthStore((s) => s.profile)
  const supabase = createClient()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(abogadoResponsableId)

  const canEdit = isDirector(profile)

  const { data: abogados } = useQuery({
    queryKey: ['abogados-list'],
    enabled: editing,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, rol')
        .in('rol', ['DIRECTOR', 'ABOGADO', 'COLABORADOR'])
        .order('apellido', { ascending: true })
      return (data ?? []) as Array<{ id: string; nombre: string; apellido: string; rol: string }>
    },
  })

  const updateMut = useMutation({
    mutationFn: async (newId: string | null) => {
      const { error } = await supabase
        .from('expedientes')
        .update({ abogado_responsable_id: newId } as never)
        .eq('id', expedienteId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Abogado responsable actualizado')
      qc.invalidateQueries({ queryKey: ['expedientes'] })
      qc.invalidateQueries({ queryKey: ['abogados-stats'] })
      setEditing(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar')
    },
  })

  return (
    <div className="flex items-start gap-2.5">
      <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-zinc-600 dark:text-zinc-300">
          Abogado responsable
        </p>
        {!editing ? (
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {abogadoResponsableLabel || (
                <span className="italic text-zinc-500 dark:text-zinc-400">Sin asignar</span>
              )}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setPendingId(abogadoResponsableId); setEditing(true) }}
                className="rounded p-1 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Cambiar abogado responsable"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <select
              value={pendingId ?? ''}
              onChange={(e) => setPendingId(e.target.value || null)}
              className="rounded-lg border border-white/10 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="">— Sin asignar —</option>
              {(abogados ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.apellido}, {a.nombre} ({a.rol === 'DIRECTOR' ? 'Director' : a.rol === 'ABOGADO' ? 'Abogado' : 'Colab.'})
                </option>
              ))}
            </select>
            <button
              onClick={() => updateMut.mutate(pendingId)}
              disabled={updateMut.isPending}
              className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-30"
              title="Guardar"
            >
              {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={updateMut.isPending}
              className="rounded p-1 text-zinc-500 hover:bg-white/5"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
