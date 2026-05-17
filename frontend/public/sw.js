// ---------------------------------------------------------------------------
// MR Abogado — Service Worker (Network-first strategy)
// Does NOT cache API calls or Supabase data — must always be fresh.
// Only caches static assets (JS, CSS, fonts, images) for fast reload.
// Bumping CACHE_NAME invalida cualquier cache previo (incluido alba-crm-v1).
// ---------------------------------------------------------------------------

const CACHE_NAME = 'mr-abogado-v2'

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/logo/icon-192.png',
  '/logo/icon-512.png',
  '/logo/mr-monograma-azul.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ---------------------------------------------------------------------------
// Web Push (VAPID) — payload esperado:
//   { title, body, url?, tag?, icon?, badge? }
// Android/Chrome y Safari iOS 16.4+ (con PWA instalada) llegan por acá.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'MR Abogado', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'MR Abogado'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo/icon-192.png',
    badge: payload.badge || '/logo/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // NEVER cache Supabase API calls, auth, or edge functions
  if (
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/rest') ||
    url.pathname.startsWith('/functions') ||
    url.pathname.includes('/storage/')
  ) {
    return // Let the browser handle these normally
  }

  // For navigation requests (HTML), always go network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    )
    return
  }

  // For static assets (JS, CSS, fonts, images) — stale-while-revalidate
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|svg|png|jpg|ico)$/) ||
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('fonts.gstatic')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          }).catch(() => cached)

          return cached || fetched
        })
      )
    )
    return
  }
})
