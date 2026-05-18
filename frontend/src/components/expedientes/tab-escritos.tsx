import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  PenLine, Plus, Loader2, FileText, Trash2, Printer, X, Sparkles,
  AlertCircle, Pencil, Check, Upload, Send, ExternalLink, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useEscritos, useEscritoTiposPrevios, useGenerateEscrito,
  useDeleteEscrito, useUpdateEscrito,
  useAttachSignedPdf, usePresentarEscrito, useFetchPortalCategorias,
  type Escrito, type EscritoContenido, type PortalFormInfo,
} from '@/hooks/use-escritos'
import { useSaeMovements } from '@/hooks/use-sae'
import { EscritoPreview, type EscritoEncabezadoAbogado } from './escrito-preview'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

interface Props {
  expedienteId: string
}

// Tipos sugeridos por defecto (el usuario puede escribir cualquier otro)
const TIPOS_SUGERIDOS = [
  'Contestación de demanda',
  'Contestación de traslado',
  'Alegato',
  'Recurso de apelación',
  'Recurso de reposición',
  'Pronto despacho',
  'Ofrecimiento de prueba',
  'Oficio',
  'Memorial',
  'Expresión de agravios',
]

// Mismas reglas que tab-actuaciones-claves para mostrar el preview de claves
const KEY_TYPES = new Set(['sentencia','audiencia','intimacion','embargo','traslado','decreto','cedula'])

