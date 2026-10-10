import { Star } from 'lucide-react'
import { useFavoritos, useToggleFavorito } from '@/hooks/use-favoritos'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

/**
 * Estrella de favorito. Es un <span role="button"> y no un <button> porque se
 * usa dentro de filas y tarjetas que ya son clickeables (un botón no puede ir
 * dentro de otro).
 */
export function FavoritoStar({ expedienteId, size = 'sm', className }: {
  expedienteId: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const { data: favoritos } = useFavoritos()
  const toggle = useToggleFavorito()
  const activo = favoritos?.has(expedienteId) ?? false

  const cambiar = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    toggle.mutate(
      { expedienteId, favorito: !activo },
      { onError: () => toast.error('No se pudo actualizar el favorito') },
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={activo}
      aria-label={activo ? 'Quitar de favoritos' : 'Marcar como favorito'}
      title={activo ? 'Quitar de favoritos' : 'Marcar como favorito'}
      onClick={cambiar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') cambiar(e) }}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
        size === 'md' ? 'h-8 w-8' : 'h-7 w-7',
        activo
          ? 'text-amber-400 hover:text-amber-500'
          : 'text-zinc-300 hover:text-amber-400 dark:text-zinc-600 dark:hover:text-amber-400',
        className,
      )}
    >
      <Star className={cn(size === 'md' ? 'h-5 w-5' : 'h-4 w-4', activo && 'fill-current')} />
    </span>
  )
}
