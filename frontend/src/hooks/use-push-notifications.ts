import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { arrayBufferToBase64, urlBase64ToUint8Array } from '@/lib/push/vapid'
import { getPushCapabilities, type PushCapabilities } from '@/lib/push/platform'

type PermissionState = NotificationPermission | 'unsupported'

interface UsePushNotificationsReturn {
  capabilities: PushCapabilities
  permission: PermissionState
  isSubscribed: boolean
  isBusy: boolean
  error: string | null
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<boolean>
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const supabase = createClient()
  const userId = useAuthStore((s) => s.user?.id)

  const [capabilities] = useState<PushCapabilities>(() => getPushCapabilities())
  const [permission, setPermission] = useState<PermissionState>(() =>
    capabilities.hasAPIs ? Notification.permission : 'unsupported'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detectar si ya hay una suscripción activa en el browser.
  useEffect(() => {
    if (!capabilities.supported) return
    let cancelled = false
    ;(async () => {
      const reg = await getRegistration()
      if (!reg || cancelled) return
      const sub = await reg.pushManager.getSubscription()
      if (!cancelled) setIsSubscribed(!!sub)
    })()
    return () => {
      cancelled = true
    }
  }, [capabilities.supported])

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null)

    if (!capabilities.supported) {
      setError(
        capabilities.requiresInstall
          ? 'En iOS tenés que instalar la app (Compartir → Agregar a pantalla de inicio) antes de activar notificaciones.'
          : 'Este navegador no soporta notificaciones push.'
      )
      return false
    }
    if (!VAPID_PUBLIC_KEY) {
      setError('Falta VITE_VAPID_PUBLIC_KEY en la configuración.')
      return false
    }
    if (!userId) {
      setError('Iniciá sesión para activar notificaciones.')
      return false
    }

    setIsBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('Permiso de notificaciones denegado.')
        return false
      }

      const reg = await getRegistration()
      if (!reg) {
        setError('No se pudo registrar el service worker.')
        return false
      }

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const json = sub.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!p256dh || !auth) {
        setError('La suscripción no devolvió las claves esperadas.')
        return false
      }
      // Fallback por si el browser no devuelve toJSON() completo:
      const p256dhStr =
        p256dh || arrayBufferToBase64(sub.getKey('p256dh') as ArrayBuffer)
      const authStr =
        auth || arrayBufferToBase64(sub.getKey('auth') as ArrayBuffer)

      const { error: upsertError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: sub.endpoint,
            p256dh_key: p256dhStr,
            auth_key: authStr,
            user_agent: navigator.userAgent,
            platform: capabilities.platform,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        )

      if (upsertError) {
        setError(`No se pudo guardar la suscripción: ${upsertError.message}`)
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error activando notificaciones.')
      return false
    } finally {
      setIsBusy(false)
    }
  }, [capabilities, supabase, userId])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null)
    setIsBusy(true)
    try {
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setIsSubscribed(false)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desactivando notificaciones.')
      return false
    } finally {
      setIsBusy(false)
    }
  }, [supabase])

  return {
    capabilities,
    permission,
    isSubscribed,
    isBusy,
    error,
    subscribe,
    unsubscribe,
  }
}
