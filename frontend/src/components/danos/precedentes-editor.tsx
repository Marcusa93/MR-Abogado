import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Pencil, Loader2, Save, BookMarked } from 'lucide-react'
import {
  useDanoPrecedentes, useUpsertPrecedente, useDeletePrecedente, type PrecedenteInput,
} from '@/hooks/use-dano-precedentes'
import { normalizarPrecedente, type Precedente } from '@/lib/danos/precedentes'
import type { ValoresReferencia } from '@/lib/danos/types'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.round(n))
}

const RUBROS: Precedente['rubro'][] = ['no_patrimonial', 'punitivo', 'patrimonial', 'mixto']
const inputCls = 'w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50'

const EMPTY: PrecedenteInput = {
  tribunal: '', caratula: '', fecha: '', rubro: 'no_patrimonial',
  monto_nominal: null, unidad_normalizada: 'CBT', valor_en_unidad: null,
  hechos_relevantes: '', estado_verificacion: 'remision_oficial', jurisdiccion: 'Tucuman',
}

export function PrecedentesEditor({ onClose, valores }: { onClose: () => void; valores?: ValoresReferencia }) {
  const { data: precedentes = [], isLoading } = useDanoPrecedentes()
  const upsert = useUpsertPrecedente()
  const del = useDeletePrecedente()
  const [form, setForm] = useState<PrecedenteInput | null>(null)
  const set = <K extends keyof PrecedenteInput>(k: K, v: PrecedenteInput[K]) => setForm(p => p ? { ...p, [k]: v } : p)

  async function guardar() {
    if (!form?.tribunal?.trim() || !form?.caratula?.trim()) { toast.error('Tribunal y carátula son obligatorios'); return }
    try {
      await upsert.mutateAsync(form)
      toast.success(form.id ? 'Precedente actualizado' : 'Precedente agregado')
      setForm(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }
  async function eliminar(id: string, caratula: string) {
    if (!window.confirm(`¿Dar de baja el precedente "${caratula}"?`)) return
    try { await del.mutateAsync(id); toast.success('Precedente dado de baja') }
    catch { toast.error('No se pudo eliminar') }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border border-white/10 bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <BookMarked className="h-4 w-4 text-amber-500" /> Precedentes de daños
          </h2>
          <div className="flex items-center gap-2">
            {!form && (
              <button type="button" onClick={() => setForm({ ...EMPTY })}
                className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-2.5 py-1 text-xs font-medium text-white">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {form && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Tribunal *" value={form.tribunal ?? ''} onChange={e => set('tribunal', e.target.value)} className={inputCls} />
                <input placeholder="Carátula *" value={form.caratula ?? ''} onChange={e => set('caratula', e.target.value)} className={inputCls} />
                <input type="date" value={form.fecha ?? ''} onChange={e => set('fecha', e.target.value)} className={inputCls} />
                <select value={form.rubro ?? 'no_patrimonial'} onChange={e => set('rubro', e.target.value as Precedente['rubro'])} className={inputCls}>
                  {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="number" placeholder="Monto nominal (pesos)" value={form.monto_nominal ?? ''} onChange={e => set('monto_nominal', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
                <div className="flex gap-2">
                  <select value={form.unidad_normalizada ?? ''} onChange={e => set('unidad_normalizada', (e.target.value || null) as any)} className={cn(inputCls, 'w-24')}>
                    <option value="">—</option><option value="CBT">CBT</option><option value="SMVM">SMVM</option>
                  </select>
                  <input type="number" step="0.1" placeholder="Nº de unidades" value={form.valor_en_unidad ?? ''} onChange={e => set('valor_en_unidad', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
                </div>
              </div>
              <textarea rows={2} placeholder="Hechos relevantes" value={form.hechos_relevantes ?? ''} onChange={e => set('hechos_relevantes', e.target.value)} className={cn(inputCls, 'resize-y')} />
              <div className="flex items-center gap-2">
                <select value={form.estado_verificacion ?? 'remision_oficial'} onChange={e => set('estado_verificacion', e.target.value as any)} className={cn(inputCls, 'w-56')}>
                  <option value="verificado_integro">Verificado íntegro</option>
                  <option value="remision_oficial">Por remisión oficial</option>
                </select>
                <button type="button" onClick={guardar} disabled={upsert.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
                </button>
                <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm text-zinc-500">Cancelar</button>
              </div>
              <p className="text-[11px] text-zinc-400">Para normalizar a valor de hoy, cargá el equivalente en canastas (CBT) o salarios (SMVM) al momento del fallo.</p>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 text-center text-sm text-zinc-400">Cargando…</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/5">
              {precedentes.map(p => {
                const norm = valores ? normalizarPrecedente(p, valores) : null
                return (
                  <div key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{p.caratula}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.tribunal}{p.fecha ? ` · ${p.fecha}` : ''} · {p.rubro}
                        {p.estado_verificacion === 'verificado_integro' ? ' · ✓ íntegro' : ' · remisión'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {norm?.montoHoy != null && (
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{formatPesos(norm.montoHoy)}{!norm.normalizado && ' *'}</span>
                      )}
                      <button type="button" onClick={() => setForm({
                        id: p.id, tribunal: p.tribunal, caratula: p.caratula, fecha: p.fecha ?? '', rubro: p.rubro,
                        monto_nominal: p.monto_nominal, unidad_normalizada: p.unidad_normalizada, valor_en_unidad: p.valor_en_unidad,
                        hechos_relevantes: p.hechos_relevantes ?? '', estado_verificacion: p.estado_verificacion, jurisdiccion: p.jurisdiccion,
                      })} className="text-zinc-400 hover:text-amber-500"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => eliminar(p.id, p.caratula)} className="text-zinc-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
