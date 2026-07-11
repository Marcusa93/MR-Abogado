import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { List, Loader2, Check, X, Pencil, Trash2, MapPin, ToggleLeft, ToggleRight } from 'lucide-react'

type CatalogoTable = 'tipos_tramite' | 'organismos' | 'catalogo_tipos_tarea' | 'catalogo_tipos_audiencia'

/** Converts snake_case to readable: "contactar_cliente" → "Contactar cliente" */
function formatSnakeCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function CatalogoEditor({
  tableName,
  title,
  icon: IconComponent,
  showAddress = false,
  formatNames = false,
}: {
  tableName: CatalogoTable
  title: string
  icon: typeof List
  showAddress?: boolean
  formatNames?: boolean
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; nombre: string } | null>(null)

  const { data: items, isLoading } = useQuery({
    queryKey: ['catalogo', tableName],
    queryFn: async () => {
      const select = showAddress ? 'id, nombre, activo, direccion' : 'id, nombre, activo'
      const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data as unknown as { id: string; nombre: string; activo?: boolean; direccion?: string }[]).map(item => ({
        ...item,
        activo: item.activo ?? true,
      }))
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ activo } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
    },
  })

  const renameItem = useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ nombre } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
      setEditingId(null)
    },
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
    },
  })

  const addItem = useMutation({
    mutationFn: async (nombre: string) => {
      // Build base payload per table
      let payload: Record<string, unknown>
      if (tableName === 'tipos_tramite') {
        // tipos_tramite requires a unique NOT NULL `codigo` slug
        const slug = nombre
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '') // strip accents
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        const codigo = slug || `tipo_${Date.now()}`
        payload = { nombre, codigo, activo: true }
      } else {
        payload = { nombre, activo: true }
      }

      const { error } = await supabase.from(tableName).insert(payload as any)

      // Retry with a disambiguating suffix if codigo collides
      if (error && tableName === 'tipos_tramite' && error.code === '23505') {
        const suffix = Date.now().toString(36)
        const retryPayload = { ...payload, codigo: `${payload.codigo}_${suffix}` }
        const { error: retryError } = await supabase
          .from(tableName)
          .insert(retryPayload as any)
        if (retryError) throw retryError
        return
      }
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
      setNewItem('')
    },
  })

  const handleAdd = () => {
    if (!newItem.trim()) return
    addItem.mutate(newItem.trim())
  }

  const startEdit = (id: string, nombre: string) => {
    setEditingId(id)
    setEditingName(nombre)
  }

  const saveEdit = () => {
    if (!editingId || !editingName.trim()) return
    renameItem.mutate({ id: editingId, nombre: editingName.trim() })
  }

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <IconComponent className="h-5 w-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <span className="ml-auto text-[10px] text-zinc-600 dark:text-zinc-300">{items?.length ?? 0}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-300" />
        </div>
      ) : (
        <div className="space-y-1">
          {(items ?? []).map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <button
                onClick={() =>
                  toggleActive.mutate({ id: item.id, activo: !item.activo })
                }
                className={cn(
                  'shrink-0 transition-colors',
                  item.activo ? 'text-amber-400' : 'text-zinc-600 dark:text-zinc-300'
                )}
                title={item.activo ? 'Desactivar' : 'Activar'}
              >
                {item.activo ? (
                  <ToggleRight className="h-5 w-5" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>

              {editingId === item.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className="h-7 flex-1 rounded border border-amber-500/30 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                  <button onClick={saveEdit} className="text-amber-400 hover:text-amber-300"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <span className={cn('text-sm', item.activo ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300 line-through')}>
                    {formatNames ? formatSnakeCase(item.nombre) : item.nombre}
                  </span>
                  {showAddress && (item as any).direccion && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-700 dark:text-zinc-300 mt-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {(item as any).direccion}
                    </div>
                  )}
                </div>
              )}

              {/* Edit/delete — visible on hover */}
              {editingId !== item.id && (
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(item.id, item.nombre)}
                    className="rounded p-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ id: item.id, nombre: formatNames ? formatSnakeCase(item.nombre) : item.nombre })}
                    className="rounded p-1 text-zinc-600 dark:text-zinc-300 hover:text-rose-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add new */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Agregar nuevo..."
              className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              onClick={handleAdd}
              disabled={!newItem.trim() || addItem.isPending}
              className="rounded-lg bg-gradient-cyan px-2.5 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
            >
              {addItem.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Agregar'
              )}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { deleteItem.mutate(deleteConfirm!.id); setDeleteConfirm(null) }}
        title="Eliminar elemento"
        description={`¿Eliminar "${deleteConfirm?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteItem.isPending}
      />
    </div>
  )
}
