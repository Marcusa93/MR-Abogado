/**
 * Detección de plataforma + capacidades de Web Push.
 *
 * Reglas clave:
 *  - Chrome/Android: soporte directo sin instalar.
 *  - Safari iOS 16.4+: SOLO funciona si la app está instalada en pantalla
 *    de inicio (standalone). Desde pestaña de Safari NO hay push.
 *  - Safari macOS 16.1+: soporta push en pestaña normal.
 *  - Firefox y demás browsers modernos: soporte directo.
 */

export type PushPlatform =
  | 'android-chrome'
  | 'ios-safari'
  | 'ios-other'           // Chrome/Firefox/etc en iOS — no permiten PWA/push
  | 'macos-safari'
  | 'desktop'
  | 'unknown'

export interface PushCapabilities {
  hasAPIs: boolean           // Notification + PushManager + serviceWorker
  isIOS: boolean
  isIOSNonSafari: boolean     // iOS pero en Chrome/Firefox — hay que pasarlos a Safari
  isStandalonePWA: boolean    // display-mode: standalone o navigator.standalone
  requiresInstall: boolean    // iOS en pestaña: hay que instalar como PWA
  supported: boolean          // Push realmente funciona acá
  platform: PushPlatform
}

export function detectPlatform(): PushPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent

  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) {
    // CriOS = Chrome iOS, FxiOS = Firefox iOS, EdgiOS = Edge iOS
    const isIOSNonSafari = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
    return isIOSNonSafari ? 'ios-other' : 'ios-safari'
  }

  if (/Android/.test(ua) && /Chrome|Chromium/.test(ua)) return 'android-chrome'

  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  if (isSafari) return 'macos-safari'

  return 'desktop'
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function getPushCapabilities(): PushCapabilities {
  if (typeof window === 'undefined') {
    return {
      hasAPIs: false,
      isIOS: false,
      isIOSNonSafari: false,
      isStandalonePWA: false,
      requiresInstall: false,
      supported: false,
      platform: 'unknown',
    }
  }

  const hasAPIs =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const platform = detectPlatform()
  const isIOS = platform === 'ios-safari' || platform === 'ios-other'
  const isIOSNonSafari = platform === 'ios-other'
  const standalone = isStandalonePWA()
  const requiresInstall = isIOS && !standalone

  return {
    hasAPIs,
    isIOS,
    isIOSNonSafari,
    isStandalonePWA: standalone,
    requiresInstall,
    supported: hasAPIs && !requiresInstall,
    platform,
  }
}
