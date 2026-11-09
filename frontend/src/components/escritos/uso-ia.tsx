import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { useUsoIA } from '@/hooks/use-plantillas'
import { nombreModeloCorto } from '@/lib/escritos/modelos'
import { cn } from '@/lib/utils'

type Periodo = 'mes' | 'trimestre' | 'anio'

function rango(p: Periodo): [Date, Date] {
  const hoy = new Date()
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1)
  if (p === 'mes') return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta]
  if (p === 'trimestre') return [new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1), hasta]
  return [new Date(hoy.getFullYear(), 0, 1), hasta]
}

const usd = (n: number | null | undefined) => (n == null ? '—' : `US$ ${Number(n).toFixed(2)}`)
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(0)} %`)
const th = 'px-2 py-1.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.1em] text-zinc-500'
const td = 'px-2 py-1.5 text-[12.5px] text-zinc-300'

/** Gasto de IA en escritos y cuánto corrige cada abogado lo que redacta la IA. */
export function UsoIADialog({ onClose }: { onClose: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, hasta] = useMemo(() => rango(periodo), [periodo])
  const { data, isLoading, error } = useUsoIA(desde, hasta)

  const tot = useMemo(() => {
    const a = data?.por_abogado ?? []
    const conEd = a.filter((x) => x.edicion_promedio != null)
    return {
      costo: a.reduce((s, x) => s + Number(x.costo_redaccion) + Number(x.costo_asistente) + Number(x.costo_revision), 0),
      ia: a.reduce((s, x) => s + x.escritos_ia, 0),
      plantilla: a.reduce((s, x) => s + x.escritos_plantilla, 0),
      firmados: a.reduce((s, x) => s + x.firmados, 0),
      edicion: conEd.length ? conEd.reduce((s, x) => s + Number(x.edicion_promedio), 0) / conEd.length : null,
    }
  }, [data])
  const tipos = (data?.por_tipo ?? []).slice(0, 20)

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#10161d] shadow-2xl sm:max-w-3xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Uso de IA en escritos</h2>
            <p className="mt-0.5 text-xs text-zinc-400">Cuánto se gasta y cuánto corrige cada abogado lo que redacta la IA antes de firmar.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="flex w-fit overflow-hidden rounded-md border border-white/10 text-[12px]">
            {([['mes', 'Este mes'], ['trimestre', 'Últimos 3 meses'], ['anio', 'Este año']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPeriodo(k)}
                className={cn('px-3 py-1', periodo === k ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200')}>{l}</button>
            ))}
          </div>

          {isLoading && <p className="flex items-center gap-2 text-[13px] text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}
          {error && <p className="text-[13px] text-rose-400">No se pudo cargar: {(error as Error).message}</p>}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Gasto', usd(tot.costo)],
                  ['Escritos con IA', String(tot.ia)],
                  ['Con plantilla', String(tot.plantilla)],
                  ['Firmados', String(tot.firmados)],
                  ['Corrección promedio', pct(tot.edicion)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-white/[0.08] px-3 py-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">{l}</p>
                    <p className="mt-0.5 text-lg font-semibold text-zinc-100">{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] leading-relaxed text-zinc-500">
                Corrección: qué parte del texto cambió el abogado entre lo que redactó la IA (o la plantilla) y lo que firmó. Se mide al firmar; con pocos escritos firmados todavía no es representativa.
              </p>

              <div>
                <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Por abogado</p>
                <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                  <table className="w-full min-w-[560px]">
                    <thead><tr className="border-b border-white/5">
                      <th className={th}>Abogado</th><th className={th}>IA</th><th className={th}>Plantilla</th><th className={th}>Firmados</th>
                      <th className={th}>Redacción</th><th className={th}>Asistente</th><th className={th}>Revisión</th><th className={th}>Corrección</th>
                    </tr></thead>
                    <tbody>
                      {data.por_abogado.length === 0 && <tr><td className={td} colSpan={8}>Sin uso en el período.</td></tr>}
                      {data.por_abogado.map((a) => (
                        <tr key={a.user_id} className="border-b border-white/[0.04] last:border-0">
                          <td className={cn(td, 'text-zinc-100')}>{a.nombre || '—'}</td>
                          <td className={td}>{a.escritos_ia}</td><td className={td}>{a.escritos_plantilla}</td><td className={td}>{a.firmados}</td>
                          <td className={td}>{usd(a.costo_redaccion)}</td><td className={td}>{usd(a.costo_asistente)}</td><td className={td}>{usd(a.costo_revision)}</td>
                          <td className={td}>{pct(a.edicion_promedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Por tipo de escrito y modelo</p>
                <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                  <table className="w-full min-w-[560px]">
                    <thead><tr className="border-b border-white/5">
                      <th className={th}>Tipo</th><th className={th}>Redactó</th><th className={th}>Cant.</th><th className={th}>Firmados</th><th className={th}>Costo prom.</th><th className={th}>Corrección</th>
                    </tr></thead>
                    <tbody>
                      {tipos.length === 0 && <tr><td className={td} colSpan={6}>Sin escritos en el período.</td></tr>}
                      {tipos.map((t, i) => (
                        <tr key={i} className="border-b border-white/[0.04] last:border-0">
                          <td className={cn(td, 'max-w-[240px] truncate text-zinc-100')} title={t.tipo}>{t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1)}</td>
                          <td className={td}>{t.origen === 'plantilla' ? 'Plantilla' : t.origen === 'manual' ? 'A mano' : nombreModeloCorto(t.modelo)}</td>
                          <td className={td}>{t.n}</td><td className={td}>{t.firmados}</td>
                          <td className={td}>{t.costo_promedio == null ? '—' : `US$ ${Number(t.costo_promedio).toFixed(3)}`}</td>
                          <td className={td}>{pct(t.edicion_promedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11.5px] text-zinc-500">El costo se registra desde noviembre de 2026; los escritos anteriores figuran sin costo.</p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
