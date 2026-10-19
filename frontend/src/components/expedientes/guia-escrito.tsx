import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Loader2, X } from 'lucide-react'
import { useAttachSignedPdf, useMarcarPresentado, type Escrito, type EscritoContenido } from '@/hooks/use-escritos'
import type { EscritoEncabezadoAbogado } from './escrito-preview'
import { descargarPdfEscrito } from '@/lib/escritos/pdf-escrito'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Qué pasa después de generar: guía paso a paso del escrito hasta el proveído.
// Completar datos → revisión → PDF → firma → presentación → seguimiento.

const PENDIENTE_RE = /\[(?:COMPLETAR|DATO|INDICAR|VERIFICAR|XX+)[^\]]*\]|_{4,}|\bX{3,}\b|…{2,}/i

/** Datos que la IA dejó para completar (corchetes, rayas, XXX). */
export function datosPorCompletar(c: EscritoContenido): string[] {
  const textos = [c.encabezado_juez, c.caratula, c.presentacion ?? '', ...(c.secciones ?? []).flatMap((s) => [s.titulo, ...(s.parrafos ?? [])])]
  const out: string[] = []
  for (const t of textos) {
    const re = new RegExp(PENDIENTE_RE.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(t ?? ''))) out.push(m[0])
  }
  return out
}

