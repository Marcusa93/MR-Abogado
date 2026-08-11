import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ArrowRight, UserCheck, FileSearch, PenLine, CheckCircle, XCircle, FolderPlus, RotateCcw } from 'lucide-react'
import { useCambiarEstadoConsulta, useCriterioProfile, ESTADO_LABEL, type ConsultaEstado } from '@/hooks/use-consultas'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'

// ─── Tipo de pasos del stepper ────────────────────────────────────────────────

interface Step {
  id: string
  label: string
  estados: ConsultaEstado[]
}

const STEPS: Step[] = [
  { id: 'ingresada', label: 'Ingresada', estados: ['pendiente', 'en_proceso', 'presupuestada'] },
  { id: 'claudio', label: 'Con Claudio', estados: ['con_claudio'] },
  { id: 'gestion', label: 'Gestión', estados: ['requiere_info', 'redactando'] },
  { id: 'cierre', label: 'Cierre', estados: ['convertida', 'resuelta', 'descartada'] },
]

const TERMINAL: ConsultaEstado[] = ['convertida', 'resuelta', 'descartada']

function getStepIdx(estado: ConsultaEstado): number {
  return STEPS.findIndex(s => s.estados.includes(estado))
}

// ─── Colores del estado actual ───────────────────────────────────────────────

const ESTADO_COLOR: Record<ConsultaEstado, string> = {
  pendiente: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40',
  en_proceso: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40',
  presupuestada: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40',
  con_claudio: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/40',
  requiere_info: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40',
  redactando: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/40',
  convertida: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40',
  resuelta: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/40',
  descartada: 'text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/40',
}

// ─── Modal de notas para transición ──────────────────────────────────────────

