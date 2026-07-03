import { useState, useMemo, useRef } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent,
} from '@dnd-kit/core'
import {
  Sparkles, Plus, Edit2, Trash2, Loader2, X, FileText,
  Instagram, Linkedin, Facebook, Twitter, Mail, Send, MessageSquare,
  BookOpen, Video, Hash, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight,
  CalendarDays, FolderOpen, ImagePlus, Clock,
} from 'lucide-react'
import {
  useContenidos, useCreateContenido, useUpdateContenido, useDeleteContenido,
  useGenerarContenidoDesdeVideo, useUploadContenidoImagen,
  CATEGORIAS_CONTENIDO, ESTADOS_CONTENIDO,
  type Contenido, type CategoriaContenido, type EstadoContenido,
} from '@/hooks/use-contenidos'
import { useGoogleDriveStatus, startGoogleDriveOAuth } from '@/hooks/use-google-drive'
import { createClient } from '@/lib/supabase/client'
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

const HORARIOS_TIPS: Partial<Record<CategoriaContenido, string>> = {
  instagram: 'Mejor alcance: ma–ju entre 9 y 11h o 18–20h. Evitá lunes.',
  linkedin: 'Mejor alcance: ma–ju entre 8 y 10h (antes del horario laboral). Viernes bajo.',
  facebook: 'Mejor alcance: martes y miércoles entre 13 y 16h.',
  twitter: 'Mejor alcance: lu–vi entre 12 y 15h.',
  newsletter: 'Mejor apertura: martes o miércoles entre 10 y 11h.',
  email_cliente: 'Mejor apertura: ma–ju entre 10 y 11h.',
  whatsapp_difusion: 'Mejor: ma–ju a las 11h o 19h. Evitá sábados y domingos.',
  blog: 'Sin horario crítico. Martes o miércoles para mejor indexación.',
}

// ── Google Picker (Drive) para elegir un video ──────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const gapi: any
let gapiPickerPromise: Promise<void> | null = null
function loadGooglePicker(): Promise<void> {
  if (gapiPickerPromise) return gapiPickerPromise
  gapiPickerPromise = (async () => {
    await new Promise<void>((resolve, reject) => {
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) { resolve(); return }
      const s = document.createElement('script')
      s.src = 'https://apis.google.com/js/api.js'; s.async = true; s.defer = true
      s.onload = () => resolve(); s.onerror = () => reject(new Error('No se pudo cargar Google API'))
      document.head.appendChild(s)
    })
    await new Promise<void>((resolve) => gapi.load('picker', () => resolve()))
  })()
  return gapiPickerPromise
}

function DriveVideoButton({ onPicked, disabled }: { onPicked: (fileId: string) => void; disabled?: boolean }) {
  const { data: status } = useGoogleDriveStatus()
  const [loading, setLoading] = useState(false)
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined
  if (!apiKey) return null

  if (!status?.connected) {
    return (
      <button
        type="button"
        onClick={() => startGoogleDriveOAuth().catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo iniciar la conexión con Drive'))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
        title="Conectá tu Google Drive para elegir videos"
      >
        <FolderOpen className="h-4 w-4" /> Conectar Drive
      </button>
    )
  }

  const handleClick = async () => {
    try {
      setLoading(true)
      await loadGooglePicker()
      const supabase = createClient()
      const { data: tokenData, error } = await supabase.functions.invoke('drive-get-token', { body: {} })
      if (error || !(tokenData as { access_token?: string })?.access_token) {
        throw new Error((tokenData as { error?: string })?.error || 'No se pudo obtener token de Drive')
      }
      const driveToken = (tokenData as { access_token: string }).access_token
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS)
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(driveToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
          if (data.action === 'picked' && data.docs?.[0]) onPicked(data.docs[0].id)
        })
        .build()
      picker.setVisible(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error abriendo Drive')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
      title="Elegir un video de tu Drive"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />} Desde Drive
    </button>
  )
}

