import { useState, useEffect, useLayoutEffect, useCallback, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useOnboardingStore } from '@/stores/onboarding-store'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  CheckSquare,
  CalendarDays,
  Bell,
  Sparkles,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  ClipboardList,
  Briefcase,
  Bot,
  BookMarked,
  BarChart3,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface TourStep {
  icon: ComponentType<{ className?: string }>
  titulo: string
  subtitulo: string
  descripcion: string
  tips: string[]
  ruta?: string
  target?: string | null
  placement?: 'right' | 'left' | 'bottom' | 'top'
}

const STEPS: TourStep[] = [
  {
    icon: Sparkles,
    titulo: 'Bienvenido al sistema del estudio',
    subtitulo: 'Un recorrido de dos minutos para conocer cada sección',
    descripcion:
      'Te vamos a mostrar las secciones principales con una descripción de para qué sirve cada una. Podés avanzar con los botones o con las flechas ← → del teclado.',
    tips: [
      'Podés cerrar el tour en cualquier momento con la X o la tecla Escape.',
      'El ícono ? de la cabecera lo reabre cuando quieras, sin límite de veces.',
    ],
    target: null,
  },
  {
    icon: Briefcase,
    titulo: 'Mi trabajo',
    subtitulo: 'Tu vista personal del día',
    descripcion:
      'La primera pantalla que verás cada vez que entrés. Resume tus tareas pendientes, consultas asignadas y expedientes en los que participás — todo en un solo lugar.',
    tips: [
      'Tareas ordenadas por vencimiento: las más urgentes primero.',
      'Expedientes con tu rol: abogado, colaborador, etc.',
      'Desde acá podés marcar tareas como completadas directamente.',
    ],
    ruta: '/mi-trabajo',
    target: '[data-tour="nav-mi-trabajo"]',
    placement: 'right',
  },
  {
    icon: LayoutDashboard,
    titulo: 'Dashboard',
    subtitulo: 'El pulso del estudio en números',
    descripcion:
      'Vista global del estudio para directores y socios: expedientes activos, tareas pendientes, ingresos del mes y pipeline visual de todos los casos por estado.',
    tips: [
      'KPIs clave: expedientes activos, tareas vencidas, turnos de la semana.',
      'Pipeline con todos los expedientes distribuidos por etapa.',
      'Gráficos de evolución mensual y distribución por fuero.',
    ],
    ruta: '/dashboard',
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
  },
  {
    icon: ClipboardList,
    titulo: 'Consultas',
    subtitulo: 'Primera atención al cliente',
    descripcion:
      'Registrá cada consulta nueva antes de convertirla en expediente. Incluye el motivo, el cliente, honorarios presupuestados y el diagnóstico de la IA.',
    tips: [
      'La IA analiza el caso y sugiere estrategia y legislación aplicable.',
      'Podés cargar documentos del cliente para que la IA los interprete.',
      'Cuando el cliente acepta, se convierte en expediente con un click.',
      'También podés asignar tareas directamente a una consulta.',
    ],
    ruta: '/consultas',
    target: '[data-tour="nav-consultas"]',
    placement: 'right',
  },
  {
    icon: Users,
    titulo: 'Clientes',
    subtitulo: 'Ficha personal de cada persona que atendés',
    descripcion:
      'Guarda los datos personales de cada cliente: DNI, CUIL, teléfono, email y todos los expedientes abiertos a su nombre.',
    tips: [
      'Búsqueda tolerante a errores: apellido, DNI, CUIL o teléfono.',
      '"Nuevo Cliente" para dar de alta una persona.',
      'El detalle muestra todos sus expedientes y contactos adicionales.',
    ],
    ruta: '/clientes',
    target: '[data-tour="nav-clientes"]',
    placement: 'right',
  },
  {
    icon: FolderOpen,
    titulo: 'Expedientes',
    subtitulo: 'Control total de cada caso judicial',
    descripcion:
      'Cada expediente reúne toda la información del caso: estado, responsables, audiencias, seguimientos, documentación, tareas y sincronización automática con SAE.',
    tips: [
      'Vinculación con SAE: las actuaciones electrónicas llegan automáticamente.',
      'La IA analiza las actuaciones y sugiere acciones a tomar.',
      'Alertas automáticas de vencimientos de plazos y audiencias próximas.',
      'Asigná abogados y colaboradores con distintos roles por expediente.',
      'Desde una actuación SAE podés crear una tarea vinculada a ella.',
    ],
    ruta: '/expedientes',
    target: '[data-tour="nav-expedientes"]',
    placement: 'right',
  },
  {
    icon: CheckSquare,
    titulo: 'Tareas',
    subtitulo: 'Lo que tenés que hacer hoy y esta semana',
    descripcion:
      'Lista completa de tareas del estudio: pendientes, en progreso y vencidas. Cada tarea puede estar vinculada a un expediente, una consulta o una actuación SAE específica.',
    tips: [
      'Filtros rápidos: Hoy, Esta semana, Vencidas, Todas.',
      'Las vencidas aparecen destacadas en rojo.',
      'Al crear una tarea desde una actuación SAE, queda el link directo a esa actuación.',
      'Notificaciones automáticas al asignado cuando se crea o se completa.',
    ],
    ruta: '/tareas',
    target: '[data-tour="nav-tareas"]',
    placement: 'right',
  },
  {
    icon: CalendarDays,
    titulo: 'Agenda',
    subtitulo: 'Audiencias y turnos programados',
    descripcion:
      'Las audiencias programadas: fecha, hora, organismo, tipo y estado. Se genera una alerta automática 48 horas antes de cada audiencia.',
    tips: [
      'Cargá la audiencia ni bien la confirmen para activar el recordatorio.',
      'Al terminar, marcala como realizada y dejá el resultado.',
      'Las audiencias SAE se sincronizan automáticamente desde el expediente.',
    ],
    ruta: '/agenda',
    target: '[data-tour="nav-agenda"]',
    placement: 'right',
  },
  {
    icon: Bell,
    titulo: 'Notificaciones',
    subtitulo: 'Lo que el sistema te avisa automáticamente',
    descripcion:
      'Alertas generadas cuando algo necesita atención: tareas asignadas o vencidas, audiencias en 48 hs, menciones en comentarios y actuaciones nuevas en SAE.',
    tips: [
      'La campana de la cabecera muestra el contador de alertas activas.',
      'Hacé click en una alerta para ir directamente al expediente relacionado.',
      'Podés posponerlas (snooze) si no las podés resolver en el momento.',
      'Las alertas de tareas llegan también como notificación push al teléfono.',
    ],
    ruta: '/notificaciones',
    target: '[data-tour="nav-notificaciones"]',
    placement: 'right',
  },
  {
    icon: Bot,
    titulo: 'BogaBot — Asistente de IA',
    subtitulo: 'Tu asistente jurídico disponible todo el tiempo',
    descripcion:
      'Un chat de inteligencia artificial entrenado para el contexto del estudio. Consultá estrategias procesales, redacción de escritos, plazos judiciales o cualquier duda jurídica.',
    tips: [
      'Abrilo con el botón azul flotante ✦ en la esquina inferior derecha.',
      'Podés pedirle que redacte un escrito, analice un fallo o calcule un plazo.',
      'Tiene acceso a normativa y jurisprudencia cargada en el sistema.',
      'Cada sesión es independiente — no guarda conversaciones anteriores.',
    ],
    target: '[data-tour="bogabot-trigger"]',
    placement: 'top',
  },
  {
    icon: BookMarked,
    titulo: 'Inteligencia jurídica',
    subtitulo: 'Normativa, jurisprudencia y aprendizajes',
    descripcion:
      'El repositorio de conocimiento del estudio: normativa vigente con búsqueda semántica, fallos judiciales relevantes y los aprendizajes que el equipo fue acumulando.',
    tips: [
      'Normativa: leyes y decretos con búsqueda por palabras clave o pregunta.',
      'Jurisprudencia: fallos relevantes para los fueros que trabaja el estudio.',
      'Aprendizajes: estrategias y decisiones que demostraron ser efectivas.',
    ],
    ruta: '/normativa',
    target: '[data-tour="nav-normativa"]',
    placement: 'right',
  },
  {
    icon: BarChart3,
    titulo: 'Informes',
    subtitulo: 'Datos del estudio para tomar decisiones',
    descripcion:
      'Reportes sobre la actividad del estudio: expedientes por estado y fuero, carga de trabajo por abogado, tiempos de resolución y evolución mensual.',
    tips: [
      'Filtrá por período, fuero o responsable.',
      'Los gráficos se actualizan en tiempo real con los datos cargados.',
    ],
    ruta: '/informes',
    target: '[data-tour="nav-informes"]',
    placement: 'right',
  },
  {
    icon: HelpCircle,
    titulo: '¡Listo! Ya conocés el sistema',
    subtitulo: 'Podés volver a ver esto cuando quieras',
    descripcion:
      'Hacé click en el ícono ? que está junto a la campana de notificaciones en la parte superior derecha para relanzar este tour en cualquier momento.',
    tips: [
      'El tour se puede ver cuantas veces quieras — siempre está disponible.',
      'Si tenés alguna duda, consultale directamente al BogaBot.',
    ],
    target: '[data-tour="help-button"]',
    placement: 'bottom',
  },
]

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const TOOLTIP_W = 400
const TOOLTIP_MIN_H = 240
const GAP = 16