function ModalNotas({ titulo, placeholder, onConfirm, onCancel, loading }: {
  titulo: string
  placeholder: string
  onConfirm: (notas: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [notas, setNotas] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{titulo}</h3>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notas)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ConsultaForPipeline {
  id: string
  estado: ConsultaEstado
  estado_notas: string | null
  assigned_to: string | null
  convertida_expediente_id: string | null
  nombre: string
  apellido: string | null
}

interface Profile {
  id: string
  rol?: string | null
}

interface Props {
  consulta: ConsultaForPipeline
  profile: Profile
  onConvertir: () => void
}

export function ConsultaPipeline({ consulta, profile, onConvertir }: Props) {
  const navigate = useNavigate()
  const cambiar = useCambiarEstadoConsulta()
  const { data: criterioProfile } = useCriterioProfile()
  const [modal, setModal] = useState<null | 'requiere_info' | 'pasar_claudio_manual'>(null)

  const { estado } = consulta
  const isCriterio = profile.rol === 'CRITERIO'
  const isTerminal = TERMINAL.includes(estado)
  const stepIdx = getStepIdx(estado)
  const nombreCliente = [consulta.apellido, consulta.nombre].filter(Boolean).join(', ')

  async function transition(params: {
    nuevoEstado: ConsultaEstado
    notas?: string
    assignedTo?: string | null
    alertaDestinatarioId?: string
    alertaTitulo?: string
    alertaMensaje?: string
  }) {
    try {
      await cambiar.mutateAsync({
        consultaId: consulta.id,
        estado: params.nuevoEstado,
        estadoNotas: params.notas,
        assignedTo: params.assignedTo,
        alertaDestinatarioId: params.alertaDestinatarioId,
        alertaTitulo: params.alertaTitulo,
        alertaMensaje: params.alertaMensaje,
      })
      toast.success(`Estado: ${ESTADO_LABEL[params.nuevoEstado]}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  async function handlePasarAClaudio(notas?: string) {
    if (!criterioProfile) { toast.error('No hay usuario CRITERIO activo'); return }
    await transition({
      nuevoEstado: 'con_claudio',
      notas,
      assignedTo: criterioProfile.id,
      alertaDestinatarioId: criterioProfile.id,
      alertaTitulo: `Consulta de ${nombreCliente}`,
      alertaMensaje: `Se te asignó la consulta de ${nombreCliente} para revisión.`,
    })
    setModal(null)
  }

  async function handleRequiereInfo(notas: string) {
    await transition({
      nuevoEstado: 'requiere_info',
      notas,
      assignedTo: null,
    })
    setModal(null)
  }

  async function handleRedactando() {
    await transition({ nuevoEstado: 'redactando', assignedTo: criterioProfile?.id ?? consulta.assigned_to })
  }

  async function handleResuelta() {
    if (!window.confirm('¿Marcar la consulta como resuelta?')) return
    await transition({ nuevoEstado: 'resuelta', assignedTo: null })
  }

  async function handleDescartar() {
    if (!window.confirm('¿Descartar esta consulta?')) return
    await transition({ nuevoEstado: 'descartada', assignedTo: null })
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const active = i === stepIdx
          const done = i < stepIdx
          const terminal = isTerminal && i === STEPS.length - 1

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-colors',
                  active && !isTerminal
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : done
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : terminal
                    ? estado === 'convertida'
                      ? 'border-green-500 bg-green-500 text-white'
                      : estado === 'resuelta'
                      ? 'border-teal-500 bg-teal-500 text-white'
                      : 'border-zinc-400 bg-zinc-400 text-white'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-400',
                )}>
                  {done || (isTerminal && i === STEPS.length - 1) ? '✓' : i + 1}
                </div>
                <span className={cn(
                  'text-[10px] font-medium text-center leading-tight hidden sm:block',
                  active || done || terminal ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600',
                )}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'h-0.5 flex-1 mx-1',
                  done ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700',
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Estado actual */}
      <div className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2',
        ESTADO_COLOR[estado],
      )}>
        <div>
          <div className="text-xs font-semibold">{ESTADO_LABEL[estado]}</div>
          {consulta.estado_notas && (
            <div className="text-[11px] opacity-80 mt-0.5">{consulta.estado_notas}</div>
          )}
        </div>
        {estado === 'convertida' && consulta.convertida_expediente_id && (
          <button
            type="button"
            onClick={() => navigate(`/expedientes/${consulta.convertida_expediente_id}`)}
            className="text-xs font-medium underline opacity-80 hover:opacity-100"
          >
            Ver expediente
          </button>
        )}
      </div>

      {/* Acciones contextuales */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-2">

          {/* Desde pendiente/en_proceso/presupuestada: pasar a Claudio */}
          {(['pendiente', 'en_proceso', 'presupuestada'] as ConsultaEstado[]).includes(estado) && !isCriterio && (
            <button
              type="button"
              onClick={() => setModal('pasar_claudio_manual')}
              disabled={cambiar.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {cambiar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              Pasar a Claudio
            </button>
          )}

          {/* Desde requiere_info: volver a Claudio */}
          {estado === 'requiere_info' && !isCriterio && (
            <button
              type="button"
              onClick={() => handlePasarAClaudio('Información completada')}
              disabled={cambiar.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {cambiar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Enviar a Claudio
            </button>
          )}

          {/* Desde con_claudio siendo CRITERIO */}
          {estado === 'con_claudio' && isCriterio && (
            <>
              <button
                type="button"
                onClick={() => setModal('requiere_info')}
                disabled={cambiar.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Requiere info
              </button>
              <button
                type="button"
                onClick={handleRedactando}
                disabled={cambiar.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <PenLine className="h-3.5 w-3.5" />
                Redactar instrumento
              </button>
            </>
          )}

          {/* Crear expediente: desde con_claudio o redactando, siendo CRITERIO */}
          {(['con_claudio', 'redactando'] as ConsultaEstado[]).includes(estado) && isCriterio && (
            <button
              type="button"
              onClick={onConvertir}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Crear expediente
            </button>
          )}

          {/* Marcar resuelta */}
          {(['con_claudio', 'redactando', 'requiere_info'] as ConsultaEstado[]).includes(estado) && isCriterio && (
            <button
              type="button"
              onClick={handleResuelta}
              disabled={cambiar.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Resuelta
            </button>
          )}

          {/* Descartar (cualquier estado no terminal, solo no-secretaria) */}
          {profile.rol !== 'SECRETARIA' && (
            <button
              type="button"
              onClick={handleDescartar}
              disabled={cambiar.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Descartar
            </button>
          )}
        </div>
      )}

      {/* Modales */}
      {modal === 'requiere_info' && (
        <ModalNotas
          titulo="¿Qué información falta?"
          placeholder="Ej: Falta DNI del demandado y acuerdo laboral firmado…"
          onConfirm={handleRequiereInfo}
          onCancel={() => setModal(null)}
          loading={cambiar.isPending}
        />
      )}
      {modal === 'pasar_claudio_manual' && (
        <ModalNotas
          titulo="Pasar a Claudio"
          placeholder="Nota opcional para Claudio…"
          onConfirm={notas => handlePasarAClaudio(notas || undefined)}
          onCancel={() => setModal(null)}
          loading={cambiar.isPending}
        />
      )}
    </div>
  )
}
