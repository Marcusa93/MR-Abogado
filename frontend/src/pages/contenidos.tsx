import { useState, useMemo, useRef, useEffect } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent,
} from '@dnd-kit/core'
import {
  Sparkles, Plus, Edit2, Trash2, Loader2, X, FileText,
  Instagram, Linkedin, Facebook, Twitter, Mail, Send, MessageSquare,
  BookOpen, Video, Hash, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight,
  CalendarDays, CalendarRange, FolderOpen, Clapperboard, ImagePlus, Clock,
} from 'lucide-react'
import {
  useContenidos, useCreateContenido, useUpdateContenido, useDeleteContenido,
  useGenerarContenidoDesdeVideo, useUploadContenidoImagen, useGenerarCalendarioEditorial,
  parseGuionReel, parseIdea,
  CATEGORIAS_CONTENIDO, ESTADOS_CONTENIDO,
  type Contenido, type CategoriaContenido, type EstadoContenido,
} from '@/hooks/use-contenidos'
import { GuionReelDialog, GuionReelViewer } from '@/components/contenidos/guion-reel'
import { IdeasQueue } from '@/components/contenidos/ideas-queue'
import { useGoogleDriveStatus, startGoogleDriveOAuth } from '@/hooks/use-google-drive'
import { useLinkedInStatus, connectLinkedIn, useLinkedInPublish } from '@/hooks/use-social'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_CONTENIDO.map(c => [c.value, c.label])
)

// Plataformas que la IA puede generar desde un video/guion. Los `key` deben
// coincidir con PLATAFORMAS de la edge function contenido-desde-video.
const PLATAFORMAS_GENERABLES: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { key: 'x', label: 'X / Twitter', icon: Twitter },
  { key: 'instagram', label: 'Instagram', icon: Instagram },
  { key: 'facebook', label: 'Facebook', icon: Facebook },
  { key: 'youtube', label: 'YouTube / TikTok', icon: Video },
]

// Texto de preview para una tarjeta. Los guiones de Reel guardan JSON en cuerpo,
// así que mostramos el primer hook o el tema en vez del JSON crudo.
function previewContenido(c: Contenido): string | null {
  const g = parseGuionReel(c)
  if (g) return g.hooks[0] ?? g.tema ?? 'Guion de Reel estructurado'
  return c.cuerpo ?? null
}

