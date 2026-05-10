import { useState, useEffect, useLayoutEffect, useCallback, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useOnboardingStore } from '@/stores/onboarding-store'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Columns3,
  CheckSquare,
  CalendarDays,
  Bell,
  Sparkles,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
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
  /** Si está definido, navega a esta ruta antes de mostrar el paso. */
  ruta?: string
  /** Selector del elemento a resaltar (data-tour="..."). null = modal centrado. */
  target?: string | null
  /** Ubicación preferida del tooltip respecto al target. */
  placement?: 'right' | 'left' | 'bottom' | 'top'
}

const STEPS: TourStep[] = [
  {
    icon: Sparkles,
    titulo: 'Bienvenido a Marco Rossi Estudio Jurídico',
    subtitulo: 'Un recorrido de un minuto para conocer el sistema',
    descripcion:
      'Te vamos a mostrar las secciones principales del CRM con ejemplos reales. Al avanzar, el sistema te va a llevar a cada pantalla y destacar la sección correspondiente.',
    tips: [
      'Usá los botones "Atrás" y "Siguiente" o las flechas ← → del teclado.',
      'Podés saltar el tour en cualquier momento; siempre se relanza desde el ícono de ayuda.',
    ],
    target: null,
  },
  {
    icon: LayoutDashboard,
    titulo: 'Dashboard',
    subtitulo: 'Tu panel de control del día',
    descripcion:
      'Lo primero que ves al entrar. Resume lo que pasa en el estudio y lo que necesita tu atención hoy.',
    tips: [
      'KPIs clave: expedientes activos, tareas pendientes, turnos de la semana.',
      'Panel con tus tareas pendientes y próximas audiencias (48 hs).',
      'Pipeline visual con todos los expedientes distribuidos por estado.',
    ],
    ruta: '/dashboard',
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
  },
  {
    icon: Users,
    titulo: 'Clientes',
    subtitulo: 'La ficha personal de cada persona que atendés',
    descripcion:
      'Guarda los datos personales de cada cliente y todos los expedientes abiertos a su nombre.',
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
    subtitulo: 'El corazón del sistema: control total del expediente',
    descripcion:
      'Cada expediente reúne toda la información de un caso: estado judicial/administrativo, responsables, audiencias, seguimientos, documentación y tareas. Se puede vincular con SAE para sincronización automática.',
    tips: [
      'Estados: Nueva consulta → Iniciado → Prueba → Sentencia → Finalizado.',
      'Vinculación con SAE: número de SAE, estado sincronizado automáticamente.',
      'Alertas automáticas de vencimientos de plazos y audiencias próximas.',
      'Asigná abogados y colaboradores con distintos roles.',
    ],
    ruta: '/expedientes',
    target: '[data-tour="nav-expedientes"]',
    placement: 'right',
  },
  {
    icon: Columns3,
    titulo: 'Tablero',
    subtitulo: 'Vista Kanban con drag & drop',
    descripcion:
      'Todos los expedientes distribuidos en 5 columnas según su etapa. Arrastrás una tarjeta a otra columna para cambiarle el estado.',
    tips: [
      'Columnas: Nueva consulta, Para iniciar, Iniciados, En instancia judicial, Finalizados.',
      'Filtrá por tipo de trámite, prioridad o responsable.',
      'Toggle "Mis expedientes" para ver solo los tuyos.',
    ],
    ruta: '/kanban',
    target: '[data-tour="nav-kanban"]',
    placement: 'right',
  },
  {
    icon: CheckSquare,
    titulo: 'Tareas',
    subtitulo: 'Lo que tenés que hacer hoy y esta semana',
    descripcion:
      'Lista de tareas asignadas a cada persona del estudio, con vencimientos y prioridades. Se pueden vincular a un expediente.',
    tips: [
      'Filtros rápidos: Hoy, Esta semana, Vencidas, Todas.',
      'Completá con un click en el checkbox.',
      'Las vencidas aparecen destacadas en rojo.',
    ],
    ruta: '/tareas',
    target: '[data-tour="nav-tareas"]',
    placement: 'right',
  },
  {
    icon: CalendarDays,
    titulo: 'Audiencias / Agenda',
    subtitulo: 'Audiencias y seguimientos semanales',
    descripcion:
      'Las audiencias programadas: fecha, hora, organismo, tipo de audiencia y estado.',
    tips: [
      'Cargá la audiencia ni bien la confirmen — se genera alerta 48 hs antes.',
      'Al terminar, marcala como realizada y dejá el resultado.',
      'Desde el expediente podés crear seguimientos semanales.',
    ],
    ruta: '/agenda',
    target: '[data-tour="nav-agenda"]',
    placement: 'right',
  },
  {
    icon: Bell,
    titulo: 'Alertas',
    subtitulo: 'Lo que el sistema te avisa automáticamente',
    descripcion:
      'Alertas generadas por el sistema cuando algo necesita tu atención: tareas vencidas, turnos próximos, expedientes sin responsable o sin movimiento por más de 30 días.',
    tips: [
      'La campana del header muestra las alertas activas.',
      'Cada alerta tiene link al expediente relacionado.',
      'Podés marcarlas como resueltas o posponerlas.',
      'Se generan solas: vencimientos de plazos, audiencias en 48 hs, sin movimiento 30 días.',
    ],
    ruta: '/alertas',
    target: '[data-tour="nav-alertas"]',
    placement: 'right',
  },
  {
    icon: HelpCircle,
    titulo: 'Listo',
    subtitulo: 'Cuando quieras volver a ver esto',
    descripcion:
      'Podés relanzar el tour en cualquier momento haciendo click en el ícono de pregunta arriba a la derecha.',
    tips: [
      'El ícono está junto al selector de tema (sol / luna).',
      'El estado del tour se guarda por dispositivo, no vuelve a aparecer solo.',
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

const TOOLTIP_W = 380
const TOOLTIP_MIN_H = 220
const GAP = 16

function computeTooltipPosition(
  rect: Rect | null,
  placement: TourStep['placement'],
): { top: number; left: number; transform?: string } {
  const winW = window.innerWidth
  const winH = window.innerHeight

  // Sin target → centrado
  if (!rect) {
    return {
      top: winH / 2,
      left: winW / 2,
      transform: 'translate(-50%, -50%)',
    }
  }

  const preferred = placement ?? 'right'

  // Calculate candidate positions
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

  // Prefer the requested placement if it fits, else first that fits, else bottom clamp
  const chosen = candidates.find((c) => c.pos === preferred && c.fits)
    ?? candidates.find((c) => c.fits)
    ?? candidates[2] // bottom fallback

  // Clamp to viewport
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
  const markCompleted = useOnboardingStore((s) => s.markCompleted)

  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)

  const step = STEPS[index]
  const isFirst = index === 0
  const isLast = index === STEPS.length - 1

  // Reset to first step on open
  useEffect(() => {
    if (isOpen) {
      setIndex(0)
      setReady(false)
    }
  }, [isOpen])

  // Navigate to step's route when it changes
  useEffect(() => {
    if (!isOpen) return
    if (step.ruta) navigate(step.ruta)
  }, [isOpen, index, step.ruta, navigate])

  // Poll for target element and measure rect
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
    // Scroll into view if needed
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const fresh = el.getBoundingClientRect()
    setRect({
      top: fresh.top,
      left: fresh.left,
      width: fresh.width,
      height: fresh.height,
    })
    setReady(true)
  }, [isOpen, step.target])

  useLayoutEffect(() => {
    setReady(false)
    // Delay to allow route-change to render target + layout to settle
    const t1 = setTimeout(measure, 80)
    const t2 = setTimeout(measure, 350)
    const t3 = setTimeout(measure, 700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [index, isOpen, measure])

  // Reposition on resize / scroll
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

  // Keyboard nav
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, index])

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

  // Spotlight box with padding around target
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
      {/* Darken full screen via SVG mask when spotlight exists; otherwise flat overlay. */}
      {spotlight ? (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-auto"
          style={{ transition: 'all 0.25s ease' }}
          onClick={close}
        >
          <defs>
            <mask id="onboarding-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="10"
                ry="10"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.65)"
            mask="url(#onboarding-mask)"
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* Spotlight border (glow effect around target) */}
      {spotlight && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] border-2 border-amber-500/80 shadow-[0_0_0_2px_rgba(245,158,11,0.25),0_0_24px_4px_rgba(245,158,11,0.35)]"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            transition: 'all 0.25s ease',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-10 w-[380px] max-w-[calc(100vw-16px)] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl animate-fade-in"
        style={{
          top: pos.top,
          left: pos.left,
          transform: pos.transform,
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
              <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {step.subtitulo}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar tour"
            className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
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
        <div className="px-5 pb-2">
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
        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/5 px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={finish}
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
    </div>,
    document.body,
  )
}
