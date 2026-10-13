import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookMarked, ExternalLink, Lightbulb, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import {
  useEjes, useEstilo, useEvidencia, useEditarEditorial,
  ESTADO_ARTICULO_LABEL, type Articulo,
} from '@/hooks/use-editorial'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Lo que el módulo aprende: líneas temáticas (tesis y preguntas abiertas),
// guía de estilo de Marco y biblioteca de evidencia comprobada.

const VACIO = 'rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/10'
const BTN = 'flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium disabled:opacity-50'

// ── Líneas temáticas ────────────────────────────────────────────────────────

export function LineasPanel({ articulos }: { articulos: Articulo[] }) {
  const { data, isLoading } = useEjes()
  const editar = useEditarEditorial()
  const [proponiendo, setProponiendo] = useState<string | null>(null)

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
  const ejes = data?.ejes ?? []
  if (!ejes.length) {
    return <p className={VACIO}>Las líneas se arman solas: cuando aprobás un artículo, el sistema lo ubica en una línea temática y guarda sus tesis y las preguntas que deja abiertas.</p>
  }

  const proponer = async (t: { id: string; texto: string; eje_id: string | null }) => {
    setProponiendo(t.id)
    try {
      const nueva = await editar.mutateAsync({ tabla: 'editorial_propuestas', accion: 'insert', datos: {
        origen: 'manual', titulo: t.texto.replace(/^¿|\?$/g, '').slice(0, 140), pregunta: t.texto, eje_id: t.eje_id,
        problema: 'Continuación de una línea temática: pregunta que dejó abierta un artículo anterior.',
      } })
      if (nueva?.id) await editar.mutateAsync({ tabla: 'editorial_tesis', accion: 'update', id: t.id, datos: { propuesta_id: nueva.id } })
      toast.success('Propuesta creada', 'La encontrás en la pestaña Propuestas.')
    } catch (e) {
      toast.error('No se pudo crear la propuesta', e instanceof Error ? e.message : undefined)
    } finally { setProponiendo(null) }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">Cada línea guarda las tesis que ya sostuviste y las preguntas abiertas. La IA las usa para no contradecirte, remitir a artículos anteriores y proponer la continuación de cada serie.</p>
      {ejes.map((eje) => {
        const arts = articulos.filter((a) => a.eje_id === eje.id)
        const tesis = (data?.tesis ?? []).filter((t) => t.eje_id === eje.id && t.tipo === 'tesis')
        const preguntas = (data?.tesis ?? []).filter((t) => t.eje_id === eje.id && t.tipo === 'pregunta')
        return (
          <div key={eje.id} className="dashboard-panel space-y-3 rounded-2xl p-4">
            <div>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{eje.nombre}</p>
              {eje.descripcion && <p className="text-sm text-zinc-500">{eje.descripcion}</p>}
            </div>
            {arts.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Artículos · {arts.length}</p>
                <ul className="mt-1 space-y-1">
                  {arts.map((a) => (
                    <li key={a.id}>
                      <Link to={`/editorial/${a.id}`} className="text-sm text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">{a.titulo}</Link>
                      <span className="text-xs text-zinc-500"> · {ESTADO_ARTICULO_LABEL[a.estado]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tesis.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tesis sostenidas</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-zinc-700 dark:text-zinc-300">{tesis.map((t) => <li key={t.id}>{t.texto}</li>)}</ul>
              </div>
            )}
            {preguntas.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preguntas abiertas · próximos artículos posibles</p>
                <ul className="mt-1 space-y-2">
                  {preguntas.map((t) => (
                    <li key={t.id} className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-2.5 text-sm dark:border-white/10 sm:flex-row sm:items-center">
                      <span className="flex-1 text-zinc-700 dark:text-zinc-300"><Lightbulb className="mr-1 inline h-3.5 w-3.5 text-amber-500" />{t.texto}</span>
                      {t.propuesta_id
                        ? <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">Ya propuesta</span>
                        : <button type="button" onClick={() => { void proponer(t) }} disabled={proponiendo === t.id}
                            className={`${BTN} shrink-0 border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5`}>
                            {proponiendo === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Proponer como artículo
                          </button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Guía de estilo ──────────────────────────────────────────────────────────

export function EstiloPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const { data: reglas = [], isLoading } = useEstilo()
  const editar = useEditarEditorial()
  const [nueva, setNueva] = useState('')

  const agregar = () => editar.mutate({ tabla: 'editorial_estilo', accion: 'insert', datos: { regla: nueva.trim(), origen: 'manual' } }, {
    onSuccess: () => { setNueva(''); toast.success('Regla agregada') },
    onError: (e) => toast.error('No se pudo agregar', e instanceof Error ? e.message : undefined),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Cuando aprobás un artículo que corregiste, el sistema compara el borrador de la IA con tu versión y deduce reglas de tu estilo.
        Se aplican en cada redacción, depuración y edición con IA. Las más confirmadas pesan más.
      </p>
      {puedeEditar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Agregar una regla propia (p. ej.: no abrir con definiciones)"
            className="min-h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" />
          <button type="button" onClick={agregar} disabled={nueva.trim().length < 6 || editar.isPending}
            className={`${BTN} min-h-10 bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]`}><Plus className="h-4 w-4" /> Agregar</button>
        </div>
      )}
      {!reglas.length ? (
        <p className={VACIO}>Todavía no hay reglas. Empieza a aprender con el primer artículo que corrijas y apruebes.</p>
      ) : (
        <ul className="space-y-2">
          {reglas.map((r) => (
            <li key={r.id} className={cn('dashboard-panel rounded-xl p-3 text-sm', !r.activa && 'opacity-50')}>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-zinc-800 dark:text-zinc-100">{r.regla}</p>
                {puedeEditar && (
                  <>
                    <button type="button" onClick={() => editar.mutate({ tabla: 'editorial_estilo', accion: 'update', id: r.id, datos: { activa: !r.activa } })}
                      className="shrink-0 text-xs text-zinc-500 underline">{r.activa ? 'Pausar' : 'Activar'}</button>
                    <button type="button" aria-label="Eliminar regla" onClick={() => editar.mutate({ tabla: 'editorial_estilo', accion: 'delete', id: r.id }, { onSuccess: () => toast.info('Regla eliminada') })}
                      className="shrink-0 rounded p-1 text-zinc-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
              {(r.antes || r.despues) && (
                <p className="mt-1 text-xs text-zinc-500">
                  {r.antes && <span className="line-through decoration-rose-400/60">{r.antes}</span>}{r.antes && r.despues && ' → '}
                  {r.despues && <span className="text-emerald-700 dark:text-emerald-400">{r.despues}</span>}
                </p>
              )}
              <p className="mt-1 text-[11px] text-zinc-400">{r.origen === 'manual' ? 'Agregada a mano' : `Aprendida · confirmada ${r.veces} ${r.veces === 1 ? 'vez' : 'veces'}`}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Biblioteca de evidencia ─────────────────────────────────────────────────

export function BibliotecaPanel() {
  const { data: evidencia = [], isLoading } = useEvidencia()
  const [q, setQ] = useState('')
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? evidencia.filter((e) => `${e.afirmacion} ${e.fuente ?? ''} ${e.cita ?? ''}`.toLowerCase().includes(t)) : evidencia
  }, [evidencia, q])

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Toda cita que el sistema comprobó contra su fuente queda acá. Los artículos nuevos la usan como evidencia, la verificación de citas la
        cuenta como verificada y el pedido a Gemini no la vuelve a buscar.
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${evidencia.length} fuentes comprobadas`}
          className="min-h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" />
      </div>
      {!visibles.length ? (
        <p className={VACIO}>{evidencia.length ? 'Nada coincide con la búsqueda.' : 'Se llena sola con las investigaciones de Gemini que cargues.'}</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((e) => (
            <li key={e.id} className="dashboard-panel rounded-xl p-3 text-sm">
              <p className="flex items-start gap-1.5 text-zinc-800 dark:text-zinc-100"><BookMarked className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{e.afirmacion}</p>
              <p className="mt-1 text-xs text-zinc-500">{e.tipo}{e.fuente ? ` · ${e.fuente}` : ''}{e.vigencia ? ` · ${e.vigencia}` : ''}</p>
              {e.cita && <p className="mt-1 border-l-2 border-zinc-200 pl-2 text-xs italic text-zinc-600 dark:border-white/15 dark:text-zinc-400">“{e.cita}”</p>}
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-7 items-center gap-1 text-xs text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
                  <ExternalLink className="h-3 w-3" /> {(() => { try { return new URL(e.url).hostname.replace(/^www\./, '') } catch { return 'fuente' } })()}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
