import { useRef, useState } from 'react'
import { Check, ClipboardList, Copy, ExternalLink, FileText, Link2, Loader2, MessageCircle, Minus, Plus, Save, Trash2, Undo2, X } from 'lucide-react'
import {
  useDocumentosRequeridos, usePlantillasDoc, useAgregarDocumentos, useCambiarEstadoDoc, useEliminarDoc,
  useGuardarComoPlantilla, useEnlaceDoc, useCrearEnlaceDoc, useRevocarEnlaceDoc, abrirAdjunto, urlEnlace,
  type CasoDoc, type DocumentoRequerido,
} from '@/hooks/use-documentacion'
import { formatWhatsAppNumber } from '@/components/shared/whatsapp-button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Documentación que el estudio le pide al cliente para el caso: lista con
// estado, plantillas por tipo de caso y enlace para que el cliente la suba.

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''

export function DocumentacionRequerida({ caso, clienteNombre, clienteTelefono }: {
  caso: CasoDoc
  clienteNombre?: string | null
  clienteTelefono?: string | null
}) {
  const { data: docs = [], isLoading } = useDocumentosRequeridos(caso)
  const { data: plantillas = [] } = usePlantillasDoc()
  const agregar = useAgregarDocumentos(caso)
  const cambiar = useCambiarEstadoDoc(caso)
  const eliminar = useEliminarDoc(caso)
  const guardarPlantilla = useGuardarComoPlantilla()
  const { data: enlace } = useEnlaceDoc(caso)
  const crearEnlace = useCrearEnlaceDoc(caso)
  const revocar = useRevocarEnlaceDoc(caso)

  const [nuevo, setNuevo] = useState('')
  const inputNuevo = useRef<HTMLInputElement>(null)
  const [plantillaId, setPlantillaId] = useState('')
  const [borrar, setBorrar] = useState<DocumentoRequerido | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')

  const vigentes = docs.filter((d) => d.estado !== 'no_aplica')
  const recibidos = vigentes.filter((d) => d.estado === 'recibido').length
  const faltanObligatorios = vigentes.filter((d) => d.estado === 'pendiente' && d.obligatorio).length
  const pct = vigentes.length ? Math.round((recibidos / vigentes.length) * 100) : 0

  const aplicarPlantilla = (id: string) => {
    const p = plantillas.find((x) => x.id === id)
    if (!p) return
    agregar.mutate({ items: p.items, existentes: docs }, {
      onSuccess: (n) => toast.success(n ? `${n} documentos agregados` : 'Ya estaban todos en la lista'),
      onError: (e) => toast.error('No se pudo aplicar la plantilla', e instanceof Error ? e.message : undefined),
    })
    setPlantillaId('')
  }

  const agregarUno = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevo.trim()) return
    agregar.mutate({ items: [{ nombre: nuevo }], existentes: docs }, {
      onSuccess: (n) => { if (!n) toast.info('Ese documento ya está en la lista'); setNuevo('') },
      onError: (err) => toast.error('No se pudo agregar', err instanceof Error ? err.message : undefined),
    })
  }

  const pendientesTxt = vigentes.filter((d) => d.estado === 'pendiente').map((d) => `• ${d.nombre}`).join('\n')

  const conEnlace = async (accion: (url: string) => void) => {
    try {
      const e = enlace ?? await crearEnlace.mutateAsync()
      accion(urlEnlace(e.token))
    } catch (err) {
      toast.error('No se pudo generar el enlace', err instanceof Error ? err.message : undefined)
    }
  }

  // Los clientes importados del SAE tienen el número de expediente como nombre
  const primerNombre = (clienteNombre ?? '').trim().split(/\s+/)[0] ?? ''
  const saludo = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,}$/.test(primerNombre) ? ` ${primerNombre}` : ''
  const mensaje = (url: string) =>
    `Hola${saludo}, te escribimos del Estudio Jurídico Dr. Marco Rossi. ` +
    (pendientesTxt
      ? `Para avanzar con tu caso necesitamos esta documentación:\n\n${pendientesTxt}\n\nPodés subirla desde el celular, sacándole una foto, en este enlace:\n${url}`
      : `Podés mandarnos la documentación de tu caso desde el celular, sacándole una foto, en este enlace:\n${url}`) +
    '\n\nGracias.'

  const enviarWhatsApp = () => conEnlace((url) => {
    const numero = clienteTelefono ? formatWhatsAppNumber(clienteTelefono) : ''
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje(url))}`, '_blank', 'noopener')
  })

  const copiar = () => conEnlace(async (url) => {
    await navigator.clipboard.writeText(mensaje(url)).catch(() => {})
    toast.success('Mensaje copiado', 'Pegalo en WhatsApp o en un mail.')
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
        <h3 className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Documentación del cliente</h3>
        {vigentes.length > 0 && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold',
            faltanObligatorios ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>
            {recibidos} de {vigentes.length} recibidos
          </span>
        )}
      </div>

      {vigentes.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Plantilla + enviar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={plantillaId}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__libre') { setPlantillaId(''); inputNuevo.current?.focus(); return }
            setPlantillaId(v)
            if (v) aplicarPlantilla(v)
          }}
          disabled={agregar.isPending}
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"
        >
          <option value="">{docs.length ? 'Agregar desde plantilla…' : 'Elegí una plantilla o armá una lista libre…'}</option>
          <option value="__libre">Lista libre: escribo yo los documentos</option>
          {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {(
          <>
            <button type="button" onClick={enviarWhatsApp} disabled={crearEnlace.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              title={clienteTelefono ? 'Abre WhatsApp con el mensaje y el enlace' : 'El cliente no tiene teléfono cargado: elegí el contacto en WhatsApp'}>
              {crearEnlace.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
              {vigentes.some((d) => d.estado === 'pendiente') ? 'Pedir por WhatsApp' : 'Enviar enlace por WhatsApp'}
            </button>
            <button type="button" onClick={copiar}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
              <Copy className="h-3.5 w-3.5" /> Copiar mensaje
            </button>
          </>
        )}
      </div>

      {enlace && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <Link2 className="h-3 w-3" />
          Enlace activo hasta el {fechaCorta(enlace.expires_at)}
          {enlace.subidas > 0 && ` · ${enlace.subidas} ${enlace.subidas === 1 ? 'archivo subido' : 'archivos subidos'}`}
          <a href={urlEnlace(enlace.token)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
            ver como el cliente <ExternalLink className="h-3 w-3" />
          </a>
          <button type="button" onClick={() => revocar.mutate(undefined, { onSuccess: () => toast.info('Enlace revocado') })}
            className="text-rose-500 hover:underline">revocar</button>
        </p>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-zinc-400" /></div>
      ) : docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-xs text-zinc-500 dark:border-white/10">
          Todavía no hay documentos pedidos. Elegí una plantilla, escribilos uno por uno abajo, o mandá el enlace igual:
          el cliente puede subir lo que quiera indicando qué es.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-white/5 dark:border-white/10">
          {docs.map((d) => (
            <li key={d.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2 text-xs', d.estado === 'no_aplica' && 'opacity-50')}>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                d.estado === 'recibido' ? 'bg-emerald-500 text-white' : d.estado === 'no_aplica' ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' : 'border border-zinc-300 dark:border-white/20')}>
                {d.estado === 'recibido' ? <Check className="h-3 w-3" /> : d.estado === 'no_aplica' ? <Minus className="h-3 w-3" /> : null}
              </span>
              <span className={cn('min-w-0 flex-1', d.estado === 'no_aplica' && 'line-through')}>
                <span className="text-zinc-800 dark:text-zinc-100">{d.nombre}</span>
                {!d.obligatorio && <span className="ml-1 text-[10px] text-zinc-400">(si tiene)</span>}
                {d.estado === 'recibido' && (
                  <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                    {d.fuente === 'cliente' ? 'lo subió el cliente' : 'recibido'} {fechaCorta(d.recibido_at)}
                  </span>
                )}
              </span>
              {d.adjunto && (
                <button type="button" onClick={() => abrirAdjunto(d.adjunto!.storage_path).catch((e) => toast.error(e.message))}
                  className="flex items-center gap-1 text-cyan-600 hover:underline dark:text-cyan-400">
                  <FileText className="h-3.5 w-3.5" /> Ver
                </button>
              )}
              {d.estado === 'pendiente' ? (
                <>
                  <button type="button" onClick={() => cambiar.mutate({ id: d.id, estado: 'recibido' })}
                    className="rounded-md px-1.5 py-0.5 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400" title="Marcar como recibido">
                    Recibido
                  </button>
                  <button type="button" onClick={() => cambiar.mutate({ id: d.id, estado: 'no_aplica' })}
                    className="rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-500/10" title="No corresponde para este caso">
                    No aplica
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => cambiar.mutate({ id: d.id, estado: 'pendiente' })}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-500/10" title="Volver a pendiente">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button" onClick={() => setBorrar(d)} className="rounded-md p-1 text-zinc-400 hover:text-rose-500" title="Quitar de la lista">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregarUno} className="flex gap-2">
        <input ref={inputNuevo} value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Escribí un documento a pedir (ej: recibo de sueldo de marzo)"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200" />
        <button type="submit" disabled={!nuevo.trim() || agregar.isPending}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </form>

      {docs.length > 0 && (
        guardando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input autoFocus value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} placeholder="Nombre de la plantilla (ej: Laboral — Despido)"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200" />
            <button type="button" disabled={!nombrePlantilla.trim() || guardarPlantilla.isPending}
              onClick={() => guardarPlantilla.mutate({ nombre: nombrePlantilla, docs: docs.filter((d) => d.estado !== 'no_aplica') }, {
                onSuccess: () => { toast.success('Plantilla guardada'); setGuardando(false); setNombrePlantilla('') },
                onError: (e) => toast.error('No se pudo guardar', e instanceof Error ? e.message : undefined),
              })}
              className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
              Guardar
            </button>
            <button type="button" onClick={() => setGuardando(false)} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setGuardando(true)} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            <Save className="h-3 w-3" /> Guardar esta lista como plantilla (si ponés el nombre de una existente, la reemplaza)
          </button>
        )
      )}

      <ConfirmDialog
        open={!!borrar}
        onClose={() => setBorrar(null)}
        onConfirm={async () => {
          if (!borrar) return
          try { await eliminar.mutateAsync(borrar.id) } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo quitar') }
          setBorrar(null)
        }}
        title="Quitar documento"
        description={borrar ? `¿Quitar "${borrar.nombre}" de la lista? Si ya se subió un archivo, queda en los adjuntos.` : ''}
        confirmLabel="Quitar"
        variant="danger"
      />
    </div>
  )
}
