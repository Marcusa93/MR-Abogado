import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, CalendarClock, ChevronDown, Clock, FileSearch, FileText, Gavel, Loader2, MessageSquareWarning, Newspaper, Plus, Radar, RefreshCw, Search, ShieldAlert, UserRound, X } from 'lucide-react'
import {
  useAccesoEditorial, usePropuestas, useArticulos, useEditorialIA, useActualizarPropuesta, useCrearPropuestaManual,
  usePuedeAprobarEditorial, useEquipoEditorial, useAsignarPropuesta, nombreCorto,
  TIPO_ARTICULO_LABEL, ESTADO_ARTICULO_LABEL, type Propuesta, type EstadoArticulo, type MiembroEditorial,
} from '@/hooks/use-editorial'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

// Módulo editorial: propuestas (radar, sentencias nuevas, manuales) y
// artículos en curso. Para quien tiene acceso editorial: Marco y colaboradores.
// Marco ve todo lo que producen, les asigna temas y es el único que aprueba.

const ORIGEN: Record<Propuesta['origen'], { label: string; icon: typeof Radar; cls: string }> = {
  sentencia: { label: 'Sentencia nueva', icon: Gavel, cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  radar: { label: 'Radar', icon: Radar, cls: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  manual: { label: 'Manual', icon: Plus, cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  actuacion: { label: 'Desde un expediente', icon: FileSearch, cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  actualizacion: { label: 'Actualización', icon: RefreshCw, cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
}

const hoyISO = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
const fechaCorta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

const ESTADO_CLS: Record<EstadoArticulo, string> = {
  investigacion: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  borrador: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  aprobado: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  publicado: 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
  archivado: 'bg-zinc-500/10 text-zinc-500',
}

function Puntaje({ label, valor }: { label: string; valor: number | null }) {
  if (!valor) return null
  return (
    <span className="flex items-center gap-1 text-[11px] text-zinc-500" title={`${label}: ${valor}/5`}>
      {label}
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i <= valor ? 'bg-[var(--brand-accent)] dark:bg-[var(--brand-ice)]' : 'bg-zinc-300 dark:bg-white/15')} />
        ))}
      </span>
    </span>
  )
}

function Campo({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{titulo}</p>
      <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{texto}</p>
    </div>
  )
}

function Asignar({ p, equipo, yo }: { p: Propuesta; equipo: MiembroEditorial[]; yo: string | undefined }) {
  const asignar = useAsignarPropuesta()
  const [abierto, setAbierto] = useState(false)
  const [a, setA] = useState('')
  const [nota, setNota] = useState('')
  const [plazo, setPlazo] = useState('')
  const colaboradores = equipo.filter((m) => m.id !== yo)
  if (!colaboradores.length) return null
  const enviar = (asignadoA: string | null) => asignar.mutate({ propuesta_id: p.id, asignado_a: asignadoA, nota: nota.trim(), fecha_limite: plazo || null }, {
    onSuccess: (r) => {
      setAbierto(false); setNota('')
      if (!asignadoA) return toast.info('Asignación quitada')
      const quien = nombreCorto(equipo.find((m) => m.id === asignadoA))
      toast.success(`Tema asignado a ${quien}`, r.avisado ? 'Le llegó el aviso por Telegram.' : 'No tiene Telegram vinculado: lo va a ver en Editorial.')
    },
    onError: (e) => toast.error('No se pudo asignar', e instanceof Error ? e.message : undefined),
  })
  if (p.asignado_a && !abierto) {
    return (
      <button type="button" onClick={() => enviar(null)} disabled={asignar.isPending} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs text-zinc-500 hover:bg-zinc-500/10">
        Quitar asignación
      </button>
    )
  }
  if (!abierto) {
    return (
      <button type="button" onClick={() => { setA(colaboradores[0]?.id ?? ''); setAbierto(true) }}
        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
        <UserRound className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Asignar
      </button>
    )
  }
  return (
    <div className="order-first basis-full space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Proponer este tema a</p>
      <select value={a} onChange={(e) => setA(e.target.value)}
        className="min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-base sm:min-h-9 sm:text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200">
        {colaboradores.map((m) => <option key={m.id} value={m.id}>{nombreCorto(m)}</option>)}
      </select>
      <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
        placeholder="Indicaciones (opcional): enfoque, a quién va dirigido, para cuándo…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" />
      <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        Fecha límite (opcional)
        <input type="date" value={plazo} min={hoyISO()} onChange={(e) => setPlazo(e.target.value)}
          className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 text-base sm:text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100" />
      </label>
      <div className="flex gap-2 sm:justify-end">
        <button type="button" onClick={() => setAbierto(false)} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs text-zinc-500 hover:bg-zinc-500/10">Cancelar</button>
        <button type="button" onClick={() => enviar(a)} disabled={!a || asignar.isPending} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs bg-[var(--brand-navy)] text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--brand-navy)]">
          {asignar.isPending && <Loader2 className="h-4 w-4 animate-spin sm:h-3.5 sm:w-3.5" />} Asignar y avisar
        </button>
      </div>
    </div>
  )
}

