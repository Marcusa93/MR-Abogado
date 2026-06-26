import { useState, useMemo } from 'react'
import {
  Sparkles, Plus, Edit2, Trash2, Loader2, X, FileText,
  Instagram, Linkedin, Facebook, Twitter, Mail, Send, MessageSquare,
  BookOpen, Video, Hash, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  useContenidos, useCreateContenido, useUpdateContenido, useDeleteContenido,
  CATEGORIAS_CONTENIDO, ESTADOS_CONTENIDO,
  type Contenido, type CategoriaContenido, type EstadoContenido,
} from '@/hooks/use-contenidos'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_CONTENIDO.map(c => [c.value, c.label])
)

const ESTADO_LABEL: Record<string, string> = Object.fromEntries(
  ESTADOS_CONTENIDO.map(e => [e.value, e.label])
)

const ESTADO_CLS: Record<EstadoContenido, string> = {
  borrador: 'bg-zinc-500/15 text-zinc-300',
  en_revision: 'bg-amber-500/15 text-amber-300',
  aprobado: 'bg-emerald-500/15 text-emerald-300',
  publicado: 'bg-violet-500/15 text-violet-300',
  archivado: 'bg-rose-500/10 text-rose-400',
}

const CATEGORIA_ICON: Record<CategoriaContenido, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  twitter: Twitter,
  newsletter: Mail,
  email_cliente: Send,
  whatsapp_difusion: MessageSquare,
  blog: BookOpen,
  video_guion: Video,
  otro: FileText,
}

