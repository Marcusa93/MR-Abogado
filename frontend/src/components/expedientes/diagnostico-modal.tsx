import { useEffect, useState } from 'react'
import { useModalHistory } from '@/hooks/use-modal-history'
import { createPortal } from 'react-dom'
import {
  X, Loader2, AlertCircle, FileSearch, ClipboardCheck,
  AlertTriangle, BookOpen, GitCompare, CalendarClock, FileWarning,
} from 'lucide-react'
import { useDiagnoseEscrito, type DiagnosticoEscrito, type DiagnosticoInput } from '@/hooks/use-diagnose-escrito'
import { cn } from '@/lib/utils'

const EVALUACION_TONE: Record<string, { label: string; cls: string }> = {
  presentable_con_correcciones_menores: {
    label: 'Presentable con correcciones menores',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  requiere_reescritura_parcial: {
    label: 'Requiere reescritura parcial',
    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  requiere_reescritura_estructural: {
    label: 'Requiere reescritura estructural',
    cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
}

export function DiagnosticoModal({
  input,
  onClose,
}: {
  input: DiagnosticoInput
  onClose: () => void
}) {
  const diagnose = useDiagnoseEscrito()
  const [hasFired, setHasFired] = useState(false)

  useEffect(() => {
    if (!hasFired) {
      setHasFired(true)
      diagnose.mutate(input)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFired])

  useModalHistory(onClose)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/95 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileSearch className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-100 truncate">Diagnóstico del escrito</h2>
              <p className="text-[10px] text-zinc-400 truncate">
                {input.titulo ?? 'Escrito sin título'} · skill claude-for-legal-argentina
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 text-sm text-zinc-200">
          {diagnose.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-xs text-zinc-400">
                Analizando con Claude Sonnet 4 + skill argentina…
              </p>
              <p className="text-[10px] text-zinc-500">
                Tarda 10–25 segundos según extensión.
              </p>
            </div>
          )}

          {diagnose.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              <p className="font-semibold mb-1">No se pudo generar el diagnóstico</p>
              <p>{diagnose.error.message}</p>
            </div>
          )}

          {diagnose.data && (
            <DiagnosticoBody data={diagnose.data.diagnostico} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function DiagnosticoBody({ data }: { data: DiagnosticoEscrito }) {
  const evalTone = EVALUACION_TONE[data.sintesis?.evaluacion] ?? EVALUACION_TONE.requiere_reescritura_parcial
  return (
    <div className="space-y-5">
      {/* Síntesis arriba para que sea lo primero que vea */}
      <section className={cn('rounded-lg border px-4 py-3', evalTone.cls)}>
        <p className="text-[10px] uppercase tracking-wider font-bold mb-1">Síntesis</p>
        <p className="text-sm font-semibold mb-1">{evalTone.label}</p>
        <p className="text-xs leading-relaxed">{data.sintesis?.resumen}</p>
        <p className="mt-2 text-[10px] opacity-80">
          {data.sintesis?.marcadores_totales ?? 0} marcadores emitidos en total.
        </p>
      </section>

      {/* Identificación */}
      <Section title="Identificación" icon={ClipboardCheck} count={1}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <Field label="Tipo" value={data.identificacion?.tipo_escrito} />
          <Field label="Rama" value={data.identificacion?.rama_derecho} />
          <Field label="Fuero" value={data.identificacion?.fuero_inferido} />
          <Field label="Parte" value={data.identificacion?.parte_suscribiente} />
        </dl>
      </Section>

      <Section title="Argumentos sin norma de respaldo" icon={AlertCircle} count={data.argumentos_sin_norma?.length ?? 0}>
        <ItemList items={data.argumentos_sin_norma} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100">{it.argumento}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Sugerencia: {it.norma_sugerida}</p>
          </>
        )} />
      </Section>

      <Section title="Hechos no acreditados" icon={AlertTriangle} count={data.hechos_no_acreditados?.length ?? 0}>
        <ItemList items={data.hechos_no_acreditados} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100">{it.hecho}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {it.tipo === 'vacio_total' ? 'Vacío total — ' : 'Vacío parcial — '}
              Prueba sugerida: {it.prueba_sugerida}
            </p>
          </>
        )} />
      </Section>

      <Section title="Citas jurisprudenciales" icon={BookOpen} count={data.citas_jurisprudenciales?.length ?? 0}>
        <ItemList items={data.citas_jurisprudenciales} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100 italic">{it.cita}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {it.estado === 'verificada_en_sesion' ? '✓ Verificada' :
               it.estado === 'requerida' ? '✱ Requerida' : '⚠ Sin verificar'}
              {' · '}{it.doctrina_o_motivo}
            </p>
          </>
        )} />
      </Section>

      <Section title="Peticiones sin fundamento" icon={FileWarning} count={data.peticiones_sin_fundamento?.length ?? 0}>
        <ItemList items={data.peticiones_sin_fundamento} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100">{it.peticion}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Falta: {it.falta}</p>
          </>
        )} />
      </Section>

      <Section title="Contradicciones internas" icon={GitCompare} count={data.contradicciones?.length ?? 0}>
        <ItemList items={data.contradicciones} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100"><span className="text-zinc-400">A:</span> {it.seccion_a}</p>
            <p className="text-zinc-100"><span className="text-zinc-400">B:</span> {it.seccion_b}</p>
            <p className="text-[10px] text-amber-200 mt-1">→ {it.resolucion_sugerida}</p>
          </>
        )} />
      </Section>

      <Section title="Normas con verificación pendiente" icon={BookOpen} count={data.normas_verificacion_pendiente?.length ?? 0}>
        <ItemList items={data.normas_verificacion_pendiente} renderItem={(it: any) => (
          <>
            <p className="text-zinc-100 font-mono text-xs">{it.norma}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{it.motivo}</p>
          </>
        )} />
      </Section>

      <Section title="Alertas de plazo fatal" icon={CalendarClock} count={data.alertas_plazo_fatal?.length ?? 0}>
        <ItemList items={data.alertas_plazo_fatal} renderItem={(it: any) => (
          <>
            <p className="text-rose-200 font-semibold">{it.norma} · {it.plazo}</p>
            {it.vencimiento_estimado && (
              <p className="text-[10px] text-rose-300/80 mt-0.5">
                Vencimiento estimado: {it.vencimiento_estimado}
                {it.fecha_inicio_computo && ` (desde ${it.fecha_inicio_computo})`}
              </p>
            )}
          </>
        )} />
      </Section>

      <Section title="Observaciones estructurales" icon={ClipboardCheck} count={data.observaciones_estructurales?.length ?? 0}>
        {data.observaciones_estructurales?.length > 0 ? (
          <ul className="space-y-1.5 text-xs text-zinc-100">
            {data.observaciones_estructurales.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-500 shrink-0">·</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyHint />}
      </Section>
    </div>
  )
}

function Section({
  title, icon: Icon, count, children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <header className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <h3 className="text-xs font-semibold text-zinc-100 flex-1">{title}</h3>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-bold',
          count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-500/15 text-zinc-400',
        )}>
          {count}
        </span>
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}

function ItemList({
  items, renderItem,
}: {
  items: any[] | undefined
  renderItem: (it: any) => React.ReactNode
}) {
  if (!items || items.length === 0) return <EmptyHint />
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="rounded border border-white/5 bg-black/20 px-2.5 py-2 text-xs">
          {renderItem(it)}
        </li>
      ))}
    </ul>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</dt>
      <dd className="text-zinc-100">{value || '—'}</dd>
    </div>
  )
}

function EmptyHint() {
  return <p className="text-[11px] text-zinc-500 italic">Sin observaciones.</p>
}
