import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, ChevronRight, FileText, Loader2, Plus, X } from 'lucide-react'
import {
  useTareasRecurrentesAdmin, useCreateTareaRecurrente, useDeleteTareaRecurrente, type TareaRecurrente,
} from '@/hooks/use-tareas-recurrentes'
import { usePropuestas } from '@/hooks/use-editorial'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/stores/toast-store'

// Piezas de gestión que antes estaban en Inicio y ahora viven en Dirección.

const FRECUENCIA_LABEL: Record<string, string> = {
  diaria: 'Diaria',
  'lun-vie': 'Lun–Vie',
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
}

// ---------------------------------------------------------------------------
// Admin checklist panel
// ---------------------------------------------------------------------------

interface PerfilAdmin {
  id: string
  nombre: string | null
  apellido: string | null
  activo: boolean
}

function usePerfilesActivos() {
  const supabase = createClient()
  return useQuery<PerfilAdmin[]>({
    queryKey: ['perfiles-activos-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, activo')
        .eq('activo', true)
        .order('apellido', { ascending: true })
      if (error) throw error
      return (data ?? []) as PerfilAdmin[]
    },
    staleTime: 5 * 60_000,
  })
}

export function RutinasEquipo() {
  const [open, setOpen] = useState(false)
  const [addingForPerfil, setAddingForPerfil] = useState<string | null>(null)
  const [newTitulo, setNewTitulo] = useState('')
  const [newFrecuencia, setNewFrecuencia] = useState<TareaRecurrente['frecuencia']>('lun-vie')

  const { data: perfiles = [] } = usePerfilesActivos()
  const { data: tareasAdmin = [] } = useTareasRecurrentesAdmin()
  const crear = useCreateTareaRecurrente()
  const borrar = useDeleteTareaRecurrente()

  async function handleCrear(perfilId: string) {
    if (!newTitulo.trim()) return
    try {
      await crear.mutateAsync({ perfil_id: perfilId, titulo: newTitulo.trim(), frecuencia: newFrecuencia })
      setNewTitulo('')
      setAddingForPerfil(null)
    } catch {
      toast.error('No se pudo crear la tarea')
    }
  }

  async function handleBorrar(id: string) {
    if (!window.confirm('¿Eliminar esta tarea recurrente?')) return
    try {
      await borrar.mutateAsync(id)
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/30 mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Gestionar rutinas del equipo</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 space-y-4 pt-3">
          {perfiles.map(perfil => {
            const tareasPerfil = tareasAdmin.filter(t => t.perfil_id === perfil.id)
            return (
              <div key={perfil.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-300">
                    {[perfil.apellido, perfil.nombre].filter(Boolean).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setAddingForPerfil(perfil.id); setNewTitulo(''); setNewFrecuencia('lun-vie') }}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                  >
                    <Plus className="h-3 w-3" /> Nueva tarea
                  </button>
                </div>
                <div className="space-y-1">
                  {tareasPerfil.map(t => (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
                      <span className="flex-1 text-xs text-zinc-200">{t.titulo}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{FRECUENCIA_LABEL[t.frecuencia]}</span>
                      <button
                        type="button"
                        onClick={() => handleBorrar(t.id)}
                        className="shrink-0 text-zinc-600 hover:text-rose-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {tareasPerfil.length === 0 && (
                    <p className="text-[11px] text-zinc-600 pl-1">Sin tareas configuradas</p>
                  )}
                </div>
                {addingForPerfil === perfil.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newTitulo}
                      onChange={e => setNewTitulo(e.target.value)}
                      placeholder="Título de la tarea"
                      autoFocus
                      className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <select
                      value={newFrecuencia}
                      onChange={e => setNewFrecuencia(e.target.value as TareaRecurrente['frecuencia'])}
                      className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none"
                    >
                      {Object.entries(FRECUENCIA_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleCrear(perfil.id)}
                      disabled={crear.isPending || !newTitulo.trim()}
                      className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {crear.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Agregar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingForPerfil(null)}
                      className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Propuestas editoriales nuevas (solo quien tiene acceso editorial). */
export function AvisoEditorial() {
  const { data: propuestas = [] } = usePropuestas()
  const nuevas = propuestas.filter((p) => p.estado === 'propuesta')
  if (nuevas.length === 0) return null
  const deSentencia = nuevas.filter((p) => p.origen === 'sentencia').length
  return (
    <Link to="/editorial" className="dashboard-panel flex items-center gap-3 rounded-[1.25rem] px-4 py-3 hover:opacity-90">
      <FileText className="h-4 w-4 shrink-0 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" />
      <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">
        <span className="font-semibold">{nuevas.length} {nuevas.length === 1 ? 'propuesta editorial' : 'propuestas editoriales'}</span>
        {deSentencia > 0 && ` (${deSentencia} por ${deSentencia === 1 ? 'una sentencia nueva' : 'sentencias nuevas'})`}
        <span className="text-zinc-500"> · {nuevas[0].titulo.slice(0, 80)}{nuevas.length > 1 ? '…' : ''}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-zinc-400" />
    </Link>
  )
}

