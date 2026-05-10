import { useEffect, useState } from 'react'
import { Download, X, Smartphone, MoreVertical } from 'lucide-react'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { usePwaInstallStore } from '@/stores/pwa-install-store'
import { useOnboardingStore } from '@/stores/onboarding-store'
import { getPushCapabilities } from '@/lib/push/platform'

/**
 * Prompt de instalación PWA al primer ingreso.
 * Detecta la plataforma y muestra la vía más simple posible:
 *  - Android Chrome (con beforeinstallprompt): botón "Instalar ahora" nativo.
 *  - Android Chrome (sin evento): instructivo manual del menú ⋮.
 *  - iOS Safari: modal con pasos Compartir → Añadir a pantalla de inicio.
 *  - iOS Chrome/Firefox: warning de abrir en Safari.
 *  - Desktop con evento disponible: card opcional.
 */
export function InstallPwaPrompt() {
  const { kind, canInstallNatively, promptInstall, isStandalone } = usePwaInstall()
  const caps = getPushCapabilities()
  const dismissed = usePwaInstallStore((s) => s.dismissed)
  const dismiss = usePwaInstallStore((s) => s.dismiss)
  const tourOpen = useOnboardingStore((s) => s.isOpen)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isStandalone || dismissed || kind === 'none' || tourOpen) {
      setOpen(false)
      return
    }
    const t = setTimeout(() => setOpen(true), 400)
    return () => clearTimeout(t)
  }, [isStandalone, dismissed, kind, tourOpen])

  if (!open) return null

  const handleInstall = async () => {
    if (canInstallNatively) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') dismiss()
    }
  }

  const handleDismiss = () => {
    dismiss()
    setOpen(false)
  }

  if (kind === 'ios' && caps.isIOSNonSafari) {
    return <IOSNonSafariWarning onDismiss={handleDismiss} />
  }
  if (kind === 'ios') {
    return <IOSSafariInstructions onDismiss={handleDismiss} />
  }
  if (kind === 'android') {
    return (
      <AndroidInstallModal
        canInstall={canInstallNatively}
        onInstall={handleInstall}
        onDismiss={handleDismiss}
      />
    )
  }
  return (
    <DesktopInstallCard
      canInstall={canInstallNatively}
      onInstall={handleInstall}
      onDismiss={handleDismiss}
    />
  )
}

