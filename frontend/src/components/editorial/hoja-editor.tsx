import { useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Bold, Heading2, Italic, Loader2, Wand2, X } from 'lucide-react'
import { DictarBoton } from '@/components/shared/dictar-boton'
import { useEditorialIA } from '@/hooks/use-editorial'
import { toast } from '@/stores/toast-store'

// Editor del artículo sobre una hoja con el formato del documento final
// (Times New Roman 12, interlineado 1,5, justificado), como los escritos.
// Dictado por voz en la posición del cursor y edición con IA del fragmento
// seleccionado: la IA propone, Marco revisa y recién ahí se reemplaza.

const CHIPS = [
  { label: 'Más claro', text: 'Hacelo más claro y directo, sin perder precisión jurídica.' },
  { label: 'Desarrollar', text: 'Desarrollá más el argumento, con el fundamento normativo.' },
  { label: 'Más breve', text: 'Acortalo a lo esencial.' },
  { label: 'Más formal', text: 'Llevalo a un registro más académico.' },
  { label: 'Citar en APA', text: 'Agregá o corregí las citas en formato APA, sin inventar datos.' },
]

const HOJA = { fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: 1.5 } as const

interface Props {
  articuloId: string
  titulo: string
  bajada: string
  cuerpo: string
  onTitulo: (v: string) => void
  onBajada: (v: string) => void
  onCuerpo: (v: string) => void
}

