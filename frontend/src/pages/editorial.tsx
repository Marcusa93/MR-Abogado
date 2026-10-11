import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, FileText, Gavel, Loader2, Newspaper, Plus, Radar, Search, ShieldAlert, X } from 'lucide-react'
import {
  useAccesoEditorial, usePropuestas, useArticulos, useEditorialIA, useActualizarPropuesta, useCrearPropuestaManual,
  TIPO_ARTICULO_LABEL, ESTADO_ARTICULO_LABEL, type Propuesta, type EstadoArticulo,
} from '@/hooks/use-editorial'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Módulo editorial: propuestas (radar, sentencias nuevas, manuales) y
// artículos en curso. Solo para quien tiene acceso editorial (Marco).

const ORIGEN: Record<Propuesta['origen'], { label: string; icon: typeof Radar; cls: string }> = {
  sentencia: { label: 'Sentencia nueva', icon: Gavel, cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  radar: { label: 'Radar', icon: Radar, cls: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  manual: { label: 'Manual', icon: Plus, cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
}

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

function PropuestaCard({ p }: { p: Propuesta }) {
  const navigate = useNavigate()
  const ia = useEditorialIA()
  const actualizar = useActualizarPropuesta()
  const [abierta, setAbierta] = useState(false)
  const o = ORIGEN[p.origen]

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
      </div>
      <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">{p.titulo}</h3>
      {p.pregunta && <p className="mt-1 text-sm italic text-zinc-600 dark:text-zinc-300">{p.pregunta}</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        <Puntaje label="Actualidad" valor={p.actualidad} />
        <Puntaje label="Interés" valor={p.interes} />
        <Puntaje label="Originalidad" valor={p.originalidad} />
      </div>

      {abierta && (
        <div className="mt-3 space-y-2.5 border-t border-zinc-200 pt-3 dark:border-white/10">
          <Campo titulo="Problema jurídico" texto={p.problema} />
          <Campo titulo="Hipótesis inicial" texto={p.hipotesis} />
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} className="text-xs text-zinc-500 hover:underline">
          {abierta ? 'Ver menos' : 'Ver problema, hipótesis y fuentes'}
        </button>
        <span className="flex-1" />
        {p.estado === 'propuesta' && (
          <>
            <button type="button" disabled={actualizar.isPending}
              onClick={() => actualizar.mutate({ id: p.id, estado: 'descartada' }, { onSuccess: () => toast.info('Propuesta descartada') })}
              className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-500/10">
              Descartar
            </button>
            <button type="button" onClick={investigar} disabled={ia.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-navy)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--brand-navy)]"
              title="Modo investigación: normas, jurisprudencia de tu base, interpretaciones y tesis. No redacta el artículo todavía.">
              {ia.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {ia.isPending ? 'Investigando… (1-2 min)' : 'Investigar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function NuevaPropuesta({ onClose }: { onClose: () => void }) {
  const crear = useCrearPropuestaManual()
  const [titulo, setTitulo] = useState('')
  const [problema, setProblema] = useState('')
  const [pregunta, setPregunta] = useState('')
  const cls = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'
  return (
    <div className="dashboard-panel space-y-2 rounded-2xl p-4">
      <div className="flex items-center">
        <p className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Nueva propuesta propia</p>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
      </div>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título tentativo" className={cls} autoFocus />
      <textarea value={problema} onChange={(e) => setProblema(e.target.value)} rows={3} placeholder="El problema jurídico que querés pensar (qué viste, por qué importa)" className={cls} />
      <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="La pregunta que debería responder el artículo" className={cls} />
      <button type="button" disabled={titulo.trim().length < 4 || crear.isPending}
        onClick={() => crear.mutate({ titulo: titulo.trim(), problema: problema.trim(), pregunta: pregunta.trim() }, {
          onSuccess: () => { toast.success('Propuesta creada'); onClose() },
          onError: (e) => toast.error('No se pudo crear', e instanceof Error ? e.message : undefined),
        })}
        className="rounded-lg bg-[var(--brand-navy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-[var(--brand-navy)]">
        Crear propuesta
      </button>
    </div>
  )
}

export default function EditorialPage() {
  const { data: acceso, isLoading: cargandoAcceso } = useAccesoEditorial()
  const { data: propuestas = [], isLoading } = usePropuestas()
  const { data: articulos = [] } = useArticulos()
  const ia = useEditorialIA()
  const [tab, setTab] = useState<'propuestas' | 'articulos'>('propuestas')
  const [nueva, setNueva] = useState(false)

  if (cargandoAcceso) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
  if (!acceso) return <Navigate to="/inicio" replace />

  const pendientes = propuestas.filter((p) => p.estado === 'propuesta')
  const radar = () => ia.mutate({ modo: 'radar' }, {
    onSuccess: (r) => toast.success(
      r.propuestas ? `${r.propuestas} ${r.propuestas === 1 ? 'tema propuesto' : 'temas propuestos'}` : 'Sin temas que lo justifiquen',
      typeof r.comentario === 'string' ? r.comentario : undefined,
    ),
    onError: (e) => toast.error('No se pudo correr el radar', e instanceof Error ? e.message : undefined),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <Breadcrumb items={[{ label: 'Editorial' }]} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            <Newspaper className="h-5 w-5 text-[var(--brand-accent)] dark:text-[var(--brand-ice)]" /> Editorial
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Propuestas de artículos (sentencias nuevas y radar de lunes a viernes a las 7). Nada se redacta ni se publica sin tu decisión.
          </p>
        </div>
        <button type="button" onClick={() => setNueva(true)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
          <Plus className="h-3.5 w-3.5" /> Propuesta propia
        </button>
        <button type="button" onClick={radar} disabled={ia.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          title="Analiza las novedades de la semana y propone de 0 a 5 temas">
          {ia.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />} Correr radar ahora
        </button>
      </div>

      <div className="flex border-b border-zinc-200 dark:border-white/10">
        {([['propuestas', `Propuestas${pendientes.length ? ` (${pendientes.length})` : ''}`, BookOpen], ['articulos', `Artículos${articulos.length ? ` (${articulos.length})` : ''}`, FileText]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium',
              tab === id ? 'border-[var(--brand-accent)] text-zinc-900 dark:border-[var(--brand-ice)] dark:text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-700')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'propuestas' && (
        <div className="space-y-3">
          {nueva && <NuevaPropuesta onClose={() => setNueva(false)} />}
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
          ) : propuestas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10">
              Todavía no hay propuestas. Van a aparecer cuando entre una sentencia o con el radar de la mañana. También podés correrlo ahora o cargar una propia.
            </p>
          ) : propuestas.map((p) => <PropuestaCard key={p.id} p={p} />)}
        </div>
      )}

      {tab === 'articulos' && (
        <div className="space-y-2">
          {articulos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10">
              Sin artículos todavía. Empezá investigando una propuesta.
            </p>
          ) : articulos.map((a) => (
            <Link key={a.id} to={`/editorial/${a.id}`} className="dashboard-panel block rounded-xl px-4 py-3 hover:opacity-90">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ESTADO_CLS[a.estado])}>{ESTADO_ARTICULO_LABEL[a.estado]}</span>
                <span className="text-[11px] text-zinc-500">{TIPO_ARTICULO_LABEL[a.tipo]} · v{a.version} · {new Date(a.updated_at).toLocaleDateString('es-AR')}</span>
                {(a.alertas_confidencialidad?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3 w-3" /> confidencialidad</span>
                )}
              </div>
              <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">{a.titulo}</p>
              {a.bajada && <p className="line-clamp-1 text-sm text-zinc-500">{a.bajada}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
