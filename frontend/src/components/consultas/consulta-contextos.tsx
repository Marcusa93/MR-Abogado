import { useState } from 'react'
import { Mic, FileText, StickyNote, Trash2, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { ConsultaGrabadora } from './consulta-grabadora'
import {
  useConsultaContextos, useAddConsultaContexto, useDeleteConsultaContexto,
  type TipoContexto,
} from '@/hooks/use-consulta-contextos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const TIPO_ICON: Record<TipoContexto, React.ReactNode> = {
  grabacion: <Mic className="h-3.5 w-3.5" />,
  documento: <FileText className="h-3.5 w-3.5" />,
  apunte: <StickyNote className="h-3.5 w-3.5" />,
}

const TIPO_LABEL: Record<TipoContexto, string> = {
  grabacion: 'Grabación',
  documento: 'Documento',
  apunte: 'Apunte',
}

const TIPO_COLOR: Record<TipoContexto, string> = {
  grabacion: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  documento: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  apunte: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
}

interface Props {
  consultaId: string
}

export function ConsultaContextos({ consultaId }: Props) {
  const { data: contextos = [], isLoading } = useConsultaContextos(consultaId)
  const add = useAddConsultaContexto()
  const del = useDeleteConsultaContexto()

  const [mostrarGrabadora, setMostrarGrabadora] = useState(false)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [tipo, setTipo] = useState<TipoContexto>('documento')
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')

  async function handleAgregar() {
    if (!titulo.trim() || !contenido.trim()) return
    try {
      await add.mutateAsync({ consulta_id: consultaId, tipo, titulo: titulo.trim(), contenido: contenido.trim() })
      setTitulo('')
      setContenido('')
      setMostrarFormulario(false)
      toast.success('Contexto agregado')
    } catch {
      toast.error('No se pudo guardar el contexto')
    }
  }

  async function handleTranscript(texto: string) {
    const tituloGrab = `Grabación ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
    try {
      await add.mutateAsync({ consulta_id: consultaId, tipo: 'grabacion', titulo: tituloGrab, contenido: texto })
      setMostrarGrabadora(false)
      toast.success('Grabación guardada como contexto')
    } catch {
      toast.error('No se pudo guardar la grabación')
    }
  }

  async function handleEliminar(id: string) {
    try {
      await del.mutateAsync({ id, consulta_id: consultaId })
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-3">
      {/* Lista de contextos existentes */}
      {isLoading ? (
        <div className="h-6 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
      ) : contextos.length > 0 ? (
        <div className="space-y-2">
          {contextos.map(c => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/60 p-3 flex gap-3"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', TIPO_COLOR[c.tipo as TipoContexto])}>
                    {TIPO_ICON[c.tipo as TipoContexto]}
                    {TIPO_LABEL[c.tipo as TipoContexto]}
                  </span>
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{c.titulo}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{c.contenido}</p>
              </div>
              <button
                type="button"
                onClick={() => handleEliminar(c.id)}
                disabled={del.isPending}
                className="shrink-0 p-1 text-zinc-400 hover:text-red-500 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 italic">
          Sin contexto adicional. Podés grabar la conversación o pegar texto de documentos.
        </p>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setMostrarGrabadora(v => !v); setMostrarFormulario(false) }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
            mostrarGrabadora
              ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400'
              : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          Grabar conversación
          {mostrarGrabadora ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => { setMostrarFormulario(v => !v); setMostrarGrabadora(false) }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
            mostrarFormulario
              ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
              : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
          )}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Agregar documento / apunte
          {mostrarFormulario ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Grabadora inline */}
      {mostrarGrabadora && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 p-4">
          <ConsultaGrabadora onTranscript={handleTranscript} />
        </div>
      )}

      {/* Formulario de texto */}
      {mostrarFormulario && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">Tipo</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as TipoContexto)}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="documento">Documento</option>
                <option value="apunte">Apunte</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ej: Telegrama de despido"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">Contenido (pegá el texto)</label>
            <textarea
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              placeholder="Pegá el texto del documento o apunte…"
              rows={5}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>
          <button
            type="button"
            onClick={handleAgregar}
            disabled={!titulo.trim() || !contenido.trim() || add.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Guardar contexto
          </button>
        </div>
      )}
    </div>
  )
}
