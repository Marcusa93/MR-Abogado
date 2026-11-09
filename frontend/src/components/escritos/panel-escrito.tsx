import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import type { EscritoConExpediente, EscritoContenido, EscritoSnapshot } from '@/hooks/use-escritos'
import {
  useAprendizajesDeEscrito, useCitasEscrito, useEstrategiaExpediente, useGuardarEstrategia, useRevisarEscrito,
  type CitaEscrito,
} from '@/hooks/use-redaccion'
import { useAprobarAprendizaje, useDescartarAprendizaje } from '@/hooks/use-aprendizajes'
import { detectarCitas } from '@/lib/escritos/citas'
import { ContextoIAVista } from './contexto-ia'
import { RevisionVista } from './revision-formal'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

type Pestana = 'contexto' | 'citas' | 'revision' | 'versiones' | 'aprendizajes'

export function revisionDesactualizada(e: { updated_at: string; revision_formal_at?: string | null }): boolean {
  if (!e.revision_formal_at) return true
  return new Date(e.updated_at).getTime() - new Date(e.revision_formal_at).getTime() > 10_000
}

export function useCitasDetectadas(escritoId: string, contenido: EscritoContenido) {
  const { data: citas = [] } = useCitasEscrito(escritoId)
  const detectadas = useMemo(
    () => detectarCitas(contenido, citas.map((c: CitaEscrito) => ({ texto: c.cita_texto, documento: c.documento, fuente: c.fuente }))),
    [contenido, citas],
  )
  return { citas, detectadas }
}

function Estrategia({ expedienteId }: { expedienteId: string }) {
  const { data = '', isLoading } = useEstrategiaExpediente(expedienteId)
  const guardar = useGuardarEstrategia()
  const [texto, setTexto] = useState('')
  useEffect(() => { setTexto(data) }, [data])
  if (isLoading) return null
  const cambio = texto.trim() !== (data ?? '').trim()
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Estrategia del caso</p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
        placeholder="Teoría del caso, qué conviene sostener y qué evitar. La IA la usa en todos los escritos de este expediente."
        className="w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none" />
      {cambio && (
        <button type="button" disabled={guardar.isPending}
          onClick={() => guardar.mutate({ expedienteId, texto }, { onSuccess: () => toast.success('Estrategia guardada'), onError: (e) => toast.error('No se pudo guardar', e.message) })}
          className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-900 disabled:opacity-50">
          {guardar.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Guardar estrategia
        </button>
      )}
    </div>
  )
}