/** Suma días hábiles (lunes a viernes) a una fecha YYYY-MM-DD. */
function sumarHabiles(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`)
  let n = 0
  while (n < dias) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++ }
  return d.toISOString().slice(0, 10)
}

const hoyAR = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

interface Paso {
  key: string
  titulo: string
  hecho: boolean
  detalle: string
  opcional?: boolean
  oculto?: boolean
  accion?: { label: string; onClick: () => void; cargando?: boolean }
  secundaria?: { label: string; onClick: () => void; href?: string }
}

export function GuiaEscrito({ escrito, contenido, abogado, dirty, guardando, onGuardar, onRevisar, onPresentarSae, onVerProveido }: {
  escrito: Escrito
  contenido: EscritoContenido
  abogado: EscritoEncabezadoAbogado | null
  dirty: boolean
  guardando?: boolean
  onGuardar: () => void
  /** Abre el control de calidad con IA (si el editor lo tiene) */
  onRevisar?: () => void
  /** Presentación automática al SAE (beta), si el editor la ofrece */
  onPresentarSae?: () => void
  onVerProveido?: () => void
}) {
  const attach = useAttachSignedPdf()
  const archivoRef = useRef<HTMLInputElement>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [pdfBajado, setPdfBajado] = useState(false)
  const [revisado, setRevisado] = useState(false)
  const [presentando, setPresentando] = useState(false)
  const [verLista, setVerLista] = useState(false)

  const pendientes = datosPorCompletar(contenido)
  const firmado = !!escrito.pdf_firmado_path || ['firmado', 'presentado', 'presentado_sae'].includes(escrito.estado)
  const presentado = escrito.estado === 'presentado' || escrito.estado === 'presentado_sae'

  const bajarPdf = async () => {
    if (!abogado) return toast.error('Faltan tus datos profesionales', 'Completalos en Configuración → Perfil.')
    setGenerandoPdf(true)
    try {
      await descargarPdfEscrito(contenido, abogado, escrito.titulo)
      setPdfBajado(true)
      toast.success('PDF descargado', 'Firmalo en firmar.gob.ar y después adjuntá el PDF firmado.')
    } catch (e) {
      toast.error('No se pudo generar el PDF', e instanceof Error ? e.message : undefined)
    } finally { setGenerandoPdf(false) }
  }

  const adjuntar = (file: File) => attach.mutate({ escrito_id: escrito.id, expediente_id: escrito.expediente_id, file }, {
    onSuccess: ({ hasSignature }) => toast.success(hasSignature ? 'PDF firmado adjuntado' : 'PDF adjuntado', hasSignature ? undefined : 'No detecté una firma digital: verificá que esté firmado.'),
    onError: (e) => toast.error('No se pudo adjuntar', e instanceof Error ? e.message : undefined),
  })

  const pasos: Paso[] = presentado ? [
    { key: 'presentado', titulo: 'Presentado', hecho: true, detalle: '' },
    {
      key: 'proveido', titulo: escrito.proveido_movement_id ? 'Llegó el proveído' : 'Esperando el proveído', hecho: !!escrito.proveido_movement_id,
      detalle: escrito.proveido_movement_id
        ? 'Ya está en las actuaciones del expediente. La tarea de control se cerró sola.'
        : 'El sistema revisa el SAE cada dos horas y te avisa por Telegram cuando el juzgado provea. La tarea de control se cierra sola.',
      accion: escrito.proveido_movement_id && onVerProveido ? { label: 'Ver el proveído', onClick: onVerProveido } : undefined,
    },
  ] : [
    { key: 'datos', titulo: 'Completar los datos que faltan', hecho: pendientes.length === 0,
      detalle: pendientes.length ? `La IA dejó ${pendientes.length} ${pendientes.length === 1 ? 'dato' : 'datos'} para completar (${[...new Set(pendientes)].slice(0, 3).join(', ')}). Buscalos en el texto y reemplazalos.` : '' },
    { key: 'guardar', titulo: 'Guardar los cambios', hecho: !dirty, oculto: !dirty,
      detalle: 'Tenés cambios sin guardar.', accion: { label: 'Guardar', onClick: onGuardar, cargando: guardando } },
    { key: 'revisar', titulo: 'Revisión con IA (opcional)', hecho: revisado, opcional: true, oculto: !onRevisar,
      detalle: 'Control de calidad: errores procesales, plazos, citas y fundamentos débiles, antes de firmar.',
      accion: onRevisar ? { label: 'Revisar con IA', onClick: () => { setRevisado(true); onRevisar() } } : undefined },
    { key: 'pdf', titulo: 'Descargar el PDF para firmar', hecho: pdfBajado || firmado,
      detalle: 'Sale con el formato del estudio, listo para firmar.gob.ar.',
      accion: { label: 'Descargar PDF', onClick: () => { void bajarPdf() }, cargando: generandoPdf } },
    { key: 'firmar', titulo: 'Firmar y adjuntar el PDF firmado', hecho: firmado,
      detalle: 'Firmalo en firmar.gob.ar con tu token o firma remota y subí acá el PDF firmado: queda guardado con el escrito.',
      accion: { label: 'Adjuntar PDF firmado', onClick: () => archivoRef.current?.click(), cargando: attach.isPending },
      secundaria: { label: 'Abrir firmar.gob.ar', onClick: () => {}, href: 'https://firmar.gob.ar/firmador/' } },
    { key: 'presentar', titulo: 'Presentarlo en el juzgado', hecho: false,
      detalle: 'Presentalo en el portal del SAE y marcalo acá: se crea la tarea de controlar el proveído y te aviso cuando llegue.',
      accion: { label: 'Ya lo presenté', onClick: () => setPresentando(true) },
      secundaria: onPresentarSae && firmado ? { label: 'Presentar automático (beta)', onClick: onPresentarSae } : { label: 'Abrir el portal del SAE', onClick: () => {}, href: 'https://portaldelsae.justucuman.gov.ar/ingreso-escritos' } },
  ]

  const visibles = pasos.filter((p) => !p.oculto)
  const actual = visibles.find((p) => !p.hecho && !p.opcional) ?? visibles.find((p) => !p.hecho)
  const n = actual ? visibles.indexOf(actual) + 1 : visibles.length

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <input ref={archivoRef} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntar(f); e.target.value = '' }} />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {visibles.map((p) => (
            <span key={p.key} className={cn('h-1.5 flex-1 rounded-full', p.hecho ? 'bg-emerald-500' : p === actual ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-white/15')} />
          ))}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{visibles.filter((p) => p.hecho).length}/{visibles.length}</span>
      </div>
      {actual ? (
        <div className="mt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Paso {n} de {visibles.length}{actual.opcional ? ' · opcional' : ''}</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{actual.titulo}</p>
          {actual.detalle && <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">{actual.detalle}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {actual.accion && (
              <button type="button" onClick={actual.accion.onClick} disabled={actual.accion.cargando}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 sm:min-h-9 sm:flex-none">
                {actual.accion.cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {actual.accion.label}
              </button>
            )}
            {actual.secundaria && (actual.secundaria.href
              ? <a href={actual.secundaria.href} target="_blank" rel="noreferrer noopener"
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 sm:min-h-9 dark:border-white/15 dark:text-zinc-200">
                  {actual.secundaria.label} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              : <button type="button" onClick={actual.secundaria.onClick}
                  className="flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 sm:min-h-9 dark:border-white/15 dark:text-zinc-200">
                  {actual.secundaria.label}
                </button>)}
          </div>
        </div>
      ) : (
        <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Listo.</p>
      )}
      <button type="button" onClick={() => setVerLista((v) => !v)} className="mt-2 flex min-h-8 items-center gap-1 text-xs text-zinc-500">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', verLista && 'rotate-180')} /> {verLista ? 'Ocultar los pasos' : 'Ver todos los pasos'}
      </button>
      {verLista && (
        <ol className="mt-1 space-y-1">
          {visibles.map((p, i) => (
            <li key={p.key} className="flex items-center gap-2 text-sm">
              {p.hecho ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                : <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold', p === actual ? 'border-amber-500 text-amber-600' : 'border-zinc-300 text-zinc-400 dark:border-white/20')}>{i + 1}</span>}
              <span className={cn('flex-1', p.hecho ? 'text-zinc-400 line-through decoration-zinc-400/40' : 'text-zinc-700 dark:text-zinc-200')}>{p.titulo}{p.opcional ? ' (opcional)' : ''}</span>
              {!p.hecho && p !== actual && p.accion && <button type="button" onClick={p.accion.onClick} className="shrink-0 text-xs text-amber-600 underline dark:text-amber-400">{p.accion.label}</button>}
            </li>
          ))}
        </ol>
      )}
      {presentando && <MarcarPresentadoDialog escrito={escrito} onClose={() => setPresentando(false)} />}
    </div>
  )
}

function MarcarPresentadoDialog({ escrito, onClose }: { escrito: Escrito; onClose: () => void }) {
  const marcar = useMarcarPresentado()
  const [fecha, setFecha] = useState(hoyAR())
  const [medio, setMedio] = useState('Portal del SAE')
  const [comprobante, setComprobante] = useState('')
  const [seguimiento, setSeguimiento] = useState(true)
  const [controlarEl, setControlarEl] = useState(sumarHabiles(hoyAR(), 3))
  const campo = 'min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'

  const confirmar = () => marcar.mutate({
    escrito: { id: escrito.id, titulo: escrito.titulo, expediente_id: escrito.expediente_id },
    fecha, medio, comprobante, controlarEl: seguimiento ? controlarEl : null,
  }, {
    onSuccess: () => { toast.success('Escrito marcado como presentado', seguimiento ? 'Te aviso cuando llegue el proveído.' : undefined); onClose() },
    onError: (e) => toast.error('No se pudo marcar', e instanceof Error ? e.message : undefined),
  })

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-4 shadow-xl dark:bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Marcar como presentado</p>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-zinc-400" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-zinc-500">"{escrito.titulo}"</p>
        <label className="block space-y-1 text-xs text-zinc-500">Fecha de presentación
          <input type="date" value={fecha} max={hoyAR()} onChange={(e) => { setFecha(e.target.value); setControlarEl(sumarHabiles(e.target.value, 3)) }} className={campo} />
        </label>
        <label className="block space-y-1 text-xs text-zinc-500">Dónde
          <select value={medio} onChange={(e) => setMedio(e.target.value)} className={campo}>
            <option>Portal del SAE</option>
            <option>Mesa de entradas</option>
            <option>Otro</option>
          </select>
        </label>
        <label className="block space-y-1 text-xs text-zinc-500">N° de comprobante (opcional)
          <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} className={campo} />
        </label>
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" checked={seguimiento} onChange={(e) => setSeguimiento(e.target.checked)} className="mt-1" />
          <span>Crear la tarea de controlar el proveído para el
            <input type="date" value={controlarEl} min={fecha} disabled={!seguimiento} onChange={(e) => setControlarEl(e.target.value)}
              className="ml-1 rounded border border-zinc-200 bg-white px-1.5 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-800" />
            <span className="block text-xs text-zinc-500">Se cierra sola cuando el juzgado provea.</span>
          </span>
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-xl border border-zinc-200 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-300">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={marcar.isPending}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-medium text-white disabled:opacity-50">
            {marcar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
