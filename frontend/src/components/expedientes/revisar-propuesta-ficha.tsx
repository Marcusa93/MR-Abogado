import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Sparkles, Mic } from 'lucide-react'
import { toast } from '@/stores/toast-store'
import { useGuardarFicha, useResolverPropuesta } from '@/hooks/use-ficha'
import { useUpdateExpediente } from '@/hooks/use-expedientes'
import { aplicarCambios, describirCambio, fichaVacia, type Ficha, type PropuestaFicha } from '@/lib/expedientes/ficha'

// Revisión de las novedades propuestas para la ficha, una por vez.
// Todo viene tildado; se destilda lo que no corresponde y se incorpora.

export function RevisarPropuestaFicha({ expedienteId, ficha, propuestas, onCerrar }: {
  expedienteId: string
  ficha: Ficha | null
  propuestas: PropuestaFicha[]
  onCerrar: () => void
}) {
  const guardar = useGuardarFicha(expedienteId)
  const resolver = useResolverPropuesta(expedienteId)
  const updateExpediente = useUpdateExpediente()
  const [trabajando, setTrabajando] = useState(false)
  const [restantes, setRestantes] = useState(propuestas)
  const actual = restantes[0]
  const [sel, setSel] = useState<Set<number>>(new Set())

  useEffect(() => { setSel(new Set(actual?.cambios.map((_, i) => i) ?? [])) }, [actual?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!actual) onCerrar() }, [actual]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!actual) return null

  const siguiente = () => setRestantes((r) => r.slice(1))
  const total = propuestas.length
  const numero = total - restantes.length + 1

  const descartar = async () => {
    setTrabajando(true)
    try { await resolver.mutateAsync({ id: actual.id, estado: 'descartada' }); siguiente() }
    catch (e) { toast.error('No se pudo descartar', e instanceof Error ? e.message : undefined) }
    finally { setTrabajando(false) }
  }

  const incorporar = async () => {
    setTrabajando(true)
    try {
      const elegidos = actual.cambios.filter((_, i) => sel.has(i))
      // Se aplica sobre la ficha más reciente: puede haber cambiado con la propuesta anterior
      const base = ficha ?? fichaVacia(expedienteId)
      const { ficha: nueva, etapa } = aplicarCambios(base, elegidos)
      const { expediente_id: _e, updated_at: _u, ...datos } = nueva
      await guardar.mutateAsync(datos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (etapa) await updateExpediente.mutateAsync({ id: expedienteId, etapa_procesal: etapa } as any)
      await resolver.mutateAsync({ id: actual.id, estado: 'aplicada' })
      if (restantes.length === 1) toast.success('Ficha actualizada')
      siguiente()
    } catch (e) {
      toast.error('No se pudo incorporar', e instanceof Error ? e.message : undefined)
    } finally {
      setTrabajando(false)
    }
  }

  const items = actual.cambios.map((c, i) => ({ i, ...describirCambio(c, ficha) }))
  const secciones = [...new Set(items.map((x) => x.seccion))]
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-2xl dark:bg-zinc-900">
        <div className="flex items-start gap-2 border-b border-zinc-100 px-4 py-3 dark:border-white/10">
          {actual.origen === 'dictado' ? <Mic className="mt-0.5 h-4 w-4 text-blue-600" /> : <Sparkles className="mt-0.5 h-4 w-4 text-blue-600" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {actual.origen === 'dictado' ? 'Así quedaría lo que agregaste' : 'Novedad del SAE'}
              {total > 1 && <span className="ml-1.5 font-normal text-zinc-500">· {numero} de {total}</span>}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{actual.titulo}</p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-2 py-3 sm:px-3">
          <p className="px-2 text-xs text-zinc-500">Destildá lo que no corresponda. Después lo podés corregir tocando el texto en la ficha.</p>
          {secciones.map((s) => (
            <section key={s} className="space-y-0.5">
              <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{s}</h3>
              {items.filter((x) => x.seccion === s).map((x) => (
                <label key={x.i} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5">
                  <input type="checkbox" checked={sel.has(x.i)} onChange={() => toggle(x.i)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                  <span className="min-w-0">
                    {x.texto}
                    {x.nota && <span className="block text-xs text-zinc-500">{x.nota}</span>}
                  </span>
                </label>
              ))}
            </section>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-white/10">
          <button type="button" onClick={descartar} disabled={trabajando} className="min-h-10 rounded-lg px-3 text-sm text-zinc-600 disabled:opacity-50 dark:text-zinc-300">
            Descartar
          </button>
          <button type="button" onClick={incorporar} disabled={trabajando || sel.size === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            {trabajando && <Loader2 className="h-4 w-4 animate-spin" />} Incorporar a la ficha
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
