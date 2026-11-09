import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUpdateConsulta, TIPO_ASUNTO_LABEL, type Consulta, type ConsultaTipoAsunto } from '@/hooks/use-consultas'
import { useDocumentosRequeridos, useAgregarDocumentos } from '@/hooks/use-documentacion'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Después de una entrevista: la IA propone qué incorporar a la consulta
// (hechos nuevos, datos del cliente, áreas, preguntas, documentación, plazos)
// sin pisar lo cargado. Cada punto se acepta o descarta antes de aplicar.

interface Propuesta {
  hechos_nuevos: string[]
  contradicciones: string[]
  datos_cliente: Partial<Record<'nombre' | 'apellido' | 'telefono' | 'email', string>>
  areas: string[]
  preguntas_respondidas: number[]
  preguntas_nuevas: string[]
  documentacion: string[]
  plazos: string[]
}

const DATO: Record<string, string> = { nombre: 'Nombre', apellido: 'Apellido', telefono: 'Teléfono', email: 'Email' }

export function IncorporarEntrevista({ consulta, transcripcion, marcas, notas, areas, onAplicado, onCerrar, onOrdenar }: {
  consulta: Consulta
  transcripcion: string
  marcas: string[]
  notas: string
  areas: string[]
  onAplicado: (r: { notas: string; areas: string[] }) => void
  onCerrar: () => void
  onOrdenar: () => void
}) {
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const [listo, setListo] = useState(false)
  const update = useUpdateConsulta()
  const caso = { consultaId: consulta.id }
  const { data: docs = [] } = useDocumentosRequeridos(caso)
  const agregarDocs = useAgregarDocumentos(caso)
  const preguntas = consulta.preguntas_sugeridas ?? []

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data, error } = await createClient().functions.invoke('consulta-transcribir', {
        body: { accion: 'incorporar', consulta_id: consulta.id, transcripcion, marcas },
      })
      if (!vivo) return
      if (error || !(data as { propuesta?: Propuesta })?.propuesta) {
        let msg = 'No se pudo analizar la entrevista.'
        try { msg = ((await (error as { context?: Response })?.context?.json()) as { error?: string })?.error ?? msg } catch { /* */ }
        setError(msg)
        return
      }
      const p = (data as { propuesta: Propuesta }).propuesta
      setPropuesta(p)
      // Todo marcado por defecto, salvo las contradicciones (son para leer)
      setSel(new Set([
        ...p.hechos_nuevos.map((_, i) => `h${i}`), ...Object.keys(p.datos_cliente).map((k) => `d:${k}`),
        ...p.areas.filter((a) => !areas.includes(a)).map((a) => `a:${a}`),
        ...p.preguntas_respondidas.map((n) => `pr${n}`), ...p.preguntas_nuevas.map((_, i) => `pn${i}`),
        ...p.documentacion.map((_, i) => `doc${i}`), ...p.plazos.map((_, i) => `pl${i}`),
      ]))
    })()
    return () => { vivo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const aplicar = async () => {
    if (!propuesta) return
    setAplicando(true)
    try {
      const fecha = new Date().toLocaleDateString('es-AR')
      const hechos = propuesta.hechos_nuevos.filter((_, i) => sel.has(`h${i}`))
      const plazos = propuesta.plazos.filter((_, i) => sel.has(`pl${i}`))
      const aclarar = propuesta.contradicciones.filter((_, i) => sel.has(`c${i}`))
      let nuevasNotas = notas
      const bloque = [
        hechos.length ? `Surge de la entrevista del ${fecha}:\n${hechos.map((h) => `- ${h}`).join('\n')}` : '',
        aclarar.length ? `A aclarar (diferencias con lo cargado antes):\n${aclarar.map((h) => `- ${h}`).join('\n')}` : '',
        plazos.length ? `Plazos a controlar:\n${plazos.map((h) => `- ${h}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n')
      if (bloque) nuevasNotas = [notas.trim(), bloque].filter(Boolean).join('\n\n')

      const nuevasAreas = [...areas, ...propuesta.areas.filter((a) => sel.has(`a:${a}`) && !areas.includes(a))]
      const respondidas = new Set(propuesta.preguntas_respondidas.filter((n) => sel.has(`pr${n}`)))
      const nuevasPreguntas = [
        ...preguntas.filter((_, i) => !respondidas.has(i)),
        ...propuesta.preguntas_nuevas.filter((_, i) => sel.has(`pn${i}`)),
      ]
      const datos = Object.fromEntries(Object.entries(propuesta.datos_cliente).filter(([k]) => sel.has(`d:${k}`)))

      await update.mutateAsync({
        id: consulta.id, notas_libres: nuevasNotas, areas_derecho: nuevasAreas, preguntas_sugeridas: nuevasPreguntas, ...datos,
      } as Partial<Consulta> & { id: string })

      const documentos = propuesta.documentacion.filter((_, i) => sel.has(`doc${i}`))
      if (documentos.length) await agregarDocs.mutateAsync({ items: documentos.map((nombre) => ({ nombre })), existentes: docs })

      onAplicado({ notas: nuevasNotas, areas: nuevasAreas })
      setListo(true)
    } catch (e) {
      toast.error('No se pudo aplicar', e instanceof Error ? e.message : undefined)
    } finally {
      setAplicando(false)
    }
  }

  const Fila = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5">
      <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
      <span className="min-w-0">{children}</span>
    </label>
  )
  const Seccion = ({ titulo, children, n }: { titulo: string; children: React.ReactNode; n: number }) => n ? (
    <section className="space-y-0.5">
      <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{titulo}</h3>
      {children}
    </section>
  ) : null

  const p = propuesta
  const vacio = p && !p.hechos_nuevos.length && !p.contradicciones.length && !Object.keys(p.datos_cliente).length && !p.areas.filter((a) => !areas.includes(a)).length
    && !p.preguntas_respondidas.length && !p.preguntas_nuevas.length && !p.documentacion.length && !p.plazos.length

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-2xl sm:rounded-xl dark:bg-[var(--card)]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <Sparkles className="h-4 w-4 text-blue-600" /> Incorporar la entrevista a la consulta
          </h2>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3 sm:px-3">
          {!p && !error && (
            <p className="flex items-center gap-2 px-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la entrevista y comparándola con lo cargado…</p>
          )}
          {error && <p className="px-2 text-sm text-red-600">{error}</p>}
          {listo ? (
            <div className="space-y-3 px-2">
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Listo, se incorporó a la consulta.</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Conviene volver a ordenar los hechos para que el relato cronológico incluya lo nuevo.</p>
            </div>
          ) : p && (
            <>
              {vacio && <p className="px-2 text-sm text-zinc-500">La entrevista no agrega nada nuevo a lo que ya está cargado.</p>}
              <p className="px-2 text-xs text-zinc-500">Destildá lo que no quieras incorporar. No se borra nada de lo que ya está cargado.</p>
              <Seccion titulo="Hechos nuevos (se agregan a Hechos del caso)" n={p.hechos_nuevos.length}>
                {p.hechos_nuevos.map((h, i) => <Fila key={i} k={`h${i}`}>{h}</Fila>)}
              </Seccion>
              <Seccion titulo="Diferencias con lo cargado antes" n={p.contradicciones.length}>
                {p.contradicciones.map((h, i) => (
                  <Fila key={i} k={`c${i}`}><span className="inline-flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{h}</span>
                    <span className="block text-[11px] text-zinc-500">Tildala para dejarla anotada como "a aclarar".</span></Fila>
                ))}
              </Seccion>
              <Seccion titulo="Datos del cliente (solo los que estaban vacíos)" n={Object.keys(p.datos_cliente).length}>
                {Object.entries(p.datos_cliente).map(([k, v]) => <Fila key={k} k={`d:${k}`}><b>{DATO[k] ?? k}:</b> {v}</Fila>)}
              </Seccion>
              <Seccion titulo="Áreas del derecho" n={p.areas.filter((a) => !areas.includes(a)).length}>
                {p.areas.filter((a) => !areas.includes(a)).map((a) => <Fila key={a} k={`a:${a}`}>{TIPO_ASUNTO_LABEL[a as ConsultaTipoAsunto] ?? a}</Fila>)}
              </Seccion>
              <Seccion titulo="Preguntas que ya quedaron respondidas (se quitan)" n={p.preguntas_respondidas.length}>
                {p.preguntas_respondidas.map((n) => <Fila key={n} k={`pr${n}`}><span className="line-through decoration-zinc-400">{preguntas[n]}</span></Fila>)}
              </Seccion>
              <Seccion titulo="Preguntas que faltan hacer" n={p.preguntas_nuevas.length}>
                {p.preguntas_nuevas.map((h, i) => <Fila key={i} k={`pn${i}`}>{h}</Fila>)}
              </Seccion>
              <Seccion titulo="Documentación a pedirle (se suma a la lista)" n={p.documentacion.length}>
                {p.documentacion.map((h, i) => <Fila key={i} k={`doc${i}`}>{h}</Fila>)}
              </Seccion>
              <Seccion titulo="Plazos a controlar" n={p.plazos.length}>
                {p.plazos.map((h, i) => <Fila key={i} k={`pl${i}`}>{h}</Fila>)}
              </Seccion>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-white/10">
          {listo ? (
            <>
              <button type="button" onClick={onCerrar} className="min-h-10 rounded-lg px-3 text-sm text-zinc-600 dark:text-zinc-300">Cerrar</button>
              <button type="button" onClick={() => { onCerrar(); onOrdenar() }}
                className="min-h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">Ordenar hechos con IA</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCerrar} className="min-h-10 rounded-lg px-3 text-sm text-zinc-600 dark:text-zinc-300">Ahora no</button>
              <button type="button" onClick={aplicar} disabled={!p || aplicando || sel.size === 0}
                className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50')}>
                {aplicando && <Loader2 className="h-4 w-4 animate-spin" />} Incorporar lo seleccionado
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
