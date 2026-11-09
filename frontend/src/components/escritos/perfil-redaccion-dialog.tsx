import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  CAMPOS_PERFIL, useBorrarReglaTipo, useGuardarPerfilRedaccion, useGuardarReglaTipo,
  usePerfilesRedaccion, useReglasTipo, type PerfilRedaccion,
} from '@/hooks/use-redaccion'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

type Pestana = 'abogado' | 'estudio' | 'tipos'

const campo = 'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none resize-y'

function vacio(ambito: 'estudio' | 'abogado'): PerfilRedaccion {
  return { ambito, profile_id: null, tono: '', formulas: '', evitar: '', citas: '', notas: '' }
}

function FormPerfil({ inicial, ambito, editable }: { inicial: PerfilRedaccion | null; ambito: 'estudio' | 'abogado'; editable: boolean }) {
  const [p, setP] = useState<PerfilRedaccion>(inicial ?? vacio(ambito))
  useEffect(() => { setP(inicial ?? vacio(ambito)) }, [inicial, ambito])
  const guardar = useGuardarPerfilRedaccion()

  return (
    <div className="space-y-3">
      {CAMPOS_PERFIL.map((c) => (
        <label key={c.key} className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-300">{c.label}</span>
          <textarea
            value={p[c.key] ?? ''} disabled={!editable} rows={c.key === 'tono' ? 2 : 3}
            onChange={(e) => setP({ ...p, [c.key]: e.target.value })}
            placeholder={c.ayuda} className={cn(campo, !editable && 'opacity-60')}
          />
        </label>
      ))}
      {editable ? (
        <div className="flex justify-end">
          <button
            type="button" disabled={guardar.isPending}
            onClick={() => guardar.mutate(p, {
              onSuccess: () => toast.success('Perfil guardado', 'Se aplica desde el próximo escrito.'),
              onError: (e) => toast.error('No se pudo guardar', e.message),
            })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Solo la dirección edita las reglas del estudio.</p>
      )}
    </div>
  )
}

function ReglasPorTipo({ esDirector }: { esDirector: boolean }) {
  const { data: reglas = [], isLoading } = useReglasTipo()
  const guardar = useGuardarReglaTipo()
  const borrar = useBorrarReglaTipo()
  const [tipo, setTipo] = useState('')
  const [texto, setTexto] = useState('')
  const [delEstudio, setDelEstudio] = useState(false)

  const agregar = () => {
    if (!tipo.trim() || !texto.trim()) return
    guardar.mutate({ tipo, reglas: texto, delEstudio }, {
      onSuccess: () => { setTipo(''); setTexto(''); toast.success('Regla guardada') },
      onError: (e) => toast.error('No se pudo guardar', e.message),
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">Se aplican cuando el tipo del escrito contiene el nombre de la regla (ej.: "contestación" alcanza a "Contestación de demanda" y "Contestación de traslado").</p>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : reglas.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no hay reglas por tipo.</p>
      ) : (
        <ul className="space-y-2">
          {reglas.map((r) => (
            <li key={r.id} className="rounded-lg border border-white/[0.08] p-3">
              <div className="flex items-center gap-2">
                <span className="tag-mono">{r.tipo}</span>
                <span className="font-mono text-[10.5px] text-zinc-500">{r.profile_id ? 'mía' : 'estudio'}</span>
                {(r.profile_id || esDirector) && (
                  <button type="button" onClick={() => borrar.mutate(r.id)} className="ml-auto rounded p-1 text-zinc-500 hover:text-rose-400" title="Borrar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-300">{r.reglas}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 rounded-lg border border-dashed border-white/10 p-3">
        <input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Tipo de escrito (ej.: contestación, expresión de agravios)" className={cn(campo, 'h-9 py-0')} />
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Reglas para ese tipo (ej.: negar uno por uno los hechos; ofrecer la prueba al final; reservar el caso federal)." className={campo} />
        <div className="flex items-center gap-3">
          {esDirector && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input type="checkbox" checked={delEstudio} onChange={(e) => setDelEstudio(e.target.checked)} className="accent-cyan-500" />
              Para todo el estudio
            </label>
          )}
          <button type="button" onClick={agregar} disabled={guardar.isPending || !tipo.trim() || !texto.trim()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> Agregar regla
          </button>
        </div>
      </div>
    </div>
  )
}

export function PerfilRedaccionDialog({ onClose }: { onClose: () => void }) {
  const [pestana, setPestana] = useState<Pestana>('abogado')
  const esDirector = useAuthStore((s) => (s.profile as { rol?: string } | null)?.rol === 'DIRECTOR')
  const { data, isLoading } = usePerfilesRedaccion()

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#10161d] shadow-2xl sm:max-w-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Perfil de redacción</h2>
            <p className="mt-0.5 text-xs text-zinc-400">Lo que la IA respeta en cada escrito. Capas: estudio → abogado → tipo de escrito → expediente.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 border-b border-white/5 px-5">
          {([['abogado', 'Mis preferencias'], ['estudio', 'Reglas del estudio'], ['tipos', 'Por tipo de escrito']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPestana(k)}
              className={cn('border-b-2 px-3 py-2.5 text-xs font-medium', pestana === k ? 'border-cyan-400 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            : pestana === 'abogado' ? <FormPerfil inicial={data?.abogado ?? null} ambito="abogado" editable />
            : pestana === 'estudio' ? <FormPerfil inicial={data?.estudio ?? null} ambito="estudio" editable={esDirector} />
            : <ReglasPorTipo esDirector={esDirector} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
