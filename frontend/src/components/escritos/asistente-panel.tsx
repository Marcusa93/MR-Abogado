import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, CheckCheck, Loader2, Sparkles, X } from 'lucide-react'
import {
  aplicarCambio, textoAnterior, useAsistenteEscrito,
  type CambioPropuesto, type MensajeAsistente,
} from '@/hooks/use-redaccion'
import type { EscritoContenido } from '@/hooks/use-escritos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

export interface FocoAsistente { seccion: number; parrafo?: number | null; nonce: number }

const SUGERENCIAS = [
  '¿Qué le falta para presentarlo?',
  'Revisá que cada pedido del petitorio tenga fundamento',
  'Hacé más firme el argumento principal',
  'Acortalo sin perder argumentos',
]

type Estado = 'pendiente' | 'aceptado' | 'rechazado'

/** Corrige los índices de un cambio pendiente después de aplicar otro. Devuelve null si quedó inválido. */
function ajustar(y: CambioPropuesto, x: CambioPropuesto, insertados: number): CambioPropuesto | null {
  const z = { ...y }
  if (x.accion === 'nueva_seccion') {
    if (z.seccion > x.seccion) z.seccion += 1
    return z
  }
  if (z.seccion !== x.seccion) return z
  if (x.accion === 'reemplazar_seccion') return null
  const p = x.parrafo ?? 0
  if (x.accion === 'insertar_despues' && z.parrafo != null && z.parrafo > p) z.parrafo += insertados
  if (x.accion === 'eliminar' && z.parrafo != null) {
    if (z.parrafo === p && z.accion !== 'insertar_despues') return null
    if (z.parrafo > p) z.parrafo -= 1
  }
  return z
}

function etiqueta(x: CambioPropuesto, c: EscritoContenido): string {
  const sec = c.secciones[x.seccion - 1]?.titulo ?? `sección ${x.seccion}`
  switch (x.accion) {
    case 'reemplazar': return `${sec} · párrafo ${x.parrafo} · reescribir`
    case 'eliminar': return `${sec} · párrafo ${x.parrafo} · quitar`
    case 'insertar_despues': return `${sec} · agregar ${x.parrafo ? `después del párrafo ${x.parrafo}` : 'al principio'}`
    case 'reemplazar_seccion': return `${sec} · reescribir la sección`
    case 'nueva_seccion': return `Nueva sección: ${x.titulo ?? ''}`
  }
}