export default function ContenidosPage() {
  const [filterCategoria, setFilterCategoria] = useState<CategoriaContenido | 'all'>('all')
  const [filterEstado, setFilterEstado] = useState<EstadoContenido | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contenido | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [view, setView] = useState<'tablero' | 'lista'>('tablero')

  const { data: contenidos = [], isLoading } = useContenidos({
    categoria: filterCategoria === 'all' ? null : filterCategoria,
    estado: filterEstado === 'all' ? null : filterEstado,
  })
  const deleteContenido = useDeleteContenido()

  const countsByEstado = useMemo(() => {
    const c: Partial<Record<EstadoContenido, number>> = {}
    for (const item of contenidos) c[item.estado] = (c[item.estado] ?? 0) + 1
    return c
  }, [contenidos])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Contenidos' }]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Contenidos del estudio
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Borradores y posts para redes, newsletters, emails y otras comunicaciones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle vista */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              onClick={() => setView('tablero')}
              className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'tablero' ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-zinc-200')}
              title="Vista tablero"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Tablero
            </button>
            <button
              onClick={() => setView('lista')}
              className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'lista' ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-zinc-200')}
              title="Vista lista"
            >
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/25 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo contenido
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterEstado('all')}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                filterEstado === 'all' ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              )}
            >
              Todos ({contenidos.length})
            </button>
            {ESTADOS_CONTENIDO.map((e) => (
              <button
                key={e.value}
                onClick={() => setFilterEstado(e.value)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  filterEstado === e.value ? `${ESTADO_CLS[e.value]} ring-1 ring-current` : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                )}
              >
                {e.label} {countsByEstado[e.value] ? `(${countsByEstado[e.value]})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterCategoria('all')}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                filterCategoria === 'all' ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              )}
            >
              Todas
            </button>
            {CATEGORIAS_CONTENIDO.map((c) => {
              const Icon = CATEGORIA_ICON[c.value]
              return (
                <button
                  key={c.value}
                  onClick={() => setFilterCategoria(c.value)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    filterCategoria === c.value ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : contenidos.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Sin contenidos"
          description="Creá tu primer borrador para redes, newsletter o comunicación a clientes."
          actionLabel="Nuevo contenido"
          onAction={() => { setEditing(null); setDialogOpen(true) }}
        />
      ) : view === 'tablero' ? (
        <ContenidoBoard
          contenidos={contenidos}
          onEdit={(c) => { setEditing(c); setDialogOpen(true) }}
          onDelete={(id) => setConfirmDelete(id)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contenidos.map((c) => {
            const Icon = CATEGORIA_ICON[c.categoria]
            return (
              <div
                key={c.id}
                className="rounded-xl border border-white/10 bg-zinc-900/30 p-4 hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">
                    <Icon className="h-3 w-3" />
                    {CATEGORIA_LABEL[c.categoria]}
                  </span>
                  <span className={cn('rounded-full px-1.5 py-0 text-[10px] font-medium', ESTADO_CLS[c.estado])}>
                    {ESTADO_LABEL[c.estado]}
                  </span>
                </div>

                <h3 className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight mb-2">{c.titulo}</h3>

                {c.cuerpo && (
                  <p className="text-[11px] text-zinc-500 line-clamp-3 leading-relaxed mb-2">{c.cuerpo}</p>
                )}

                {c.hashtags && (
                  <div className="flex items-center gap-1 mb-2">
                    <Hash className="h-3 w-3 text-cyan-400 shrink-0" />
                    <p className="text-[10px] text-cyan-400/80 line-clamp-1">{c.hashtags}</p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <p className="text-[10px] text-zinc-500">
                    {c.publicar_el
                      ? <>📅 {formatDate(c.publicar_el)}</>
                      : `Editado ${formatDate(c.updated_at)}`}
                  </p>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditing(c); setDialogOpen(true) }}
                      className="rounded p-1 text-zinc-500 hover:text-cyan-400"
                      title="Editar"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      className="rounded p-1 text-zinc-500 hover:text-rose-400"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogOpen && <ContenidoDialog editing={editing} onClose={() => { setDialogOpen(false); setEditing(null) }} />}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteContenido.mutateAsync(confirmDelete); toast.success('Contenido eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
          setConfirmDelete(null)
        }}
        title="Eliminar contenido"
        description="¿Seguro? Podés archivarlo en su lugar para mantener el historial."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}

// ── Vista tablero (Trello/Asana): columnas por estado ───────────────────────
function ContenidoBoard({ contenidos, onEdit, onDelete }: {
  contenidos: Contenido[]
  onEdit: (c: Contenido) => void
  onDelete: (id: string) => void
}) {
  const update = useUpdateContenido()
  const orden = ESTADOS_CONTENIDO.map((e) => e.value)
  const mover = (c: Contenido, dir: -1 | 1) => {
    const next = orden[orden.indexOf(c.estado) + dir]
    if (!next || next === c.estado) return
    update.mutate({ id: c.id, estado: next })
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
      {ESTADOS_CONTENIDO.map((e) => {
        const items = contenidos.filter((c) => c.estado === e.value)
        return (
          <div key={e.value} className="rounded-xl border border-white/10 bg-zinc-900/20 p-2">
            <div className="flex items-center justify-between px-1 py-1.5 mb-1">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', ESTADO_CLS[e.value])}>
                {e.label}
              </span>
              <span className="text-[10px] text-zinc-500">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((c) => (
                <BoardCard key={c.id} c={c} orden={orden} onEdit={onEdit} onDelete={onDelete} onMover={mover} disabled={update.isPending} />
              ))}
              {items.length === 0 && <p className="px-1 py-3 text-center text-[10px] text-zinc-600">—</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BoardCard({ c, orden, onEdit, onDelete, onMover, disabled }: {
  c: Contenido
  orden: EstadoContenido[]
  onEdit: (c: Contenido) => void
  onDelete: (id: string) => void
  onMover: (c: Contenido, dir: -1 | 1) => void
  disabled: boolean
}) {
  const Icon = CATEGORIA_ICON[c.categoria]
  const i = orden.indexOf(c.estado)
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-2.5 group">
      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 mb-1.5">
        <Icon className="h-3 w-3" /> {CATEGORIA_LABEL[c.categoria]}
      </span>
      <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-tight mb-1.5">{c.titulo}</p>
      {c.publicar_el && <p className="text-[10px] text-zinc-500 mb-1.5">📅 {formatDate(c.publicar_el)}</p>}
      <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/5">
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMover(c, -1)} disabled={disabled || i <= 0}
            className="rounded p-1 text-zinc-500 hover:text-violet-300 disabled:opacity-30 disabled:hover:text-zinc-500" title="Mover atrás">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMover(c, 1)} disabled={disabled || i >= orden.length - 1}
            className="rounded p-1 text-zinc-500 hover:text-violet-300 disabled:opacity-30 disabled:hover:text-zinc-500" title="Mover adelante">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(c)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={() => onDelete(c.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ContenidoDialog({ editing, onClose }: { editing: Contenido | null; onClose: () => void }) {
  const { user } = useAuth()
  const createContenido = useCreateContenido()
  const updateContenido = useUpdateContenido()

  const [titulo, setTitulo] = useState(editing?.titulo ?? '')
  const [categoria, setCategoria] = useState<CategoriaContenido>(editing?.categoria ?? 'instagram')
  const [estado, setEstado] = useState<EstadoContenido>(editing?.estado ?? 'borrador')
  const [cuerpo, setCuerpo] = useState(editing?.cuerpo ?? '')
  const [hashtags, setHashtags] = useState(editing?.hashtags ?? '')
  const [publicarEl, setPublicarEl] = useState(editing?.publicar_el ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !titulo.trim()) return
    try {
      if (editing) {
        await updateContenido.mutateAsync({
          id: editing.id,
          titulo: titulo.trim(),
          categoria,
          estado,
          cuerpo: cuerpo.trim() || null,
          hashtags: hashtags.trim() || null,
          publicar_el: publicarEl || null,
        })
        toast.success('Contenido actualizado')
      } else {
        await createContenido.mutateAsync({
          titulo: titulo.trim(),
          categoria,
          cuerpo: cuerpo.trim() || null,
          hashtags: hashtags.trim() || null,
          publicar_el: publicarEl || null,
          created_by: user.id,
        })
        toast.success('Contenido creado')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const isPending = createContenido.isPending || updateContenido.isPending

  const inputCls = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/40 focus:outline-none focus:ring-1 focus:ring-violet-500/20'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 sticky top-0 bg-zinc-900/95 backdrop-blur">
          <h3 className="text-sm font-semibold text-zinc-100">{editing ? 'Editar contenido' : 'Nuevo contenido'}</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Título</label>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required autoFocus className={inputCls} placeholder="Ej: Tips para divorcios express" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaContenido)} className={inputCls}>
                {CATEGORIAS_CONTENIDO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {editing && (
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Estado</label>
                <select value={estado} onChange={e => setEstado(e.target.value as EstadoContenido)} className={inputCls}>
                  {ESTADOS_CONTENIDO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
            )}
            {!editing && (
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Publicar el (opcional)</label>
                <input type="date" value={publicarEl} onChange={e => setPublicarEl(e.target.value)} className={inputCls} />
              </div>
            )}
          </div>

          {editing && (
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Publicar el (opcional)</label>
              <input type="date" value={publicarEl} onChange={e => setPublicarEl(e.target.value)} className={inputCls} />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Contenido</label>
            <textarea
              value={cuerpo}
              onChange={e => setCuerpo(e.target.value)}
              rows={8}
              className={inputCls}
              placeholder="Escribí el texto del post, email o newsletter…"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Hashtags (opcional)</label>
            <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)} className={inputCls} placeholder="#abogados #derecho #tucuman" />
          </div>

          <button
            type="submit"
            disabled={isPending || !titulo.trim()}
            className="w-full rounded-md bg-violet-500/15 px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Guardar cambios' : 'Crear contenido'}
          </button>
        </form>
      </div>
    </div>
  )
}
