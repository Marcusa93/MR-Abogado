import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarOff, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  useAgregarDiaInhabil, useAgregarFeria, useBorrarDia, useBorrarFeria, useCalendarioJudicial, useMarcarDia,
  useSincronizarNacionales, type AmbitoInhabil, type DiaInhabil,
} from '@/hooks/use-calendario-judicial'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const AMBITO: Record<AmbitoInhabil, { l: string; c: string }> = {
  nacional: { l: 'Nacional', c: 'text-sky-600 dark:text-sky-400' },
  provincial: { l: 'Tucumán', c: 'text-violet-600 dark:text-violet-400' },
  judicial: { l: 'Poder Judicial', c: 'text-amber-600 dark:text-amber-400' },
}
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const fechaLarga = (iso: string) => {
  const d = new Date(iso + 'T12:00:00Z')
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}
const campo = 'h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-zinc-100'

/**
 * Días inhábiles que usa el cálculo de plazos: feriados nacionales (API oficial),
 * provinciales de Tucumán, días que la Corte declara inhábiles y ferias.
 */
export function CalendarioInhabiles() {
  const rol = useAuthStore((s) => s.profile?.rol)
  const puedeEditar = rol === 'DIRECTOR' || rol === 'ABOGADO' || rol === 'SECRETARIA'
  const actual = new Date().getFullYear()
  const [anio, setAnio] = useState(actual)
  const { data, isLoading, error } = useCalendarioJudicial()
  const sync = useSincronizarNacionales()
  const agregar = useAgregarDiaInhabil()
  const marcar = useMarcarDia()
  const borrar = useBorrarDia()
  const agregarFeria = useAgregarFeria()
  const borrarFeria = useBorrarFeria()

  const [nuevo, setNuevo] = useState({ fecha: '', descripcion: '', referencia: '', ambito: 'judicial' as AmbitoInhabil })
  const [nuevaFeria, setNuevaFeria] = useState({ inicio: '', fin: '', temporada: 'verano' as 'verano' | 'invierno' })
  const [formAbierto, setFormAbierto] = useState<'dia' | 'feria' | null>(null)

  const dias = useMemo(() => (data?.dias ?? []).filter((d) => d.fecha.startsWith(String(anio))), [data, anio])
  const ferias = useMemo(() => (data?.ferias ?? []).filter((f) => f.inicio.startsWith(String(anio)) || f.fin.startsWith(String(anio))), [data, anio])
  const porMes = useMemo(() => {
    const m = new Map<number, DiaInhabil[]>()
    for (const d of dias) {
      const k = Number(d.fecha.slice(5, 7)) - 1
      m.set(k, [...(m.get(k) ?? []), d])
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [dias])
  const sinNacionales = !isLoading && !dias.some((d) => d.ambito === 'nacional')
  const faltaFeria = !isLoading && (['verano', 'invierno'] as const).filter((t) => !ferias.some((f) => f.temporada === t))

  const handleSync = () => sync.mutate([anio], {
    onSuccess: (r) => {
      const n = r.guardados[String(anio)] ?? 0
      toast.success('Feriados nacionales actualizados', n ? `${n} días según los decretos publicados.` : 'La fuente oficial todavía no publicó ese año.')
    },
    onError: (e) => toast.error('No se pudo consultar la fuente oficial', e.message),
  })
  const handleAgregar = () => {
    if (!nuevo.fecha || !nuevo.descripcion.trim()) { toast.error('Falta la fecha o el motivo'); return }
    agregar.mutate(nuevo, {
      onSuccess: () => { toast.success('Día inhábil cargado', 'Los plazos nuevos ya lo descuentan.'); setNuevo({ ...nuevo, fecha: '', descripcion: '', referencia: '' }); setFormAbierto(null) },
      onError: (e) => toast.error('No se pudo guardar', e.message),
    })
  }
  const handleFeria = () => {
    if (!nuevaFeria.inicio || !nuevaFeria.fin || nuevaFeria.fin < nuevaFeria.inicio) { toast.error('Revisá las fechas de la feria'); return }
    agregarFeria.mutate({ ...nuevaFeria, descripcion: `Feria de ${nuevaFeria.temporada} ${nuevaFeria.inicio.slice(0, 4)}` }, {
      onSuccess: () => { toast.success('Feria cargada'); setNuevaFeria({ inicio: '', fin: '', temporada: 'verano' }); setFormAbierto(null) },
      onError: (e) => toast.error('No se pudo guardar', e.message),
    })
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-4 dark:border-white/5">
        <CalendarOff className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Días inhábiles</h2>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-white/10">
          {[actual, actual + 1].map((y) => (
            <button key={y} type="button" onClick={() => setAnio(y)}
              className={cn('px-3 py-1', anio === y ? 'bg-zinc-900 text-white dark:bg-white/15' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>{y}</button>
          ))}
        </div>
        <button type="button" onClick={handleSync} disabled={sync.isPending} title="Consultar los feriados nacionales en la fuente oficial"
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
          {sync.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Actualizar nacionales
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {isLoading && <p className="text-sm text-zinc-500">Cargando…</p>}
        {error && <p className="text-sm text-rose-500">No se pudo cargar: {(error as Error).message}</p>}

        {(sinNacionales || (faltaFeria && faltaFeria.length > 0)) && (
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              {sinNacionales && <p>Sin feriados nacionales de {anio}: usá "Actualizar nacionales". Mientras tanto se usa la lista fija del sistema.</p>}
              {faltaFeria && faltaFeria.length > 0 && <p>Falta cargar la feria de {faltaFeria.join(' y ')} {anio}. Sin ella, los plazos que la crucen salen mal.</p>}
            </div>
          </div>
        )}

        {/* Ferias */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Ferias judiciales</p>
          {ferias.length === 0 && <p className="text-sm text-zinc-500">Ninguna cargada para {anio}.</p>}
          <ul className="space-y-1">
            {ferias.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <span className="text-zinc-900 dark:text-zinc-100">{fechaLarga(f.inicio)} al {fechaLarga(f.fin)}</span>
                <span className="text-xs text-zinc-500">{f.descripcion ?? f.temporada}</span>
                {puedeEditar && (
                  <button type="button" title="Borrar" onClick={() => { if (confirm('¿Borrar esta feria?')) borrarFeria.mutate(f.id) }}
                    className="ml-auto p-1 text-zinc-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Días */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Feriados y días inhábiles</p>
          <div className="space-y-3">
            {porMes.map(([mes, lista]) => (
              <div key={mes}>
                <p className="mb-0.5 text-xs font-medium capitalize text-zinc-500">{MES[mes]}</p>
                <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                  {lista.map((d) => (
                    <li key={d.id} className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm', !d.inhabil && 'opacity-50')}>
                      <span className="w-16 shrink-0 font-mono text-xs text-zinc-700 dark:text-zinc-300">{fechaLarga(d.fecha)}</span>
                      <span className={cn('min-w-0 flex-1 text-zinc-900 dark:text-zinc-100', !d.inhabil && 'line-through')}>{d.descripcion}</span>
                      <span className={cn('text-[11px] font-medium', AMBITO[d.ambito].c)}>
                        {AMBITO[d.ambito].l}{d.referencia && d.fuente !== 'api' ? ` · ${d.referencia}` : d.referencia === 'puente' ? ' · puente' : ''}
                      </span>
                      {puedeEditar && (
                        <span className="flex items-center gap-1">
                          <button type="button" onClick={() => marcar.mutate({ id: d.id, inhabil: !d.inhabil })}
                            title={d.inhabil ? 'Marcar que tribunales trabajó ese día' : 'Volver a contarlo como inhábil'}
                            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/5 dark:hover:text-zinc-200">
                            {d.inhabil ? 'Fue hábil' : 'Es inhábil'}
                          </button>
                          {d.fuente === 'manual' && (
                            <button type="button" title="Borrar" onClick={() => { if (confirm('¿Borrar este día?')) borrar.mutate(d.id) }}
                              className="p-1 text-zinc-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFormAbierto(formAbierto === 'dia' ? null : 'dia')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
              <Plus className="h-3 w-3" /> Día inhábil (acordada)
            </button>
            <button type="button" onClick={() => setFormAbierto(formAbierto === 'feria' ? null : 'feria')}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
              <Plus className="h-3 w-3" /> Feria
            </button>
          </div>
        )}

        {formAbierto === 'dia' && (
          <div className="grid gap-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10 sm:grid-cols-2">
            <input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} className={campo} />
            <select value={nuevo.ambito} onChange={(e) => setNuevo({ ...nuevo, ambito: e.target.value as AmbitoInhabil })} className={campo}>
              <option value="judicial">Poder Judicial (acordada, asueto)</option>
              <option value="provincial">Feriado provincial</option>
              <option value="nacional">Feriado nacional</option>
            </select>
            <input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Motivo (ej.: asueto, paro, corte de luz)" className={cn(campo, 'sm:col-span-2')} />
            <input value={nuevo.referencia} onChange={(e) => setNuevo({ ...nuevo, referencia: e.target.value })} placeholder="Referencia (ej.: Acordada 1234/26)" className={campo} />
            <button type="button" onClick={handleAgregar} disabled={agregar.isPending}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">
              {agregar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
            </button>
          </div>
        )}

        {formAbierto === 'feria' && (
          <div className="grid gap-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10 sm:grid-cols-4">
            <select value={nuevaFeria.temporada} onChange={(e) => setNuevaFeria({ ...nuevaFeria, temporada: e.target.value as 'verano' | 'invierno' })} className={campo}>
              <option value="verano">Verano</option>
              <option value="invierno">Invierno</option>
            </select>
            <input type="date" value={nuevaFeria.inicio} onChange={(e) => setNuevaFeria({ ...nuevaFeria, inicio: e.target.value })} className={campo} aria-label="Desde" />
            <input type="date" value={nuevaFeria.fin} onChange={(e) => setNuevaFeria({ ...nuevaFeria, fin: e.target.value })} className={campo} aria-label="Hasta" />
            <button type="button" onClick={handleFeria} disabled={agregarFeria.isPending}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">
              {agregarFeria.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
            </button>
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed text-zinc-500">
          Los feriados nacionales salen de la fuente oficial de los decretos y se actualizan solos. El 24 de septiembre está cargado por ley provincial.
          Los días que declara inhábiles la Corte Suprema de Tucumán (asuetos, acordadas) no se publican en un formato que el sistema pueda leer: cargalos acá cuando salgan.
          Todo lo que figura en esta lista lo usan la calculadora, la procuración automática y el análisis de notificaciones.
        </p>
      </div>
    </section>
  )
}
