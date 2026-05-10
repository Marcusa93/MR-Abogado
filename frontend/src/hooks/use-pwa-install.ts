import { useCallback, useEffect, useState } from 'react'
import { getPushCapabilities } from '@/lib/push/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallPromptKind = 'android' | 'ios' | 'desktop' | 'none'

export interface UsePwaInstallReturn {
  /** ¿El usuario ya está dentro de la PWA standalone? */
  isStandalone: boolean
  /** Tipo de prompt a mostrar. "none" = no mostrar nada. */
  kind: InstallPromptKind
  /** True si capturamos el `beforeinstallprompt` (Android Chrome + desktop Chrome). */
  canInstallNatively: boolean
  /** Abre el prompt nativo del browser. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export function usePwaInstall(): UsePwaInstallReturn {
  const [caps] = useState(() => getPushCapabilities())
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome
  }, [deferred])

  const isStandalone = caps.isStandalonePWA || installed

  // Detección por plataforma (no depende de que `beforeinstallprompt` haya
  // disparado — si no disparó, igual damos instrucciones manuales).
  let kind: InstallPromptKind = 'none'
  if (!isStandalone) {
    if (caps.isIOS) kind = 'ios'
    else if (caps.platform === 'android-chrome') kind = 'android'
    else if (deferred) kind = 'desktop'
  }

  return {
    isStandalone,
    kind,
    canInstallNatively: !!deferred,
    promptInstall,
  }
}
