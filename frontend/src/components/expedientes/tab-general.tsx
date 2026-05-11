import { useNavigate } from 'react-router-dom'
import { Card, InfoItem } from './detail-helpers'
import { formatDate, daysAgo } from '@/lib/utils/date-helpers'
import type { Tables } from '@/types/database.types'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import {
  User,
  Phone,
  Mail,
  CreditCard,
  Calendar,
  Building2,
  FileText,
  Scale,
} from 'lucide-react'
import { WhatsAppButtons } from '@/components/shared/whatsapp-button'

interface TabGeneralProps {
  expediente: ExpedienteWithRelations
}

export function TabGeneral({ expediente }: TabGeneralProps) {
  const navigate = useNavigate()

  const cliente = expediente.clientes as Tables<'clientes'> | null
  const tipo = expediente.tipos_tramite as Tables<'tipos_tramite'> | null
  // Find the primary responsible (first member with rol='abogado')
  const miembros = ((expediente as any).miembros ?? []) as { rol: string; perfil: { nombre: string; apellido: string } | null }[]
  const responsable = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
  const fechaAlta = expediente.fecha_alta ?? (expediente as any).fecha_inicio_proceso

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Cliente">
          {cliente ? (
            <div className="space-y-3">
              <InfoItem icon={User} label="Nombre" value={`${cliente.apellido} ${cliente.nombre}`} copyable />
              <InfoItem icon={CreditCard} label="DNI" value={cliente.dni} copyable />
              <InfoItem icon={CreditCard} label="CUIL" value={cliente.cuil} copyable />
              <InfoItem icon={Phone} label="Teléfono" value={cliente.telefono} copyable />
              {(cliente as any).telefono_alt && (
                <InfoItem icon={Phone} label="Tel. alternativo" value={(cliente as any).telefono_alt} copyable />
              )}
              <InfoItem icon={Mail} label="Email" value={cliente.email} copyable />
              <WhatsAppButtons
                telefono={cliente.telefono}
                telefonoAlt={(cliente as any).telefono_alt}
                clienteNombre={`${cliente.apellido} ${cliente.nombre}`}
                motivo={`sobre el avance de su expediente ${expediente.caratula ?? (expediente as any).numero}`}
                variant="full"
                className="pt-1"
              />
              <div className="border-t border-zinc-200 dark:border-white/5 pt-3">
                <button
                  className="w-full rounded-lg py-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                  onClick={() => navigate(`/clientes/${cliente.id}`)}
                >
                  Ver ficha del cliente
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Sin cliente asignado</p>
          )}
        </Card>

        <Card title="Expediente">
          <div className="space-y-3">
            <InfoItem icon={FileText} label="Tipo de trámite" value={tipo?.nombre} />
            <InfoItem
              icon={Building2}
              label="Organismo"
              value={
                (expediente as Record<string, unknown>).organismo
                  ? ((expediente as Record<string, unknown>).organismo as { nombre: string }).nombre
                  : '-'
              }
            />
            <InfoItem
              icon={User}
              label="Responsable"
              value={responsable ? `${responsable.nombre} ${responsable.apellido}` : null}
            />
            <InfoItem icon={Calendar} label="Fecha de alta" value={formatDate(fechaAlta)} />
            {expediente.fecha_cierre && (
              <InfoItem icon={Calendar} label="Fecha de cierre" value={formatDate(expediente.fecha_cierre)} />
            )}
            {expediente.fuero && (
              <InfoItem icon={Scale} label="Fuero" value={expediente.fuero} />
            )}
            {expediente.numero_sae && (
              <InfoItem icon={FileText} label="Nro. SAE" value={expediente.numero_sae} copyable />
            )}
          </div>
        </Card>

        <Card title="Datos adicionales">
          <div className="space-y-3">
            <InfoItem
              icon={Calendar}
              label="Días desde el alta"
              value={
                daysAgo(fechaAlta) !== null
                  ? `${daysAgo(fechaAlta)} días`
                  : '-'
              }
            />
            {expediente.caratula && (
              <InfoItem icon={FileText} label="Carátula" value={expediente.caratula} />
            )}
          </div>
        </Card>
      </div>

      {expediente.observaciones && (
        <Card title="Observaciones">
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {expediente.observaciones}
          </p>
        </Card>
      )}
    </div>
  )
}
