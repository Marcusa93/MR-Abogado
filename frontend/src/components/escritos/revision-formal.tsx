import { AlertTriangle, Check, Circle, HelpCircle, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { ControlFormalItem, RevisionFormal } from '@/hooks/use-redaccion'
import type { CitaDetectada } from '@/lib/escritos/citas'
import { cn } from '@/lib/utils'

const ICONO: Record<ControlFormalItem['estado'], { i: typeof Check; cls: string; label: string }> = {
  cumple: { i: Check, cls: 'text-emerald-400', label: 'cumple' },
  falta: { i: X, cls: 'text-rose-400', label: 'falta' },
  revisar: { i: HelpCircle, cls: 'text-amber-400', label: 'revisar' },
  no_aplica: { i: Circle, cls: 'text-zinc-600', label: 'no aplica' },
}

const EVALUACION: Record<string, string> = {
  presentable_con_correcciones_menores: 'Presentable con correcciones menores',
  requiere_reescritura_parcial: 'Requiere reescribir partes',
  requiere_reescritura_estructural: 'Requiere reescribir la estructura',
}

export function resumenRevision(r: RevisionFormal | null | undefined) {
  const items = r?.diagnostico?.control_formal ?? []
  return {
    faltan: items.filter((x) => x.estado === 'falta'),
    revisar: items.filter((x) => x.estado === 'revisar'),
    total: items.length,
  }
}

export function RevisionVista({ r }: { r: RevisionFormal }) {
  const d = r.diagnostico ?? {}
  const items = d.control_formal ?? []
  const otros: { titulo: string; filas: string[] }[] = [
    { titulo: 'Pedidos sin fundamento', filas: (d.peticiones_sin_fundamento ?? []).map((x) => `${x.peticion} — falta: ${x.falta}`) },
    { titulo: 'Argumentos sin norma', filas: (d.argumentos_sin_norma ?? []).map((x) => `${x.argumento}${x.norma_sugerida && x.norma_sugerida !== 'indeterminado' ? ` (sugerida: ${x.norma_sugerida})` : ''}`) },
    { titulo: 'Hechos sin prueba', filas: (d.hechos_no_acreditados ?? []).map((x) => `${x.hecho}${x.prueba_sugerida && x.prueba_sugerida !== 'indeterminado' ? ` → ${x.prueba_sugerida}` : ''}`) },
    { titulo: 'Contradicciones', filas: (d.contradicciones ?? []).map((x) => `${x.seccion_a} / ${x.seccion_b}${x.resolucion_sugerida ? ` → ${x.resolucion_sugerida}` : ''}`) },
    { titulo: 'Plazos', filas: (d.alertas_plazo_fatal ?? []).map((x) => `${x.norma}: ${x.plazo}${x.vencimiento_estimado ? ` (vence ${x.vencimiento_estimado})` : ''}`) },
    { titulo: 'Observaciones', filas: d.observaciones_estructurales ?? [] },
  ].filter((g) => g.filas.length > 0)

  return (
    <div className="space-y-3">
      {d.sintesis?.evaluacion && (
        <div>
          <p className="text-[13px] font-medium text-zinc-100">{EVALUACION[d.sintesis.evaluacion] ?? d.sintesis.evaluacion}</p>
          {d.sintesis.resumen && <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-400">{d.sintesis.resumen}</p>}
        </div>
      )}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((x, i) => {
            const k = ICONO[x.estado] ?? ICONO.revisar
            return (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                <k.i className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', k.cls)} />
                <span className={x.estado === 'no_aplica' ? 'text-zinc-500' : 'text-zinc-200'}>
                  {x.requisito}{x.detalle && x.estado !== 'cumple' && x.estado !== 'no_aplica' && <span className="text-zinc-400"> — {x.detalle}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {otros.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">{g.titulo}</p>
          <ul className="space-y-1">{g.filas.map((f, i) => <li key={i} className="text-[12.5px] leading-relaxed text-zinc-300">{f}</li>)}</ul>
        </div>
      ))}
      {r.modelo_nombre && <p className="font-mono text-[10px] text-zinc-600">revisó {r.modelo_nombre}</p>}
    </div>
  )
}

/**
 * Control antes de firmar: muestra lo que falta (revisión formal y citas sin
 * respaldo) y deja seguir igual. No bloquea: el abogado decide.
 */
export function AntesDeFirmarDialog({ revision, revisando, desactualizada, citasSinRespaldo, onRevisar, onSeguir, onClose }: {
  revision: RevisionFormal | null
  revisando: boolean
  desactualizada: boolean
  citasSinRespaldo: CitaDetectada[]
  onRevisar: () => void
  onSeguir: () => void
  onClose: () => void
}) {
  const { faltan, revisar } = resumenRevision(revision)
  const limpio = !!revision && !desactualizada && faltan.length === 0 && citasSinRespaldo.length === 0
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#10161d] shadow-2xl sm:max-w-lg sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Antes de firmar</h2>
            <p className="mt-0.5 text-xs text-zinc-400">Control formal y de citas. Decidís vos si seguís.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!revision || desactualizada ? (
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[13px] text-zinc-200">{revision ? 'El escrito cambió después de la última revisión.' : 'Todavía no se revisó este escrito.'}</p>
              <p className="mt-0.5 text-[12px] text-zinc-500">La revisión la hace un modelo distinto del que redactó. Tarda menos de un minuto.</p>
              <button type="button" onClick={onRevisar} disabled={revisando}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-900 disabled:opacity-50">
                {revisando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {revisando ? 'Revisando…' : 'Revisar ahora'}
              </button>
            </div>
          ) : faltan.length + revisar.length > 0 ? (
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Control formal</p>
              <ul className="space-y-1">
                {[...faltan, ...revisar].map((x, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px]">
                    {x.estado === 'falta' ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" /> : <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                    <span className="text-zinc-200">{x.requisito}{x.detalle && <span className="text-zinc-400"> — {x.detalle}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-emerald-300"><Check className="h-4 w-4" /> Control formal sin faltantes.</p>
          )}
          {citasSinRespaldo.length > 0 && (
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Citas a verificar a mano</p>
              <p className="mb-1.5 text-[12px] text-zinc-500">No están en la normativa ni en los fallos del estudio que usó la IA.</p>
              <ul className="space-y-1">
                {citasSinRespaldo.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-zinc-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />{c.texto}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Volver al escrito</button>
          <button type="button" onClick={onSeguir}
            className={cn('rounded-lg px-4 py-2 text-sm font-medium', limpio ? 'bg-white text-zinc-900 hover:opacity-90' : 'border border-white/15 text-zinc-200 hover:bg-white/5')}>
            {limpio ? 'Continuar' : 'Firmar igual'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