export function HojaEditor({ articuloId, titulo, bajada, cuerpo, onTitulo, onBajada, onCuerpo }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const sel = useRef({ start: 0, end: 0 })
  const ia = useEditorialIA()
  const [edicion, setEdicion] = useState<{ start: number; end: number; fragmento: string } | null>(null)
  const [instruccion, setInstruccion] = useState('')
  const [propuesta, setPropuesta] = useState<string | null>(null)

  // Alto automático: la hoja crece con el texto
  useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight + 4}px`
  }, [cuerpo])

  const recordarSeleccion = () => {
    const t = ref.current
    if (t) sel.current = { start: t.selectionStart, end: t.selectionEnd }
  }

  /** Reemplaza el rango [start, end) y deja el cursor al final de lo insertado. */
  const reemplazar = (start: number, end: number, texto: string) => {
    onCuerpo(cuerpo.slice(0, start) + texto + cuerpo.slice(end))
    const pos = start + texto.length
    sel.current = { start: pos, end: pos }
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos) })
  }

  const envolver = (antes: string, despues = antes) => {
    const { start, end } = sel.current
    reemplazar(start, end, `${antes}${cuerpo.slice(start, end) || 'texto'}${despues}`)
  }

  const subtitulo = () => {
    const { start } = sel.current
    const inicioLinea = cuerpo.lastIndexOf('\n', start - 1) + 1
    const linea = cuerpo.slice(inicioLinea)
    if (linea.startsWith('## ')) return reemplazar(inicioLinea, inicioLinea + 3, '')
    reemplazar(inicioLinea, inicioLinea, '## ')
  }

  const insertarDictado = (texto: string) => {
    const { start, end } = sel.current
    const antes = cuerpo.slice(0, start)
    const sep = antes && !/\s$/.test(antes) ? ' ' : ''
    reemplazar(start, end, sep + texto)
  }

  const abrirEdicionIA = () => {
    const { start, end } = sel.current
    const fragmento = cuerpo.slice(start, end)
    if (fragmento.trim().length < 10) {
      return toast.info('Seleccioná un fragmento', 'Marcá con el dedo o el mouse el pasaje que querés que la IA modifique.')
    }
    setEdicion({ start, end, fragmento }); setInstruccion(''); setPropuesta(null)
  }

  const pedirIA = () => {
    if (!edicion || !instruccion.trim()) return
    ia.mutate({ modo: 'refinar', articulo_id: articuloId, fragmento: edicion.fragmento, instruccion: instruccion.trim(), contexto: cuerpo }, {
      onSuccess: (r) => setPropuesta(String(r.texto ?? '')),
      onError: (e) => toast.error('La IA no pudo editar el fragmento', e instanceof Error ? e.message : undefined),
    })
  }

  const aplicar = () => {
    if (!edicion || propuesta === null) return
    // Si el texto cambió mientras tanto, se ubica el fragmento de nuevo
    let { start, end } = edicion
    if (cuerpo.slice(start, end) !== edicion.fragmento) {
      start = cuerpo.indexOf(edicion.fragmento)
      if (start < 0) return toast.error('El fragmento ya no está en el texto', 'Volvé a seleccionarlo.')
      end = start + edicion.fragmento.length
    }
    reemplazar(start, end, propuesta)
    setEdicion(null); setPropuesta(null)
    toast.success('Fragmento reemplazado', 'Guardá la versión para conservar el cambio.')
  }

  const boton = 'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5'

  return (
    <div className="space-y-2">
      {/* Barra de herramientas (onMouseDown evita perder la selección del texto) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200 bg-white/95 p-1 backdrop-blur dark:border-white/10 dark:bg-zinc-900/95">
        <button type="button" className={boton} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver('**')} title="Negrita"><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" className={boton} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver('*')} title="Cursiva"><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" className={boton} onMouseDown={(e) => e.preventDefault()} onClick={subtitulo} title="Subtítulo"><Heading2 className="h-3.5 w-3.5" /></button>
        <button type="button" className={boton} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver('[VERIFICAR: ', ']')} title="Marcar para verificar">
          <AlertTriangle className="h-3.5 w-3.5" /> Verificar
        </button>
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-white/10" />
        <DictarBoton onTexto={insertarDictado} />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={abrirEdicionIA}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
          title="Seleccioná un fragmento y pedile a la IA que lo modifique">
          <Wand2 className="h-3.5 w-3.5" /> IA en selección
        </button>
      </div>

      {/* Edición con IA del fragmento */}
      {edicion && (
        <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold">Fragmento:</span> “{edicion.fragmento.length > 220 ? `${edicion.fragmento.slice(0, 220)}…` : edicion.fragmento}”
            </p>
            <button type="button" onClick={() => { setEdicion(null); setPropuesta(null) }} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
          </div>
          {propuesta === null ? (
            <>
              <div className="flex flex-wrap gap-1">
                {CHIPS.map((c) => (
                  <button key={c.label} type="button" onClick={() => setInstruccion(c.text)}
                    className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-500/20 dark:text-violet-300">
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea value={instruccion} onChange={(e) => setInstruccion(e.target.value)} rows={2} autoFocus
                placeholder="¿Qué querés que haga con este fragmento?"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={pedirIA} disabled={!instruccion.trim() || ia.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                  {ia.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Proponer
                </button>
                <DictarBoton label="Dictar instrucción" onTexto={(t) => setInstruccion((p) => (p.trim() ? `${p.trim()} ${t}` : t))} />
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Propuesta de la IA — editala si hace falta</p>
              <textarea value={propuesta} onChange={(e) => setPropuesta(e.target.value)} rows={Math.min(14, Math.max(4, Math.ceil(propuesta.length / 70)))}
                className="w-full rounded-lg border border-violet-500/30 bg-white px-3 py-2 text-sm dark:bg-zinc-900 dark:text-zinc-200" style={HOJA} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={aplicar}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700">Reemplazar en el texto</button>
                <button type="button" onClick={() => setPropuesta(null)} className="text-xs text-zinc-500 hover:underline">Pedir otra cosa</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* La hoja */}
      <div className="overflow-hidden rounded-lg bg-white text-black shadow-sm ring-1 ring-zinc-200 dark:ring-white/10">
        <div className="mx-auto max-w-[21cm] px-5 py-8 sm:px-[2.5cm] sm:py-[2.5cm]" style={HOJA}>
          <textarea value={titulo} onChange={(e) => onTitulo(e.target.value)} rows={2} placeholder="Título"
            className="w-full resize-none border-0 bg-transparent p-0 text-center font-bold text-black placeholder:text-zinc-400 focus:outline-none focus:ring-0"
            style={{ ...HOJA, fontSize: '14pt' }} />
          <textarea value={bajada} onChange={(e) => onBajada(e.target.value)} rows={2} placeholder="Bajada"
            className="mb-4 w-full resize-none border-0 bg-transparent p-0 text-center italic text-black placeholder:text-zinc-400 focus:outline-none focus:ring-0"
            style={HOJA} />
          <textarea ref={ref} value={cuerpo}
            onChange={(e) => { onCuerpo(e.target.value); recordarSeleccion() }}
            onSelect={recordarSeleccion} onKeyUp={recordarSeleccion} onClick={recordarSeleccion}
            placeholder="Escribí o dictá el artículo…"
            className="min-h-[50vh] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-justify text-black placeholder:text-zinc-400 focus:outline-none focus:ring-0"
            style={HOJA} />
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">## subtítulo · **negrita** · *cursiva* · - lista · {'>'} cita · [VERIFICAR: …] para marcar algo a comprobar</p>
    </div>
  )
}