function buildAbogadoFromProfile(profile: ReturnType<typeof useAuth>['profile']): EscritoEncabezadoAbogado | null {
  if (!profile) return null
  const p = profile as typeof profile & {
    matricula?: string | null
    matricula_libro?: string | null
    matricula_folio?: string | null
    domicilio_legal?: string | null
    casillero_notif?: string | null
    cuit?: string | null
  }
  return {
    nombreCompleto: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim().toUpperCase(),
    matricula: p.matricula ?? null,
    matriculaLibro: p.matricula_libro ?? null,
    matriculaFolio: p.matricula_folio ?? null,
    domicilioLegal: p.domicilio_legal ?? null,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    casilleroNotif: p.casillero_notif ?? null,
    cuit: p.cuit ?? null,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog: Nuevo escrito
// ────────────────────────────────────────────────────────────────────────────

function NuevoEscritoDialog({
  open, onClose, expedienteId, clavesCount, onGenerated,
}: {
  open: boolean
  onClose: () => void
  expedienteId: string
  clavesCount: number
  onGenerated: (escritoId: string) => void
}) {
  const [tipo, setTipo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [instrucciones, setInstrucciones] = useState('')
  const { data: tiposPrevios = [] } = useEscritoTiposPrevios()
  const generate = useGenerateEscrito()

  const sugerencias = useMemo(() => {
    const merged = new Set<string>([...tiposPrevios, ...TIPOS_SUGERIDOS])
    return Array.from(merged).sort()
  }, [tiposPrevios])

  const reset = () => {
    setTipo(''); setTitulo(''); setInstrucciones('')
    generate.reset()
  }

  const handleClose = () => { reset(); onClose() }

  const handleGenerate = () => {
    if (!tipo.trim()) {
      toast.error('Indicá el tipo de escrito')
      return
    }
    generate.mutate(
      { expediente_id: expedienteId, tipo: tipo.trim(), titulo: titulo.trim() || undefined, instrucciones: instrucciones.trim() || undefined },
      {
        onSuccess: (data) => {
          toast.success(`Escrito generado (${data.claves_usadas} claves usadas)`)
          onGenerated(data.escrito_id)
          handleClose()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo generar'),
      }
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={generate.isPending ? undefined : handleClose} />

      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Nuevo escrito
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Se redactará usando el contexto del expediente y {clavesCount} {clavesCount === 1 ? 'actuación clave' : 'actuaciones claves'}.
            </p>
          </div>
          <button onClick={handleClose} disabled={generate.isPending} className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {clavesCount === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Este expediente no tiene actuaciones claves todavía. El escrito se generará sin ese contexto.
                Marcá actuaciones con la estrella desde el tab <strong>SAE</strong> o <strong>Claves</strong>.
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Tipo de escrito *
            </label>
            <input
              list="tipos-escrito"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="ej: Contestación de demanda"
              disabled={generate.isPending}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <datalist id="tipos-escrito">
              {sugerencias.map(s => <option key={s} value={s} />)}
            </datalist>
            <p className="mt-1 text-[10px] text-zinc-500">
              Podés escribir cualquier tipo. Los conocidos aparecen como sugerencia.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Título sugerido (opcional)
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Si lo dejás vacío, la IA decide el título"
              disabled={generate.isPending}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">
              Instrucciones puntuales (opcional)
            </label>
            <textarea
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              placeholder="ej: contestar negando todos los hechos y oponiendo prescripción"
              rows={4}
              disabled={generate.isPending}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={generate.isPending}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={generate.isPending || !tipo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generate.isPending ? 'Redactando…' : 'Generar escrito'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog: presentar al SAE
// ────────────────────────────────────────────────────────────────────────────

function PresentarSaeDialog({
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
  useMemo(() => {
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
        expediente_id: escrito.expediente_id,
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
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sticky top-0 bg-slate-900">
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
                <p className="text-zinc-500 truncate">{portalInfo.expediente.oficina}</p>
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
            ⚠ Esta acción presenta el escrito a la oficina judicial. Asegurate de que el PDF firmado sea el correcto. La presentación no se puede deshacer desde nuestra app.
          </div>
        </div>

        <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={isLoading} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={isLoading || !categoria.trim() || !descripcion.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-zinc-50 hover:opacity-90 disabled:opacity-50"
          >
            {presentar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Presentar al SAE
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Workflow bar: Firmar → Presentar → Comprobante
// ────────────────────────────────────────────────────────────────────────────

function WorkflowBar({ escrito }: { escrito: Escrito }) {
  const attach = useAttachSignedPdf()
  const fileRef = useRef<HTMLInputElement>(null)
  const [openPresentar, setOpenPresentar] = useState(false)

  const handleFile = (file: File) => {
    attach.mutate(
      { escrito_id: escrito.id, expediente_id: escrito.expediente_id, file },
      {
        onSuccess: ({ hasSignature }) => {
          if (hasSignature) toast.success('PDF firmado adjuntado')
          else toast.success('PDF adjuntado (no detecté firma embebida — verificá que esté correctamente firmado)')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo adjuntar'),
      }
    )
  }

  const isFirmado = escrito.estado === 'firmado' || escrito.estado === 'presentado_sae'
  const isPresentado = escrito.estado === 'presentado_sae'
  const comprobante = escrito.presentacion_sae?.nro_comprobante

  return (
    <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3 flex items-center gap-3 text-xs">
      {/* Paso 1: Firmar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        isFirmado ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-white/10 text-zinc-400'
      )}>
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-medium">
          {isFirmado ? 'Firmado' : '1. Firmar'}
        </span>
        {escrito.pdf_firmado_at && (
          <span className="text-[10px] text-zinc-500">
            · {new Date(escrito.pdf_firmado_at).toLocaleDateString('es-AR')}
          </span>
        )}
      </div>

      {!isFirmado && (
        <a
          href="https://firmar.gob.ar/firmador/"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          firmar.gob.ar <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      {!isPresentado && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={attach.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10 disabled:opacity-30"
          title={isFirmado ? 'Reemplazar PDF firmado' : 'Adjuntar PDF firmado'}
        >
          {attach.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {isFirmado ? 'Reemplazar firmado' : 'Adjuntar firmado'}
        </button>
      )}

      <span className="text-zinc-700 dark:text-zinc-200">→</span>

      {/* Paso 2: Presentar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        isPresentado ? 'border-violet-500/30 bg-violet-500/5 text-violet-300'
                     : isFirmado ? 'border-white/10 text-zinc-300'
                     : 'border-white/10 text-zinc-600 dark:text-zinc-400',
      )}>
        <Send className="h-3.5 w-3.5" />
        <span className="font-medium">
          {isPresentado ? 'Presentado' : '2. Presentar al SAE'}
        </span>
        {isPresentado && comprobante && (
          <span className="text-[10px] font-mono">· {comprobante}</span>
        )}
      </div>

      {isFirmado && !isPresentado && (
        <button
          onClick={() => setOpenPresentar(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/25"
        >
          <Send className="h-3 w-3" />
          Presentar ahora
        </button>
      )}

      {openPresentar && (
        <PresentarSaeDialog
          escrito={escrito}
          onClose={() => setOpenPresentar(false)}
          onSuccess={(nro) => {
            setOpenPresentar(false)
            toast.success(nro ? `Presentado · Comprobante ${nro}` : 'Presentado al SAE')
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Editor de escrito (full-screen modal)
// ────────────────────────────────────────────────────────────────────────────

function EscritoEditorModal({
  escrito, onClose, abogado, onRequestDelete,
}: {
  escrito: Escrito
  onClose: () => void
  abogado: EscritoEncabezadoAbogado
  onRequestDelete: () => void
}) {
  const update = useUpdateEscrito()
  const [contenido, setContenido] = useState<EscritoContenido>(escrito.contenido)
  const [titulo, setTitulo] = useState(escrito.titulo)
  const [estado, setEstado] = useState<Escrito['estado']>(escrito.estado)
  const [dirty, setDirty] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleSave = () => {
    update.mutate(
      { id: escrito.id, expediente_id: escrito.expediente_id, patch: { titulo, contenido, estado } },
      {
        onSuccess: () => { setDirty(false); toast.success('Escrito guardado') },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
      }
    )
  }

  // Cambio de estado: se guarda solo (no requiere apretar "Guardar")
  const handleChangeEstado = (nuevo: Escrito['estado']) => {
    setEstado(nuevo)
    update.mutate(
      { id: escrito.id, expediente_id: escrito.expediente_id, patch: { estado: nuevo } },
      {
        onSuccess: () => {
          const labels: Record<Escrito['estado'], string> = {
            borrador: 'Marcado como borrador',
            final: 'Marcado como final',
            firmado: 'Marcado como firmado',
            presentado_sae: 'Marcado como presentado al SAE',
            presentado: 'Marcado como presentado',
          }
          toast.success(labels[nuevo])
        },
        onError: (err) => {
          setEstado(escrito.estado) // rollback local
          toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
        },
      }
    )
  }

  const handlePrint = () => {
    if (!previewRef.current) return
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) {
      toast.error('Tu navegador bloqueó la ventana de impresión')
      return
    }
    const html = previewRef.current.outerHTML
    printWindow.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .escrito-doc { box-shadow: none !important; }
  @media print {
    .escrito-doc { width: 21cm !important; min-height: 29.7cm !important; padding: 2.5cm !important; }
  }
</style>
</head>
<body>${html}
<script>window.addEventListener('load', () => { setTimeout(() => { window.print() }, 200) })</script>
</body></html>`)
    printWindow.document.close()
  }

  const updateSeccion = (i: number, patch: Partial<EscritoContenido['secciones'][0]>) => {
    setContenido(c => ({
      ...c,
      secciones: c.secciones.map((s, idx) => idx === i ? { ...s, ...patch } : s),
    }))
    setDirty(true)
  }

  const updateParrafo = (si: number, pi: number, value: string) => {
    setContenido(c => ({
      ...c,
      secciones: c.secciones.map((s, idx) => idx === si
        ? { ...s, parrafos: s.parrafos.map((p, j) => j === pi ? value : p) }
        : s,
      ),
    }))
    setDirty(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            value={titulo}
            onChange={(e) => { setTitulo(e.target.value); setDirty(true) }}
            className="bg-transparent text-base font-semibold text-zinc-900 dark:text-zinc-50 focus:outline-none border-b border-transparent focus:border-amber-500/40 min-w-0 flex-1"
          />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">
            {escrito.tipo} · {escrito.registro_tonal === 'retorico' ? 'retórico' : 'procesal'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && <span className="text-[10px] text-amber-400">cambios sin guardar</span>}
          <select
            value={estado}
            onChange={(e) => handleChangeEstado(e.target.value as Escrito['estado'])}
            disabled={update.isPending || estado === 'firmado' || estado === 'presentado_sae'}
            className={cn(
              'h-7 rounded-lg border bg-slate-900 px-2 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-colors',
              estado === 'borrador'  && 'border-zinc-600/50 text-zinc-300',
              estado === 'final'     && 'border-emerald-500/40 text-emerald-300',
              estado === 'firmado'   && 'border-cyan-500/40 text-cyan-300',
              estado === 'presentado_sae' && 'border-violet-500/40 text-violet-300',
              estado === 'presentado' && 'border-violet-500/40 text-violet-300',
            )}
            title={estado === 'firmado' || estado === 'presentado_sae'
              ? 'Estado controlado por el workflow de firma/presentación'
              : 'Estado del escrito'}
          >
            <option value="borrador">Borrador</option>
            <option value="final">Final</option>
            {estado === 'firmado' && <option value="firmado">Firmado</option>}
            {estado === 'presentado_sae' && <option value="presentado_sae">Presentado al SAE</option>}
            <option value="presentado">Presentado (manual)</option>
          </select>
          <button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30"
          >
            {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
          >
            <Printer className="h-3 w-3" />
            Imprimir / PDF
          </button>
          <button
            onClick={onRequestDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
            title="Eliminar escrito"
          >
            <Trash2 className="h-3 w-3" />
            Eliminar
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Workflow: Firmar → Presentar */}
      <WorkflowBar escrito={escrito} />

      {/* Split: editor + preview */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Editor */}
        <div className="overflow-y-auto border-r border-white/10 p-5 space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Encabezado al juez</label>
            <input
              value={contenido.encabezado_juez}
              onChange={(e) => { setContenido(c => ({ ...c, encabezado_juez: e.target.value })); setDirty(true) }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            />
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mt-2">Carátula</label>
            <input
              value={contenido.caratula}
              onChange={(e) => { setContenido(c => ({ ...c, caratula: e.target.value })); setDirty(true) }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          {contenido.secciones?.map((sec, si) => (
            <div key={si} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <input
                value={sec.titulo}
                onChange={(e) => updateSeccion(si, { titulo: e.target.value })}
                className="w-full bg-transparent text-sm font-semibold text-zinc-200 mb-2 focus:outline-none border-b border-transparent focus:border-amber-500/40"
              />
              <div className="space-y-2">
                {sec.parrafos?.map((p, pi) => (
                  <textarea
                    key={pi}
                    value={p}
                    onChange={(e) => updateParrafo(si, pi, e.target.value)}
                    rows={Math.max(2, Math.ceil(p.length / 80))}
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500/40 focus:outline-none resize-none"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="overflow-y-auto bg-zinc-100 p-5">
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
            <EscritoPreview ref={previewRef} contenido={contenido} abogado={{ ...abogado, nombreCompleto: abogado.nombreCompleto || '—' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Tab Escritos (main)
// ────────────────────────────────────────────────────────────────────────────

export function TabEscritos({ expedienteId }: Props) {
  const { profile } = useAuth()
  const abogado = buildAbogadoFromProfile(profile)
  const profileIncompleto = !abogado?.matricula || !abogado?.domicilioLegal || !abogado?.cuit

  const { data: escritos = [], isLoading } = useEscritos(expedienteId)
  const { data: movements = [] } = useSaeMovements(expedienteId)
  const deleteMut = useDeleteEscrito()

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Escrito | null>(null)

  const clavesCount = useMemo(() => {
    return movements.filter(m => {
      if (m.is_key === true) return true
      if (m.is_key === false) return false
      return KEY_TYPES.has(m.tipo_movimiento) || Boolean(m.ai_suggested_action)
    }).length
  }, [movements])

  const editing = editingId ? escritos.find(e => e.id === editingId) : null

  if (profileIncompleto) {
    return (
      <Card title="Escritos">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-200">Completá tus datos profesionales</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Para generar escritos necesitamos tu matrícula, domicilio legal y CUIT. Se cargan una sola vez y se usan en el encabezado de cada escrito.
            </p>
            <Link
              to="/configuracion"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Ir a Configuración
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        title="Escritos"
        headerRight={
          <button
            onClick={() => setNuevoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            Nuevo escrito
          </button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : escritos.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="Todavía no hay escritos"
            description={`Generá el primero. Usaremos el contexto del expediente y ${clavesCount} actuaciones claves. La IA produce el formato pixel-perfect con tu logo y Times New Roman.`}
            actionLabel="Nuevo escrito"
            onAction={() => setNuevoOpen(true)}
          />
        ) : (
          <div className="space-y-2">
            {escritos.map(esc => (
              <div
                key={esc.id}
                className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <FileText className="h-4 w-4 text-violet-400 shrink-0" />
                <button
                  onClick={() => setEditingId(esc.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{esc.titulo}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {esc.tipo}
                    {esc.registro_tonal && <span className="ml-2 text-zinc-600 dark:text-zinc-400">· {esc.registro_tonal === 'retorico' ? 'retórico' : 'procesal'}</span>}
                    <span className="ml-2 text-zinc-600 dark:text-zinc-400">· {new Date(esc.created_at).toLocaleDateString('es-AR')}</span>
                  </p>
                </button>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  esc.estado === 'borrador' ? 'bg-zinc-700/30 text-zinc-400' :
                  esc.estado === 'final' ? 'bg-emerald-700/30 text-emerald-400' :
                  'bg-violet-700/30 text-violet-400',
                )}>
                  {esc.estado}
                </span>
                <button
                  onClick={() => setConfirmDelete(esc)}
                  className="shrink-0 rounded p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-white/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-600 dark:text-zinc-400">
          Cada escrito se genera usando solo las actuaciones marcadas como claves (nunca todo el historial).
        </p>
      </Card>

      <NuevoEscritoDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        expedienteId={expedienteId}
        clavesCount={clavesCount}
        onGenerated={(id) => setEditingId(id)}
      />

      {editing && abogado && (
        <EscritoEditorModal
          escrito={editing}
          abogado={abogado}
          onClose={() => setEditingId(null)}
          onRequestDelete={() => setConfirmDelete(editing)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          deleteMut.mutate(
            { id: confirmDelete.id, expediente_id: confirmDelete.expediente_id },
            {
              onSuccess: () => {
                toast.success('Escrito eliminado')
                setConfirmDelete(null)
                if (editingId === confirmDelete.id) setEditingId(null)
              },
              onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo eliminar'),
            }
          )
        }}
        title="Eliminar escrito"
        description={`¿Eliminar "${confirmDelete?.titulo}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMut.isPending}
      />
    </>
  )
}