export function PanelEscrito({ escrito, contenido, onRestaurar, restaurando }: {
  escrito: EscritoConExpediente
  contenido: EscritoContenido
  onRestaurar: (snap: EscritoSnapshot) => void
  restaurando: boolean
}) {
  const [pestana, setPestana] = useState<Pestana>('contexto')
  const { citas, detectadas } = useCitasDetectadas(escrito.id, contenido)
  const sinRespaldo = detectadas.filter((d) => !d.respaldada)
  const revisar = useRevisarEscrito()
  const { data: aprendizajes = [] } = useAprendizajesDeEscrito(escrito.id)
  const aprobar = useAprobarAprendizaje()
  const descartar = useDescartarAprendizaje()
  const propuestos = aprendizajes.filter((a) => a.proposed)
  const revision = revisar.data ?? escrito.revision_formal ?? null
  const desactualizada = !revisar.data && revisionDesactualizada(escrito)
  const historial = [...(escrito.historial ?? [])].reverse()

  const pestanas: { k: Pestana; l: string; n?: number; alerta?: boolean }[] = [
    { k: 'contexto', l: 'Contexto' },
    { k: 'citas', l: 'Citas', n: sinRespaldo.length || undefined, alerta: sinRespaldo.length > 0 },
    { k: 'revision', l: 'Revisión' },
    { k: 'versiones', l: 'Versiones', n: historial.length || undefined },
    { k: 'aprendizajes', l: 'Aprende', n: propuestos.length || undefined },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-0.5 overflow-x-auto border-b border-white/5 px-2">
        {pestanas.map((p) => (
          <button key={p.k} type="button" onClick={() => setPestana(p.k)}
            className={cn('shrink-0 border-b-2 px-2 py-2.5 text-[12px] font-medium', pestana === p.k ? 'border-cyan-400 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
            {p.l}{p.n != null && <span className={cn('ml-1 font-mono text-[10.5px]', p.alerta ? 'text-amber-400' : 'text-zinc-500')}>{p.n}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {pestana === 'contexto' && (
          <>
            {escrito.contexto_ia ? (
              <ContextoIAVista c={escrito.contexto_ia} />
            ) : (
              <p className="text-[12.5px] text-zinc-500">{escrito.modelo_ia ? 'Este escrito se generó antes de que se registrara el contexto.' : 'Escrito sin generación con IA.'}</p>
            )}
            {escrito.costo_usd != null && (
              <p className="font-mono text-[10.5px] text-zinc-600">costo de la generación: US$ {Number(escrito.costo_usd).toFixed(3)}</p>
            )}
            {escrito.expediente_id && <Estrategia expedienteId={escrito.expediente_id} />}
          </>
        )}

        {pestana === 'citas' && (
          <>
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Verificadas en el corpus del estudio</p>
              {citas.length === 0 ? <p className="text-[12.5px] text-zinc-500">Ninguna.</p> : (
                <ul className="space-y-2">
                  {citas.map((c) => (
                    <li key={c.id} className="text-[12.5px]">
                      <p className="flex items-start gap-1.5 text-zinc-200"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{c.documento ?? (c.fuente === 'jurisprudencia' ? 'Fallo' : 'Norma')}</p>
                      <p className="ml-5 line-clamp-3 text-zinc-500">{c.cita_texto}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Citas en el texto sin respaldo propio</p>
              {sinRespaldo.length === 0 ? <p className="text-[12.5px] text-zinc-500">Ninguna detectada.</p> : (
                <>
                  <p className="mb-1.5 text-[12px] text-zinc-500">No surgen de la normativa ni de los fallos del estudio. Verificalas antes de firmar.</p>
                  <ul className="space-y-1">
                    {sinRespaldo.map((d, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-zinc-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />{d.texto}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}

        {pestana === 'revision' && (
          <>
            <div className="flex items-center gap-2">
              <button type="button" disabled={revisar.isPending}
                onClick={() => revisar.mutate(escrito.id, { onError: (e) => toast.error('No se pudo revisar', e.message) })}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-900 disabled:opacity-50">
                {revisar.isPending && <Loader2 className="h-3 w-3 animate-spin" />} {revisar.isPending ? 'Revisando…' : revision ? 'Revisar de nuevo' : 'Revisar'}
              </button>
              {revision && desactualizada && <span className="text-[11.5px] text-amber-400">el escrito cambió después de esta revisión</span>}
            </div>
            {revision ? <RevisionVista r={revision} /> : (
              <p className="text-[12.5px] text-zinc-500">Control de requisitos formales (código procesal de Tucumán), pedidos sin fundamento, hechos sin prueba, contradicciones y plazos. Lo hace un modelo distinto del que redactó. Guardá antes de revisar.</p>
            )}
          </>
        )}

        {pestana === 'versiones' && (
          historial.length === 0 ? <p className="text-[12.5px] text-zinc-500">Todavía no hay versiones anteriores. Se guarda una en cada guardado.</p> : (
            <ul className="space-y-1">
              {historial.map((s, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11.5px] text-zinc-300">{new Date(s.saved_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false })}</p>
                    <p className="text-[11.5px] text-zinc-500">{s.contenido.secciones?.length ?? 0} secciones · {s.contenido.secciones?.reduce((n, x) => n + x.parrafos.length, 0) ?? 0} párrafos</p>
                  </div>
                  <button type="button" disabled={restaurando} onClick={() => onRestaurar(s)} className="shrink-0 text-[12px] text-cyan-300 hover:text-cyan-200 disabled:opacity-50">Restaurar</button>
                </li>
              ))}
            </ul>
          )
        )}

        {pestana === 'aprendizajes' && (
          aprendizajes.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500">Al firmar, la IA compara lo que redactó con tu versión final y propone reglas para los próximos escritos. Aparecen acá y en Aprendizajes.</p>
          ) : (
            <ul className="space-y-2">
              {aprendizajes.map((a) => (
                <li key={a.id} className="rounded-md border border-white/[0.08] p-2.5">
                  <p className="text-[12.5px] leading-relaxed text-zinc-200">{a.contenido}</p>
                  {a.proposed ? (
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => aprobar.mutate({ id: a.id }, { onSuccess: () => toast.success('Aprendizaje activado') })}
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[12px] font-medium text-zinc-900"><Check className="h-3 w-3" /> Usar siempre</button>
                      <button type="button" onClick={() => descartar.mutate(a.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[12px] text-zinc-300"><X className="h-3 w-3" /> Descartar</button>
                    </div>
                  ) : <p className="mt-1 font-mono text-[10.5px] text-emerald-400">activo</p>}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}
