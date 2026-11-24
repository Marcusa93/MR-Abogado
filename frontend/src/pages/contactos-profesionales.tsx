import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Plus, Edit2, Trash2, Loader2, X, Phone, Mail, Briefcase,
  Sparkles, ChevronRight, Search, Gavel, Scale, FileText, Calendar,
  ArrowRight,
} from 'lucide-react'
import {
  useContactosProfesionales, useCreateContacto, useUpdateContacto, useDeleteContacto,
  useContactoDetalle360, usePersonasSinContacto,
  TIPOS_CONTACTO, type TipoContacto, type ContactoProfesional, type PersonaSinContacto,
} from '@/hooks/use-contactos-profesionales'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS_CONTACTO.map(t => [t.value, t.label]))
const TIPO_COLOR: Record<TipoContacto, string> = {
  juez: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  perito: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  abogado_contraparte: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  secretario: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  mediador: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  fiscal: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  defensor: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  otro: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0][0]?.toUpperCase() ?? '?'
  return (partes[0][0] + (partes[partes.length - 1][0] ?? '')).toUpperCase()
}

export default function ContactosProfesionalesPage() {
  const [filterTipo, setFilterTipo] = useState<TipoContacto | 'all'>('all')
  const [busqueda, setBusqueda] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ContactoProfesional | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<{ nombre: string; alias?: string[]; tipo?: TipoContacto } | null>(null)

  const { data: contactos = [], isLoading } = useContactosProfesionales({
    tipo: filterTipo === 'all' ? null : filterTipo,
  })
  const deleteContacto = useDeleteContacto()

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return contactos
    return contactos.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.matricula?.toLowerCase().includes(q) ||
      c.especialidad?.toLowerCase().includes(q)
    )
  }, [contactos, busqueda])

  const countsByTipo = useMemo(() => {
    const c: Partial<Record<TipoContacto, number>> = {}
    for (const ct of contactos) c[ct.tipo] = (c[ct.tipo] ?? 0) + 1
    return c
  }, [contactos])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <Breadcrumb items={[{ label: 'Contactos profesionales' }]} />

      <PageHeader
        title="Contactos profesionales"
        subtitle="Jueces, peritos, contrapartes. Cada nombre se cruza automáticamente con audiencias y sentencias donde aparece."
        actions={
          <button
            onClick={() => { setEditing(null); setPrefill(null); setDialogOpen(true) }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            Nuevo contacto
          </button>
        }
      />

      <PersonasSinRegistrarPanel onSuggest={(p) => {
        setPrefill({ nombre: p.nombre_display, alias: [p.nombre_normalizado], tipo: 'otro' })
        setEditing(null)
        setDialogOpen(true)
      }} />

      {/* Filtros */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, email, matrícula…"
            className="field h-11 pl-10"
          />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            onClick={() => setFilterTipo('all')}
            aria-pressed={filterTipo === 'all'}
            className="chip"
          >
            Todos <span className="chip-count">{contactos.length}</span>
          </button>
          {TIPOS_CONTACTO.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTipo(t.value)}
              aria-pressed={filterTipo === t.value}
              className="chip"
            >
              {t.label}{!!countsByTipo[t.value] && <span className="chip-count">{countsByTipo[t.value]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={contactos.length === 0 ? 'Sin contactos registrados' : 'Ningún contacto coincide'}
          description={contactos.length === 0
            ? 'Cargá tus primeros contactos manualmente o aceptá una sugerencia del panel de arriba.'
            : 'Probá con otro término de búsqueda o tipo.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => (
            <ContactoCard
              key={c.id}
              contacto={c}
              onOpen={() => setDetalleId(c.id)}
              onEdit={() => { setEditing(c); setPrefill(null); setDialogOpen(true) }}
              onDelete={() => setConfirmDelete(c.id)}
            />
          ))}
        </div>
      )}

      {dialogOpen && (
        <ContactoDialog
          editing={editing}
          prefill={prefill ?? undefined}
          onClose={() => { setDialogOpen(false); setEditing(null); setPrefill(null) }}
        />
      )}

      {detalleId && <DetalleDialog contactoId={detalleId} onClose={() => setDetalleId(null)} />}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteContacto.mutateAsync(confirmDelete); toast.success('Contacto eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
          setConfirmDelete(null)
        }}
        title="Eliminar contacto"
        description="¿Seguro? El contacto se borra pero las audiencias y aprendizajes vinculados se mantienen."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}

// ─── Card de contacto ───────────────────────────────────────────────────────

