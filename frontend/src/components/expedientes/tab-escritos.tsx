import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from './detail-helpers'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PenLine, Plus, Loader2, FileText, Trash2, FileSearch, AlertCircle, Pencil } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useEscritos, useDeleteEscrito, type Escrito } from '@/hooks/use-escritos'
import { useSaeMovements } from '@/hooks/use-sae'
import { useEscritoIntent } from '@/stores/escrito-intent-store'
import { DiagnosticoModal } from './diagnostico-modal'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

interface Props {
  expedienteId: string
}

// Mismas reglas que tab-actuaciones-claves para contar las actuaciones claves
const KEY_TYPES = new Set(['sentencia','audiencia','intimacion','embargo','traslado','decreto','cedula'])

const ESTADO_LABELS: Record<Escrito['estado'], string> = {
  borrador: 'Borrador', final: 'Final', firmado: 'Firmado', presentado_sae: 'Presentado (SAE)', presentado: 'Presentado',
}

// La lista vive en el expediente; el escrito se abre y se crea en el editor único de /escritos.

export function TabEscritos({ expedienteId }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const p = profile as (typeof profile & { matricula?: string | null; domicilio_legal?: string | null; cuit?: string | null }) | null
  const profileIncompleto = !p?.matricula || !p?.domicilio_legal || !p?.cuit

  const { data: escritos = [], isLoading } = useEscritos(expedienteId)
  const { data: movements = [] } = useSaeMovements(expedienteId)
  const deleteMut = useDeleteEscrito()

  const abrir = (id: string) => navigate(`/escritos/${id}`)
  const nuevo = (respondeA?: string | null) => {
    const q = new URLSearchParams({ nuevo: '1', expediente: expedienteId })
    if (respondeA) q.set('responde', respondeA)
    navigate(`/escritos?${q.toString()}`)
  }
  const [confirmDelete, setConfirmDelete] = useState<Escrito | null>(null)
  const [diagnosticando, setDiagnosticando] = useState<Escrito | null>(null)

  // "Redactar respuesta" desde una actuación: abre el generador apuntado a esa providencia.
  const respondeAPending = useEscritoIntent((s) => s.respondeA)
  const consumirRespondeA = useEscritoIntent((s) => s.consumirRespondeA)
  useEffect(() => {
    if (respondeAPending) nuevo(consumirRespondeA())
  }, [respondeAPending, consumirRespondeA]) // eslint-disable-line react-hooks/exhaustive-deps

  const clavesCount = useMemo(() => {
    return movements.filter(m => {
      if (m.is_key === true) return true
      if (m.is_key === false) return false
      return KEY_TYPES.has(m.tipo_movimiento) || Boolean(m.ai_suggested_action)
    }).length
  }, [movements])

  if (profileIncompleto) {
    return (
      <Card title="Escritos">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-200">Completá tus datos profesionales</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Para generar escritos necesitamos tu matrícula, domicilio legal y CUIT. Se cargan una sola vez y se usan en el encabezado de cada escrito.
            </p>
            <Link
              to="/configuracion"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Ir a Configuración
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        title="Escritos"
        headerRight={
          <button
            onClick={() => nuevo()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            Nuevo escrito
          </button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400" />
          </div>
        ) : escritos.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="Todavía no hay escritos"
            description={`Generá el primero. Usaremos el contexto del expediente y ${clavesCount} actuaciones claves. Sale con el formato de presentación del estudio.`}
            actionLabel="Nuevo escrito"
            onAction={() => nuevo()}
          />
        ) : (
          <div className="space-y-2">
            {escritos.map(esc => (
              <div
                key={esc.id}
                className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <FileText className="h-4 w-4 text-violet-400 shrink-0" />
                <button
                  onClick={() => abrir(esc.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{esc.titulo}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {esc.tipo}
                    {esc.registro_tonal && <span className="ml-2 text-zinc-600 dark:text-zinc-300">· {esc.registro_tonal === 'retorico' ? 'retórico' : 'procesal'}</span>}
                    <span className="ml-2 text-zinc-600 dark:text-zinc-300">· {new Date(esc.created_at).toLocaleDateString('es-AR')}</span>
                  </p>
                </button>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  esc.estado === 'borrador' ? 'bg-zinc-700/30 text-zinc-400' :
                  esc.estado === 'final' ? 'bg-emerald-700/30 text-emerald-400' :
                  'bg-violet-700/30 text-violet-400',
                )}>
                  {ESTADO_LABELS[esc.estado] ?? esc.estado}
                </span>
                <button
                  onClick={() => setDiagnosticando(esc)}
                  className="shrink-0 inline-flex items-center gap-1 rounded p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  title="Diagnosticar con skill jurídico argentino"
                >
                  <FileSearch className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setConfirmDelete(esc)}
                  className="shrink-0 rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-rose-400 hover:bg-white/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-600 dark:text-zinc-300">
          Cada escrito se genera usando solo las actuaciones marcadas como claves (nunca todo el historial).
        </p>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          deleteMut.mutate(
            { id: confirmDelete.id, expediente_id: confirmDelete.expediente_id },
            {
              onSuccess: () => {
                toast.success('Escrito eliminado')
                setConfirmDelete(null)
              },
              onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo eliminar'),
            }
          )
        }}
        title="Eliminar escrito"
        description={`¿Eliminar "${confirmDelete?.titulo}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMut.isPending}
      />

      {diagnosticando && (
        <DiagnosticoModal
          input={{
            escrito_id: diagnosticando.id,
            titulo: diagnosticando.titulo,
            tipo: diagnosticando.tipo,
          }}
          onClose={() => setDiagnosticando(null)}
        />
      )}
    </>
  )
}
