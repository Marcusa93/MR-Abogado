import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Copy, Check, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

// ---------------------------------------------------------------------------
// Tipos de mensaje
// ---------------------------------------------------------------------------

type TipoMensaje = 'seguimiento' | 'estado' | 'audiencia' | 'documentacion' | 'personalizado'

const TIPOS: { id: TipoMensaje; label: string; descripcion: string }[] = [
  { id: 'seguimiento',    label: 'Seguimiento del caso',     descripcion: 'Estado general y novedades' },
  { id: 'estado',         label: 'Cambio de estado',         descripcion: 'Informar nueva etapa procesal' },
  { id: 'audiencia',      label: 'Próxima audiencia',        descripcion: 'Recordatorio de fecha y lugar' },
  { id: 'documentacion',  label: 'Documentación requerida',  descripcion: 'Solicitar documentos al cliente' },
  { id: 'personalizado',  label: 'Mensaje personalizado',    descripcion: 'Redactar libremente' },
]

// ---------------------------------------------------------------------------
// Generación de mensaje
// ---------------------------------------------------------------------------

function formatWhatsAppNumber(phone: string): string {
  let clean = phone.replace(/[\s\-()+]/g, '')
  if (clean.startsWith('0')) clean = '54' + clean.slice(1)
  return clean.replace(/^\+/, '')
}

function buildMensaje(
  tipo: TipoMensaje,
  clienteNombre: string,
  caratula: string,
  estadoInterno: string,
  tipoTramite?: string | null,
  fechaAudiencia?: string,
): string {
  const saludo = `Hola ${clienteNombre}! Nos comunicamos del Estudio Jurídico Marco Rossi`
  const tramite = tipoTramite ? ` de ${tipoTramite}` : ''
  const estado = estadoInterno.replace(/_/g, ' ').toLowerCase()

  switch (tipo) {
    case 'seguimiento':
      return `${saludo} para darle seguimiento a su trámite${tramite}. El estado actual del expediente es: ${estado}. Ante cualquier novedad le estaremos informando. Quedamos a disposición.`

    case 'estado':
      return `${saludo} para informarle que su trámite${tramite} (${caratula}) ha avanzado a la etapa: *${estado}*. Por favor comuníquese con nosotros si tiene alguna consulta.`

    case 'audiencia':
      return `${saludo} para recordarle que tiene una audiencia próximamente en su causa ${caratula}${fechaAudiencia ? ` el día ${fechaAudiencia}` : ''}. Le pedimos que se comunique con nosotros para coordinar los detalles y asegurarse de concurrir con la documentación necesaria.`

    case 'documentacion':
      return `${saludo} para informarle que necesitamos documentación adicional para avanzar con su trámite${tramite}. Por favor comuníquese con nosotros a la brevedad para indicarle exactamente qué documentos se requieren.`

    case 'personalizado':
      return `${saludo}.`
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificarClienteModalProps {
  open: boolean
  onClose: () => void
  caratula: string
  estadoInterno: string
  tipoTramite?: string | null
  clienteNombre: string
  clienteTelefono: string
  clienteTelefonoAlt?: string | null
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function NotificarClienteModal({
  open,
  onClose,
  caratula,
  estadoInterno,
  tipoTramite,
  clienteNombre,
  clienteTelefono,
  clienteTelefonoAlt,
}: NotificarClienteModalProps) {
  const [tipo, setTipo] = useState<TipoMensaje>('seguimiento')
  const [mensaje, setMensaje] = useState('')
  const [telefonoSeleccionado, setTelefonoSeleccionado] = useState(clienteTelefono)
  const [copied, setCopied] = useState(false)

  // Regenerar mensaje cuando cambia tipo
  useEffect(() => {
    if (!open) return
    const msg = buildMensaje(tipo, clienteNombre, caratula, estadoInterno, tipoTramite)
    setMensaje(msg)
  }, [tipo, open, clienteNombre, caratula, estadoInterno, tipoTramite])

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setTipo('seguimiento')
      setTelefonoSeleccionado(clienteTelefono)
      setCopied(false)
    }
  }, [open, clienteTelefono])

  function handleWhatsApp() {
    const numero = formatWhatsAppNumber(telefonoSeleccionado)
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleCopy() {
    navigator.clipboard.writeText(mensaje).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Mensaje copiado')
    })
  }

  if (!open) return null

  const phones = [clienteTelefono, clienteTelefonoAlt].filter(Boolean) as string[]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/10 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Notificar al cliente</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{clienteNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Tipo de mensaje */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Tipo de comunicación
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TIPOS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    tipo === t.id
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20 hover:bg-zinc-50 dark:hover:bg-white/5'
                  )}
                >
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5 hidden sm:block">{t.descripcion}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Mensaje */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Mensaje (editable)
            </label>
            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
          </div>

          {/* Selección de teléfono si hay más de uno */}
          {phones.length > 1 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Enviar a
              </label>
              <div className="flex gap-2">
                {phones.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTelefonoSeleccionado(p)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      telefonoSeleccionado === p
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Abrir WhatsApp
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