function PropuestaCard({ p, equipo, puedeAprobar, yo }: { p: Propuesta; equipo: MiembroEditorial[]; puedeAprobar: boolean; yo: string | undefined }) {
  const navigate = useNavigate()
  const ia = useEditorialIA()
  const actualizar = useActualizarPropuesta()
  const [abierta, setAbierta] = useState(false)
  const o = ORIGEN[p.origen]
  const persona = (id: string | null) => (id ? equipo.find((m) => m.id === id) : undefined)
  const asignado = persona(p.asignado_a)
  const autor = p.origen === 'manual' && p.creado_por && p.creado_por !== yo ? persona(p.creado_por) : undefined

  const investigar = () => ia.mutate({ modo: 'investigar', propuesta_id: p.id }, {
    onSuccess: (r) => {
      toast.success('Investigación lista', 'Revisala y pedí la redacción cuando quieras.')
      if (typeof r.articulo_id === 'string') navigate(`/editorial/${r.articulo_id}`)
    },
    onError: (e) => toast.error('No se pudo investigar', e instanceof Error ? e.message : undefined),
  })

  return (
    <div className="dashboard-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', o.cls)}>
          <o.icon className="h-3 w-3" /> {o.label}
        </span>
        <span className="text-[11px] text-zinc-500">{new Date(p.created_at).toLocaleDateString('es-AR')}</span>
        {p.tipo_sugerido && <span className="text-[11px] text-zinc-500">· sugiere {TIPO_ARTICULO_LABEL[p.tipo_sugerido].toLowerCase()}</span>}
        {p.estado === 'en_curso' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">En curso</span>}
        {asignado && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
            <UserRound className="h-3 w-3" /> {p.asignado_a === yo ? 'Para vos' : `Para ${asignado.nombre}`}
          </span>
        )}
        {autor && <span className="text-[11px] text-zinc-500">· propuesta de {autor.nombre}</span>}
        {p.asignado_a && p.fecha_limite && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            p.fecha_limite < hoyISO() && p.estado === 'propuesta' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>
            <CalendarClock className="h-3 w-3" /> para el {fechaCorta(p.fecha_limite)}
          </span>
        )}
      </div>
      <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">{p.titulo}</h3>
      {p.pregunta && <p className="mt-1 text-sm italic text-zinc-600 dark:text-zinc-300">{p.pregunta}</p>}
      {p.asignado_a && p.nota_asignacion && (
        <p className="mt-2 rounded-lg bg-indigo-500/5 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Indicaciones de Marco:</span> {p.nota_asignacion}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <Puntaje label="Actualidad" valor={p.actualidad} />
        <Puntaje label="Interés" valor={p.interes} />
        <Puntaje label="Originalidad" valor={p.originalidad} />
      </div>

      {abierta && (
        <div className="mt-3 space-y-2.5 border-t border-zinc-200 pt-3 dark:border-white/10">
          <Campo titulo={p.origen === 'actualizacion' ? 'Qué cambió' : 'Problema jurídico'} texto={p.problema} />
          <Campo titulo={p.origen === 'actualizacion' ? 'Qué revisar' : 'Hipótesis inicial'} texto={p.hipotesis} />
          <Campo titulo="Enfoque diferencial" texto={p.enfoque} />
          <Campo titulo="Relevancia" texto={p.relevancia} />
          {p.fuentes?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fuentes</p>
              <ul className="mt-0.5 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                {p.fuentes.map((f, i) => <li key={i}><span className="font-mono text-[11px] text-zinc-400">[{f.tipo ?? '?'}]</span> {f.descripcion}</li>)}
              </ul>
            </div>
          )}
          {p.riesgos && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {p.riesgos}
            </div>
          )}
          {p.movement_id && p.expediente_id && (
            <Link to={`/expedientes/${p.expediente_id}?tab=actuaciones&mid=${p.movement_id}`} className="inline-flex items-center gap-1 text-xs text-[var(--brand-accent)] hover:underline dark:text-[var(--brand-ice)]">
              <Gavel className="h-3 w-3" /> Ver la sentencia de origen (interna, no publicable)
            </Link>
          )}
        </div>
      )}

      <button type="button" onClick={() => setAbierta((v) => !v)}
        className="mt-2 flex min-h-8 items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', abierta && 'rotate-180')} />
        {abierta ? 'Ver menos' : p.origen === 'actualizacion' ? 'Ver qué cambió' : 'Ver problema, hipótesis y fuentes'}
      </button>

      {p.estado === 'propuesta' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-white/10 sm:justify-end">
          {p.origen === 'actualizacion' && p.articulo_id ? (
            <>
              <button type="button" disabled={actualizar.isPending}
                onClick={() => actualizar.mutate({ id: p.id, estado: 'descartada' }, { onSuccess: () => toast.info('Propuesta descartada') })}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs text-zinc-500 hover:bg-zinc-500/10">
                No hace falta
              </button>
              <Link to={`/editorial/${p.articulo_id}`} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs bg-[var(--brand-navy)] text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--brand-navy)]">
                <RefreshCw className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Abrir el artículo
              </Link>
            </>
          ) : (
            <>
              <button type="button" disabled={actualizar.isPending || ia.isPending}
                onClick={() => actualizar.mutate({ id: p.id, estado: 'descartada' }, { onSuccess: () => toast.info('Propuesta descartada') })}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs text-zinc-500 hover:bg-zinc-500/10">
                Descartar
              </button>
              {puedeAprobar && <Asignar p={p} equipo={equipo} yo={yo} />}
              <button type="button" onClick={investigar} disabled={ia.isPending}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium sm:min-h-8 sm:flex-none sm:rounded-lg sm:text-xs bg-[var(--brand-navy)] text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--brand-navy)]"
                title="Modo investigación: normas, jurisprudencia de tu base, interpretaciones y tesis. No redacta el artículo todavía.">
                {ia.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:h-3.5 sm:w-3.5" /> : <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
                {ia.isPending ? 'Investigando…' : 'Investigar'}
              </button>
            </>
          )}
          {ia.isPending && (
            <p className="basis-full text-center text-xs text-zinc-500 sm:text-right">Tarda uno o dos minutos. Al terminar se abre el artículo.</p>
          )}
        </div>
      )}
    </div>
  )
}

