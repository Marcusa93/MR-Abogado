import { useState } from 'react'
import { Send, Lock, Unlock, Trash2 } from 'lucide-react'
import { useNotas, useCreateNota, useDeleteNota, type NotaWithAuthor } from '@/hooks/use-notas'
import { useAuthStore } from '@/stores/auth-store'
import { renderMentionParts } from '@/lib/utils/mentions'
import { toast } from '@/stores/toast-store'
import MentionTextarea from '@/components/shared/mention-textarea'

interface ComentariosPanelProps {
  expedienteId: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = Math.floor((now - d) / 1000)

  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: diff > 31536000 ? 'numeric' : undefined,
  })
}

function NotaContent({ text, deleted }: { text: string; deleted?: boolean }) {
  const parts = renderMentionParts(text)
  return (
    <p
      className={`text-sm whitespace-pre-wrap break-words ${
        deleted ? 'text-zinc-600 dark:text-zinc-400 line-through italic' : 'text-zinc-700 dark:text-zinc-300'
      }`}
    >
      {parts.map((part, i) =>
        part.type === 'mention' ? (
          <span
            key={i}
            className={deleted ? 'text-zinc-600 dark:text-zinc-400' : 'font-medium text-amber-400'}
          >
            {part.content}
          </span>
        ) : (
          <span key={i}>{part.content}</span>
        ),
      )}
    </p>
  )
}

function NotaItem({ nota, expedienteId }: { nota: NotaWithAuthor; expedienteId: string }) {
  const profile = useAuthStore((s) => s.profile)
  const deleteNota = useDeleteNota()
  const isOwn = nota.created_by === profile?.id
  const isAdmin = profile?.rol === 'ADMIN'
  const canDelete = (isOwn || isAdmin) && !nota.eliminada
  const initials = nota.author
    ? `${nota.author.nombre[0]}${nota.author.apellido[0]}`
    : '??'
  const authorName = nota.author
    ? `${nota.author.nombre} ${nota.author.apellido}`
    : 'Desconocido'

  async function handleDelete() {
    try {
      await deleteNota.mutateAsync({ notaId: nota.id, expedienteId })
      toast.success('Nota eliminada')
    } catch {
      toast.error('Error al eliminar la nota')
    }
  }

  return (
    <div
      className={`group flex gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.02] ${
        nota.es_privada && !nota.eliminada ? 'border-l-2 border-amber-500/40' : ''
      } ${nota.eliminada ? 'opacity-60' : ''}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          nota.eliminada
            ? 'bg-slate-800 text-zinc-600 dark:text-zinc-400'
            : isOwn
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-slate-700 text-zinc-700 dark:text-zinc-300'
        }`}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${nota.eliminada ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-800 dark:text-zinc-200'}`}
          >
            {authorName}
          </span>
          {nota.es_privada && !nota.eliminada && (
            <Lock className="h-3 w-3 text-amber-500/60" />
          )}
          <span className="text-xs text-zinc-700 dark:text-zinc-300">{timeAgo(nota.created_at)}</span>
          {nota.eliminada && (
            <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-300">
              eliminado
            </span>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteNota.isPending}
              className="ml-auto hidden rounded p-1 text-zinc-600 dark:text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400 group-hover:flex items-center disabled:opacity-50"
              title="Eliminar nota"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1">
          <NotaContent text={nota.contenido} deleted={nota.eliminada} />
        </div>
      </div>
    </div>
  )
}

export default function ComentariosPanel({ expedienteId }: ComentariosPanelProps) {
  const { data: notas = [], isLoading } = useNotas(expedienteId)
  const createNota = useCreateNota()
  const [contenido, setContenido] = useState('')
  const [esPrivada, setEsPrivada] = useState(false)

  async function handleSubmit() {
    const trimmed = contenido.trim()
    if (!trimmed) return

    try {
      await createNota.mutateAsync({
        expediente_id: expedienteId,
        contenido: trimmed,
        es_privada: esPrivada,
      })
      setContenido('')
      setEsPrivada(false)
      toast.success('Nota agregada')
    } catch {
      toast.error('Error al crear la nota')
    }
  }

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <MentionTextarea
          value={contenido}
          onChange={setContenido}
          placeholder="Escribí una nota... usá @ para mencionar a alguien"
          rows={3}
          disabled={createNota.isPending}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:opacity-50 transition-all"
        />
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setEsPrivada(!esPrivada)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              esPrivada
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title={esPrivada ? 'Nota privada (solo vos y admins)' : 'Nota pública'}
          >
            {esPrivada ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {esPrivada ? 'Privada' : 'Pública'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!contenido.trim() || createNota.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar
          </button>
        </div>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 px-3 py-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-700" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-700/50" />
              </div>
            </div>
          ))}
        </div>
      ) : notas.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Sin notas todavía</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Usá @ para mencionar a un compañero
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notas.map((nota) => (
            <NotaItem key={nota.id} nota={nota} expedienteId={expedienteId} />
          ))}
        </div>
      )}
    </div>
  )
}