export default function ContenidosPage() {
  const [filterCategoria, setFilterCategoria] = useState<CategoriaContenido | 'all'>('all')
  const [filterEstado, setFilterEstado] = useState<EstadoContenido | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contenido | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [view, setView] = useState<'tablero' | 'calendario' | 'lista'>('tablero')
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [genStage, setGenStage] = useState<string | null>(null)
  const generar = useGenerarContenidoDesdeVideo()

  const runGenerar = (input: { file?: File; driveFileId?: string }) => {
    generar.mutate(
      { ...input, onStage: setGenStage },
      {
        onSuccess: (r) => { setGenStage(null); toast.success(`${r.created} ${r.created === 1 ? 'tarjeta generada' : 'tarjetas generadas'} desde el video`) },
        onError: (e) => { setGenStage(null); toast.error(e instanceof Error ? e.message : 'No se pudo generar') },
      },
    )
  }
  const handleVideo = (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      toast.error('El video supera 200 MB. Recortalo o comprimilo antes (los videos editados para redes suelen ser más livianos).')
      return
    }
    runGenerar({ file })
  }

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
              onClick={() => setView('calendario')}
              className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'calendario' ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-zinc-200')}
              title="Vista calendario"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendario
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
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideo(f); e.target.value = '' }}
          />
          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={generar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
            title="Generar borradores por plataforma a partir de un video (subida directa)"
          >
            {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Desde video
          </button>
          <DriveVideoButton onPicked={(fileId) => runGenerar({ driveFileId: fileId })} disabled={generar.isPending} />
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/25 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo contenido
          </button>
        </div>
      </div>

      {genStage && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2 text-xs text-cyan-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {genStage} — puede tardar 1-2 min, no cierres la pestaña.
        </div>
      )}

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
      ) : view === 'calendario' ? (
        <ContenidoCalendar
          contenidos={contenidos}
          onEdit={(c) => { setEditing(c); setDialogOpen(true) }}
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
                {c.imagen_url && (
                  <img src={c.imagen_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3" loading="lazy" />
                )}
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

// ── Vista calendario: grilla mensual por fecha de publicación ───────────────
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function ContenidoCalendar({ contenidos, onEdit }: {
  contenidos: Contenido[]
  onEdit: (c: Contenido) => void
}) {
  const hoy = new Date()
  const [cursor, setCursor] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() })
  const { y, m } = cursor
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = (d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
  const todayStr = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`

  const byDate = useMemo(() => {
    const map: Record<string, Contenido[]> = {}
    for (const c of contenidos) if (c.publicar_el) (map[c.publicar_el] ??= []).push(c)
    return map
  }, [contenidos])
  const sinFecha = useMemo(() => contenidos.filter((c) => !c.publicar_el), [contenidos])

  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7 // Lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => setCursor((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const next = () => setCursor((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">{MESES[m]} {y}</h2>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="rounded-md border border-white/10 bg-white/5 p-1.5 text-zinc-300 hover:bg-white/10" title="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setCursor({ y: hoy.getFullYear(), m: hoy.getMonth() })} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10">Hoy</button>
          <button onClick={next} className="rounded-md border border-white/10 bg-white/5 p-1.5 text-zinc-300 hover:bg-white/10" title="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="bg-zinc-900/60 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">{d}</div>
        ))}
        {cells.map((d, i) => {
          const items = d ? (byDate[dateStr(d)] ?? []) : []
          const esHoy = d != null && dateStr(d) === todayStr
          return (
            <div key={i} className={cn('min-h-[92px] bg-zinc-950/40 p-1.5', !d && 'opacity-40')}>
              {d && (
                <>
                  <div className={cn('mb-1 text-[11px]', esHoy ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/30 font-semibold text-violet-200' : 'text-zinc-500')}>{d}</div>
                  <div className="space-y-1">
                    {items.map((c) => {
                      const Icon = CATEGORIA_ICON[c.categoria]
                      return (
                        <button
                          key={c.id}
                          onClick={() => onEdit(c)}
                          className={cn('flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[10px] leading-tight transition-all hover:brightness-125', ESTADO_CLS[c.estado])}
                          title={`${c.titulo} · ${ESTADO_LABEL[c.estado]}`}
                        >
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{c.titulo}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {sinFecha.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
            Sin fecha de publicación ({sinFecha.length}) — abrí cada uno y asignale fecha
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sinFecha.map((c) => {
              const Icon = CATEGORIA_ICON[c.categoria]
              return (
                <button
                  key={c.id}
                  onClick={() => onEdit(c)}
                  className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all hover:brightness-125', ESTADO_CLS[c.estado])}
                  title={ESTADO_LABEL[c.estado]}
                >
                  <Icon className="h-3 w-3" /> <span className="max-w-[160px] truncate">{c.titulo}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vista tablero (Trello/Asana): columnas por estado, drag & drop ──────────
function ContenidoBoard({ contenidos, onEdit, onDelete }: {
  contenidos: Contenido[]
  onEdit: (c: Contenido) => void
  onDelete: (id: string) => void
}) {
  const update = useUpdateContenido()
  const orden = ESTADOS_CONTENIDO.map((e) => e.value)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const setEstado = (c: Contenido, estado: EstadoContenido) => {
    if (estado === c.estado || !orden.includes(estado)) return
    update.mutate({ id: c.id, estado })
  }
  const mover = (c: Contenido, dir: -1 | 1) => {
    const next = orden[orden.indexOf(c.estado) + dir]
    if (next) setEstado(c, next)
  }
  const onDragEnd = (event: DragEndEvent) => {
    const c = event.active.data.current?.contenido as Contenido | undefined
    const estado = event.over?.id as EstadoContenido | undefined
    if (c && estado) setEstado(c, estado)
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
        {ESTADOS_CONTENIDO.map((e) => (
          <BoardColumn
            key={e.value}
            estado={e.value}
            label={e.label}
            items={contenidos.filter((c) => c.estado === e.value)}
            orden={orden}
            onEdit={onEdit}
            onDelete={onDelete}
            onMover={mover}
            disabled={update.isPending}
          />
        ))}
      </div>
    </DndContext>
  )
}

function BoardColumn({ estado, label, items, orden, onEdit, onDelete, onMover, disabled }: {
  estado: EstadoContenido
  label: string
  items: Contenido[]
  orden: EstadoContenido[]
  onEdit: (c: Contenido) => void
  onDelete: (id: string) => void
  onMover: (c: Contenido, dir: -1 | 1) => void
  disabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-xl border p-2 transition-colors', isOver ? 'border-violet-400/50 bg-violet-500/[0.06]' : 'border-white/10 bg-zinc-900/20')}
    >
      <div className="flex items-center justify-between px-1 py-1.5 mb-1">
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', ESTADO_CLS[estado])}>
          {label}
        </span>
        <span className="text-[10px] text-zinc-500">{items.length}</span>
      </div>
      <div className="space-y-2 min-h-[44px]">
        {items.map((c) => (
          <BoardCard key={c.id} c={c} orden={orden} onEdit={onEdit} onDelete={onDelete} onMover={onMover} disabled={disabled} />
        ))}
        {items.length === 0 && <p className="px-1 py-3 text-center text-[10px] text-zinc-600">Soltá una tarjeta acá</p>}
      </div>
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, data: { contenido: c } })
  const Icon = CATEGORIA_ICON[c.categoria]
  const i = orden.indexOf(c.estado)
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-lg border border-white/10 bg-zinc-900/40 p-2.5 group cursor-grab active:cursor-grabbing"
    >
      {c.imagen_url && (
        <img src={c.imagen_url} alt="" className="w-full h-24 object-cover rounded-md mb-2" loading="lazy" />
      )}
      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 mb-1.5">
        <Icon className="h-3 w-3" /> {CATEGORIA_LABEL[c.categoria]}
      </span>
      <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-tight mb-1.5">{c.titulo}</p>
      {c.publicar_el && <p className="text-[10px] text-zinc-500 mb-1.5">📅 {formatDate(c.publicar_el)}</p>}
      <div
        className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/5"
        onPointerDown={(e) => e.stopPropagation()}
      >
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

// Publicación asistida: abre el editor de la red con el texto (pre-cargado donde
// se puede, ej. X) o para pegar. No publica solo — el último click es del usuario.
function composerDestino(categoria: CategoriaContenido, texto: string): { url: string; prefilled: boolean; label: string } | null {
  const enc = encodeURIComponent(texto)
  switch (categoria) {
    case 'twitter': return { url: `https://x.com/intent/tweet?text=${enc}`, prefilled: true, label: 'X' }
    case 'linkedin': return { url: 'https://www.linkedin.com/feed/?shareActive=true', prefilled: false, label: 'LinkedIn' }
    case 'instagram': return { url: 'https://www.instagram.com/', prefilled: false, label: 'Instagram' }
    case 'facebook': return { url: 'https://www.facebook.com/', prefilled: false, label: 'Facebook' }
    case 'video_guion': return { url: 'https://studio.youtube.com/', prefilled: false, label: 'YouTube Studio' }
    default: return null
  }
}