// ---------------------------------------------------------------------------
// Header común (para que todos los modales compartan identidad visual)
// ---------------------------------------------------------------------------
function ModalShell({
  platformLabel,
  title,
  onDismiss,
  children,
  footer,
}: {
  platformLabel: string
  title: string
  onDismiss: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-amber-500/30 shadow-2xl animate-fade-in-up overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-600 dark:hover:text-zinc-300 z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500 mb-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            {platformLabel}
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {title}
              </h3>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">{children}</div>

        {footer && (
          <div className="border-t border-zinc-200 dark:border-white/5 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function StepList({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-4">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-sm font-semibold">
        {n}
      </span>
      <div className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
        {children}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Íconos inline (para que no dependan de la UI nativa del browser)
// ---------------------------------------------------------------------------
function IOSShareIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3L12 15M12 3L8 7M12 3L16 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11H5C4.44772 11 4 11.4477 4 12V20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20V12C20 11.4477 19.5523 11 19 11H18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// iOS Safari — 4 pasos
// ---------------------------------------------------------------------------
function IOSSafariInstructions({ onDismiss }: { onDismiss: () => void }) {
  return (
    <ModalShell
      platformLabel="Detectamos que estás en iPhone o iPad"
      title="Instalá Marco Rossi Estudio Jurídico en tu pantalla de inicio"
      onDismiss={onDismiss}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-semibold text-amber-600 dark:text-amber-500 hover:underline"
          >
            Ya lo instalé · No mostrar más
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        En iPhone/iPad las notificaciones solo llegan si instalás la app desde
        Safari. Es un minuto:
      </p>
      <StepList>
        <Step n={1}>
          <p>
            Buscá el botón de <strong>Compartir</strong> de Safari — es el ícono
            de un <strong>cuadrado con una flecha hacia arriba</strong>{' '}
            <IOSShareIcon className="inline-block h-5 w-5 align-middle text-sky-500 mx-0.5" />
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Normalmente está en la barra de abajo del iPhone, o arriba a la
            derecha en iPad. Tocalo.
          </p>
        </Step>
        <Step n={2}>
          <p>
            En el menú que aparece, <strong>deslizá hacia abajo</strong> hasta
            encontrar:
          </p>
          <p className="mt-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Añadir a pantalla de inicio
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Suele estar después de "Copiar", "Imprimir" o "Marcadores".
          </p>
        </Step>
        <Step n={3}>
          <p>
            Tocá <strong>Añadir</strong> en la esquina superior derecha para
            confirmar.
          </p>
        </Step>
        <Step n={4}>
          <p>
            Cerrá Safari y abrí <strong>Marco Rossi Estudio Jurídico</strong> desde el ícono nuevo
            en la pantalla de inicio del teléfono.
          </p>
        </Step>
      </StepList>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Android — botón nativo + fallback manual
// ---------------------------------------------------------------------------
function AndroidInstallModal({
  canInstall,
  onInstall,
  onDismiss,
}: {
  canInstall: boolean
  onInstall: () => void
  onDismiss: () => void
}) {
  return (
    <ModalShell
      platformLabel="Detectamos que estás en Android"
      title="Instalá Marco Rossi Estudio Jurídico en tu dispositivo"
      onDismiss={onDismiss}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-semibold text-amber-600 dark:text-amber-500 hover:underline"
          >
            Ya lo instalé · No mostrar más
          </button>
        </div>
      }
    >
      {canInstall ? (
        <>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Chrome te lo puede instalar directamente desde acá:
          </p>
          <button
            type="button"
            onClick={onInstall}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors"
          >
            <Download className="h-4 w-4" />
            Instalar ahora
          </button>
          <div className="mt-5">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              ¿No te funcionó el botón? Hacelo desde el menú:
            </p>
            <AndroidManualSteps />
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Tu navegador todavía no te mostró el botón automático. Lo podés
            hacer en 3 pasos:
          </p>
          <AndroidManualSteps />
        </>
      )}
    </ModalShell>
  )
}

function AndroidManualSteps() {
  return (
    <StepList>
      <Step n={1}>
        <p className="flex items-center gap-1.5 flex-wrap">
          Tocá el menú de Chrome <MoreVertical className="h-4 w-4 inline" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            (los 3 puntos arriba a la derecha)
          </span>
        </p>
      </Step>
      <Step n={2}>
        <p>
          Elegí la opción:
        </p>
        <p className="mt-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Instalar aplicación
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          En algunos Chrome viejos figura como "Añadir a pantalla principal".
        </p>
      </Step>
      <Step n={3}>
        <p>
          Confirmá tocando <strong>Instalar</strong> y abrí Marco Rossi Estudio Jurídico desde el
          ícono nuevo de tu celular.
        </p>
      </Step>
    </StepList>
  )
}

// ---------------------------------------------------------------------------
// iOS pero abrió Chrome/Firefox
// ---------------------------------------------------------------------------
function IOSNonSafariWarning({ onDismiss }: { onDismiss: () => void }) {
  return (
    <ModalShell
      platformLabel="Estás en iPhone pero no en Safari"
      title="Abrí Marco Rossi Estudio Jurídico en Safari"
      onDismiss={onDismiss}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Entendido
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        En iPhone/iPad la app solo se puede instalar y recibir notificaciones
        desde <strong>Safari</strong>. Chrome, Firefox y otros browsers en iOS
        no lo permiten (restricción de Apple).
      </p>
      <StepList>
        <Step n={1}>Copiá el link de esta página.</Step>
        <Step n={2}>
          Abrí la app de <strong>Safari</strong> y pegá el link en la barra de
          direcciones.
        </Step>
        <Step n={3}>
          Ahí te va a aparecer este mismo mensaje con los pasos para instalarla.
        </Step>
      </StepList>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Desktop (Chrome con beforeinstallprompt disponible)
// ---------------------------------------------------------------------------
function DesktopInstallCard({
  canInstall,
  onInstall,
  onDismiss,
}: {
  canInstall: boolean
  onInstall: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      className="fixed z-50 left-3 right-3 bottom-3 sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-sm animate-fade-in-up"
    >
      <div className="rounded-2xl border border-amber-500/30 bg-white dark:bg-zinc-900 shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="pwa-install-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Instalá Marco Rossi Estudio Jurídico como app
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Te lo deja en una ventana propia y recibís las notificaciones sin
              tener que abrir el navegador.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onInstall}
                disabled={!canInstall}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {canInstall ? 'Instalar ahora' : 'Esperando...'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Ahora no
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
