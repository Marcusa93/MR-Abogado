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
import { formatDate, daysAgo, timeAgo } from '@/lib/utils/date-helpers'
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
  ChevronRight,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Building2,
  FolderOpen,
  StickyNote,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────

function InfoItem({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100 break-words">{value ?? '-'}</p>
      </div>
    </div>
  )
}

function MaskedInfoItem({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  const [visible, setVisible] = useState(false)
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-sm text-zinc-900 dark:text-zinc-100 font-mono tracking-widest break-all">
            {visible ? value : '••••••••'}
          </p>
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="shrink-0 rounded p-0.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            title={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function calcularEdad(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return '-'
  const dias = daysAgo(fechaNacimiento)
  if (dias === null) return '-'
  const years = Math.floor(dias / 365.25)
  return `${years} años`
}

// ─── Tab definitions ──────────────────────────────────────────────────────

const TABS = [
  { id: 'expedientes', label: 'Expedientes', icon: FolderOpen },
  { id: 'datos',       label: 'Datos',       icon: User },
  { id: 'contacto',    label: 'Contacto',    icon: Phone },
  { id: 'notas',       label: 'Notas',       icon: StickyNote },
] as const
type TabId = (typeof TABS)[number]['id']

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('expedientes')
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
  const expedientesActivos = expedientes.filter(e =>
    !['FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'].includes(e.estado_interno),
  )
  const esPlaceholder = cliente.apellido === 'Importado SAE'

  const tabCounts: Partial<Record<TabId, number>> = {
    expedientes: expedientes.length,
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <Breadcrumb items={[
        { label: 'Clientes', href: '/clientes' },
        { label: `${cliente.apellido} ${cliente.nombre}` },
      ]} />

      {/* Banner placeholder */}
      {esPlaceholder && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Este es un cliente placeholder importado desde SAE
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              Consolidalo con el cliente real para evitar duplicados.
            </p>
          </div>
          <button
            onClick={() => navigate('/clientes/resolver')}
            className="flex-shrink-0 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
          >
            Resolver →
          </button>
        </div>
      )}

      {/* Header compacto */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/20 flex-shrink-0">
            <User className="h-6 w-6 text-amber-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 truncate">
              {cliente.apellido}, {cliente.nombre}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-xs">{cliente.dni}</span>
              {cliente.cuil && <span className="font-mono text-xs">· {cliente.cuil}</span>}
              <span className="text-xs">·</span>
              <span className="text-xs">
                {expedientesActivos.length} activo{expedientesActivos.length === 1 ? '' : 's'} de {expedientes.length}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </button>
          {isAdmin && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-white/10 overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 -mb-px min-w-max">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const count = tabCounts[tab.id]
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {count != null && count > 0 && (
                  <span className={cn(
                    'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    isActive
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
                  )}>{count}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'expedientes' && (
          <ExpedientesTab expedientes={expedientes} navigate={navigate} />
        )}
        {activeTab === 'datos' && <DatosTab cliente={cliente} />}
        {activeTab === 'contacto' && <ContactoTab cliente={cliente} />}
        {activeTab === 'notas' && <NotasTab cliente={cliente} />}
      </div>

      <EditarClienteDialog
        cliente={cliente}
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 shadow-xl animate-fade-in">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Eliminar cliente</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              ¿Estás seguro de que querés eliminar a <strong>{cliente.apellido}, {cliente.nombre}</strong>?
              {expedientes.length > 0 && (
                <span className="block mt-1 text-amber-500">
                  Tiene {expedientes.length} expediente(s). Solo se puede eliminar si no tiene activos.
                </span>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-zinc-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
              >Cancelar</button>
              <button
                onClick={async () => {
                  try {
                    await deleteCliente.mutateAsync(cliente.id)
                    toast.success('Cliente eliminado')
                    navigate('/clientes', { replace: true })
                  } catch (err: any) {
                    const msg = err?.message?.includes('expedientes activos')
                      ? 'No se puede eliminar: tiene expedientes activos'
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

// ─── Tabs ─────────────────────────────────────────────────────────────────

function ExpedientesTab({
  expedientes, navigate,
}: {
  expedientes: any[]
  navigate: (path: string) => void
}) {
  if (expedientes.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-8">
        <EmptyState
          icon={FolderOpen}
          title="Sin expedientes"
          description="Este cliente no tiene expedientes asociados."
          actionLabel="Crear expediente"
          onAction={() => navigate('/expedientes/nuevo')}
        />
      </div>
    )
  }

  // Agrupar por estado
  const activos = expedientes.filter(e =>
    !['FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'].includes(e.estado_interno),
  )
  const otros = expedientes.filter(e =>
    ['FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'].includes(e.estado_interno),
  )

  return (
    <div className="space-y-4">
      {activos.length > 0 && (
        <ExpedientesGroup title="Activos" count={activos.length} expedientes={activos} navigate={navigate} />
      )}
      {otros.length > 0 && (
        <ExpedientesGroup title="Finalizados / Pausados" count={otros.length} expedientes={otros} navigate={navigate} dimmed />
      )}
    </div>
  )
}

function ExpedientesGroup({
  title, count, expedientes, navigate, dimmed = false,
}: {
  title: string
  count: number
  expedientes: any[]
  navigate: (path: string) => void
  dimmed?: boolean
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-white/5 px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {title}
          <span className="ml-2 text-zinc-400 normal-case font-normal">({count})</span>
        </h3>
      </div>
      <ul className={cn('divide-y divide-zinc-100 dark:divide-white/5', dimmed && 'opacity-70')}>
        {expedientes.map(exp => (
          <li
            key={exp.id}
            onClick={() => navigate(`/expedientes/${exp.id}`)}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <FileText className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {exp.caratula || exp.numero}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{exp.numero}</span>
                {(exp.fecha_alta || exp.fecha_inicio) && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600 text-xs">·</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {timeAgo(exp.fecha_alta ?? exp.fecha_inicio) ?? formatDate(exp.fecha_alta ?? exp.fecha_inicio)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <EstadoBadge estado={exp.estado_interno} compact />
              <PrioridadBadge prioridad={exp.prioridad} compact />
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DatosTab({ cliente }: { cliente: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Documentación
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
        <InfoItem
          icon={Heart}
          label="Estado civil"
          value={cliente.estado_civil ? (ESTADO_CIVIL_LABELS[cliente.estado_civil as EstadoCivil] ?? cliente.estado_civil) : null}
        />
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Profesional / Sanitario
        </h3>
        <InfoItem icon={Briefcase} label="Ocupación" value={cliente.ocupacion} />
        <InfoItem icon={Building2} label="Obra social" value={cliente.obra_social} />
      </div>
    </div>
  )
}

function ContactoTab({ cliente }: { cliente: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Teléfonos y email
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
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Domicilio
        </h3>
        <InfoItem icon={MapPin} label="Calle" value={cliente.domicilio} />
        <InfoItem
          icon={MapPin}
          label="Localidad / provincia"
          value={[cliente.localidad, cliente.provincia].filter(Boolean).join(', ') || null}
        />
      </div>
    </div>
  )
}

function NotasTab({ cliente }: { cliente: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
          Notas
        </h3>
        {cliente.notas ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {cliente.notas}
          </p>
        ) : (
          <p className="text-sm text-zinc-500 italic">Sin notas registradas.</p>
        )}
      </div>
      {cliente.clave_arca && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Claves de acceso
          </h3>
          <MaskedInfoItem icon={Key} label="Clave ARCA" value={cliente.clave_arca} />
        </div>
      )}
    </div>
  )
}
