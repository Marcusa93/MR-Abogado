import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { InfoItem } from './detail-helpers'
import { AbogadoResponsableSelector } from './abogado-responsable-selector'
import { formatDate, daysAgo } from '@/lib/utils/date-helpers'
import type { Tables } from '@/types/database.types'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import {
  User, Phone, Mail, CreditCard, Calendar, Building2, FileText, Scale,
  ChevronDown, ChevronUp, Briefcase, MessageSquare, UsersRound, Clock,
} from 'lucide-react'
import { WhatsAppButtons } from '@/components/shared/whatsapp-button'
import { cn } from '@/lib/utils'

interface TabGeneralProps {
  expediente: ExpedienteWithRelations
}

type GroupKey = 'cliente' | 'juzgado' | 'tramite' | 'equipo' | 'observaciones'

const DEFAULT_OPEN: GroupKey[] = ['cliente']

export function TabGeneral({ expediente }: TabGeneralProps) {
  const navigate = useNavigate()
  const storageKey = `tab-general-open-${expediente.id}`

  const [openGroups, setOpenGroups] = useState<Set<GroupKey>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_OPEN)
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return new Set(DEFAULT_OPEN)
      const parsed = JSON.parse(raw) as string[]
      return new Set(parsed.filter((g): g is GroupKey => ['cliente', 'juzgado', 'tramite', 'equipo', 'observaciones'].includes(g)))
    } catch {
      return new Set(DEFAULT_OPEN)
    }
  })

  const toggle = (g: GroupKey) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
      }
      return next
    })
  }

  const cliente = expediente.clientes as Tables<'clientes'> | null
  const tipo = expediente.tipos_tramite as Tables<'tipos_tramite'> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const miembros = ((expediente as any).miembros ?? []) as { rol: string; perfil: { nombre: string; apellido: string } | null }[]
  const responsable = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fechaAlta = expediente.fecha_alta ?? (expediente as any).fecha_inicio_proceso
  const dias = daysAgo(fechaAlta)
  const organismo = ((expediente as Record<string, unknown>).organismo as { nombre: string } | null)?.nombre ?? null
  const juez = (expediente as any).juez as string | null ?? null
  const oga = (expediente as any).oga as string | null ?? null
  const juzgadoNumero = (expediente as any).juzgado_numero as number | null ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abogadoResp = (expediente as any).abogado_responsable as { nombre: string; apellido: string } | null
  const responsableLabel = abogadoResp ? `${abogadoResp.apellido}, ${abogadoResp.nombre}` : (responsable ? `${responsable.apellido}, ${responsable.nombre}` : null)

  return (
    <div className="space-y-4">
      {/* Stat strip de cabeceros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatStripCard
          icon={User}
          label="Cliente"
          value={cliente ? `${cliente.apellido}, ${cliente.nombre}` : 'Sin asignar'}
          accent="cyan"
        />
        <StatStripCard
          icon={Clock}
          label="Antigüedad"
          value={dias != null ? `${dias} d.` : '—'}
          sub={fechaAlta ? `Alta ${formatDate(fechaAlta)}` : null}
          accent="amber"
        />
        <StatStripCard
          icon={Briefcase}
          label="Trámite"
          value={tipo?.nombre || '—'}
          sub={expediente.fuero || null}
          accent="violet"
        />
        <StatStripCard
          icon={UsersRound}
          label="Responsable"
          value={responsableLabel || 'Sin asignar'}
          accent={responsableLabel ? 'emerald' : 'muted'}
        />
      </div>

      {/* Acordeones */}
      <div className="space-y-2">
        <Acordeon
          openKey="cliente"
          isOpen={openGroups.has('cliente')}
          onToggle={toggle}
          icon={User}
          title="Cliente"
        >
          {cliente ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoItem icon={User} label="Nombre" value={`${cliente.apellido}, ${cliente.nombre}`} copyable />
                <InfoItem icon={CreditCard} label="DNI" value={cliente.dni} copyable />
                <InfoItem icon={CreditCard} label="CUIL" value={cliente.cuil} copyable />
                <InfoItem icon={Phone} label="Teléfono" value={cliente.telefono} copyable />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(cliente as any).telefono_alt && (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <InfoItem icon={Phone} label="Tel. alt." value={(cliente as any).telefono_alt} copyable />
                )}
                <InfoItem icon={Mail} label="Email" value={cliente.email} copyable />
              </div>

              <WhatsAppButtons
                telefono={cliente.telefono}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                telefonoAlt={(cliente as any).telefono_alt}
                clienteNombre={`${cliente.apellido} ${cliente.nombre}`}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                motivo={`sobre el avance de su expediente ${expediente.caratula ?? (expediente as any).numero}`}
                variant="full"
              />

              <button
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
                onClick={() => navigate(`/clientes/${cliente.id}`)}
              >
                Ver ficha completa del cliente →
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">Sin cliente asignado</p>
          )}
        </Acordeon>

        <Acordeon
          openKey="juzgado"
          isOpen={openGroups.has('juzgado')}
          onToggle={toggle}
          icon={Building2}
          title="Datos del juzgado"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoItem icon={Building2} label="Organismo" value={organismo || '—'} />
            {expediente.fuero && (
              <InfoItem icon={Scale} label="Fuero" value={expediente.fuero} />
            )}
            {juzgadoNumero && (
              <InfoItem icon={Building2} label="Juzgado N.º" value={String(juzgadoNumero)} />
            )}
            {juez && (
              <InfoItem icon={User} label="Juez/a" value={juez} />
            )}
            {oga && (
              <InfoItem icon={Building2} label="OGA" value={oga} />
            )}
            {expediente.numero_sae && (
              <InfoItem icon={FileText} label="Nro. SAE" value={expediente.numero_sae} copyable />
            )}
            {expediente.caratula && (
              <InfoItem icon={FileText} label="Carátula" value={expediente.caratula} />
            )}
          </div>
        </Acordeon>

        <Acordeon
          openKey="tramite"
          isOpen={openGroups.has('tramite')}
          onToggle={toggle}
          icon={Briefcase}
          title="Tipo de trámite y fechas"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoItem icon={Briefcase} label="Tipo de trámite" value={tipo?.nombre || '—'} />
            <InfoItem icon={Calendar} label="Fecha de alta" value={formatDate(fechaAlta)} />
            {expediente.fecha_cierre && (
              <InfoItem icon={Calendar} label="Fecha de cierre" value={formatDate(expediente.fecha_cierre)} />
            )}
            <InfoItem
              icon={Clock}
              label="Días desde el alta"
              value={dias != null ? `${dias} días` : '—'}
            />
          </div>
        </Acordeon>

        <Acordeon
          openKey="equipo"
          isOpen={openGroups.has('equipo')}
          onToggle={toggle}
          icon={UsersRound}
          title="Equipo asignado"
        >
          <div className="space-y-3">
            <AbogadoResponsableSelector
              expedienteId={expediente.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              abogadoResponsableId={(expediente as any).abogado_responsable_id ?? null}
              abogadoResponsableLabel={responsableLabel}
            />
            {miembros.length > 0 && (
              <div className="border-t border-white/5 pt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Miembros del expediente</p>
                {miembros.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">
                      {m.perfil ? `${m.perfil.apellido}, ${m.perfil.nombre}` : '—'}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 capitalize">{m.rol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Acordeon>

        {expediente.observaciones && (
          <Acordeon
            openKey="observaciones"
            isOpen={openGroups.has('observaciones')}
            onToggle={toggle}
            icon={MessageSquare}
            title="Observaciones"
          >
            <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {expediente.observaciones}
            </p>
          </Acordeon>
        )}
      </div>
    </div>
  )
}

// ─── Componentes internos ───────────────────────────────────────────────────

function StatStripCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string | null
  accent: 'cyan' | 'amber' | 'violet' | 'emerald' | 'muted'
}) {
  const cls = {
    cyan: 'border-cyan-500/20 bg-cyan-500/[0.04]',
    amber: 'border-amber-500/20 bg-amber-500/[0.04]',
    violet: 'border-violet-500/20 bg-violet-500/[0.04]',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.04]',
    muted: 'border-white/10 bg-white/[0.02]',
  }[accent]
  const iconCls = {
    cyan: 'text-cyan-400', amber: 'text-amber-400', violet: 'text-violet-400',
    emerald: 'text-emerald-400', muted: 'text-zinc-500',
  }[accent]

  return (
    <div className={cn('rounded-lg border px-3 py-2', cls)}>
      <div className="flex items-start gap-2">
        <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', iconCls)} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="text-sm font-semibold text-zinc-100 truncate" title={value}>{value}</p>
          {sub && <p className="text-[10px] text-zinc-500 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function Acordeon({
  openKey, isOpen, onToggle, icon: Icon, title, children,
}: {
  openKey: GroupKey
  isOpen: boolean
  onToggle: (k: GroupKey) => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/30 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(openKey)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        </div>
        {isOpen
          ? <ChevronUp className="h-4 w-4 text-zinc-500" />
          : <ChevronDown className="h-4 w-4 text-zinc-500" />
        }
      </button>
      {isOpen && (
        <div className="border-t border-zinc-200 dark:border-white/5 px-4 py-3">
          {children}
        </div>
      )}
    </div>
  )
}
