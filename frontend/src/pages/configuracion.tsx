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
import { List, MapPin } from 'lucide-react'

// ---------------------------------------------------------------------------
// SAE Notificaciones Section (preferences wrapper)
// ---------------------------------------------------------------------------

function SaeNotifSection() {
  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <SaeNotifConfig />
    </div>
  )
}

function NotifPrefsSection() {
  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Configuraci{'ó'}n
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Ajustes del perfil, apariencia y administraci{'ó'}n del sistema.
        </p>
      </div>

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
      <div className="border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          Integraciones
        </h2>
        <div className="space-y-4">
          <IntegracionesDrive />
        </div>
      </div>

      {/* Admin sections */}
      {isAdmin && (
        <>
          <div className="border-t border-white/10 pt-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
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
              tableName="catalogo_tipos_tarea"
              title="Tipos de Tarea"
              icon={List}
              formatNames
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
