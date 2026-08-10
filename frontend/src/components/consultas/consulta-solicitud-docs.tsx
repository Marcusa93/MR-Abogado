import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  useSolicitudesDocs, useCreateSolicitudDoc, useUpdateSolicitudDoc, useDeleteSolicitudDoc,
  type SolicitudDoc,
} from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { Plus, Trash2, Check, X, Loader2, FileSearch } from 'lucide-react'

interface Props {
  consultaId: string
}

const ESTADO_LABEL: Record<SolicitudDoc['estado'], string> = {
  pendiente: 'Pendiente',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
}

const ESTADO_STYLE: Record<SolicitudDoc['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  recibido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelado: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

function useTeamProfiles() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, rol')
        .eq('activo', true)
        .order('apellido', { ascending: true })
      return (data ?? []) as Array<{ id: string; nombre: string | null; apellido: string | null; rol: string }>
    },
    staleTime: 5 * 60_000,
  })
}

function NuevaSolicitudForm({ consultaId, onDone }: { consultaId: string; onDone: () => void }) {
  const [descripcion, setDescripcion] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const create = useCreateSolicitudDoc()
  const { data: profiles = [] } = useTeamProfiles()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descripcion.trim()) return
    try {
      await create.mutateAsync({
        consulta_id: consultaId,
        descripcion: descripcion.trim(),
        responsable_id: responsableId || null,
        fecha_limite: fechaLimite || null,
      })
      toast.success('Solicitud creada')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-dashed border-zinc-300 dark:border-white/10 rounded-xl p-4 space-y-3 bg-zinc-50 dark:bg-zinc-800/30">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Nueva solicitud</p>
      <div className="space-y-1">
        <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Documento solicitado *</label>
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Ej: DNI del actor, contrato de trabajo firmado, recibos de sueldo últimos 6 meses…"
          rows={2}
          required
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Responsable</label>
          <select
            value={responsableId}
            onChange={e => setResponsableId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Sin asignar</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {[p.apellido, p.nombre].filter(Boolean).join(', ')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Fecha límite</label>
          <input
            type="date"
            value={fechaLimite}
            onChange={e => setFechaLimite(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!descripcion.trim() || create.isPending}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}

function SolicitudDocItem({ doc, consultaId }: { doc: SolicitudDoc; consultaId: string }) {
  const update = useUpdateSolicitudDoc()
  const remove = useDeleteSolicitudDoc()

  async function marcarRecibido() {
    try {
      await update.mutateAsync({ id: doc.id, consulta_id: consultaId, estado: 'recibido' })
      toast.success('Documento marcado como recibido')
    } catch { toast.error('No se pudo actualizar') }
  }

  async function cancelar() {
    try {
      await update.mutateAsync({ id: doc.id, consulta_id: consultaId, estado: 'cancelado' })
    } catch { toast.error('No se pudo cancelar') }
  }

  async function eliminar() {
    if (!window.confirm('¿Eliminar esta solicitud?')) return
    try {
      await remove.mutateAsync({ id: doc.id, consulta_id: consultaId })
    } catch { toast.error('No se pudo eliminar') }
  }

  const responsableLabel = doc.responsable_profile
    ? [doc.responsable_profile.apellido, doc.responsable_profile.nombre].filter(Boolean).join(', ')
    : null

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border transition-colors',
      doc.estado === 'recibido' ? 'border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10' :
      doc.estado === 'cancelado' ? 'border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-800/20 opacity-60' :
      'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60',
    )}>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-zinc-800 dark:text-zinc-200', doc.estado !== 'pendiente' && 'line-through text-zinc-400 dark:text-zinc-500')}>
          {doc.descripcion}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span className={cn('rounded-full px-2 py-0.5 font-medium', ESTADO_STYLE[doc.estado])}>
            {ESTADO_LABEL[doc.estado]}
          </span>
          {responsableLabel && <span>→ {responsableLabel}</span>}
          {doc.fecha_limite && <span>Límite: {doc.fecha_limite}</span>}
        </div>
      </div>
      {doc.estado === 'pendiente' && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Marcar como recibido"
            onClick={marcarRecibido}
            disabled={update.isPending}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            title="Cancelar solicitud"
            onClick={cancelar}
            disabled={update.isPending}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Eliminar solicitud"
            onClick={eliminar}
            disabled={remove.isPending}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
          >
            {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

export function ConsultaSolicitudDocs({ consultaId }: Props) {
  const { data: solicitudes = [], isLoading } = useSolicitudesDocs(consultaId)
  const [agregando, setAgregando] = useState(false)

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente').length
  const total = solicitudes.length

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Documentación solicitada</h2>
          {total > 0 && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {pendientes > 0 ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : 'Todo recibido'}
            </span>
          )}
        </div>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="space-y-2">
          {solicitudes.map(doc => (
            <SolicitudDocItem key={doc.id} doc={doc} consultaId={consultaId} />
          ))}
          {solicitudes.length === 0 && !agregando && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-1">
              Sin solicitudes de documentación todavía.
            </p>
          )}
          {agregando && (
            <NuevaSolicitudForm consultaId={consultaId} onDone={() => setAgregando(false)} />
          )}
        </div>
      )}
    </div>
  )
}
