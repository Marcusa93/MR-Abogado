import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ChevronDown, Loader2, Merge, X } from 'lucide-react'
import { useConsolidarAprendizajes, useFusionarAprendizajes, type ConsolidacionAprendizajes } from '@/hooks/use-plantillas'
import { useDescartarAprendizaje } from '@/hooks/use-aprendizajes'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

type Grupo = ConsolidacionAprendizajes['grupos'][number]

function GrupoCard({ g, onListo }: { g: Grupo; onListo: () => void }) {
  const [texto, setTexto] = useState(g.regla)
  const [abierto, setAbierto] = useState(false)
  const fusionar = useFusionarAprendizajes()
  const aplicar = (aprobar: boolean) => fusionar.mutate(
    { ids: g.ids, contenido: texto, ambito: g.ambito, aprobar },
    { onSuccess: onListo, onError: (e) => toast.error('No se pudo fusionar', e.message) },
  )
  return (
    <li className="rounded-lg border border-white/[0.08] p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="tag-mono text-cyan-300">{g.ids.length} iguales</span>
        {g.ambito && <span className="tag-mono text-zinc-500">{g.ambito}</span>}
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
        className="w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[13px] leading-relaxed text-zinc-100 focus:border-cyan-500/40 focus:outline-none" />
      <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-zinc-500 hover:text-zinc-300">
        <ChevronDown className={cn('h-3 w-3 transition-transform', !abierto && '-rotate-90')} /> Ver las {g.originales.length} originales
      </button>
      {abierto && (
        <ul className="mt-1 space-y-1 pl-4">
          {g.originales.map((o) => (
            <li key={o.id} className="text-[12px] leading-relaxed text-zinc-400">
              {o.contenido}{!o.proposed && <span className="ml-1 font-mono text-[10px] text-emerald-400">activo</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={fusionar.isPending || !texto.trim()} onClick={() => aplicar(true)}
          className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-900 disabled:opacity-50">
          {fusionar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Fusionar y activar
        </button>
        <button type="button" disabled={fusionar.isPending || !texto.trim()} onClick={() => aplicar(false)}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[12px] text-zinc-300 hover:bg-white/5 disabled:opacity-50">
          <Merge className="h-3 w-3" /> Fusionar y dejar propuesto
        </button>
        <button type="button" onClick={onListo} className="px-1 text-[12px] text-zinc-500 hover:text-zinc-300">Dejar como está</button>
      </div>
    </li>
  )
}

/**
 * Ordena los aprendizajes de un abogado: junta los que dicen lo mismo,
 * marca los que solo sirven para un caso y señala contradicciones.
 */
export function OrdenarAprendizajesDialog({ ownerId, nombre, onClose }: { ownerId: string | null; nombre?: string; onClose: () => void }) {
  const consolidar = useConsolidarAprendizajes()
  const descartar = useDescartarAprendizaje()
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const [descartando, setDescartando] = useState(false)
  const r = consolidar.data

  useEffect(() => { consolidar.mutate(ownerId) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const listo = (k: string) => setHechos((s) => new Set(s).add(k))
  const grupos = (r?.grupos ?? []).filter((g) => !hechos.has(g.ids.join()))
  const puntuales = (r?.puntuales ?? []).filter((p) => !hechos.has(p.id))
  const repetidas = (r?.grupos ?? []).reduce((n, g) => n + g.ids.length - 1, 0)

  const descartarPuntuales = async () => {
    setDescartando(true)
    try {
      for (const p of puntuales) { await descartar.mutateAsync(p.id); listo(p.id) }
      toast.success('Descartados', 'Quedan en la pestaña Descartados por si hace falta recuperarlos.')
    } catch (e) { toast.error('No se pudieron descartar todos', e instanceof Error ? e.message : '') }
    finally { setDescartando(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#10161d] shadow-2xl sm:max-w-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Ordenar aprendizajes{nombre ? ` de ${nombre}` : ''}</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {r ? `${r.total} reglas: ${r.grupos.length} grupos repetidos (${repetidas} de más), ${r.puntuales.length} de un solo caso, ${r.contradicciones.length} contradicciones.` : 'La IA agrupa las reglas que dicen lo mismo. Vos decidís qué se fusiona.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {consolidar.isPending && (
            <p className="flex items-center gap-2 text-[13px] text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo todas las reglas… puede tardar hasta un minuto.</p>
          )}
          {consolidar.isError && (
            <div className="space-y-2">
              <p className="text-[13px] text-rose-400">{consolidar.error.message}</p>
              <button type="button" onClick={() => consolidar.mutate(ownerId)} className="text-[12.5px] text-cyan-300">Reintentar</button>
            </div>
          )}

          {r && (r.contradicciones.length > 0) && (
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Se contradicen</p>
              <ul className="space-y-2">
                {r.contradicciones.map((c, i) => (
                  <li key={i} className="rounded-lg border border-amber-500/20 p-3">
                    <p className="flex items-start gap-1.5 text-[12.5px] text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{c.detalle}</p>
                    <ul className="mt-1 space-y-0.5 pl-5">{c.reglas.map((x) => <li key={x.id} className="text-[12px] text-zinc-400">{x.contenido}</li>)}</ul>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11.5px] text-zinc-500">Descartá la que no corresponda desde la lista de aprendizajes.</p>
            </div>
          )}

          {r && (
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Dicen lo mismo</p>
              {grupos.length === 0 ? <p className="text-[12.5px] text-zinc-500">{r.grupos.length ? 'Listo, no quedan grupos.' : 'No hay reglas repetidas.'}</p> : (
                <ul className="space-y-2">{grupos.map((g) => <GrupoCard key={g.ids.join()} g={g} onListo={() => listo(g.ids.join())} />)}</ul>
              )}
            </div>
          )}

          {r && puntuales.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Solo sirven para un caso</p>
                <button type="button" onClick={descartarPuntuales} disabled={descartando}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-zinc-300 hover:bg-white/5 disabled:opacity-50">
                  {descartando && <Loader2 className="h-3 w-3 animate-spin" />} Descartar los {puntuales.length}
                </button>
              </div>
              <ul className="space-y-1.5">
                {puntuales.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-md px-1 py-0.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-zinc-300">{p.contenido}</p>
                      {p.motivo && <p className="text-[11.5px] text-zinc-500">{p.motivo}</p>}
                    </div>
                    <button type="button" title="Conservar" onClick={() => listo(p.id)} className="shrink-0 text-[11.5px] text-zinc-500 hover:text-zinc-300">Conservar</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