function computeTooltipPosition(
  rect: Rect | null,
  placement: TourStep['placement'],
): { top: number; left: number; transform?: string } {
  const winW = window.innerWidth
  const winH = window.innerHeight

  if (!rect) {
    return { top: winH / 2, left: winW / 2, transform: 'translate(-50%, -50%)' }
  }

  const preferred = placement ?? 'right'

  const candidates: Array<{ pos: NonNullable<TourStep['placement']>; top: number; left: number; fits: boolean }> = [
    {
      pos: 'right',
      top: rect.top + rect.height / 2 - TOOLTIP_MIN_H / 2,
      left: rect.left + rect.width + GAP,
      fits: rect.left + rect.width + GAP + TOOLTIP_W <= winW - 8,
    },
    {
      pos: 'left',
      top: rect.top + rect.height / 2 - TOOLTIP_MIN_H / 2,
      left: rect.left - TOOLTIP_W - GAP,
      fits: rect.left - TOOLTIP_W - GAP >= 8,
    },
    {
      pos: 'bottom',
      top: rect.top + rect.height + GAP,
      left: Math.max(8, Math.min(rect.left, winW - TOOLTIP_W - 8)),
      fits: rect.top + rect.height + GAP + TOOLTIP_MIN_H <= winH - 8,
    },
    {
      pos: 'top',
      top: rect.top - TOOLTIP_MIN_H - GAP,
      left: Math.max(8, Math.min(rect.left, winW - TOOLTIP_W - 8)),
      fits: rect.top - TOOLTIP_MIN_H - GAP >= 8,
    },
  ]

  const chosen = candidates.find((c) => c.pos === preferred && c.fits)
    ?? candidates.find((c) => c.fits)
    ?? candidates[2]

  const top = Math.max(8, Math.min(chosen.top, winH - TOOLTIP_MIN_H - 8))
  const left = Math.max(8, Math.min(chosen.left, winW - TOOLTIP_W - 8))

  return { top, left }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OnboardingTour() {
  const navigate = useNavigate()
  const isOpen = useOnboardingStore((s) => s.isOpen)
  const close = useOnboardingStore((s) => s.close)
  const justClose = useOnboardingStore((s) => s.justClose)
  const markCompleted = useOnboardingStore((s) => s.markCompleted)

  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)
  const [neverShowAgain, setNeverShowAgain] = useState(true)

  const step = STEPS[index]
  const isFirst = index === 0
  const isLast = index === STEPS.length - 1

  useEffect(() => {
    if (isOpen) {
      setIndex(0)
      setReady(false)
      setNeverShowAgain(true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (step.ruta) navigate(step.ruta)
  }, [isOpen, index, step.ruta, navigate])

  const measure = useCallback(() => {
    if (!isOpen) return
    if (!step.target) {
      setRect(null)
      setReady(true)
      return
    }
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) {
      setReady(false)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const fresh = el.getBoundingClientRect()
    setRect({ top: fresh.top, left: fresh.left, width: fresh.width, height: fresh.height })
    setReady(true)
  }, [isOpen, step.target])

  useLayoutEffect(() => {
    setReady(false)
    const t1 = setTimeout(measure, 80)
    const t2 = setTimeout(measure, 350)
    const t3 = setTimeout(measure, 700)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [index, isOpen, measure])

  useEffect(() => {
    if (!isOpen) return
    const onChange = () => measure()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [isOpen, measure])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, index, neverShowAgain])

  const handleClose = () => {
    if (neverShowAgain) {
      close()
    } else {
      justClose()
    }
  }

  const goNext = () => {
    if (isLast) return finish()
    setIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }

  const goPrev = () => {
    setIndex((i) => Math.max(i - 1, 0))
  }

  const finish = () => {
    markCompleted()
    navigate('/dashboard')
  }

  if (!isOpen) return null

  const Icon = step.icon
  const pos = computeTooltipPosition(rect, step.placement)

  const SP_PAD = 6
  const spotlight = rect && ready
    ? {
        top: rect.top - SP_PAD,
        left: rect.left - SP_PAD,
        width: rect.width + SP_PAD * 2,
        height: rect.height + SP_PAD * 2,
      }
    : null

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Backdrop */}
      {spotlight ? (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-auto"
          style={{ transition: 'all 0.25s ease' }}
          onClick={handleClose}
        >
          <defs>
            <mask id="onboarding-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={spotlight.left} y={spotlight.top}
                width={spotlight.width} height={spotlight.height}
                rx="10" ry="10" fill="black"
              />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#onboarding-mask)" />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
      )}

      {/* Spotlight glow */}
      {spotlight && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] border-2 border-amber-500/80 shadow-[0_0_0_2px_rgba(245,158,11,0.25),0_0_24px_4px_rgba(245,158,11,0.35)]"
          style={{
            top: spotlight.top, left: spotlight.left,
            width: spotlight.width, height: spotlight.height,
            transition: 'all 0.25s ease',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-10 w-[400px] max-w-[calc(100vw-16px)] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl animate-fade-in"
        style={{
          top: pos.top, left: pos.left, transform: pos.transform,
          transition: 'top 0.25s ease, left 0.25s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 dark:border-white/5 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="onboarding-title" className="truncate text-base font-bold text-zinc-900 dark:text-zinc-50">
                {step.titulo}
              </h2>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {step.subtitulo}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar tour"
            className="shrink-0 rounded-lg p-1 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {step.descripcion}
          </p>

          {step.tips.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {step.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Progress dots */}
        <div className="px-5 pb-1">
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir al paso ${i + 1}`}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i === index
                    ? 'bg-amber-500'
                    : i < index
                      ? 'bg-amber-500/50'
                      : 'bg-zinc-200 dark:bg-white/10 hover:bg-zinc-300 dark:hover:bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 dark:border-white/5 px-5 pt-3 pb-4 space-y-3">
          {/* No volver a mostrar checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div
              onClick={() => setNeverShowAgain((v) => !v)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                neverShowAgain
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-zinc-300 dark:border-zinc-600 group-hover:border-amber-400'
              }`}
            >
              {neverShowAgain && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              No volver a mostrar automáticamente
              <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                (podés reabrirlo cuando quieras con el ícono ?)
              </span>
            </span>
          </label>

          {/* Nav buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Saltar
              </button>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {index + 1} / {STEPS.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirst}
                aria-label="Paso anterior"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={finish}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
                >
                  <Check className="h-4 w-4" />
                  Terminar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 transition-colors"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