// ── Identidad visual por plataforma ──────────────────────────────────────────
type Tema = { border: string; pill: string; bar: string }
const CATEGORIA_THEME: Record<string, Tema> = {
  instagram:         { border: 'border-pink-500/30',   pill: 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',         bar: 'bg-pink-500' },
  linkedin:          { border: 'border-sky-500/30',    pill: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',             bar: 'bg-sky-500' },
  facebook:          { border: 'border-blue-500/30',   pill: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',         bar: 'bg-blue-500' },
  twitter:           { border: 'border-zinc-400/30',   pill: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200',         bar: 'bg-zinc-400' },
  video_guion:       { border: 'border-red-500/30',    pill: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',             bar: 'bg-red-500' },
  newsletter:        { border: 'border-cyan-500/30',   pill: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',         bar: 'bg-cyan-500' },
  email_cliente:     { border: 'border-teal-500/30',   pill: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',         bar: 'bg-teal-500' },
  whatsapp_difusion: { border: 'border-emerald-500/30',pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  blog:              { border: 'border-violet-500/30', pill: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300', bar: 'bg-violet-500' },
  otro:              { border: 'border-zinc-200 dark:border-white/10', pill: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300', bar: 'bg-zinc-500' },
}
const GUION_THEME: Tema = { border: 'border-fuchsia-500/40', pill: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', bar: 'bg-fuchsia-500' }

function temaDe(c: Contenido): Tema {
  if (parseGuionReel(c)) return GUION_THEME
  return CATEGORIA_THEME[c.categoria] ?? CATEGORIA_THEME.otro
}

// Mini-pipeline: borrador → revisión → aprobado → publicado.
const ESTADO_STEP: Record<string, number> = { borrador: 1, en_revision: 2, aprobado: 3, publicado: 4, archivado: 0 }
function EstadoPipeline({ estado, bar }: { estado: EstadoContenido; bar: string }) {
  const step = ESTADO_STEP[estado] ?? 0
  return (
    <div className="flex gap-1" title={ESTADO_LABEL[estado]}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? bar : 'bg-zinc-200 dark:bg-white/10')} />
      ))}
    </div>
  )
}

const ESTADO_LABEL: Record<string, string> = Object.fromEntries(
  ESTADOS_CONTENIDO.map(e => [e.value, e.label])
)

const ESTADO_CLS: Record<EstadoContenido, string> = {
  borrador: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  en_revision: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  aprobado: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  publicado: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  archivado: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
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

  // Reconectar si no está conectado o si la conexión tiene el scope viejo (drive.file).
  const needsReconnect = !status?.connected || !status?.scope?.includes('drive.readonly')
  if (needsReconnect) {
    return (
      <button
        type="button"
        onClick={() => startGoogleDriveOAuth().catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo iniciar la conexión con Drive'))}
        className="btn border border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        title="Conectá (o reconectá) tu Google Drive para elegir videos o guiones"
      >
        <FolderOpen className="h-4 w-4" /> <span className="hidden sm:inline">{status?.connected ? 'Reconectar Drive' : 'Conectar Drive'}</span>
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
      const picker = new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS))
        .addView(new google.picker.DocsView())
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
      className="btn btn-ghost"
      title="Elegir un video o un guion de tu Drive"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />} <span className="hidden sm:inline">Desde Drive</span>
    </button>
  )
}

export default function ContenidosPage() {
  const [filterCategoria, setFilterCategoria] = useState<CategoriaContenido | 'all'>('all')
  const [filterEstado, setFilterEstado] = useState<EstadoContenido | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contenido | null>(null)
  const [initialPublicarEl, setInitialPublicarEl] = useState('')
  const [guionDialogOpen, setGuionDialogOpen] = useState(false)
  const [viewingGuion, setViewingGuion] = useState<Contenido | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [view, setView] = useState<'tablero' | 'calendario' | 'lista'>('tablero')
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [genStage, setGenStage] = useState<string | null>(null)
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [plataformas, setPlataformas] = useState<Set<string>>(
    () => new Set(PLATAFORMAS_GENERABLES.map((p) => p.key)),
  )
  const [calendarioOpen, setCalendarioOpen] = useState(false)
  const generar = useGenerarContenidoDesdeVideo()

  const togglePlataforma = (key: string) => {
    setPlataformas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Guiones de Reel se abren en el visor estructurado; el resto, en el editor.
  const abrirContenido = (c: Contenido) => {
    if (parseGuionReel(c)) setViewingGuion(c)
    else { setEditing(c); setDialogOpen(true) }
  }

  const runGenerar = (input: { file?: File; driveFileId?: string }) => {
    if (plataformas.size === 0) {
      toast.error('Seleccioná al menos una plataforma para generar')
      return
    }
    generar.mutate(
      { ...input, plataformas: [...plataformas], onStage: setGenStage },
      {
        onSuccess: (r) => { setGenStage(null); toast.success(`${r.created} ${r.created === 1 ? 'tarjeta generada' : 'tarjetas generadas'} desde el video`) },
        onError: (e) => { setGenStage(null); toast.error(e instanceof Error ? e.message : 'No se pudo generar') },
      },
    )
  }
  const handleVideo = (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      toast.error('El video supera 500 MB. Recortalo o comprimilo antes (los videos editados para redes suelen ser más livianos).')
      return
    }
    runGenerar({ file })
  }

  // Aviso al volver del OAuth de LinkedIn
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('linkedin') === 'connected') toast.success('LinkedIn conectado')
    else if (p.get('linkedin_error')) toast.error(`LinkedIn: ${p.get('linkedin_error')}`)
    if (p.has('linkedin') || p.has('linkedin_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const { data: contenidosRaw = [], isLoading } = useContenidos({
    categoria: filterCategoria === 'all' ? null : filterCategoria,
    estado: filterEstado === 'all' ? null : filterEstado,
  })
  const deleteContenido = useDeleteContenido()

  // Las ideas (cola) viven en su propio panel; el resto va al tablero/calendario/lista.
  const ideas = useMemo(() => contenidosRaw.filter((c) => parseIdea(c)), [contenidosRaw])
  const contenidos = useMemo(() => contenidosRaw.filter((c) => !parseIdea(c)), [contenidosRaw])

  const countsByEstado = useMemo(() => {
    const c: Partial<Record<EstadoContenido, number>> = {}
    for (const item of contenidos) c[item.estado] = (c[item.estado] ?? 0) + 1
    return c
  }, [contenidos])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Contenidos' }]} />

      <PageHeader
        title="Contenidos del estudio"
        subtitle="Borradores y posts para redes, newsletters, emails y otras comunicaciones."
        actions={
        <>
          {/* Toggle vista */}
          <div className="segmented" role="group" aria-label="Vista">
            <button
              onClick={() => setView('tablero')}
              aria-pressed={view === 'tablero'}
              className="px-2.5 text-xs font-semibold"
              title="Vista tablero"
            >
              <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Tablero</span>
            </button>
            <button
              onClick={() => setView('calendario')}
              aria-pressed={view === 'calendario'}
              className="px-2.5 text-xs font-semibold"
              title="Vista calendario"
            >
              <CalendarDays className="h-4 w-4" /> <span className="hidden sm:inline">Calendario</span>
            </button>
            <button
              onClick={() => setView('lista')}
              aria-pressed={view === 'lista'}
              className="px-2.5 text-xs font-semibold"
              title="Vista lista"
            >
              <ListIcon className="h-4 w-4" /> <span className="hidden sm:inline">Lista</span>
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
            className="btn btn-ghost"
            title="Generar borradores por plataforma a partir de un video (subida directa)"
          >
            {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            <span className="hidden sm:inline">Desde video</span>
          </button>
          <DriveVideoButton onPicked={(fileId) => runGenerar({ driveFileId: fileId })} disabled={generar.isPending} />
          <button
            onClick={() => setGuionDialogOpen(true)}
            className="btn btn-ghost"
            title="Decí o escribí un tema y la IA arma un guion de Reel estructurado"
          >
            <Clapperboard className="h-4 w-4" />
            <span className="hidden sm:inline">Guion de Reel</span>
          </button>
          <button
            onClick={() => setCalendarioOpen(true)}
            className="btn btn-ghost"
            title="Generar el plan editorial de un mes completo"
          >
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Generar mes</span>
          </button>
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            Nuevo contenido
          </button>
        </>
        }
      />

      {/* Selector de plataformas para generar desde video/Drive */}
      <div className="app-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">
            Generar para:
          </span>
          {PLATAFORMAS_GENERABLES.map((p) => {
            const active = plataformas.has(p.key)
            const Icon = p.icon
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => togglePlataforma(p.key)}
                disabled={generar.isPending}
                aria-pressed={active}
                className="chip disabled:opacity-50"
                title={active ? `No generar para ${p.label}` : `Generar para ${p.label}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {p.label}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] text-zinc-500">
            Tildá las redes antes de cargar el video o el Drive.
          </span>
        </div>
      </div>

      {/* Cola de ideas */}
      <IdeasQueue ideas={ideas} />

      {genStage && (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-cyan-800 dark:text-cyan-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="font-semibold">{genStage}</span>
          </div>
          <p className="mt-1 text-[11px] text-cyan-700/80 dark:text-cyan-300/70">Escribiendo con tu voz para cada red. Puede tardar 1-2 min — no cierres la pestaña.</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-cyan-500/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand-accent)]" />
          </div>
        </div>
      )}

      {/* Filtros: colapsables en mobile */}
      <div>
        <button
          type="button"
          onClick={() => setFiltrosOpen((v) => !v)}
          className="btn btn-ghost btn-sm mb-2 sm:hidden"
        >
          <ListIcon className="h-3.5 w-3.5" />
          Filtros
          {((filterEstado !== 'all' ? 1 : 0) + (filterCategoria !== 'all' ? 1 : 0)) > 0 && (
            <span className="rounded-full bg-cyan-500/15 px-1.5 text-[10px] font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {(filterEstado !== 'all' ? 1 : 0) + (filterCategoria !== 'all' ? 1 : 0)}
            </span>
          )}
        </button>
      </div>
      <div className={cn('space-y-3', filtrosOpen ? 'block' : 'hidden sm:block')}>
        <div>
          <p className="eyebrow mb-2">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterEstado('all')}
              aria-pressed={filterEstado === 'all'}
              className="chip"
            >
              Todos <span className="chip-count">{contenidos.length}</span>
            </button>
            {ESTADOS_CONTENIDO.map((e) => (
              <button
                key={e.value}
                onClick={() => setFilterEstado(e.value)}
                aria-pressed={filterEstado === e.value}
                className="chip"
              >
                {e.label}{!!countsByEstado[e.value] && <span className="chip-count">{countsByEstado[e.value]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterCategoria('all')}
              aria-pressed={filterCategoria === 'all'}
              className="chip"
            >
              Todas
            </button>
            {CATEGORIAS_CONTENIDO.map((c) => {
              const Icon = CATEGORIA_ICON[c.value]
              return (
                <button
                  key={c.value}
                  onClick={() => setFilterCategoria(c.value)}
                  aria-pressed={filterCategoria === c.value}
                  className="chip"
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
          onEdit={abrirContenido}
          onDelete={(id) => setConfirmDelete(id)}
        />
      ) : view === 'calendario' ? (
        <ContenidoCalendar
          contenidos={contenidos}
          onEdit={abrirContenido}
          onCreateForDate={(fecha) => {
            setInitialPublicarEl(fecha)
            setEditing(null)
            setDialogOpen(true)
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contenidos.map((c) => {
            const Icon = CATEGORIA_ICON[c.categoria]
            const tema = temaDe(c)
            const guion = parseGuionReel(c)
            const headline = guion ? (guion.hooks[0] ?? guion.tema ?? c.titulo) : c.titulo
            return (
              <div
                key={c.id}
                className={cn('app-card group flex flex-col p-4', tema.border)}
              >
                {c.imagen_url && (
                  <img src={c.imagen_url} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" loading="lazy" />
                )}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold gap-1', tema.pill)}>
                    <Icon className="h-3 w-3" />
                    {guion ? 'Reel' : CATEGORIA_LABEL[c.categoria]}
                  </span>
                  {guion && (
                    <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold gap-1 border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
                      <Clapperboard className="h-3 w-3" /> Guion
                    </span>
                  )}
                </div>

                <h3 className={cn('mb-2 text-[14px] font-bold leading-snug tracking-tight text-zinc-900 dark:text-white', guion ? 'line-clamp-3' : 'line-clamp-2')}>
                  {headline}
                </h3>

                {guion ? (
                  <div className="mb-2 flex items-center gap-2.5 text-[11px] font-medium text-zinc-500">
                    {guion.escenas.length > 0 && <span className="inline-flex items-center gap-1"><ListIcon className="h-2.5 w-2.5" /> {guion.escenas.length} escenas</span>}
                    {guion.duracion_estimada && <span className="inline-flex items-center gap-1"><Video className="h-2.5 w-2.5" /> {guion.duracion_estimada}</span>}
                  </div>
                ) : previewContenido(c) ? (
                  <p className="mb-2 line-clamp-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{previewContenido(c)}</p>
                ) : null}

                {c.hashtags && (
                  <div className="flex items-center gap-1 mb-2">
                    <Hash className="h-3 w-3 shrink-0 text-[var(--brand-accent)]" />
                    <p className="line-clamp-1 text-[11px] text-cyan-700 dark:text-cyan-400/80">{c.hashtags}</p>
                  </div>
                )}

                <div className="mt-auto pt-2.5">
                  <EstadoPipeline estado={c.estado} bar={tema.bar} />
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-[11px] font-medium tabular-nums text-zinc-500">
                      {c.publicar_el
                        ? <>📅 {formatDate(c.publicar_el)}</>
                        : ESTADO_LABEL[c.estado]}
                    </p>
                    <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => abrirContenido(c)}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-[var(--brand-accent)] dark:hover:bg-white/[0.06]"
                        title={guion ? 'Ver guion' : 'Editar'}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c.id)}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogOpen && <ContenidoDialog editing={editing} defaultPublicarEl={initialPublicarEl} onClose={() => { setDialogOpen(false); setEditing(null); setInitialPublicarEl('') }} />}
      {guionDialogOpen && <GuionReelDialog onClose={() => setGuionDialogOpen(false)} />}
      {viewingGuion && <GuionReelViewer contenido={viewingGuion} onClose={() => setViewingGuion(null)} />}
      {calendarioOpen && (
        <CalendarioGenerarDialog
          onClose={() => setCalendarioOpen(false)}
          onSuccess={() => { setCalendarioOpen(false); setView('calendario') }}
        />
      )}

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

// ── Generador de calendario editorial ────────────────────────────────────────

const PLATAFORMAS_CALENDARIO = [
  { key: 'linkedin',    label: 'LinkedIn',        icon: Linkedin,  desc: '4 posts/sem — análisis y criterio' },
  { key: 'instagram',  label: 'Instagram',        icon: Instagram, desc: '3 posts/sem — educativo y cercano' },
  { key: 'twitter',    label: 'X / Twitter',      icon: Twitter,   desc: '3 posts/sem — opinión breve' },
  { key: 'video_guion',label: 'TikTok / Reels',   icon: Video,     desc: '1 guion/sem — gancho + desarrollo' },
]

function CalendarioGenerarDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const now = new Date()
  const defaultMonth = now.getMonth() === 11
    ? { year: now.getFullYear() + 1, month: 1 }
    : { year: now.getFullYear(), month: now.getMonth() + 2 }

  const [year, setYear] = useState(defaultMonth.year)
  const [month, setMonth] = useState(defaultMonth.month)
  const [plats, setPlats] = useState<Set<string>>(
    () => new Set(['linkedin', 'instagram', 'twitter', 'video_guion'])
  )
  const generar = useGenerarCalendarioEditorial()

  const togglePlat = (key: string) =>
    setPlats(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const mesLabel = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][month - 1]

  const estimado = (() => {
    const freq: Record<string, number> = { linkedin: 16, instagram: 12, twitter: 12, video_guion: 4 }
    return [...plats].reduce((s, p) => s + (freq[p] ?? 8), 0)
  })()

  const handleGenerar = () => {
    if (plats.size === 0) { toast.error('Seleccioná al menos una plataforma'); return }
    generar.mutate(
      { year, month, plataformas: [...plats] },
      {
        onSuccess: (r) => {
          toast.success(`${r.created} borradores creados para ${mesLabel} ${year}`)
          onSuccess()
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo generar el calendario'),
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-[var(--brand-accent)]" />
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">Generar calendario editorial</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Selector de mes */}
          <div>
            <p className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 mb-2">Mes a planificar</p>
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="field h-10 flex-1 py-0"
              >
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="field h-10 w-24 py-0"
              >
                {[now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de plataformas */}
          <div>
            <p className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 mb-2">Plataformas a cubrir</p>
            <div className="space-y-2">
              {PLATAFORMAS_CALENDARIO.map(p => {
                const Icon = p.icon
                const active = plats.has(p.key)
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => togglePlat(p.key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-cyan-500/40 bg-cyan-500/10'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-cyan-500/15' : 'bg-zinc-100 dark:bg-white/[0.06]'
                    )}>
                      <Icon className={cn('h-4 w-4', active ? 'text-cyan-700 dark:text-cyan-300' : 'text-zinc-500')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[13px] font-bold', active ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400')}>{p.label}</p>
                      <p className="text-[11px] text-zinc-500">{p.desc}</p>
                    </div>
                    <div className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      active ? 'border-cyan-500/60 bg-cyan-500/20' : 'border-zinc-300 dark:border-white/15'
                    )}>
                      {active && <div className="h-2 w-2 rounded-sm bg-[var(--brand-accent)]" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Estimado */}
          {plats.size > 0 && (
            <div className="dashboard-panel-muted px-3 py-2.5">
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Se crearán aproximadamente <span className="font-bold text-zinc-900 dark:text-white">~{estimado} borradores</span> distribuidos en los días hábiles de {mesLabel} {year}.
                Cada uno incluye el tema y el gancho sugerido — después los completás con texto completo o guion.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost border-transparent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerar}
            disabled={generar.isPending || plats.size === 0}
            className="btn btn-primary"
          >
            {generar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generando con IA…</>
            ) : (
              <><CalendarRange className="h-4 w-4" /> Generar {mesLabel}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vista calendario: grilla mensual por fecha de publicación ───────────────
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function ContenidoCalendar({ contenidos, onEdit, onCreateForDate }: {
  contenidos: Contenido[]
  onEdit: (c: Contenido) => void
  onCreateForDate?: (fecha: string) => void
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

  // Arrastrar una tarjeta a un día setea publicar_el; a "sin fecha" lo limpia.
  const update = useUpdateContenido()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    const c = e.active.data.current?.contenido as Contenido | undefined
    const over = e.over?.id
    if (!c || over == null) return
    const fecha = over === 'sin-fecha' ? null : String(over)
    if (c.publicar_el !== fecha) {
      update.mutate({ id: c.id, publicar_el: fecha })
      toast.success(fecha ? `Agendado para ${formatDate(fecha)}` : 'Sin fecha')
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">{MESES[m]} {y}</h2>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="btn btn-ghost btn-icon h-8 w-8" title="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setCursor({ y: hoy.getFullYear(), m: hoy.getMonth() })} className="btn btn-ghost btn-sm">Hoy</button>
          <button onClick={next} className="btn btn-ghost btn-icon h-8 w-8" title="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 dark:border-white/[0.09] dark:bg-white/[0.06]">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="bg-zinc-50 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:bg-[var(--card)]">{d}</div>
        ))}
        {cells.map((d, i) => {
          const items = d ? (byDate[dateStr(d)] ?? []) : []
          const esHoy = d != null && dateStr(d) === todayStr
          return (
            <CalDia
              key={i}
              id={d ? dateStr(d) : null}
              vacio={!d}
              onCreateClick={d && onCreateForDate ? () => onCreateForDate(dateStr(d)) : undefined}
            >
              {d && (
                <>
                  <div className={cn('mb-1 text-[11px] tabular-nums', esHoy ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-navy)] font-bold text-white dark:bg-white dark:text-[#1c2633]' : 'font-medium text-zinc-500')}>{d}</div>
                  <div className="space-y-1.5">
                    {items.map((c) => (
                      <CalChip key={c.id} c={c} onClick={() => onEdit(c)}
                        className={cn('flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] font-semibold leading-tight transition-all hover:brightness-110', temaDe(c).pill)}
                        title={`${c.titulo} · ${ESTADO_LABEL[c.estado]} · arrastrá para reagendar`}>
                        <span className="truncate">{c.titulo}</span>
                      </CalChip>
                    ))}
                  </div>
                </>
              )}
            </CalDia>
          )
        })}
      </div>

      {sinFecha.length > 0 && (
        <CalSinFecha count={sinFecha.length}>
          {sinFecha.map((c) => (
            <CalChip key={c.id} c={c} onClick={() => onEdit(c)}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all hover:brightness-110', temaDe(c).pill)}
              title={`${ESTADO_LABEL[c.estado]} · arrastrá a un día para agendar`}>
              <span className="max-w-[160px] truncate">{c.titulo}</span>
            </CalChip>
          ))}
        </CalSinFecha>
      )}
    </div>
    </DndContext>
  )
}

// Celda de día: zona donde se puede soltar una tarjeta para agendarla.
function CalDia({ id, vacio, children, onCreateClick }: {
  id: string | null
  vacio: boolean
  children: React.ReactNode
  onCreateClick?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: id ?? `empty-${Math.random()}`, disabled: !id })
  return (
    <div ref={id ? setNodeRef : undefined}
      className={cn('group/day flex min-h-[92px] flex-col bg-white p-1.5 transition-colors dark:bg-[var(--card)]', vacio && 'opacity-40', isOver && '!bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/50')}>
      <div className="flex-1">{children}</div>
      {id && onCreateClick && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCreateClick() }}
          className="mt-0.5 flex w-full items-center justify-center rounded-md py-0.5 text-zinc-400 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-700 group-hover/day:opacity-100 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-300"
          title="Agregar contenido en esta fecha"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// Zona "sin fecha": soltar acá limpia la fecha de publicación.
function CalSinFecha({ count, children }: { count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'sin-fecha' })
  return (
    <div ref={setNodeRef} className={cn('rounded-2xl p-2 transition-colors', isOver && 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/40')}>
      <p className="eyebrow mb-2">
        Sin fecha ({count}) — arrastrá a un día para agendar, o soltá acá para quitar la fecha
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// Tarjeta arrastrable del calendario (click abre, drag reagenda).
function CalChip({ c, onClick, className, title, children }: {
  c: Contenido
  onClick: () => void
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, data: { contenido: c } })
  const Icon = CATEGORIA_ICON[c.categoria]
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined
  return (
    <button ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={onClick}
      className={cn(className, isDragging && 'opacity-50')} title={title}>
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {children}
    </button>
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
      className={cn('rounded-2xl border p-2 transition-colors', isOver ? 'border-cyan-500/50 bg-cyan-500/[0.06]' : 'border-zinc-200 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02]')}
    >
      <div className="flex items-center justify-between px-1 py-1.5 mb-1">
        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold px-2.5 py-0.5 text-[11px]', ESTADO_CLS[estado])}>
          {label}
        </span>
        <span className="text-xs font-bold tabular-nums text-zinc-500">{items.length}</span>
      </div>
      <div className="space-y-2 min-h-[44px]">
        {items.map((c) => (
          <BoardCard key={c.id} c={c} orden={orden} onEdit={onEdit} onDelete={onDelete} onMover={onMover} disabled={disabled} />
        ))}
        {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] font-medium text-zinc-500">Soltá una tarjeta acá</p>}
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
  const tema = temaDe(c)
  const guion = parseGuionReel(c)
  const headline = guion ? (guion.hooks[0] ?? guion.tema ?? c.titulo) : c.titulo
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
      className={cn('app-card group cursor-grab rounded-xl p-2.5 active:cursor-grabbing', tema.border)}
    >
      {c.imagen_url && (
        <img src={c.imagen_url} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" loading="lazy" />
      )}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold', tema.pill)}>
          <Icon className="h-2.5 w-2.5" /> {guion ? 'Reel' : CATEGORIA_LABEL[c.categoria]}
        </span>
        {guion && <Clapperboard className="h-3 w-3 text-fuchsia-600 dark:text-fuchsia-400" />}
      </div>
      <p className={cn('mb-1 text-[13px] font-bold leading-snug tracking-tight text-zinc-900 dark:text-white', guion ? 'line-clamp-3' : 'line-clamp-2')}>{headline}</p>
      {guion ? (
        <p className="mb-1.5 text-[10.5px] font-medium text-zinc-500">{guion.escenas.length} escenas{guion.duracion_estimada ? ` · ${guion.duracion_estimada}` : ''}</p>
      ) : previewContenido(c) ? (
        <p className="mb-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{previewContenido(c)}</p>
      ) : null}
      {c.publicar_el && <p className="mb-1.5 text-[11px] font-medium tabular-nums text-zinc-500">📅 {formatDate(c.publicar_el)}</p>}
      <div className="mb-1.5"><EstadoPipeline estado={c.estado} bar={tema.bar} /></div>
      <div
        className="flex items-center justify-between gap-1 border-t border-zinc-100 pt-1.5 dark:border-white/[0.06]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMover(c, -1)} disabled={disabled || i <= 0}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Mover atrás">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMover(c, 1)} disabled={disabled || i >= orden.length - 1}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Mover adelante">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button onClick={() => onEdit(c)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-[var(--brand-accent)] dark:hover:bg-white/[0.06]" title={parseGuionReel(c) ? 'Ver guion' : 'Editar'}>
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={() => onDelete(c.id)} className="rounded-md p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500" title="Eliminar">
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
    case 'twitter': {
      // El intent de X solo carga un tweet: abrimos el primero del hilo.
      const first = texto.split(/\n\s*\n/)[0] ?? texto
      return { url: `https://x.com/intent/tweet?text=${encodeURIComponent(first)}`, prefilled: true, label: 'X' }
    }
    case 'linkedin': return { url: 'https://www.linkedin.com/feed/?shareActive=true', prefilled: false, label: 'LinkedIn' }
    case 'instagram': return { url: 'https://www.instagram.com/', prefilled: false, label: 'Instagram' }
    case 'facebook': return { url: 'https://www.facebook.com/', prefilled: false, label: 'Facebook' }
    case 'video_guion': return { url: 'https://studio.youtube.com/', prefilled: false, label: 'YouTube Studio' }
    default: return null
  }
}

function ContenidoDialog({ editing, defaultPublicarEl, onClose }: { editing: Contenido | null; defaultPublicarEl?: string; onClose: () => void }) {
  const { user } = useAuth()
  const createContenido = useCreateContenido()
  const updateContenido = useUpdateContenido()
  const uploadImagen = useUploadContenidoImagen()

  const [titulo, setTitulo] = useState(editing?.titulo ?? '')
  const [categoria, setCategoria] = useState<CategoriaContenido>(editing?.categoria ?? 'instagram')
  const [estado, setEstado] = useState<EstadoContenido>(editing?.estado ?? 'borrador')
  const [cuerpo, setCuerpo] = useState(editing?.cuerpo ?? '')
  const [hashtags, setHashtags] = useState(editing?.hashtags ?? '')
  const [publicarEl, setPublicarEl] = useState(editing?.publicar_el ?? defaultPublicarEl ?? '')
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
    const esHilo = categoria === 'twitter' && textoPublicar.split(/\n\s*\n/).length > 1
    toast.success(
      esHilo ? 'Abrí X con el primer tweet. El hilo completo está copiado: pegá el resto como respuestas.'
        : dest?.prefilled ? 'Abrí X con el texto cargado'
        : dest ? `Texto copiado — pegalo en ${dest.label}`
        : 'Texto copiado al portapapeles',
    )
  }
  const handleMarcarPublicado = async () => {
    if (!editing) return
    try { await updateContenido.mutateAsync({ id: editing.id, estado: 'publicado' }); toast.success('Marcado como publicado'); onClose() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  // LinkedIn: publicación automática (un click) para tarjetas de LinkedIn
  const { data: liStatus } = useLinkedInStatus()
  const liPublish = useLinkedInPublish()
  const esLinkedin = categoria === 'linkedin'
  // X: hilo semiautomático — tweets numerados, se postean uno por uno.
  const esX = categoria === 'twitter'
  const tweetsHilo = esX ? cuerpo.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) : []
  const copiarTweet = async (t: string) => {
    try { await navigator.clipboard.writeText(t) } catch { /* sin gesto puede fallar */ }
    toast.success('Tweet copiado')
  }
  const abrirTweetEnX = async (t: string) => {
    try { await navigator.clipboard.writeText(t) } catch { /* ignore */ }
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(t)}`, '_blank', 'noopener')
  }
  const handlePublicarLinkedIn = async () => {
    if (!editing) return
    try {
      await liPublish.mutateAsync({ cuerpo: cuerpo.trim(), hashtags: hashtags.trim() || undefined, imagen_url: imagenUrl ?? undefined, contenido_id: editing.id })
      toast.success('¡Publicado en LinkedIn!')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo publicar en LinkedIn') }
  }

  const inputCls = 'field'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">{editing ? 'Editar contenido' : 'Nuevo contenido'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Título</label>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required autoFocus className={inputCls} placeholder="Ej: Tips para divorcios express" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaContenido)} className={inputCls}>
                {CATEGORIAS_CONTENIDO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Publicar el (opcional)</label>
              <input type="date" value={publicarEl} onChange={e => setPublicarEl(e.target.value)} className={inputCls} />
            </div>
          </div>

          {editing && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Estado del flujo</label>
              <div className="flex flex-wrap gap-1.5">
                {ESTADOS_CONTENIDO.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => setEstado(e.value)}
                    aria-pressed={estado === e.value}
                    className="chip"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Contenido</label>
            <textarea
              value={cuerpo}
              onChange={e => setCuerpo(e.target.value)}
              rows={8}
              className={inputCls}
              placeholder="Escribí el texto del post, email o newsletter…"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Hashtags (opcional)</label>
            <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)} className={inputCls} placeholder="#abogados #derecho #tucuman" />
          </div>

          {/* Imagen adjunta */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Imagen (opcional)</label>
            {imagenUrl ? (
              <div className="relative">
                <img src={imagenUrl} alt="Vista previa" className="max-h-48 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setImagenUrl(null)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-zinc-200 transition-colors hover:text-rose-400"
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-4 text-xs font-semibold text-zinc-500 transition-colors hover:border-[var(--brand-accent)] hover:text-zinc-800 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:text-zinc-200"
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
            <div className="flex items-start gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] px-3 py-2">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700 dark:text-cyan-300" />
              <p className="text-[11px] leading-relaxed text-cyan-800 dark:text-cyan-200/80">{HORARIOS_TIPS[categoria]}</p>
            </div>
          )}

          {editing && (
            <div className="dashboard-panel-muted space-y-2 p-3.5">
              <p className="eyebrow">Publicar</p>
              <p className="text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                Copia el texto + hashtags y abre el editor de la red.{' '}
                {dest?.prefilled ? 'En X queda pre-cargado.' : 'Pegalo (Ctrl/Cmd+V) en el editor que se abre.'} Vos/Facundo dan el último click desde su cuenta.
              </p>

              {esX && tweetsHilo.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11.5px] font-medium text-zinc-700 dark:text-zinc-300">
                    Hilo de {tweetsHilo.length} {tweetsHilo.length === 1 ? 'tweet' : 'tweets'} — posteá en orden: el 1 abre X, los demás copialos y pegalos como respuesta.
                  </p>
                  {tweetsHilo.map((tw, i) => {
                    const over = tw.length > 280
                    return (
                      <div key={i} className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium tabular-nums text-zinc-500">
                            Tweet {i + 1} · <span className={over ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-zinc-500'}>{tw.length}/280</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => (i === 0 ? abrirTweetEnX(tw) : copiarTweet(tw))}
                            className="btn btn-secondary btn-sm min-h-0 px-2 py-1 text-[11px]"
                          >
                            {i === 0 ? <><Send className="h-3 w-3" /> Copiar + abrir X</> : 'Copiar'}
                          </button>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-zinc-700 dark:text-zinc-300">{tw}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {esLinkedin && (liStatus?.connected ? (
                  <button
                    type="button"
                    onClick={handlePublicarLinkedIn}
                    disabled={liPublish.isPending}
                    className="btn btn-sm bg-[#0a66c2] text-white hover:brightness-110"
                    title={liStatus.accountName ? `Publicar como ${liStatus.accountName}` : 'Publicar en tu LinkedIn'}
                  >
                    {liPublish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Linkedin className="h-3.5 w-3.5" />}
                    Publicar en LinkedIn
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => connectLinkedIn().catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo conectar LinkedIn'))}
                    className="btn btn-sm border border-[#0a66c2]/40 text-[#0a66c2] hover:bg-[#0a66c2]/10 dark:text-[#4aa3e8]"
                  >
                    <Linkedin className="h-3.5 w-3.5" /> Conectar LinkedIn
                  </button>
                ))}
                {!esX && (
                  <button
                    type="button"
                    onClick={handlePublicar}
                    className="btn btn-secondary btn-sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {dest ? `Copiar y abrir ${dest.label}` : 'Copiar texto'}
                  </button>
                )}
                {estado !== 'publicado' && (
                  <button
                    type="button"
                    onClick={handleMarcarPublicado}
                    className="btn btn-sm border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
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
            className="btn btn-primary w-full"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Guardar cambios' : 'Crear contenido'}
          </button>
        </form>
      </div>
    </div>
  )
}
