import { useState } from 'react'
import { Lightbulb, Plus, Sparkles, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  useCreateContenido, useDeleteContenido, useGenerarGuionReel,
  ideaACuerpo, parseIdea, type Contenido,
} from '@/hooks/use-contenidos'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Cola de ideas: temas tirados rápido (texto) que después se convierten en guion.
export function IdeasQueue({ ideas }: { ideas: Contenido[] }) {
  const { profile } = useAuth()
  const crear = useCreateContenido()
  const borrar = useDeleteContenido()
  const generar = useGenerarGuionReel()

  const [open, setOpen] = useState(true)
  const [nueva, setNueva] = useState('')
  const [generandoId, setGenerandoId] = useState<string | null>(null)

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
          // Convertida: borramos la idea de la cola.
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
                return (
                  <li
                    key={idea.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2',
                      gen && 'opacity-60',
                    )}
                  >
                    <span className="flex-1 text-sm text-zinc-200 line-clamp-2">{texto}</span>
                    <button
                      onClick={() => generarGuion(idea)}
                      disabled={gen}
                      title="Generar guion de Reel desde esta idea"
                      className="flex items-center gap-1 rounded-md bg-fuchsia-500/15 px-2 py-1 text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-500/25 disabled:opacity-50 shrink-0"
                    >
                      {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {gen ? 'Generando…' : 'Generar guion'}
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
  )
}
