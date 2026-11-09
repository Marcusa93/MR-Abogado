import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

// Datos que el cálculo de plazos necesita del expediente. Se preguntan una sola vez
// (al primero que lo abre) y quedan guardados para todo el estudio.

export type ParteEstudio = 'actora' | 'demandada' | 'tercero' | 'otra'

export interface DatosPlazosExpediente {
  id: string
  caratula: string | null
  fuero: string | null
  parte_estudio: ParteEstudio | null
  parte_estudio_detalle: string | null
  datos_plazos_confirmados_at: string | null
}

export const PARTES: { v: ParteEstudio; l: string; ayuda: string }[] = [
  { v: 'actora', l: 'Actora', ayuda: 'Iniciamos el juicio' },
  { v: 'demandada', l: 'Demandada', ayuda: 'Nos demandaron' },
  { v: 'tercero', l: 'Tercero', ayuda: 'Citada en garantía, tercero' },
  { v: 'otra', l: 'Otra', ayuda: 'Sucesión, voluntario, etc.' },
]

export const FUEROS: { v: string; l: string }[] = [
  { v: 'civil', l: 'Civil y Comercial Común' },
  { v: 'documentos_locaciones', l: 'Documentos y Locaciones' },
  { v: 'laboral', l: 'Trabajo' },
  { v: 'familia', l: 'Familia y Sucesiones' },
  { v: 'mediacion', l: 'Mediación' },
  { v: 'administrativo', l: 'Contencioso Administrativo' },
  { v: 'comercial', l: 'Comercial' },
  { v: 'previsional', l: 'Previsional' },
  { v: 'penal', l: 'Penal' },
  { v: 'otro', l: 'Otro' },
]

const CLAVE_POSPUESTO = (id: string) => `datos-plazos-pospuesto:${id}`

/** ¿Hay que preguntar? Solo si nadie lo confirmó y no se pospuso en esta sesión. */
export function debePreguntarDatosPlazos(e: Pick<DatosPlazosExpediente, 'id' | 'datos_plazos_confirmados_at'> | null | undefined): boolean {
  if (!e || e.datos_plazos_confirmados_at) return false
  try { return sessionStorage.getItem(CLAVE_POSPUESTO(e.id)) !== '1' } catch { return true }
}

export function etiquetaParte(e: Pick<DatosPlazosExpediente, 'parte_estudio' | 'parte_estudio_detalle'>): string | null {
  const p = PARTES.find((x) => x.v === e.parte_estudio)
  if (!p) return null
  return e.parte_estudio === 'otra' && e.parte_estudio_detalle ? e.parte_estudio_detalle : p.l
}

function useGuardarDatosPlazos() {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (v: { id: string; parte: ParteEstudio; detalle: string; fuero: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (createClient() as any).from('expedientes').update({
        parte_estudio: v.parte,
        parte_estudio_detalle: v.detalle.trim() || null,
        fuero: v.fuero || null,
        datos_plazos_confirmados_at: new Date().toISOString(),
        datos_plazos_confirmados_por: userId ?? null,
      }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['expedientes'] })
      qc.invalidateQueries({ queryKey: ['expediente', v.id] })
    },
  })
}

export function DatosPlazosDialog({ expediente, onClose }: { expediente: DatosPlazosExpediente; onClose: () => void }) {
  const guardar = useGuardarDatosPlazos()
  const [parte, setParte] = useState<ParteEstudio | null>(expediente.parte_estudio)
  const [detalle, setDetalle] = useState(expediente.parte_estudio_detalle ?? '')
  const [fuero, setFuero] = useState(expediente.fuero ?? '')
  const confirmado = !!expediente.datos_plazos_confirmados_at
  const inferido = !confirmado && !!expediente.parte_estudio

  const posponer = () => {
    try { sessionStorage.setItem(CLAVE_POSPUESTO(expediente.id), '1') } catch { /* sin storage */ }
    onClose()
  }
  const handleGuardar = () => {
    if (!parte) return
    guardar.mutate({ id: expediente.id, parte, detalle, fuero }, {
      onSuccess: () => { toast.success('Guardado', 'Los plazos de este expediente se calculan con estos datos.'); onClose() },
      onError: (e) => toast.error('No se pudo guardar', e instanceof Error ? e.message : ''),
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={confirmado ? onClose : undefined}>
      <div className="w-full overflow-hidden rounded-t-xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#10161d] sm:max-w-md sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-zinc-100 px-5 py-4 dark:border-white/5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100"><Scale className="h-4 w-4 text-cyan-500" /> Datos para los plazos</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {confirmado ? 'Corregí lo que haga falta.' : 'Se pregunta una sola vez: queda guardado para todo el estudio. Sin esto, la procuración puede confundir qué plazo corre para nosotros.'}
          </p>
          {expediente.caratula && <p className="mt-2 line-clamp-2 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">{expediente.caratula}</p>}
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">¿A quién representa el estudio?</label>
            <div className="grid grid-cols-2 gap-2">
              {PARTES.map((p) => (
                <button key={p.v} type="button" onClick={() => setParte(p.v)}
                  className={cn('rounded-lg border px-3 py-2 text-left transition-colors',
                    parte === p.v ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-500/60 dark:bg-cyan-500/10' : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/[0.04]')}>
                  <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.l}</span>
                  <span className="block text-[11px] text-zinc-500">{p.ayuda}</span>
                </button>
              ))}
            </div>
            {inferido && <p className="mt-1.5 text-[11.5px] text-amber-600 dark:text-amber-300/90">Marcado según la carátula. Confirmalo.</p>}
            {(parte === 'tercero' || parte === 'otra') && (
              <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={parte === 'tercero' ? 'Ej.: citada en garantía (aseguradora)' : 'Ej.: herederos en la sucesión'}
                className="mt-2 h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 focus:border-cyan-500 focus:outline-none dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100" />
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fuero</label>
            <select value={fuero} onChange={(e) => setFuero(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 focus:border-cyan-500 focus:outline-none dark:border-white/10 dark:bg-[#10161d] dark:text-zinc-100">
              <option value="">Sin dato</option>
              {FUEROS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
            <p className="mt-1 text-[11.5px] text-zinc-500">Define el código procesal y los plazos que se aplican (Trabajo tiene plazos distintos de Civil).</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-white/5">
          <button type="button" onClick={confirmado ? onClose : posponer} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            {confirmado ? 'Cancelar' : 'Ahora no'}
          </button>
          <button type="button" onClick={handleGuardar} disabled={!parte || guardar.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