function NuevaPropuesta({ onClose, equipo, puedeAprobar, yo }: { onClose: () => void; equipo: MiembroEditorial[]; puedeAprobar: boolean; yo: string | undefined }) {
  const crear = useCrearPropuestaManual()
  const asignar = useAsignarPropuesta()
  const [para, setPara] = useState('')
  const [nota, setNota] = useState('')
  const colaboradores = puedeAprobar ? equipo.filter((m) => m.id !== yo) : []
  const [titulo, setTitulo] = useState('')
  const [problema, setProblema] = useState('')
  const [pregunta, setPregunta] = useState('')
  const cls = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm text-zinc-800 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'
  return (
    <div className="dashboard-panel space-y-2 rounded-2xl p-4">
      <div className="flex items-center">
        <p className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Nuevo tema</p>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-500/10 hover:text-zinc-600" aria-label="Cerrar"><X className="h-5 w-5 sm:h-4 sm:w-4" /></button>
      </div>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título tentativo" className={cls} autoFocus />
      <textarea value={problema} onChange={(e) => setProblema(e.target.value)} rows={3} placeholder="El problema jurídico que querés pensar (qué viste, por qué importa)" className={cls} />
      <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="La pregunta que debería responder el artículo" className={cls} />
      {colaboradores.length > 0 && (
        <>
          <select value={para} onChange={(e) => setPara(e.target.value)} className={cls}>
            <option value="">La trabajo yo</option>
            {colaboradores.map((m) => <option key={m.id} value={m.id}>Proponérsela a {nombreCorto(m)}</option>)}
          </select>
          {para && <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Indicaciones para él (opcional)" className={cls} />}
        </>
      )}
      <button type="button" disabled={titulo.trim().length < 4 || crear.isPending || asignar.isPending}
        onClick={() => crear.mutate({ titulo: titulo.trim(), problema: problema.trim(), pregunta: pregunta.trim() }, {
          onSuccess: (id) => {
            if (!para) { toast.success('Propuesta creada'); return onClose() }
            asignar.mutate({ propuesta_id: id, asignado_a: para, nota: nota.trim() }, {
              onSuccess: (r) => toast.success(`Tema propuesto a ${nombreCorto(equipo.find((m) => m.id === para))}`,
                r.avisado ? 'Le llegó el aviso por Telegram.' : 'No tiene Telegram vinculado: lo va a ver en Editorial.'),
              onError: (e) => toast.error('La propuesta se creó, pero no se pudo asignar', e instanceof Error ? e.message : undefined),
              onSettled: onClose,
            })
          },
          onError: (e) => toast.error('No se pudo crear', e instanceof Error ? e.message : undefined),
        })}
        className="flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--brand-navy)] px-4 text-sm font-medium text-white disabled:opacity-50 sm:min-h-9 sm:w-auto sm:rounded-lg sm:text-xs dark:bg-white dark:text-[var(--brand-navy)]">
        Crear propuesta
      </button>
    </div>
  )
}

export default function EditorialPage() {
  const { data: acceso, isLoading: cargandoAcceso } = useAccesoEditorial()
  const { data: propuestas = [], isLoading } = usePropuestas()
  const { data: articulos = [] } = useArticulos()
  const { data: equipo = [] } = useEquipoEditorial()
  const { data: puedeAprobar = false } = usePuedeAprobarEditorial()
  const yo = useAuthStore((s) => s.profile?.id)
  const ia = useEditorialIA()
  const [tab, setTab] = useState<'propuestas' | 'articulos'>('propuestas')
  const [nueva, setNueva] = useState(false)
  const [filtroArt, setFiltroArt] = useState<'todos' | 'aprobacion' | 'curso' | 'aprobados'>('todos')
  const [filtroProp, setFiltroProp] = useState<'todas' | 'asignadas' | 'libres'>('todas')

  if (cargandoAcceso) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
  if (!acceso) return <Navigate to="/inicio" replace />

  const pendientes = propuestas.filter((p) => p.estado === 'propuesta')
  // Arriba: lo asignado a mí (colaborador) / lo que espera mi aprobación (Marco)
  const propuestasOrden = [...propuestas].sort((a, b) => Number(b.asignado_a === yo) - Number(a.asignado_a === yo))
  const esperanAprobacion = (a: { estado: EstadoArticulo; aprobacion_pedida_at: string | null }) => a.estado === 'borrador' && !!a.aprobacion_pedida_at
  const articulosOrden = [...articulos].sort((a, b) => Number(esperanAprobacion(b)) - Number(esperanAprobacion(a)))
  const persona = (id: string | null) => (id ? equipo.find((m) => m.id === id) : undefined)
  const radar = () => ia.mutate({ modo: 'radar' }, {
    onSuccess: (r) => toast.success(
      r.propuestas ? `${r.propuestas} ${r.propuestas === 1 ? 'tema propuesto' : 'temas propuestos'}` : 'Sin temas que lo justifiquen',
      typeof r.comentario === 'string' ? r.comentario : undefined,
    ),
    onError: (e) => toast.error('No se pudo correr el radar', e instanceof Error ? e.message : undefined),
  })

  const filtrosArt = {
    todos: () => true,
    aprobacion: esperanAprobacion,
    curso: (a: { estado: EstadoArticulo }) => a.estado === 'investigacion' || a.estado === 'borrador',
    aprobados: (a: { estado: EstadoArticulo }) => a.estado === 'aprobado' || a.estado === 'publicado',
  } as const
  const filtrosProp = {
    todas: () => true,
    asignadas: (p: Propuesta) => (puedeAprobar ? !!p.asignado_a : p.asignado_a === yo),
    libres: (p: Propuesta) => !p.asignado_a,
  } as const
  const artVisibles = articulosOrden.filter(filtrosArt[filtroArt])
  const propVisibles = propuestasOrden.filter(filtrosProp[filtroProp])
  const nAprobacion = articulos.filter(esperanAprobacion).length

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <div className="hidden sm:block"><Breadcrumb items={[{ label: 'Editorial' }]} /></div>

      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            <Newspaper className="h-5 w-5 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" /> Editorial
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-snug text-zinc-500">
            {puedeAprobar
              ? 'Propuestas de artículos y lo que trabaja tu equipo. Nada se publica sin tu aprobación.'
              : 'Los artículos salen a nombre de Marco Rossi: vos investigás y redactás, él revisa y aprueba.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button type="button" onClick={() => { setNueva(true); setTab('propuestas') }}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 sm:min-h-9 sm:text-xs dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
            <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Nuevo tema
          </button>
          <button type="button" onClick={radar} disabled={ia.isPending}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 sm:min-h-9 sm:text-xs dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            title="Analiza las novedades de la semana y propone de 0 a 5 temas (corre solo de lunes a viernes a las 7)">
            {ia.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:h-3.5 sm:w-3.5" /> : <Radar className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
            {ia.isPending ? 'Buscando…' : 'Correr radar'}
          </button>
        </div>
      </div>

      {/* Aviso de aprobaciones pendientes */}
      {puedeAprobar && nAprobacion > 0 && tab === 'propuestas' && (
        <button type="button" onClick={() => { setTab('articulos'); setFiltroArt('aprobacion') }}
          className="flex w-full items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-left text-sm text-emerald-800 dark:text-emerald-300">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="flex-1">{nAprobacion === 1 ? 'Un artículo espera tu aprobación' : `${nAprobacion} artículos esperan tu aprobación`}</span>
          <span className="text-xs font-medium underline">Ver</span>
        </button>
      )}

      {/* Pestañas */}
      <div className="flex border-b border-zinc-200 dark:border-white/10">
        {([['propuestas', 'Propuestas', pendientes.length, BookOpen], ['articulos', 'Artículos', articulos.length, FileText]] as const).map(([id, label, n, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn('-mb-px flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-4 text-sm font-medium sm:flex-none',
              tab === id ? 'border-[var(--brand-accent)] text-zinc-900 dark:border-[var(--brand-ice)] dark:text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-700')}>
            <Icon className="h-4 w-4" /> {label}
            {n > 0 && <span className="rounded-full bg-zinc-500/15 px-1.5 text-[11px] tabular-nums">{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'propuestas' && (
        <div className="space-y-3">
          {nueva && <NuevaPropuesta onClose={() => setNueva(false)} equipo={equipo} puedeAprobar={puedeAprobar} yo={yo} />}
          {equipo.length > 1 && propuestas.length > 0 && (
            <Chips valor={filtroProp} onChange={setFiltroProp} opciones={[
              ['todas', 'Todas', propuestas.length],
              ['asignadas', puedeAprobar ? 'Asignadas' : 'Para vos', propuestas.filter(filtrosProp.asignadas).length],
              ['libres', 'Sin asignar', propuestas.filter(filtrosProp.libres).length],
            ]} />
          )}
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
          ) : propVisibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10">
              {propuestas.length === 0
                ? 'Todavía no hay propuestas. Aparecen cuando entra una sentencia, con el radar de la mañana o cuando cargás una.'
                : 'No hay propuestas en este filtro.'}
            </p>
          ) : propVisibles.map((p) => <PropuestaCard key={p.id} p={p} equipo={equipo} puedeAprobar={puedeAprobar} yo={yo} />)}
        </div>
      )}

      {tab === 'articulos' && (
        <div className="space-y-2">
          {articulos.length > 0 && (
            <Chips valor={filtroArt} onChange={setFiltroArt} opciones={[
              ['todos', 'Todos', articulos.length],
              ['aprobacion', puedeAprobar ? 'Esperan aprobación' : 'Pedida aprobación', nAprobacion],
              ['curso', 'En curso', articulos.filter(filtrosArt.curso).length],
              ['aprobados', 'Aprobados', articulos.filter(filtrosArt.aprobados).length],
            ]} />
          )}
          {artVisibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10">
              {articulos.length === 0 ? 'Sin artículos todavía. Empezá investigando una propuesta.' : 'No hay artículos en este filtro.'}
            </p>
          ) : artVisibles.map((a) => {
            const quien = persona(a.asignado_a ?? a.creado_por)
            return (
              <Link key={a.id} to={`/editorial/${a.id}`} className="dashboard-panel block rounded-xl px-4 py-3 transition-opacity hover:opacity-90 active:opacity-80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ESTADO_CLS[a.estado])}>{ESTADO_ARTICULO_LABEL[a.estado]}</span>
                  {esperanAprobacion(a) && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Clock className="h-3 w-3" /> {puedeAprobar ? 'Espera tu aprobación' : 'Aprobación pedida'}
                    </span>
                  )}
                  {a.estado === 'borrador' && a.devuelto_at && (
                    <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-300">
                      <MessageSquareWarning className="h-3 w-3" /> Con observaciones
                    </span>
                  )}
                  {(a.alertas_confidencialidad?.length ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3 w-3" /> confidencialidad</span>
                  )}
                </div>
                <p className="mt-1.5 font-medium leading-snug text-zinc-900 dark:text-zinc-50">{a.titulo}</p>
                {a.bajada && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500 sm:line-clamp-1">{a.bajada}</p>}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                  <span>{TIPO_ARTICULO_LABEL[a.tipo]}</span>
                  <span>· v{a.version}</span>
                  <span>· {new Date(a.updated_at).toLocaleDateString('es-AR')}</span>
                  {quien && quien.id !== yo && <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-300">· <UserRound className="h-3 w-3" /> {quien.nombre}</span>}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chips<T extends string>({ valor, onChange, opciones }: { valor: T; onChange: (v: T) => void; opciones: (readonly [T, string, number])[] }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
      {opciones.map(([v, label, n]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={cn('flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium',
            valor === v
              ? 'border-transparent bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5')}>
          {label} <span className="tabular-nums opacity-70">{n}</span>
        </button>
      ))}
    </div>
  )
}
