import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, MessageSquareWarning, Send, UserCheck, X } from 'lucide-react'
import { useRevisionEscrito, useRevisores, type Escrito, type Revisor } from '@/hooks/use-escritos'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Revisión de un escrito entre personas del estudio: pedirla, verla y resolverla.

const nombre = (r: Revisor | undefined) => (r ? `${r.nombre ?? ''} ${r.apellido ?? ''}`.trim() : 'alguien del estudio')
const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : ''

const campo = 'w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm text-zinc-900 focus:border-cyan-500 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'

export function EnviarRevisionDialog({ escrito, onClose }: { escrito: Escrito; onClose: () => void }) {
  const yo = useAuthStore((s) => s.user?.id)
  const { data: revisores = [], isLoading } = useRevisores()
  const opciones = revisores.filter((r) => r.id !== yo)
  const director = opciones.find((r) => r.rol === 'DIRECTOR')
  const [revisor, setRevisor] = useState<string>('')
  const elegido = revisor || director?.id || opciones[0]?.id || ''
  const [nota, setNota] = useState('')
  const pedir = useRevisionEscrito()

  const enviar = () => pedir.mutate({ modo: 'pedir', escrito_id: escrito.id, revisor_id: elegido, nota }, {
    onSuccess: (r) => {
      const quien = nombre(opciones.find((o) => o.id === elegido))
      toast.success(`Enviado a revisión de ${quien}`, r.telegram ? 'Le llegó el aviso por Telegram, con el PDF.' : 'No tiene Telegram vinculado: lo va a ver en Escritos, en «Para revisar».')
      onClose()
    },
    onError: (e) => toast.error('No se pudo enviar', e instanceof Error ? e.message : undefined),
  })

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-t-xl bg-white p-4 shadow-xl dark:bg-[var(--card)] sm:rounded-xl" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start gap-2">
          <p className="flex flex-1 items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50"><UserCheck className="h-4 w-4 text-cyan-500" /> Enviar a revisión</p>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-zinc-400" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <p className="line-clamp-1 text-xs text-zinc-500">"{escrito.titulo}"</p>
        <label className="block space-y-1 text-xs text-zinc-500">¿Quién lo revisa?
          <select value={elegido} onChange={(e) => setRevisor(e.target.value)} disabled={isLoading} className={cn(campo, 'min-h-10')}>
            {opciones.map((r) => <option key={r.id} value={r.id}>{nombre(r)}{r.rol === 'DIRECTOR' ? ' (director)' : ''}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-xs text-zinc-500">Nota (opcional)
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={1000}
            placeholder="Ej.: fijate el cálculo del punto II; vence el jueves." className={cn(campo, 'py-2')} />
        </label>
        <p className="text-xs text-zinc-500">Le llega por Telegram con el PDF y botones para aprobar o devolver con observaciones. La respuesta te llega a vos.</p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-xl border border-zinc-200 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">Cancelar</button>
          <button type="button" onClick={enviar} disabled={!elegido || pedir.isPending}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 text-sm font-medium text-white disabled:opacity-50">
            {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Estado de la revisión arriba del editor; a quien revisa le da los botones para resolverla. */
export function BannerRevision({ escrito }: { escrito: Escrito }) {
  const yo = useAuthStore((s) => s.user?.id)
  const { data: revisores = [] } = useRevisores()
  const resolver = useRevisionEscrito()
  const [devolviendo, setDevolviendo] = useState(false)
  const [obs, setObs] = useState('')
  if (!escrito.revision_pedida_a) return null

  const revisor = nombre(revisores.find((r) => r.id === escrito.revision_pedida_a))
  const pidio = escrito.revision_pedida_por === yo ? 'Vos' : nombre(revisores.find((r) => r.id === escrito.revision_pedida_por))
  const soyRevisor = escrito.revision_pedida_a === yo
  const pendiente = !escrito.revision_resultado

  const accion = (resultado: 'aprobado' | 'cambios') => resolver.mutate(
    { modo: 'resolver', escrito_id: escrito.id, resultado, observaciones: resultado === 'cambios' ? obs : undefined },
    {
      onSuccess: (r) => { toast.success(resultado === 'aprobado' ? 'Escrito aprobado' : 'Devuelto con observaciones', r.avisado ? 'Le llegó el aviso por Telegram.' : undefined); setDevolviendo(false) },
      onError: (e) => toast.error('No se pudo completar', e instanceof Error ? e.message : undefined),
    },
  )

  if (pendiente) {
    return (
      <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
          <UserCheck className="h-4 w-4 shrink-0" />
          {soyRevisor ? `${pidio} te pidió revisarlo` : `En revisión con ${revisor}`}
          <span className="font-normal text-amber-700/80 dark:text-amber-200/60">· {fecha(escrito.revision_pedida_at)}</span>
        </p>
        {escrito.revision_nota && <p className="mt-1 text-[13px] text-amber-900/90 dark:text-amber-100/80">Nota: {escrito.revision_nota}</p>}
        {soyRevisor && !devolviendo && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => accion('aprobado')} disabled={resolver.isPending}
              className="flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50">
              {resolver.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprobar
            </button>
            <button type="button" onClick={() => setDevolviendo(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-400 px-3 text-sm font-medium text-amber-900 dark:border-amber-500/40 dark:text-amber-200">
              <MessageSquareWarning className="h-4 w-4" /> Devolver con observaciones
            </button>
          </div>
        )}
        {soyRevisor && devolviendo && (
          <div className="mt-2 space-y-2">
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} autoFocus placeholder="Qué hay que corregir"
              className={cn(campo, 'py-2')} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setDevolviendo(false)} className="min-h-9 rounded-lg px-3 text-sm text-zinc-600 dark:text-zinc-300">Cancelar</button>
              <button type="button" onClick={() => accion('cambios')} disabled={!obs.trim() || resolver.isPending}
                className="flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white disabled:opacity-50">
                {resolver.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Devolver
              </button>
            </div>
          </div>
        )}
        {!soyRevisor && escrito.revision_pedida_por === yo && (
          <button type="button" onClick={() => resolver.mutate({ modo: 'cancelar', escrito_id: escrito.id })}
            className="mt-1.5 text-xs text-amber-800 underline dark:text-amber-200/80">Cancelar el pedido</button>
        )}
      </div>
    )
  }

  if (escrito.revision_resultado === 'aprobado') {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Aprobado por {revisor}
        <span className="font-normal opacity-70">· {fecha(escrito.revision_resuelta_at)}</span>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
      <p className="flex items-center gap-2 font-medium text-rose-900 dark:text-rose-200">
        <MessageSquareWarning className="h-4 w-4 shrink-0" /> {revisor} lo devolvió con observaciones
        <span className="font-normal opacity-70">· {fecha(escrito.revision_resuelta_at)}</span>
      </p>
      {escrito.revision_observaciones && <p className="mt-1 whitespace-pre-wrap text-[13px] text-rose-900/90 dark:text-rose-100/85">{escrito.revision_observaciones}</p>}
    </div>
  )
}
