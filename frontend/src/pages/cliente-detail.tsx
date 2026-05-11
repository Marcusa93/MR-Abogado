import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ESTADO_CIVIL_LABELS, type EstadoCivil } from '@/types/enums'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { DetailSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { WhatsAppButtons } from '@/components/shared/whatsapp-button'
import { EditarClienteDialog } from '@/components/clientes/editar-cliente-dialog'
import { useCliente, useDeleteCliente } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { formatDate, daysAgo } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import {
  Edit,
  Trash2,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  Heart,
  Briefcase,
  FileText,
  AlertCircle,
  ExternalLink,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Info item
// ---------------------------------------------------------------------------

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-900 dark:text-zinc-500" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100 break-words">
          {value ?? '-'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Masked info item (passwords / sensitive credentials)
// ---------------------------------------------------------------------------

function MaskedInfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  const [visible, setVisible] = useState(false)
  const toggle = useCallback(() => setVisible((v) => !v), [])

  if (!value) return null

  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-900 dark:text-zinc-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          {label}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-sm text-zinc-900 dark:text-zinc-100 font-mono tracking-widest break-all">
            {visible ? value : '••••••••'}
          </p>
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 rounded p-0.5 text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            title={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Age calculator
// ---------------------------------------------------------------------------

function calcularEdad(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return '-'
  const dias = daysAgo(fechaNacimiento)
  if (dias === null) return '-'
  const years = Math.floor(dias / 365.25)
  return `${years} años`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteCliente = useDeleteCliente()

  const { data: cliente, isLoading, isError } = useCliente(id)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Cargando...' },
        ]} />
        <DetailSkeleton />
      </div>
    )
  }

  if (isError || !cliente) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Error' },
        ]} />
        <EmptyState
          icon={AlertCircle}
          title="Cliente no encontrado"
          description="El cliente que buscas no existe o no tienes permisos para verlo."
          actionLabel="Volver a clientes"
          onAction={() => navigate('/clientes')}
        />
      </div>
    )
  }

  const expedientes = cliente.expedientes ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Clientes', href: '/clientes' },
        { label: `${cliente.apellido} ${cliente.nombre}` },
      ]} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/20 border border-amber-500/20">
            <User className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {cliente.apellido} {cliente.nombre}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              DNI: {cliente.dni}
              {cliente.cuil && ` | CUIL: ${cliente.cuil}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </button>
          {isAdmin && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Personal info */}
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
            Datos personales
          </h3>
          <InfoItem icon={CreditCard} label="DNI" value={cliente.dni} />
          <InfoItem icon={CreditCard} label="CUIL" value={cliente.cuil} />
          <InfoItem
            icon={Calendar}
            label="Fecha de nacimiento"
            value={
              cliente.fecha_nacimiento
                ? `${formatDate(cliente.fecha_nacimiento)} (${calcularEdad(cliente.fecha_nacimiento)})`
                : null
            }
          />
          <InfoItem icon={Heart} label="Estado civil" value={(cliente as any).estado_civil ? (ESTADO_CIVIL_LABELS[(cliente as any).estado_civil as EstadoCivil] ?? (cliente as any).estado_civil) : null} />
          <InfoItem icon={Briefcase} label="Ocupación" value={(cliente as any).ocupacion} />
          <InfoItem icon={Building2} label="Obra social" value={(cliente as any).obra_social} />
        </div>

        {/* Contact info */}
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
            Contacto
          </h3>
          <InfoItem icon={Phone} label="Teléfono" value={cliente.telefono} />
          <InfoItem icon={Phone} label="Teléfono alternativo" value={cliente.telefono_alt} />
          <InfoItem icon={Mail} label="Email" value={cliente.email} />
          <WhatsAppButtons
            telefono={cliente.telefono}
            telefonoAlt={cliente.telefono_alt}
            clienteNombre={`${cliente.apellido} ${cliente.nombre}`}
            variant="full"
            className="pt-1"
          />
          <div className="border-t border-white/5 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
              Domicilio
            </h3>
            <div className="space-y-3">
              <InfoItem
                icon={MapPin}
                label="Domicilio"
                value={cliente.domicilio}
              />
              <InfoItem
                icon={MapPin}
                label="Localidad"
                value={
                  [cliente.localidad, cliente.provincia]
                    .filter(Boolean)
                    .join(', ') || null
                }
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
            Notas
          </h3>
          {cliente.notas ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {cliente.notas}
            </p>
          ) : (
            <p className="text-sm text-zinc-900 dark:text-zinc-500 italic">
              Sin notas registradas.
            </p>
          )}
        </div>
      </div>

      {/* Claves de acceso — siempre enmascaradas, show/hide por item */}
      {(cliente as any).clave_arca && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
            Claves de acceso
          </h3>
          <MaskedInfoItem icon={Key} label="Clave ARCA" value={(cliente as any).clave_arca} />
        </div>
      )}

      {/* Expedientes */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Expedientes
            {expedientes.length > 0 && (
              <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">
                ({expedientes.length})
              </span>
            )}
          </h3>
        </div>

        {expedientes.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title="Sin expedientes"
              description="Este cliente no tiene expedientes asociados."
              size="sm"
            />
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {expedientes.map((exp) => (
              <div
                key={exp.id}
                onClick={() => navigate(`/expedientes/${exp.id}`)}
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-zinc-100 dark:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                    <FileText className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {exp.caratula || (exp as any).numero}
                    </p>
                    <p className="text-xs text-zinc-900 dark:text-zinc-500 truncate font-mono">
                      {(exp as any).numero}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <EstadoBadge estado={exp.estado_interno} compact />
                  <PrioridadBadge prioridad={exp.prioridad} compact />
                  <span className="text-xs text-zinc-900 dark:text-zinc-500">
                    {formatDate((exp as any).fecha_alta ?? (exp as any).fecha_inicio)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Client Dialog */}
      <EditarClienteDialog
        cliente={cliente}
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
      />

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-white/10 p-6 shadow-xl animate-fade-in">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Eliminar cliente</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              ¿Estás seguro de que querés eliminar a <strong className="text-zinc-800 dark:text-zinc-200">{cliente.apellido} {cliente.nombre}</strong>?
              {expedientes.length > 0 && (
                <span className="block mt-1 text-amber-400">
                  Este cliente tiene {expedientes.length} expediente(s) asociado(s).
                  Solo se puede eliminar si no tiene expedientes activos.
                </span>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteCliente.mutateAsync(cliente.id)
                    toast.success('Cliente eliminado')
                    navigate('/clientes', { replace: true })
                  } catch (err: any) {
                    const msg = err?.message?.includes('expedientes activos')
                      ? 'No se puede eliminar: el cliente tiene expedientes activos'
                      : 'Error al eliminar cliente'
                    toast.error(msg)
                    setConfirmDelete(false)
                  }
                }}
                disabled={deleteCliente.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCliente.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