function ContenidoDialog({ editing, onClose }: { editing: Contenido | null; onClose: () => void }) {
  const { user } = useAuth()
  const createContenido = useCreateContenido()
  const updateContenido = useUpdateContenido()
  const uploadImagen = useUploadContenidoImagen()

  const [titulo, setTitulo] = useState(editing?.titulo ?? '')
  const [categoria, setCategoria] = useState<CategoriaContenido>(editing?.categoria ?? 'instagram')
  const [estado, setEstado] = useState<EstadoContenido>(editing?.estado ?? 'borrador')
  const [cuerpo, setCuerpo] = useState(editing?.cuerpo ?? '')
  const [hashtags, setHashtags] = useState(editing?.hashtags ?? '')
  const [publicarEl, setPublicarEl] = useState(editing?.publicar_el ?? '')
  const [imagenUrl, setImagenUrl] = useState<string | null>(editing?.imagen_url ?? null)
  const imagenRef = useRef<HTMLInputElement>(null)

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
          imagen_url: imagenUrl,
          publicar_el: publicarEl || null,
        })
        toast.success('Contenido actualizado')
      } else {
        await createContenido.mutateAsync({
          titulo: titulo.trim(),
          categoria,
          cuerpo: cuerpo.trim() || null,
          hashtags: hashtags.trim() || null,
          imagen_url: imagenUrl,
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

  const isPending = createContenido.isPending || updateContenido.isPending || uploadImagen.isPending

  const textoPublicar = [cuerpo, hashtags].map(s => s.trim()).filter(Boolean).join('\n\n')
  const dest = composerDestino(categoria, textoPublicar)
  const handlePublicar = async () => {
    if (!textoPublicar) { toast.error('No hay texto para publicar'); return }
    try { await navigator.clipboard.writeText(textoPublicar) } catch { /* clipboard puede fallar sin gesto */ }
    if (dest) window.open(dest.url, '_blank', 'noopener')
    toast.success(dest?.prefilled ? 'Abrí X con el texto cargado' : dest ? `Texto copiado — pegalo en ${dest.label}` : 'Texto copiado al portapapeles')
  }
  const handleMarcarPublicado = async () => {
    if (!editing) return
    try { await updateContenido.mutateAsync({ id: editing.id, estado: 'publicado' }); toast.success('Marcado como publicado'); onClose() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

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

          {/* Imagen adjunta */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Imagen (opcional)</label>
            {imagenUrl ? (
              <div className="relative">
                <img src={imagenUrl} alt="Vista previa" className="w-full max-h-48 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => setImagenUrl(null)}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-zinc-300 hover:text-rose-400 transition-colors"
                  title="Quitar imagen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imagenRef.current?.click()}
                disabled={uploadImagen.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] py-4 text-xs text-zinc-400 hover:border-white/25 hover:text-zinc-300 disabled:opacity-50 transition-colors"
              >
                {uploadImagen.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
                  : <><ImagePlus className="h-4 w-4" /> Adjuntar imagen</>}
              </button>
            )}
            <input
              ref={imagenRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                e.target.value = ''
                if (file.size > 10 * 1024 * 1024) { toast.error('La imagen supera 10 MB'); return }
                try {
                  const url = await uploadImagen.mutateAsync(file)
                  setImagenUrl(url)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen')
                }
              }}
            />
          </div>

          {/* Tips de horario por plataforma */}
          {HORARIOS_TIPS[categoria] && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/70 mt-0.5" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">{HORARIOS_TIPS[categoria]}</p>
            </div>
          )}

          {editing && (
            <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wider font-medium text-cyan-300/80">Publicar</p>
              <p className="text-[11px] text-zinc-400">
                Copia el texto + hashtags y abre el editor de la red.{' '}
                {dest?.prefilled ? 'En X queda pre-cargado.' : 'Pegalo (Ctrl/Cmd+V) en el editor que se abre.'} Vos/Facundo dan el último click desde su cuenta.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePublicar}
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  {dest ? `Copiar y abrir ${dest.label}` : 'Copiar texto'}
                </button>
                {estado !== 'publicado' && (
                  <button
                    type="button"
                    onClick={handleMarcarPublicado}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                  >
                    Marcar como publicado
                  </button>
                )}
              </div>
            </div>
          )}

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
