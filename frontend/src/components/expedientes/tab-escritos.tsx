import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { PenLine } from 'lucide-react'

export function TabEscritos() {
  return (
    <Card title="Escritos">
      <EmptyState
        icon={PenLine}
        title="Próximamente"
        description="Espacio para redactar escritos con asistencia IA basada en el contexto del expediente. Borradores, plantillas (contestación, alegato, recurso) y export a PDF."
      />
    </Card>
  )
}
