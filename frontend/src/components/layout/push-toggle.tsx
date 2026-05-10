import { Smartphone, SmartphoneNfc } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push-notifications'

/**
 * Botón del header para activar/desactivar Web Push (VAPID).
 *  - Android Chrome / Safari macOS / Chrome desktop: un click y listo.
 *  - iOS Safari: solo podés suscribirte si instalaste la app como PWA.
 *    Igual mostramos el botón con hint para que el usuario sepa qué hacer.
 */
export function PushToggle() {
  const { capabilities, isSubscribed, isBusy, subscribe, unsubscribe, error } =
    usePushNotifications()

  // Ocultamos solo en browsers que NI SIQUIERA son iOS y no tienen APIs
  // (navegadores raros / in-app webviews). iOS sin APIs sí lo mostramos.
  if (!capabilities.hasAPIs && !capabilities.isIOS) return null

  const requiresInstall = capabilities.requiresInstall
  const disabled = isBusy || requiresInstall || !capabilities.hasAPIs

  const label = requiresInstall
    ? 'Para recibir avisos en iOS instalá la app: Compartir → Agregar a pantalla de inicio'
    : !capabilities.hasAPIs
      ? 'Este navegador no soporta notificaciones push'
      : isSubscribed
        ? 'Avisos activados — tocá para desactivar'
        : 'Tocá para activar los avisos en este dispositivo'

  const text = requiresInstall
    ? 'Instalá la app'
    : isSubscribed
      ? 'Avisos activos'
      : 'Activar avisos'

  const Icon = isSubscribed ? SmartphoneNfc : Smartphone

  const handleClick = () => {
    if (disabled) return
    if (isSubscribed) void unsubscribe()
    else void subscribe()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isSubscribed}
      title={error || label}
      data-tour="push-toggle"
      className={`relative inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        isSubscribed
          ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200'
      } ${disabled && !isSubscribed ? 'opacity-60' : ''}`}
    >
      <span className="relative inline-flex">
        <Icon className="h-5 w-5" />
        {/* Dot indicador de estado */}
        <span
          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--header-bg)] ${
            isSubscribed
              ? 'bg-emerald-500'
              : requiresInstall || !capabilities.hasAPIs
                ? 'bg-zinc-500'
                : 'bg-zinc-400/60'
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="hidden sm:inline">{text}</span>
    </button>
  )
}
