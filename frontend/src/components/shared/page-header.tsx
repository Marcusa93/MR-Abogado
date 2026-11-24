import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Rótulo corto en mayúsculas sobre el título, como "Estudio jurídico en Tucumán" en el sitio. */
  eyebrow?: ReactNode
  /** Botones de la página. En el celular bajan debajo del título en vez de apretarlo. */
  actions?: ReactNode
  className?: string
}

/** Encabezado común de las pantallas: mismo tamaño de título, subtítulo y lugar para las acciones. */
export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
