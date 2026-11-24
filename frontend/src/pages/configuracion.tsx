import { useAuth } from '@/hooks/use-auth'
import { SaeNotifConfig } from '@/components/configuracion/sae-notif-config'
import { NotifPrefsConfig } from '@/components/configuracion/notif-prefs-config'
import { IntegracionesDrive } from '@/components/configuracion/integraciones-drive'
import { ProfileSection } from '@/components/configuracion/profile-section'
import { ChangePasswordSection } from '@/components/configuracion/change-password-section'
import { SaeCredentialsSection } from '@/components/configuracion/sae-credentials-section'
import { ThemeSection } from '@/components/configuracion/theme-section'
import { UsersSection } from '@/components/configuracion/users-section'
import { CatalogoEditor } from '@/components/configuracion/catalogo-editor'
import { PageHeader } from '@/components/shared/page-header'
import { List, MapPin } from 'lucide-react'

// ---------------------------------------------------------------------------
// SAE Notificaciones Section (preferences wrapper)
// ---------------------------------------------------------------------------

function SaeNotifSection() {
  return (
    <div className="app-card p-5">
      <SaeNotifConfig />
    </div>
  )
}

function NotifPrefsSection() {
  return (
    <div className="app-card p-5">
      <NotifPrefsConfig />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ConfiguracionPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN' || profile?.rol === 'DIRECTOR'

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={<>Configuraci{'ó'}n</>}
        subtitle={<>Ajustes del perfil, apariencia y administraci{'ó'}n del sistema.</>}
      />

      {/* Profile + Theme + Password */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileSection />
        <ThemeSection />
      </div>

      <ChangePasswordSection />

      <SaeCredentialsSection />

      <SaeNotifSection />

      <NotifPrefsSection />

      {/* Integraciones */}
      <div className="border-t border-zinc-200 pt-6 dark:border-white/[0.08]">
        <h2 className="mb-4 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Integraciones
        </h2>
        <div className="space-y-4">
          <IntegracionesDrive />
        </div>
      </div>

      {/* Admin sections */}
      {isAdmin && (
        <>
          <div className="border-t border-zinc-200 pt-6 dark:border-white/[0.08]">
            <h2 className="mb-4 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Administraci{'ó'}n
            </h2>
          </div>

          <UsersSection />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <CatalogoEditor
              tableName="tipos_tramite"
              title="Tipos de Trámite"
              icon={List}
            />
            <CatalogoEditor
              tableName="organismos"
              title="Organismos"
              icon={MapPin}
            />
            <CatalogoEditor
              tableName="catalogo_tipos_audiencia"
              title="Tipos de Audiencia"
              icon={List}
            />
          </div>
        </>
      )}
    </div>
  )
}
