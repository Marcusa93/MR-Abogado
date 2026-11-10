import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Send, X } from 'lucide-react'
import { useFetchPortalCategorias, usePresentarEscrito, type Escrito, type PortalFormInfo } from '@/hooks/use-escritos'

/** Presentación automática del escrito firmado en el portal del SAE (beta). */
export function PresentarSaeDialog({
  escrito, onClose, onSuccess,
}: {
  escrito: Escrito
  onClose: () => void
  onSuccess: (nroComprobante: string | null | undefined) => void
}) {
  const fetchCategorias = useFetchPortalCategorias()
  const presentar = usePresentarEscrito()
  const [portalInfo, setPortalInfo] = useState<PortalFormInfo | null>(null)
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [presentaDoc, setPresentaDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir, intenta traer categorías reales del portal
  useEffect(() => {
    fetchCategorias.mutate(escrito.id, {
      onSuccess: (data) => setPortalInfo(data),
      onError: (err) => setError(err.message),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = () => {
    setError(null)
    presentar.mutate(
      {
        escrito_id: escrito.id,
        expediente_id: escrito.expediente_id!,
        categoria: categoria.trim(),
        descripcion: descripcion.trim(),
        presenta_documentacion: presentaDoc,
      },
      {
        onSuccess: (res) => onSuccess(res.nro_comprobante),
        onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo presentar'),
      }
    )
  }

  const isLoading = presentar.isPending || fetchCategorias.isPending

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={isLoading ? undefined : onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-white dark:bg-[var(--card)] shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-white dark:bg-[var(--card)]">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            Presentar al portal del SAE
          </h2>
          <button onClick={onClose} disabled={isLoading} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {fetchCategorias.isPending && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Conectando con el portal del SAE…
            </div>
          )}

          {portalInfo && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs">
              <p className="text-emerald-300 font-medium">Conectado al portal</p>
              {portalInfo.expediente.caratula && (
                <p className="mt-1 text-zinc-400 truncate">{portalInfo.expediente.caratula}</p>
              )}
              {portalInfo.expediente.oficina && (
                <p className="text-zinc-500 dark:text-zinc-400 truncate">{portalInfo.expediente.oficina}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Categoría *</label>
            <input
              list="categorias-portal"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder={portalInfo?.categorias.length ? 'Elegí una categoría' : 'Cargando…'}
              disabled={isLoading || !portalInfo}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
            <datalist id="categorias-portal">
              {portalInfo?.categorias.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
            {portalInfo && portalInfo.categorias.length === 0 && (
              <p className="mt-1 text-[10px] text-amber-400">
                No pude detectar categorías automáticamente. Escribí el nombre tal como aparece en el portal.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Descripción *</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Texto de referencia que aparece en el portal"
              disabled={isLoading}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={presentaDoc}
              onChange={(e) => setPresentaDoc(e.target.checked)}
              disabled={isLoading}
              className="rounded border-white/20 bg-white/5"
            />
            Presento documentación original junto con este escrito
          </label>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 flex items-start gap-2 text-xs text-rose-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-[10px] text-amber-200/80">
            Esta acción presenta el escrito a la oficina judicial. Asegurate de que el PDF firmado sea el correcto. La presentación no se puede deshacer desde nuestra app.
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={isLoading} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isLoading || !categoria.trim() || !descripcion.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {presentar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Presentar al SAE
          </button>
        </div>
      </div>
    </div>
  )
}
