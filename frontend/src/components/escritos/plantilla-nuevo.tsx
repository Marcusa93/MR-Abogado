import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileText, Loader2, Search } from 'lucide-react'
import { useCrearDesdePlantilla, useDatosPlantilla, useGuardarComoPlantilla, usePlantillas } from '@/hooks/use-plantillas'
import { aplicarPlantilla, aVariables, type DatosPlantilla } from '@/lib/escritos/plantillas'
import { datosPorCompletar } from '@/components/expedientes/guia-escrito'
import { CaracterSelector, CARACTER_POR_DEFECTO, formulaPresentacion, inferirCaracter, type CaracterEscrito } from '@/components/expedientes/caracter-escrito'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const campo = 'h-8 w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[12.5px] text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none'

/**
 * Escrito de trámite sin IA: plantilla del estudio + datos del expediente.
 * Sale al instante, sin costo y sin texto inventado.
 */
export function NuevoDesdePlantilla({ expedienteId, pickerExpediente, onCreated, onClose }: {
  expedienteId: string
  pickerExpediente: React.ReactNode
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const { data: plantillas = [], isLoading } = usePlantillas()
  const { data: datosExp } = useDatosPlantilla(expedienteId || null)
  const crear = useCrearDesdePlantilla()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>('')
  const [datos, setDatos] = useState<DatosPlantilla>({ encabezado: '', caratula: '', expte: '', cliente: '' })
  const [caracter, setCaracter] = useState<CaracterEscrito>(CARACTER_POR_DEFECTO)
  const [caracterTocado, setCaracterTocado] = useState(false)

  useEffect(() => { if (datosExp) setDatos(datosExp) }, [datosExp])
  const plantilla = plantillas.find((p) => p.id === sel)
  useEffect(() => {
    if (!caracterTocado && plantilla) setCaracter(inferirCaracter(`${plantilla.nombre} ${plantilla.tipo}`, CARACTER_POR_DEFECTO))
  }, [plantilla, caracterTocado])

  const filtradas = useMemo(() => {
    const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const t = n(q.trim())
    return plantillas.filter((p) => !t || n(`${p.nombre} ${p.tipo}`).includes(t))
  }, [plantillas, q])
  const grupos = [
    { titulo: 'Trámite', items: filtradas.filter((p) => p.categoria === 'tramite') },
    { titulo: 'Modelos del estudio', items: filtradas.filter((p) => p.categoria === 'modelo') },
  ].filter((g) => g.items.length)

  const resultado = plantilla?.contenido_modelo
    ? { ...aplicarPlantilla(plantilla.contenido_modelo, datos), caracter, presentacion: formulaPresentacion(caracter) }
    : null
  const pendientes = resultado ? datosPorCompletar(resultado).length : 0

  const handleCrear = async () => {
    if (!plantilla || !resultado) return
    try {
      const id = await crear.mutateAsync({
        expediente_id: expedienteId || null,
        titulo: resultado.titulo || plantilla.nombre.toUpperCase(),
        tipo: plantilla.tipo || plantilla.nombre,
        contenido: resultado,
        template_id: plantilla.id,
      })
      onCreated(id)
    } catch (err) {
      toast.error('No se pudo crear el escrito', err instanceof Error ? err.message : '')
    }
  }

  return (
    <>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
        {pickerExpediente}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">Plantilla</label>
          <div className="relative mb-1.5">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pronto despacho, oficio, cédula…" className={cn(campo, 'h-9 pl-8 text-sm')} />
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-1">
            {isLoading && <p className="px-2 py-1.5 text-[12.5px] text-zinc-500">Cargando…</p>}
            {!isLoading && grupos.length === 0 && <p className="px-2 py-1.5 text-[12.5px] text-zinc-500">No hay plantillas con ese nombre.</p>}
            {grupos.map((g) => (
              <div key={g.titulo}>
                <p className="px-2 pb-0.5 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">{g.titulo}</p>
                {g.items.map((p) => (
                  <button key={p.id} type="button" onClick={() => setSel(p.id)}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]', sel === p.id ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.04]')}>
                    {sel === p.id ? <Check className="h-3.5 w-3.5 shrink-0 text-cyan-400" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-600" />}
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    {!p.compartido && <span className="tag-mono text-zinc-500">mía</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {plantilla && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Me presento como</label>
              <CaracterSelector value={caracter} expedienteId={expedienteId || null} onChange={(c) => { setCaracter(c); setCaracterTocado(true) }} />
            </div>
            <div className="space-y-2 rounded-lg border border-white/[0.08] p-3">
              <p className="text-[11.5px] text-zinc-500">{expedienteId ? 'Datos tomados del expediente. Corregí lo que haga falta.' : 'Sin expediente: completá los datos o quedan marcados para después.'}</p>
              <input value={datos.encabezado} onChange={(e) => setDatos({ ...datos, encabezado: e.target.value })} placeholder="Encabezado (SR. JUEZ…)" className={campo} />
              <input value={datos.caratula} onChange={(e) => setDatos({ ...datos, caratula: e.target.value })} placeholder="Carátula" className={campo} />
              <input value={datos.expte} onChange={(e) => setDatos({ ...datos, expte: e.target.value })} placeholder="N° de expediente" className={campo} />
            </div>
            {resultado && (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-[12.5px] leading-relaxed text-zinc-300">
                <p className="font-medium text-zinc-100">{resultado.titulo}</p>
                {resultado.secciones.flatMap((s) => s.parrafos).slice(0, 2).map((t, i) => <p key={i} className="mt-1.5">{t}</p>)}
                {pendientes > 0 && <p className="mt-2 text-[11.5px] text-amber-300/90">{pendientes} dato{pendientes !== 1 ? 's' : ''} para completar en el editor.</p>}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
        <span className="mr-auto text-[11.5px] text-zinc-500">Sin IA · sin costo</span>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancelar</button>
        <button onClick={handleCrear} disabled={!resultado || crear.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:opacity-90 disabled:opacity-50">
          {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Crear escrito
        </button>
      </div>
    </>
  )
}

/** Guarda el escrito actual como plantilla de trámite: los datos del expediente pasan a variables. */
export function GuardarPlantillaDialog({ titulo, tipo, contenido, expedienteId, onClose }: {
  titulo: string
  tipo: string
  contenido: import('@/hooks/use-escritos').EscritoContenido
  expedienteId: string | null
  onClose: () => void
}) {
  const { data: datosExp, isLoading } = useDatosPlantilla(expedienteId)
  const guardar = useGuardarComoPlantilla()
  const [nombre, setNombre] = useState(titulo.charAt(0) + titulo.slice(1).toLowerCase())
  const [tipoP, setTipoP] = useState(tipo)
  const [compartido, setCompartido] = useState(true)

  const handleGuardar = async () => {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    // Se guarda sin carácter ni presentación (se eligen al usar la plantilla)
    const { caracter: _c, presentacion: _p, ...base } = contenido
    void _c; void _p
    const plantilla = aVariables(base as typeof contenido, datosExp ?? {})
    try {
      await guardar.mutateAsync({ nombre: nombre.trim(), tipo: tipoP.trim() || nombre.trim(), contenido: plantilla, compartido })
      toast.success('Plantilla guardada', compartido ? 'Disponible para todo el estudio.' : 'Solo para vos.')
      onClose()
    } catch (err) { toast.error('No se pudo guardar', err instanceof Error ? err.message : '') }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full overflow-hidden rounded-t-xl border border-white/10 bg-[#10161d] shadow-2xl sm:max-w-md sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">Guardar como plantilla</h2>
          <p className="mt-0.5 text-xs text-zinc-400">La carátula, el número y el encabezado se reemplazan por los del expediente cada vez que se use.</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={cn(campo, 'h-9 text-sm')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-300">Tipo</label>
            <input value={tipoP} onChange={(e) => setTipoP(e.target.value)} className={cn(campo, 'h-9 text-sm')} />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-300">
            <input type="checkbox" checked={compartido} onChange={(e) => setCompartido(e.target.checked)} className="accent-cyan-500" />
            Disponible para todo el estudio
          </label>
          <p className="text-[11.5px] text-zinc-500">Revisá que el texto no tenga datos propios del caso (nombres, fechas, importes). Si los tiene, reemplazalos por [DATO] antes de guardar.</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancelar</button>
          <button onClick={handleGuardar} disabled={guardar.isPending || (!!expedienteId && isLoading)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50">
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
