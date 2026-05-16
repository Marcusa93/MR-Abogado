import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/components/auth/auth-guard'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { AppSplash } from '@/components/shared/app-splash'
import { ErrorBoundary } from '@/components/shared/error-boundary'

// Lazy load pages with automatic retry on chunk load failure (after deploys)
import { lazy, Suspense, type ComponentType } from 'react'

function lazyWithRetry(importFn: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk probably changed after a new deploy — reload once
      const key = 'chunk_reload'
      const last = sessionStorage.getItem(key)
      if (!last || Date.now() - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
      }
      // Return a no-op component so TS is happy (reload happens before render)
      return { default: (() => null) as unknown as ComponentType<any> }
    }),
  )
}

const LoginPage = lazyWithRetry(() => import('@/pages/login'))
const DashboardPage = lazyWithRetry(() => import('@/pages/dashboard'))
const DashboardPreviewPage = lazyWithRetry(() => import('@/pages/dashboard-preview'))
const ExpedientesPage = lazyWithRetry(() => import('@/pages/expedientes'))
const ExpedienteDetailPage = lazyWithRetry(() => import('@/pages/expediente-detail'))
const NuevoExpedientePage = lazyWithRetry(() => import('@/pages/nuevo-expediente'))
const ClientesPage = lazyWithRetry(() => import('@/pages/clientes'))
const ClienteDetailPage = lazyWithRetry(() => import('@/pages/cliente-detail'))
const NuevoClientePage = lazyWithRetry(() => import('@/pages/nuevo-cliente'))
const KanbanPage = lazyWithRetry(() => import('@/pages/kanban'))
const TareasPage = lazyWithRetry(() => import('@/pages/tareas'))
const AgendaSecretariaPage = lazyWithRetry(() => import('@/pages/agenda-secretaria'))
const AlertasPage = lazyWithRetry(() => import('@/pages/alertas'))
const InformesPage = lazyWithRetry(() => import('@/pages/informes'))
const ConfiguracionPage = lazyWithRetry(() => import('@/pages/configuracion'))
const ActividadPage = lazyWithRetry(() => import('@/pages/actividad'))
const ImportarExcelPage = lazyWithRetry(() => import('@/pages/importar-excel'))
const ImportarSaePage = lazyWithRetry(() => import('@/pages/importar-sae'))
const NormativaPage = lazyWithRetry(() => import('@/pages/normativa'))
const NormativaDetailPage = lazyWithRetry(() => import('@/pages/normativa-detail'))
const AuthCallbackPage = lazyWithRetry(() => import('@/pages/auth-callback'))
const ForcePasswordChangePage = lazyWithRetry(() => import('@/pages/force-password-change'))
const NotFoundPage = lazyWithRetry(() => import('@/pages/not-found'))

function PageLoader() {
  return <AppSplash fullscreen={false} message="Cargando módulo" />
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export const router = createBrowserRouter([
  ...(import.meta.env.DEV ? [{
    path: '/dashboard-preview',
    element: (
      <SuspenseWrapper>
        <DashboardPreviewPage />
      </SuspenseWrapper>
    ),
  }] : []),
  {
    path: '/login',
    element: (
      <SuspenseWrapper>
        <LoginPage />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/auth/callback',
    element: (
      <SuspenseWrapper>
        <AuthCallbackPage />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/cambiar-contrasena',
    element: (
      <SuspenseWrapper>
        <ForcePasswordChangePage />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <DashboardLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'panel', element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <SuspenseWrapper><DashboardPage /></SuspenseWrapper> },
      { path: 'expedientes', element: <SuspenseWrapper><ExpedientesPage /></SuspenseWrapper> },
      // FIX: rutas específicas ANTES de :id para que no capturen "nuevo" como ID
      { path: 'expedientes/nuevo', element: <SuspenseWrapper><NuevoExpedientePage /></SuspenseWrapper> },
      { path: 'expedientes/:id', element: <SuspenseWrapper><ExpedienteDetailPage /></SuspenseWrapper> },
      { path: 'clientes', element: <SuspenseWrapper><ClientesPage /></SuspenseWrapper> },
      { path: 'clientes/nuevo', element: <SuspenseWrapper><NuevoClientePage /></SuspenseWrapper> },
      { path: 'clientes/:id', element: <SuspenseWrapper><ClienteDetailPage /></SuspenseWrapper> },
      { path: 'kanban', element: <SuspenseWrapper><KanbanPage /></SuspenseWrapper> },
      { path: 'tareas', element: <SuspenseWrapper><TareasPage /></SuspenseWrapper> },
      { path: 'agenda', element: <SuspenseWrapper><AgendaSecretariaPage /></SuspenseWrapper> },
      { path: 'alertas', element: <SuspenseWrapper><AlertasPage /></SuspenseWrapper> },
      { path: 'informes', element: <SuspenseWrapper><InformesPage /></SuspenseWrapper> },
      { path: 'actividad', element: <SuspenseWrapper><ActividadPage /></SuspenseWrapper> },
      { path: 'configuracion', element: <SuspenseWrapper><ConfiguracionPage /></SuspenseWrapper> },
      { path: 'importar', element: <SuspenseWrapper><ImportarExcelPage /></SuspenseWrapper> },
      { path: 'importar-sae', element: <SuspenseWrapper><ImportarSaePage /></SuspenseWrapper> },
      { path: 'normativa', element: <SuspenseWrapper><NormativaPage /></SuspenseWrapper> },
      { path: 'normativa/:id', element: <SuspenseWrapper><NormativaDetailPage /></SuspenseWrapper> },
      // Catch-all 404 para rutas no encontradas dentro del layout
      { path: '*', element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper> },
    ],
  },
])
