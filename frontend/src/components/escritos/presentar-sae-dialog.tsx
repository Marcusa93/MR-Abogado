import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Loader2, Send, X } from 'lucide-react'
import { useFetchPortalCategorias, usePresentarEscrito, type Escrito, type PortalFormInfo } from '@/hooks/use-escritos'

// Sugerencia de categoría del portal según el tipo/título del escrito.
const SUGERENCIAS: [RegExp, RegExp][] = [
  [/contest\w* (de )?demanda/i, /^CONTESTO DEMANDA/],
  [/agravio/i, /^CONTESTO AGRAVIOS/],
  [/apela|recurso|revocatori|reposici|casaci/i, /^INTERPONGO RECURSO/],
  [/ofrec\w* prueba|ofrezco prueba/i, /^OFREZCO PRUEBA/],
  [/apertura a prueba/i, /^SOLICITO APERTURA A PRUEBA/],
  [/pronto despacho/i, /^SOLICITO PRONTO DESPACHO/],
  [/honorario/i, /^PIDO REGULACI/],
  [/cautelar|embargo preventivo/i, /^SOLICITO CAUTELAR/],
  [/oficio/i, /^PIDO OFICIO/],
  [/excepci/i, /^FORMULO EXCEPCIONES/],
  [/sentencia/i, /^PIDO DICTADO DE SENTENCIA/],
  [/alegato/i, /^PRESENTO ALEGATO/],
  [/demanda/i, /^PRESENTO DEMANDA/],
]

function sugerir(escrito: Escrito, cats: { id: string; nombre: string }[]): string {
  const txt = `${escrito.tipo ?? ''} ${escrito.titulo ?? ''}`
  for (const [re, cat] of SUGERENCIAS) {
    if (re.test(txt)) { const c = cats.find((x) => cat.test(x.nombre)); if (c) return c.id }
  }
  return ''
}

/** Presenta el escrito firmado en "Ingreso de Escritos" del portal del SAE. */
export function PresentarSaeDialog({
  escrito, onClose, onSuccess,
}: {
  escrito: Escrito
  onClose: () => void
  onSuccess: (mensaje: string | null | undefined) => void
}) {
  const fetchCategorias = useFetchPortalCategorias()
  const presentar = usePresentarEscrito()
  const [portal, setPortal] = useState<PortalFormInfo | null>(null)
  const [tipoId, setTipoId] = useState('')
  const [descripcion, setDescripcion] = useState(escrito.titulo?.slice(0, 120) ?? '')
  const [documentacion, setDocumentacion] = useState<'0' | '1'>('0')
  const [seguimiento, setSeguimiento] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategorias.mutate(escrito.id, {
      onSuccess: (data) => { setPortal(data); setTipoId(sugerir(escrito, data.categorias)) },
      onError: (err) => setError(err.message),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tipoNombre = useMemo(() => portal?.categorias.find((c) => c.id === tipoId)?.nombre, [portal, tipoId])
  const ocupado = presentar.isPending || fetchCategorias.isPending
  const listo = !!portal && !!tipoId && !!descripcion.trim() && !ocupado

  const submit = () => {
    setError(null)
    presentar.mutate(
      {
        escrito_id: escrito.id,
        expediente_id: escrito.expediente_id!,
        tipo_id: tipoId,
        descripcion: descripcion.trim(),
        presenta_documentacion: documentacion === '1',
        crear_seguimiento: seguimiento,
      },
      {
        onSuccess: (res) => onSuccess(res.mensaje),
        onError: (err) => setError(err instanceof Error ? err.message : 'No se pudo presentar'),
      },
    )
  }

  const campo = 'min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={ocupado ? undefined : onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl dark:bg-[var(--card)] sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4 dark:border-white/5 dark:bg-[var(--card)]">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            <Send className="h-4 w-4 text-emerald-500" /> Presentar en el SAE
          </h2>
          <button onClick={onClose} disabled={ocupado} className="-m-1 rounded-lg p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {fetchCategorias.isPending && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Entrando al portal del SAE y buscando el expediente…
            </div>
          )}

          {portal && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Expte. {portal.expediente.numero}</p>
              {portal.expediente.caratula && <p className="mt-0.5 line-clamp-2 text-zinc-600 dark:text-zinc-300">{portal.expediente.caratula}</p>}
              {portal.expediente.oficina && (
                <p className="mt-1.5 text-zinc-500">
                  Se presenta en: <span className="font-medium text-zinc-700 dark:text-zinc-200">{portal.expediente.oficina}</span>
                  {portal.expediente.ultima_radicacion ? ' (última radicación)' : ''}
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Categoría
            <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} disabled={!portal || ocupado} className={campo}>
              <option value="">{portal ? 'Seleccione…' : 'Cargando…'}</option>
              {portal?.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>

          <label className="block space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Descripción
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={250} disabled={ocupado}
              placeholder="Referencia que queda en el listado del portal" className={campo} />
          </label>

          <label className="block space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">¿Presenta documentación original?
            <select value={documentacion} onChange={(e) => setDocumentacion(e.target.value as '0' | '1')} disabled={ocupado} className={campo}>
              <option value="0">No</option>
              <option value="1">Sí</option>
            </select>
          </label>

          <p className="text-xs text-zinc-500">Archivo: el PDF firmado adjunto a este escrito.</p>

          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={seguimiento} onChange={(e) => setSeguimiento(e.target.checked)} disabled={ocupado} className="mt-1" />
            <span>Crear la tarea de controlar el proveído
              <span className="block text-xs text-zinc-500">A tres días hábiles. Se cierra sola cuando el juzgado provea.</span>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 space-y-2 border-t border-zinc-100 bg-white px-5 py-3 dark:border-white/5 dark:bg-[var(--card)]">
          {listo && (
            <p className="text-[11.5px] text-amber-700 dark:text-amber-300/90">
              Se presenta en el juzgado como "{tipoNombre}". No se puede deshacer desde la app.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={ocupado} className="min-h-10 flex-1 rounded-xl border border-zinc-200 text-sm text-zinc-600 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300">
              Cancelar
            </button>
            <button onClick={submit} disabled={!listo}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-medium text-white disabled:opacity-50">
              {presentar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {presentar.isPending ? 'Presentando…' : 'Presentar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
