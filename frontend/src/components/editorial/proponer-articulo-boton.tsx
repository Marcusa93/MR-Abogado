import { Loader2, Newspaper } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAccesoEditorial, useEditorialIA } from '@/hooks/use-editorial'
import { toast } from '@/stores/toast-store'

// En una actuación del expediente: manda la resolución al módulo Editorial
// como propuesta de artículo. Solo visible para quien tiene acceso editorial.

export function ProponerArticuloBoton({ movementId, tieneTexto }: { movementId: string; tieneTexto: boolean }) {
  const { data: acceso } = useAccesoEditorial()
  const ia = useEditorialIA()
  const navigate = useNavigate()
  if (!acceso) return null

  const proponer = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tieneTexto) return toast.info('Falta el texto de la actuación', 'Bajá el cuerpo desde SAE y volvé a intentar.')
    ia.mutate({ modo: 'proponer_movimiento', movement_id: movementId }, {
      onSuccess: (r) => {
        toast.success('Propuesta creada en Editorial', typeof r.advertencia === 'string' && r.advertencia ? r.advertencia : String(r.titulo ?? ''))
        navigate('/editorial')
      },
      onError: (err) => toast.error('No se pudo proponer', err instanceof Error ? err.message : undefined),
    })
  }

  return (
    <button type="button" onClick={proponer} disabled={ia.isPending}
      className="p-1 rounded text-sky-500/70 hover:text-sky-400 hover:bg-sky-500/10 transition-colors disabled:opacity-50"
      title="Proponer un artículo a partir de esta actuación (Editorial)">
      {ia.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Newspaper className="h-3.5 w-3.5" />}
    </button>
  )
}
