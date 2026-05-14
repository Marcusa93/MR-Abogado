import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { NicoIAChat } from '@/components/chat/nico-ia-chat'
import { useAlertasRealtime, requestNotificationPermission } from '@/hooks/use-alertas'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { OnboardingTour } from '@/components/shared/onboarding-tour'
import { InstallPwaPrompt } from '@/components/shared/install-pwa-prompt'
import { useOnboardingStore } from '@/stores/onboarding-store'
import { WifiOff } from 'lucide-react'

export function DashboardLayout() {
  const realtimeStatus = useAlertasRealtime()
  useKeyboardShortcuts()
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const onboardingCompleted = useOnboardingStore((s) => s.completed)
  const openOnboarding = useOnboardingStore((s) => s.open)

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Abrir tour automáticamente la primera vez que el usuario entra al CRM
  useEffect(() => {
    if (!onboardingCompleted) {
      const timer = setTimeout(() => openOnboarding(), 600)
      return () => clearTimeout(timer)
    }
  }, [onboardingCompleted, openOnboarding])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setIsMobileOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--layout-bg)]">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={() => {
            const next = !isCollapsed
            setIsCollapsed(next)
            localStorage.setItem('sidebar-collapsed', String(next))
          }}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMobileMenuToggle={() => setIsMobileOpen(!isMobileOpen)} />

        {realtimeStatus === 'disconnected' && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <WifiOff className="h-3.5 w-3.5" />
            Las alertas en tiempo real pueden estar demoradas — reconectando...
          </div>
        )}

        <main className="dashboard-shell mesh-gradient-bg flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-6">
          <div className="mx-auto max-w-[1440px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <NicoIAChat />
      <OnboardingTour />
      <InstallPwaPrompt />
    </div>
  )
}
