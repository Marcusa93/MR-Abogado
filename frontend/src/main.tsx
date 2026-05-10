import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './light-overrides.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

function isLocalRuntimeHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  )
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  const isLocalRuntime = isLocalRuntimeHost(window.location.hostname)

  // Local dev/preview should never keep a persisted SW or app cache because
  // it can make Vite look stale after switching between preview and dev.
  if (import.meta.env.DEV || isLocalRuntime) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(
          keys
            .filter((key) => key.startsWith('mr-crm-'))
            .map((key) => caches.delete(key)),
        )
      }
    } catch {
      // Local cache cleanup is best-effort only
    }
    return
  }

  if (import.meta.env.PROD) {
    window.addEventListener(
      'load',
      () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // SW registration failed — app works fine without it
        })
      },
      { once: true },
    )
  }
}

void setupServiceWorker()
