import { useState } from 'react'
import { Check, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import type { ContextoIA, Esquema } from '@/hooks/use-redaccion'
import { cn } from '@/lib/utils'

function Fila({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px]">
      {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />}
      <span className={ok ? 'text-zinc-200' : 'text-zinc-500'}>{children}</span>
    </li>
  )
}

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  if (n === 0) return null
  return (
    <div>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-1.5 text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-300">
        <ChevronDown className={cn('h-3 w-3 transition-transform', !abierto && '-rotate-90')} /> {titulo} <span className="text-zinc-600">{n}</span>
      </button>
      {abierto && <div className="mt-1.5 space-y-1 pl-4">{children}</div>}
    </div>
  )
}

/** Muestra qué material usa (o usó) la IA para redactar. */
export function ContextoIAVista({ c, compacto }: { c: ContextoIA; compacto?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag-mono text-cyan-300">{c.modelo_nombre}</span>
        <span className="text-[12px] text-zinc-400">{c.motivo_modelo}</span>
      </div>
      <ul className="space-y-1">
        <Fila ok={!!c.expediente}>{c.expediente ? <>Expediente: {c.expediente.caratula ?? 's/d'}{c.expediente.tiene_brief ? ' (con resumen)' : ''}</> : 'Sin expediente vinculado'}</Fila>
        <Fila ok={c.actuaciones.length > 0}>{c.actuaciones.length} actuaciones {c.actuaciones_son_claves ? 'clave' : 'recientes'} del SAE</Fila>
        {c.responde_a_providencia && <Fila ok>Responde a una actuación concreta</Fila>}
        {c.escrito_contraparte && <Fila ok>Texto del escrito de la contraria</Fila>}
        <Fila ok={c.novedades_estudio > 0}>{c.novedades_estudio} novedades cargadas por el estudio</Fila>
        <Fila ok={c.normativa.length > 0}>{c.normativa.length} fragmentos de normativa propia</Fila>
        <Fila ok={c.jurisprudencia.length > 0}>{c.jurisprudencia.length} fragmentos de fallos propios</Fila>
        <Fila ok={c.aprendizajes.length > 0}>{c.aprendizajes.length} aprendizajes aprobados</Fila>
        <Fila ok={c.perfil.estudio}>Reglas del estudio</Fila>
        <Fila ok={c.perfil.abogado}>Tus preferencias de redacción</Fila>
        <Fila ok={c.perfil.reglas_tipo.length > 0}>Reglas por tipo{c.perfil.reglas_tipo.length ? `: ${c.perfil.reglas_tipo.join(', ')}` : ''}</Fila>
        <Fila ok={c.perfil.estrategia_expediente}>Estrategia del caso</Fila>
        {c.estilo && <Fila ok>Modelo de estilo: {c.estilo}</Fila>}
        {c.esquema_aprobado && <Fila ok>Esquema aprobado por vos</Fila>}
        <Fila ok={c.instrucciones}>Tus instrucciones</Fila>
      </ul>
      {!compacto && (
        <div className="space-y-2 border-t border-white/5 pt-3">
          <Grupo titulo="Actuaciones" n={c.actuaciones.length}>
            {c.actuaciones.map((a, i) => <p key={i} className="text-[12px] text-zinc-400"><span className="font-mono text-zinc-500">{a.fecha?.slice(0, 10)}</span> {a.titulo}</p>)}
          </Grupo>
          <Grupo titulo="Normativa" n={c.normativa.length}>
            {c.normativa.map((n) => <p key={n.chunk_id} className="text-[12px] text-zinc-400">{n.titulo}{n.articulo ? ` — art. ${n.articulo}` : ''}{n.fijada ? ' · fijada' : ''}</p>)}
          </Grupo>
          <Grupo titulo="Jurisprudencia" n={c.jurisprudencia.length}>
            {c.jurisprudencia.map((j) => <p key={j.chunk_id} className="text-[12px] text-zinc-400">{j.caratula}{j.tribunal ? ` — ${j.tribunal}` : ''}{j.fijada ? ' · fijada' : ''}</p>)}
          </Grupo>
          <Grupo titulo="Aprendizajes" n={c.aprendizajes.length}>
            {c.aprendizajes.map((a, i) => <p key={i} className="text-[12px] text-zinc-400">{a}</p>)}
          </Grupo>
        </div>
      )}
    </div>
  )
}

const input = 'w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none resize-y'

/** Editor del esquema estratégico antes de redactar. */
export function EsquemaEditor({ esquema, onChange }: { esquema: Esquema; onChange: (e: Esquema) => void }) {
  const args = esquema.argumentos ?? []
  const setArg = (i: number, patch: Partial<NonNullable<Esquema['argumentos']>[number]>) =>
    onChange({ ...esquema, argumentos: args.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  const lista = (k: 'prueba' | 'riesgos' | 'datos_faltantes', titulo: string) => {
    const v = esquema[k] ?? []
    if (!v.length && k !== 'prueba') return null
    return (
      <div>
        <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">{titulo}</p>
        <textarea rows={Math.max(2, v.length)} value={v.join('\n')} className={input}
          onChange={(e) => onChange({ ...esquema, [k]: e.target.value.split('\n').filter((x) => x.trim()) })} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Objetivo</p>
        <textarea rows={2} value={esquema.objetivo ?? ''} onChange={(e) => onChange({ ...esquema, objetivo: e.target.value })} className={input} />
      </div>
      <div>
        <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Argumentos (en este orden)</p>
        <ol className="space-y-2">
          {args.map((a, i) => (
            <li key={i} className="rounded-md border border-white/[0.08] p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-zinc-500">{i + 1}</span>
                <input value={a.titulo} onChange={(e) => setArg(i, { titulo: e.target.value })} className={cn(input, 'font-medium')} />
                <button type="button" title="Quitar" onClick={() => onChange({ ...esquema, argumentos: args.filter((_, j) => j !== i) })} className="rounded p-1 text-zinc-500 hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea rows={2} value={a.desarrollo ?? ''} onChange={(e) => setArg(i, { desarrollo: e.target.value })} placeholder="Cómo se sostiene" className={cn(input, 'mt-1.5')} />
              {a.fundamento && <p className="mt-1 text-[11.5px] text-zinc-500">Fundamento: {a.fundamento}</p>}
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => onChange({ ...esquema, argumentos: [...args, { titulo: '', desarrollo: '' }] })}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-zinc-200">
          <Plus className="h-3 w-3" /> Agregar argumento
        </button>
      </div>
      {(esquema.defensas_contrarias?.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">Lo que va a sostener la contraria</p>
          <ul className="space-y-1">
            {esquema.defensas_contrarias!.map((d, i) => (
              <li key={i} className="text-[12.5px] text-zinc-300">{d.argumento}{d.respuesta && <span className="text-zinc-500"> → {d.respuesta}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      {lista('prueba', 'Prueba')}
      {lista('riesgos', 'Riesgos')}
      {lista('datos_faltantes', 'Datos que faltan')}
    </div>
  )
}