function ContactoCard({
  contacto, onOpen, onEdit, onDelete,
}: {
  contacto: ContactoProfesional
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="app-card group transition-colors hover:border-zinc-300 dark:hover:border-white/15">
      <button onClick={onOpen} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            TIPO_COLOR[contacto.tipo]
          )}>
            {iniciales(contacto.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-[14px] font-bold tracking-tight text-zinc-900 transition-colors group-hover:text-[var(--brand-accent)] dark:text-white">
              {contacto.nombre}
            </p>
            <p className="mt-0.5 text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400">
              {TIPO_LABEL[contacto.tipo] ?? contacto.tipo}
              {contacto.matricula && <> · Mat. {contacto.matricula}</>}
              {contacto.especialidad && <> · {contacto.especialidad}</>}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {contacto.telefono && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5" />
                  {contacto.telefono}
                </span>
              )}
              {contacto.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[150px]">{contacto.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-end gap-1 px-4 pb-3 opacity-60 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-[var(--brand-accent)] dark:hover:bg-white/[0.06]" title="Editar">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500" title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onOpen} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-[var(--brand-accent)] dark:hover:bg-white/[0.06]" title="Ver 360°">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Panel de personas sin registrar ────────────────────────────────────────

function PersonasSinRegistrarPanel({ onSuggest }: { onSuggest: (p: PersonaSinContacto) => void }) {
  const { data: personas = [], isLoading } = usePersonasSinContacto(3)
  const [expanded, setExpanded] = useState(false)

  if (isLoading || personas.length === 0) return null

  const visibles = expanded ? personas : personas.slice(0, 5)

  return (
    <div className="app-card p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--brand-accent)]" />
        <h3 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Detectadas pero no registradas</h3>
        <span className="text-[11px] font-medium tabular-nums text-zinc-500">{personas.length} {personas.length === 1 ? 'persona' : 'personas'}</span>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Aparecen en tus audiencias o sentencias analizadas pero todavía no las cargaste como contacto.
        Clickeá para crearlas con datos pre-rellenados.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visibles.map((p) => (
          <button
            key={p.nombre_normalizado}
            onClick={() => onSuggest(p)}
            className="chip"
          >
            <Plus className="h-2.5 w-2.5" />
            <span>{p.nombre_display}</span>
            <span className="chip-count">×{p.apariciones}</span>
          </button>
        ))}
        {personas.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="dashboard-link text-[12px]"
          >
            {expanded ? 'Ver menos' : `Ver ${personas.length - 5} más`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Detalle 360° ───────────────────────────────────────────────────────────

function DetalleDialog({ contactoId, onClose }: { contactoId: string; onClose: () => void }) {
  const { data, isLoading } = useContactoDetalle360(contactoId)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[var(--popover)]">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold',
                  TIPO_COLOR[data.contacto.tipo]
                )}>
                  {iniciales(data.contacto.nombre)}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">{data.contacto.nombre}</h2>
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    {TIPO_LABEL[data.contacto.tipo]}
                    {data.contacto.organismo_nombre && <> · {data.contacto.organismo_nombre}</>}
                    {data.contacto.matricula && <> · Mat. {data.contacto.matricula}</>}
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon shrink-0 border-transparent">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Apariciones" value={data.stats.audiencias_count + data.stats.aprendizajes_count} />
                <StatBox label="Audiencias" value={data.stats.audiencias_count} />
                <StatBox label="Expedientes" value={data.stats.expedientes_count} />
              </div>

              {/* Datos */}
              {(data.contacto.telefono || data.contacto.email || data.contacto.especialidad || data.contacto.observaciones) && (
                <div className="dashboard-panel-muted space-y-1.5 p-3.5">
                  {data.contacto.telefono && <InfoRow icon={Phone} label="Teléfono" value={data.contacto.telefono} />}
                  {data.contacto.telefono_alt && <InfoRow icon={Phone} label="Alt." value={data.contacto.telefono_alt} />}
                  {data.contacto.email && <InfoRow icon={Mail} label="Email" value={data.contacto.email} />}
                  {data.contacto.especialidad && <InfoRow icon={Briefcase} label="Especialidad" value={data.contacto.especialidad} />}
                  {data.contacto.observaciones && (
                    <p className="mt-1 border-t border-zinc-200 pt-1.5 text-[12px] italic text-zinc-600 dark:border-white/[0.06] dark:text-zinc-400">{data.contacto.observaciones}</p>
                  )}
                </div>
              )}

              {/* Audiencias */}
              {data.audiencias.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-zinc-900 dark:text-white">
                    <Scale className="h-3.5 w-3.5 text-[var(--brand-accent)]" />
                    Audiencias donde aparece ({data.audiencias.length})
                  </h3>
                  <div className="space-y-1.5">
                    {data.audiencias.slice(0, 10).map((a) => (
                      <Link
                        key={a.transcript_id}
                        to={`/expedientes/${a.expediente_id}#audiencias`}
                        onClick={onClose}
                        className="block rounded-xl border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="line-clamp-1 flex-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {a.expediente_caratula || a.expediente_numero}
                          </p>
                          {a.fecha && (
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-zinc-500">
                              <Calendar className="h-2.5 w-2.5" />
                              {formatDate(a.fecha)}
                            </span>
                          )}
                          <ArrowRight className="h-3 w-3 text-zinc-500 shrink-0" />
                        </div>
                        {a.resumen && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500 dark:text-zinc-400">{a.resumen}</p>
                        )}
                      </Link>
                    ))}
                    {data.audiencias.length > 10 && (
                      <p className="pt-1 text-center text-[11px] text-zinc-500">+ {data.audiencias.length - 10} más</p>
                    )}
                  </div>
                </div>
              )}

              {/* Aprendizajes */}
              {data.aprendizajes.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-zinc-900 dark:text-white">
                    <Gavel className="h-3.5 w-3.5 text-[var(--brand-accent)]" />
                    Aprendizajes asociados ({data.aprendizajes.length})
                  </h3>
                  <div className="space-y-1.5">
                    {data.aprendizajes.slice(0, 8).map((apr) => (
                      <div key={apr.id} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
                        <p className="line-clamp-3 text-xs leading-snug text-zinc-800 dark:text-zinc-200">{apr.contenido}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span>{TIPO_LABEL[apr.target_kind] ?? apr.target_kind} · conf. {apr.confidence}</span>
                          {apr.expediente_id && (
                            <Link
                              to={`/expedientes/${apr.expediente_id}`}
                              onClick={onClose}
                              className="dashboard-link inline-flex items-center gap-0.5"
                            >
                              <FileText className="h-2.5 w-2.5" />
                              expediente
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.audiencias.length === 0 && data.aprendizajes.length === 0 && (
                <p className="py-4 text-center text-xs italic text-zinc-500">
                  Todavía no hay audiencias ni aprendizajes vinculados a este nombre.
                  A medida que se analicen, irán apareciendo acá.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="dashboard-panel-muted px-3 py-2.5 text-center">
      <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3 w-3 text-zinc-500" />
      <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  )
}

// ─── Diálogo de alta/edición ────────────────────────────────────────────────

function ContactoDialog({
  editing, prefill, onClose,
}: {
  editing: ContactoProfesional | null
  prefill?: { nombre: string; alias?: string[]; tipo?: TipoContacto }
  onClose: () => void
}) {
  const { user } = useAuth()
  const createContacto = useCreateContacto()
  const updateContacto = useUpdateContacto()

  const [tipo, setTipo] = useState<TipoContacto>(editing?.tipo ?? prefill?.tipo ?? 'otro')
  const [nombre, setNombre] = useState(editing?.nombre ?? prefill?.nombre ?? '')
  const [alias, setAlias] = useState((editing?.alias_normalizados ?? prefill?.alias ?? []).join(', '))
  const [matricula, setMatricula] = useState(editing?.matricula ?? '')
  const [telefono, setTelefono] = useState(editing?.telefono ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [especialidad, setEspecialidad] = useState(editing?.especialidad ?? '')
  const [observaciones, setObservaciones] = useState(editing?.observaciones ?? '')

  const aliasArray = alias.split(',').map(s => s.trim()).filter(Boolean)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !nombre.trim()) return
    try {
      if (editing) {
        await updateContacto.mutateAsync({
          id: editing.id,
          tipo, nombre: nombre.trim(),
          alias_normalizados: aliasArray,
          matricula: matricula.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          especialidad: especialidad.trim() || null,
          observaciones: observaciones.trim() || null,
        })
        toast.success('Contacto actualizado')
      } else {
        await createContacto.mutateAsync({
          tipo, nombre: nombre.trim(),
          alias: aliasArray,
          matricula: matricula.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          especialidad: especialidad.trim() || null,
          observaciones: observaciones.trim() || null,
          scope: 'personal',
          owner_id: user.id,
        })
        toast.success('Contacto creado')
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const isPending = createContacto.isPending || updateContacto.isPending
  const inputCls = 'field'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[var(--popover)]" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-[var(--popover)]">
          <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">{editing ? 'Editar contacto' : 'Nuevo contacto'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="btn btn-ghost btn-icon shrink-0 border-transparent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoContacto)} className={inputCls}>
                {TIPOS_CONTACTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Matrícula (opcional)</label>
              <input type="text" value={matricula} onChange={e => setMatricula(e.target.value)} className={inputCls} placeholder="Ej: 11604" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Nombre completo</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus className={inputCls} placeholder="Ej: Dr. Juan Pérez" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Otras formas en que aparece (separadas por coma)</label>
            <input type="text" value={alias} onChange={e => setAlias(e.target.value)} className={inputCls} placeholder="J. Pérez, Juan Perez, Pérez" />
            <p className="text-[11px] text-zinc-500">El sistema usa esto para encontrarlo en audiencias y aprendizajes.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Teléfono</label>
              <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Especialidad (opcional)</label>
            <input type="text" value={especialidad} onChange={e => setEspecialidad(e.target.value)} className={inputCls} placeholder="Ej: Daños y perjuicios" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Observaciones (opcional)</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3} className={inputCls} placeholder="Cómo trabaja, qué le gusta, qué evitar…" />
          </div>

          <button
            type="submit"
            disabled={isPending || !nombre.trim()}
            className="btn btn-primary w-full"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </form>
      </div>
    </div>
  )
}
