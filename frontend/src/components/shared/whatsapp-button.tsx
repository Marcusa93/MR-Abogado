import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Formats a phone number for WhatsApp API.
 * Handles Argentine numbers: removes spaces/dashes, replaces leading 0 with 54.
 */
function formatWhatsAppNumber(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '')
  if (clean.startsWith('0')) clean = '54' + clean.slice(1)
  if (!clean.startsWith('+')) clean = '+' + clean
  return clean.replace('+', '')
}

// ---------------------------------------------------------------------------
// Contextual message templates
// ---------------------------------------------------------------------------

export interface WhatsAppContext {
  tipo: 'general' | 'turno' | 'tarea_completada' | 'seguimiento' | 'resolucion' | 'documentacion' | 'estado_cambio'
  tipoTramite?: string
  estado?: string
  fechaTurno?: string
  horaTurno?: string
  udai?: string
  tituloTarea?: string
  custom?: string
}

function buildContextualMessage(
  clienteNombre?: string,
  context?: WhatsAppContext
): string {
  const saludo = clienteNombre
    ? `Hola ${clienteNombre}! Nos comunicamos del estudio Alba Guerra`
    : 'Hola! Nos comunicamos del estudio Alba Guerra'

  if (!context) return `${saludo} para comunicarle sobre el estado de su trámite.`

  switch (context.tipo) {
    case 'turno':
      return `${saludo} para recordarle que tiene un turno en ANSES el ${context.fechaTurno ?? ''}${context.horaTurno ? ` a las ${context.horaTurno}` : ''}${context.udai ? ` en ${context.udai}` : ''}. Por favor, recuerde llevar toda la documentación requerida.`

    case 'tarea_completada':
      return `${saludo} para informarle que ${context.tituloTarea ? `la gestión "${context.tituloTarea}"` : 'una gestión de su expediente'} ha sido completada.`

    case 'seguimiento':
      return `${saludo} para darle seguimiento a su trámite${context.tipoTramite ? ` de ${context.tipoTramite}` : ''}.${context.estado ? ` El estado actual es: ${context.estado}.` : ''} Cualquier novedad le estaremos informando.`

    case 'resolucion':
      return `${saludo}. Nos complace informarle que su trámite${context.tipoTramite ? ` de ${context.tipoTramite}` : ''} ha sido resuelto favorablemente. Por favor comuníquese con nosotros para coordinar los próximos pasos.`

    case 'documentacion':
      return `${saludo} para informarle que necesitamos documentación adicional para avanzar con su trámite${context.tipoTramite ? ` de ${context.tipoTramite}` : ''}. Por favor, comuníquese con nosotros a la brevedad.`

    case 'estado_cambio':
      return `${saludo} para informarle que su trámite${context.tipoTramite ? ` de ${context.tipoTramite}` : ''} ha cambiado de estado${context.estado ? ` a "${context.estado}"` : ''}. Quedamos a disposición para cualquier consulta.`

    case 'general':
    default:
      if (context.custom) return `${saludo} ${context.custom}`
      return `${saludo} para comunicarle sobre el estado de su trámite${context.tipoTramite ? ` de ${context.tipoTramite}` : ''}.`
  }
}

interface WhatsAppButtonProps {
  phone: string
  /** Context about what to communicate — inserted into the message */
  motivo?: string
  /** Structured context for richer messages */
  context?: WhatsAppContext
  /** Client name for personalization */
  clienteNombre?: string
  /** Visual variant */
  variant?: 'badge' | 'icon' | 'full'
  className?: string
}

/**
 * Reusable WhatsApp contact button.
 * Opens wa.me with pre-filled message from Estudio Alba.
 *
 * Variants:
 * - `badge` (default): Green pill with icon + phone number
 * - `icon`: Small green circle icon only (for table rows)
 * - `full`: Wider button with "WhatsApp" label
 */
export function WhatsAppButton({
  phone,
  motivo,
  context,
  clienteNombre,
  variant = 'badge',
  className,
}: WhatsAppButtonProps) {
  const numero = formatWhatsAppNumber(phone)
  let body: string
  if (motivo) {
    const greeting = clienteNombre
      ? `Hola ${clienteNombre}! Nos comunicamos del estudio Alba Guerra`
      : 'Hola! Nos comunicamos del estudio Alba Guerra'
    body = `${greeting} para comunicarle ${motivo}.`
  } else {
    body = buildContextualMessage(clienteNombre, context)
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(body)}`

  if (variant === 'icon') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`WhatsApp ${phone}`}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors',
          className
        )}
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    )
  }

  if (variant === 'full') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors',
          className
        )}
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp {phone}
      </a>
    )
  }

  // badge (default)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors',
        className
      )}
    >
      <MessageCircle className="h-3 w-3" />
      {phone}
    </a>
  )
}

/**
 * Renders WhatsApp buttons for all available phones of a client.
 */
export function WhatsAppButtons({
  telefono,
  telefonoAlt,
  clienteNombre,
  motivo,
  context,
  variant = 'badge',
  className,
}: {
  telefono?: string | null
  telefonoAlt?: string | null
  clienteNombre?: string | null
  motivo?: string
  context?: WhatsAppContext
  variant?: 'badge' | 'icon' | 'full'
  className?: string
}) {
  const phones = [telefono, telefonoAlt].filter(Boolean) as string[]
  if (phones.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {phones.map((phone, i) => (
        <WhatsAppButton
          key={i}
          phone={phone}
          motivo={motivo}
          context={context}
          clienteNombre={clienteNombre ?? undefined}
          variant={variant}
        />
      ))}
    </div>
  )
}
