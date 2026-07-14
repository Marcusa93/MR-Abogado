import { useState, useRef } from 'react'
import { Lightbulb, Plus, Sparkles, Trash2, Loader2, ChevronDown, ChevronRight, Wand2, ImagePlus, X } from 'lucide-react'
import {
  useCreateContenido, useDeleteContenido, useGenerarGuionReel,
  useDesarrollarContenido, useUploadContenidoImagen,
  ideaACuerpo, parseIdea, type Contenido,
} from '@/hooks/use-contenidos'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Plataformas que tienen prompt de voz propio para "Desarrollar post"
const PLATAFORMAS_DESARROLLABLES = new Set(['linkedin', 'twitter', 'instagram', 'facebook'])

const PLATAFORMA_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

// ── Diálogo de desarrollo de post ────────────────────────────────────────────

function DesarrollarDialog({
  idea,
  onClose,
}: {
  idea: Contenido
  onClose: () => void
}) {
  const desarrollar = useDesarrollarContenido()
  const uploadImagen = useUploadContenidoImagen()
  const fileRef = useRef<HTMLInputElement>(null)
  const [imagenUrl, setImagenUrl] = useState<string | null>(null)
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadImagen.mutateAsync(file)
      setImagenUrl(url)
      setImagenPreview(URL.createObjectURL(file))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  const quitarImagen = () => {
    setImagenUrl(null)
    if (imagenPreview) URL.revokeObjectURL(imagenPreview)
    setImagenPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDesarrollar = () => {
    desarrollar.mutate(
      { contenido_id: idea.id, imagen_url: imagenUrl ?? undefined },
      {
        onSuccess: () => {
          toast.success('Post desarrollado — revisalo en el tablero')
          onClose()
        },
        onError: (e) => {
          toast.error(e instanceof Error ? e.message : 'No se pudo desarrollar el post')
        },
      },
    )
  }

  const plataforma = PLATAFORMA_LABEL[idea.categoria] ?? idea.categoria
  const ideaData = parseIdea(idea)
  const isPending = desarrollar.isPending || uploading

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Desarrollar post</p>
            <p className="text-sm font-medium text-zinc-100">{plataforma}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/8 transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {ideaData && (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 space-y-1">
              <p className="text-xs text-zinc-400 line-clamp-3">{ideaData.texto}</p>
              {ideaData.gancho && (
                <p className="text-[11px] text-zinc-500 italic line-clamp-1">"{ideaData.gancho}"</p>
              )}
            </div>
          )}

          {/* Imagen opcional */}
          <div>
            <p className="text-[11px] text-zinc-500 mb-2">Imagen opcional</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {imagenPreview ? (
              <div className="flex items-center gap-2">
                <img
                  src={imagenPreview}
                  alt="Preview"
                  className="h-12 w-12 rounded-lg object-cover border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 truncate">Imagen lista</p>
                  <p className="text-[10px] text-zinc-500">El post mencionará que hay imagen</p>
                </div>
                <button
                  onClick={quitarImagen}
                  disabled={isPending}
                  className="rounded-lg p-1.5 text-zinc-500 hover:text-rose-400 transition-colors disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isPending}
                className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 hover:border-white/25 hover:text-zinc-300 transition-colors disabled:opacity-40"
              >
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…</>
                  : <><ImagePlus className="h-3.5 w-3.5" /> Subir imagen (opcional)</>
                }
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-1">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleDesarrollar}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
          >
            {desarrollar.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Escribiendo…</>
              : <><Wand2 className="h-4 w-4" /> Desarrollar post</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cola de ideas ─────────────────────────────────────────────────────────────

export function IdeasQueue({ ideas }: { ideas: Contenido[] }) {
  const { profile } = useAuth()
  const crear = useCreateContenido()
  const borrar = useDeleteContenido()
  const generar = useGenerarGuionReel()

  const [open, setOpen] = useState(true)
  const [nueva, setNueva] = useState('')
  const [generandoId, setGenerandoId] = useState<string | null>(null)
  const [desarrollarIdea, setDesarrollarIdea] = useState<Contenido | null>(null)

  const agregar = async () => {
    const texto = nueva.trim()
    if (texto.length < 3 || !profile?.id) return
    try {
      await crear.mutateAsync({
        titulo: texto.slice(0, 80),
        categoria: 'otro',
        cuerpo: ideaACuerpo(texto),
        created_by: profile.id,
      })
      setNueva('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la idea')
    }
  }

  const generarGuion = (idea: Contenido) => {
    const texto = parseIdea(idea)?.texto ?? idea.titulo
    setGenerandoId(idea.id)
    generar.mutate(
      { texto },
      {
        onSuccess: async () => {
          try { await borrar.mutateAsync(idea.id) } catch { /* noop */ }
          setGenerandoId(null)
          toast.success('Guion generado desde la idea')
        },
        onError: (e) => {
          setGenerandoId(null)
          toast.error(e instanceof Error ? e.message : 'No se pudo generar el guion')
        },
      },
    )
  }

  return (
    <>
      {desarrollarIdea && (
        <DesarrollarDialog
          idea={desarrollarIdea}
          onClose={() => setDesarrollarIdea(null)}
        />
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <Lightbulb className="h-4 w-4" />
            Cola de ideas
            {ideas.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0 text-[10px] text-amber-300">{ideas.length}</span>
            )}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-amber-300/70" /> : <ChevronRight className="h-4 w-4 text-amber-300/70" />}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 space-y-3">
            <p className="text-[11px] text-zinc-500">
              Tirá temas sueltos para grabar después. Cuando quieras, los convertís en guion de un click.
            </p>

            {/* Quick-add */}
            <div className="flex gap-2">
              <input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregar() }}
                placeholder="Ej: el valor probatorio de un audio de WhatsApp…"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
              <button
                onClick={agregar}
                disabled={nueva.trim().length < 3 || crear.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
              >
                {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Sumar
              </button>
            </div>

            {/* Lista de ideas */}
            {ideas.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-2">No hay ideas en la cola. Sumá una arriba o mandá un audio al bot.</p>
            ) : (
              <ul className="space-y-1.5">
                {ideas.map((idea) => {
                  const texto = parseIdea(idea)?.texto ?? idea.titulo
                  const gen = generandoId === idea.id
                  const puedeDesarrollar = PLATAFORMAS_DESARROLLABLES.has(idea.categoria)
                  return (
                    <li
                      key={idea.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2',
                        gen && 'opacity-60',
                      )}
                    >
                      <span className="flex-1 text-sm text-zinc-200 line-clamp-2">{texto}</span>
                      {puedeDesarrollar && (
                        <button
                          onClick={() => setDesarrollarIdea(idea)}
                          disabled={gen}
                          title={`Desarrollar post completo para ${PLATAFORMA_LABEL[idea.categoria] ?? idea.categoria}`}
                          className="flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50 shrink-0"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Desarrollar
                        </button>
                      )}
                      <button
                        onClick={() => generarGuion(idea)}
                        disabled={gen}
                        title="Generar guion de Reel desde esta idea"
                        className="flex items-center gap-1 rounded-md bg-fuchsia-500/15 px-2 py-1 text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-500/25 disabled:opacity-50 shrink-0"
                      >
                        {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {gen ? 'Generando…' : 'Guion'}
                      </button>
                      <button
                        onClick={() => borrar.mutate(idea.id)}
                        disabled={gen}
                        title="Borrar idea"
                        className="rounded-md p-1 text-zinc-500 hover:text-rose-400 disabled:opacity-50 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}