export function AsistentePanel({ escritoId, contenido, onAplicar, foco }: {
  escritoId: string
  contenido: EscritoContenido
  onAplicar: (c: EscritoContenido) => void
  foco: FocoAsistente | null
}) {
  const [mensajes, setMensajes] = useState<MensajeAsistente[]>([])
  const [texto, setTexto] = useState('')
  const [preciso, setPreciso] = useState(false)
  const [focoActivo, setFocoActivo] = useState<FocoAsistente | null>(null)
  const asistente = useAsistenteEscrito()
  const finRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setMensajes([]); setFocoActivo(null) }, [escritoId])
  useEffect(() => {
    if (!foco) return
    setFocoActivo(foco)
    inputRef.current?.focus()
  }, [foco])
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, asistente.isPending])

  const enviar = async (t?: string) => {
    const contenidoMsg = (t ?? texto).trim()
    if (!contenidoMsg || asistente.isPending) return
    const nuevos: MensajeAsistente[] = [...mensajes, { role: 'user', content: contenidoMsg }]
    setMensajes(nuevos)
    setTexto('')
    try {
      const r = await asistente.mutateAsync({
        escrito_id: escritoId,
        contenido,
        mensajes: nuevos.map((m) => ({ role: m.role, content: m.role === 'assistant' && m.cambios?.length ? `${m.content}\n(Propuse ${m.cambios.length} cambios.)` : m.content })),
        foco: focoActivo ? { seccion: focoActivo.seccion, parrafo: focoActivo.parrafo ?? null } : null,
        calidad: preciso ? 'preciso' : 'auto',
      })
      setMensajes((ms) => [...ms, {
        role: 'assistant', content: r.respuesta, cambios: r.cambios,
        estados: r.cambios.map(() => 'pendiente' as Estado), modelo: r.modelo_nombre,
      }])
    } catch (e) {
      setMensajes((ms) => ms.slice(0, -1))
      setTexto(contenidoMsg)
      toast.error('El asistente no respondió', e instanceof Error ? e.message : undefined)
    }
  }

  /** Acepta los cambios indicados de un mensaje, en orden seguro, y ajusta los pendientes. */
  const aceptar = (mi: number, indices: number[]) => {
    const m = mensajes[mi]
    if (!m?.cambios || !m.estados) return
    let cambios = [...m.cambios]
    const estados = [...m.estados] as Estado[]
    let c = contenido
    // De atrás para adelante para que un cambio no corra los índices del otro
    const orden = [...indices].sort((a, b) => (cambios[b].seccion - cambios[a].seccion) || ((cambios[b].parrafo ?? 0) - (cambios[a].parrafo ?? 0)))
    for (const i of orden) {
      if (estados[i] !== 'pendiente') continue
      const x = cambios[i]
      const antes = c.secciones[x.seccion - 1]?.parrafos.length ?? 0
      c = aplicarCambio(c, x)
      const despues = c.secciones[x.seccion - 1]?.parrafos.length ?? 0
      estados[i] = 'aceptado'
      cambios = cambios.map((y, j) => {
        if (j === i || estados[j] !== 'pendiente' || orden.includes(j)) return y
        const z = ajustar(y, x, despues - antes)
        if (!z) { estados[j] = 'rechazado'; return y }
        return z
      })
    }
    onAplicar(c)
    setMensajes((ms) => ms.map((mm, k) => (k === mi ? { ...mm, cambios, estados } : mm)))
  }

  const rechazar = (mi: number, i: number) =>
    setMensajes((ms) => ms.map((mm, k) => (k === mi && mm.estados ? { ...mm, estados: mm.estados.map((e, j) => (j === i ? 'rechazado' : e)) } : mm)))

  const focoTexto = focoActivo
    ? `${contenido.secciones[focoActivo.seccion - 1]?.titulo ?? `Sección ${focoActivo.seccion}`}${focoActivo.parrafo ? ` · párrafo ${focoActivo.parrafo}` : ''}`
    : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-sm font-medium text-zinc-200">Asistente</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500" title="Usa el modelo más potente (más lento y más caro)">
          <input type="checkbox" checked={preciso} onChange={(e) => setPreciso(e.target.checked)} className="accent-cyan-500" />
          preciso
        </label>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12.5px] leading-relaxed text-zinc-400">
              Pedile cambios o preguntale sobre el escrito. Propone cada cambio por separado y vos decidís cuáles aplicar.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)}
                  className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-left text-[12.5px] text-zinc-300 hover:border-white/20 hover:bg-white/[0.03]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, mi) => m.role === 'user' ? (
          <div key={mi} className="ml-6 rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] text-zinc-100">{m.content}</div>
        ) : (
          <div key={mi} className="space-y-2">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{m.content}</p>
            {m.cambios && m.cambios.length > 0 && (
              <div className="space-y-2">
                {m.cambios.filter((_, i) => m.estados?.[i] === 'pendiente').length > 1 && (
                  <button type="button" onClick={() => aceptar(mi, m.cambios!.map((_, i) => i).filter((i) => m.estados?.[i] === 'pendiente'))}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-cyan-300 hover:text-cyan-200">
                    <CheckCheck className="h-3.5 w-3.5" /> Aceptar todos
                  </button>
                )}
                {m.cambios.map((x, i) => {
                  const estado = m.estados?.[i] ?? 'pendiente'
                  const antes = estado === 'pendiente' ? textoAnterior(contenido, x) : null
                  return (
                    <div key={i} className={cn('rounded-lg border p-2.5', estado === 'pendiente' ? 'border-white/10' : 'border-white/5 opacity-60')}>
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-zinc-500">{etiqueta(x, contenido)}</p>
                      {x.motivo && <p className="mt-1 text-[12px] text-zinc-400">{x.motivo}</p>}
                      {antes && x.accion !== 'reemplazar_seccion' && (
                        <p className="mt-1.5 rounded bg-rose-500/[0.07] px-2 py-1 text-[12px] leading-relaxed text-rose-200/70 line-through decoration-rose-400/40">{antes}</p>
                      )}
                      {x.texto && x.accion !== 'eliminar' && (
                        <p className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-emerald-500/[0.07] px-2 py-1 text-[12px] leading-relaxed text-emerald-100/90">{x.texto}</p>
                      )}
                      {estado === 'pendiente' ? (
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => aceptar(mi, [i])}
                            className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-900 hover:opacity-90">
                            <Check className="h-3.5 w-3.5" /> Aceptar
                          </button>
                          <button type="button" onClick={() => rechazar(mi, i)}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[12px] text-zinc-300 hover:bg-white/5">
                            <X className="h-3.5 w-3.5" /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <p className={cn('mt-1.5 font-mono text-[10.5px]', estado === 'aceptado' ? 'text-emerald-400' : 'text-zinc-500')}>{estado === 'aceptado' ? 'aplicado' : 'descartado'}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {m.modelo && <p className="font-mono text-[10px] text-zinc-600">{m.modelo}</p>}
          </div>
        ))}
        {asistente.isPending && <p className="flex items-center gap-2 text-[12.5px] text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…</p>}
        <div ref={finRef} />
      </div>

      <div className="border-t border-white/5 p-2.5">
        {focoTexto && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="tag-mono max-w-full truncate">sobre: {focoTexto}</span>
            <button type="button" onClick={() => setFocoActivo(null)} className="rounded p-0.5 text-zinc-500 hover:text-zinc-200" title="Quitar foco"><X className="h-3 w-3" /></button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 focus-within:border-cyan-500/40">
          <textarea
            ref={inputRef} value={texto} rows={2} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
            placeholder="Pedí un cambio o hacé una pregunta…"
            className="flex-1 resize-none bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <button type="button" onClick={() => void enviar()} disabled={!texto.trim() || asistente.isPending}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-900 disabled:opacity-30" title="Enviar">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
