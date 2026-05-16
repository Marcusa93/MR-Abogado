import { useState, useEffect } from 'react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { displayRol } from '@/lib/utils/display-rol'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import {
  User,
  Users,
  Settings,
  Sun,
  Moon,
  Monitor,
  Save,
  Loader2,
  Check,
  List,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Trash2,
  MapPin,
  X,
  UserPlus,
  Copy,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { useSaeCredential, useSaveSaeCredential, useDeleteSaeCredential, useSaeVerify } from '@/hooks/use-sae'
import { SaeNotifConfig } from '@/components/configuracion/sae-notif-config'

// ---------------------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------------------

function ProfileSection() {
  const { profile } = useAuth()
  const setProfile = useAuthStore((s) => s.setProfile)
  const queryClient = useQueryClient()
  const supabase = createClient()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [matricula, setMatricula] = useState('')
  const [matriculaLibro, setMatriculaLibro] = useState('')
  const [matriculaFolio, setMatriculaFolio] = useState('')
  const [domicilioLegal, setDomicilioLegal] = useState('')
  const [casilleroNotif, setCasilleroNotif] = useState('')
  const [cuit, setCuit] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      const p = profile as typeof profile & {
        matricula?: string | null
        matricula_libro?: string | null
        matricula_folio?: string | null
        domicilio_legal?: string | null
        casillero_notif?: string | null
        cuit?: string | null
      }
      setNombre(p.nombre ?? '')
      setApellido(p.apellido ?? '')
      setTelefono(p.telefono ?? '')
      setMatricula(p.matricula ?? '')
      setMatriculaLibro(p.matricula_libro ?? '')
      setMatriculaFolio(p.matricula_folio ?? '')
      setDomicilioLegal(p.domicilio_legal ?? '')
      setCasilleroNotif(p.casillero_notif ?? '')
      setCuit(p.cuit ?? '')
    }
  }, [profile])

  const cuitClean = cuit.replace(/\D/g, '')
  const cuitInvalid = cuit.length > 0 && cuitClean.length !== 11
  const datosEscritoFaltantes = !matricula.trim() || !domicilioLegal.trim() || !cuitClean

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('No profile')
      if (cuitInvalid) throw new Error('CUIT inv\u00E1lido (debe tener 11 d\u00EDgitos)')
      const { data, error } = await supabase
        .from('profiles')
        .update({
          nombre,
          apellido,
          telefono: telefono || null,
          matricula: matricula.trim() || null,
          matricula_libro: matriculaLibro.trim() || null,
          matricula_folio: matriculaFolio.trim() || null,
          domicilio_legal: domicilioLegal.trim() || null,
          casillero_notif: casilleroNotif.trim() || null,
          cuit: cuitClean || null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', profile.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setProfile(data as any)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  if (!profile) return null

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <User className="h-5 w-5 text-amber-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Mi perfil
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Nombre
          </label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Apellido
          </label>
          <input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Email
          </label>
          <input
            value={profile.email ?? ''}
            disabled
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Tel{'\u00E9'}fono
          </label>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>
      </div>

      {/* Datos profesionales \u2014 usados en encabezado de escritos */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
            Datos profesionales
          </h3>
          {datosEscritoFaltantes ? (
            <span className="text-[10px] text-amber-400">Requeridos para generar escritos</span>
          ) : (
            <span className="text-[10px] text-emerald-400">Listos para escritos</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Matr{'\u00ED'}cula
            </label>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="11604"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Libro
              </label>
              <input
                value={matriculaLibro}
                onChange={(e) => setMatriculaLibro(e.target.value)}
                placeholder="R"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Folio
              </label>
              <input
                value={matriculaFolio}
                onChange={(e) => setMatriculaFolio(e.target.value)}
                placeholder="106"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Domicilio legal
            </label>
            <input
              value={domicilioLegal}
              onChange={(e) => setDomicilioLegal(e.target.value)}
              placeholder="25 de mayo 545, San Miguel de Tucum\u00E1n"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              CUIT
            </label>
            <input
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              placeholder="20-37191810-9"
              className={cn(
                'h-9 w-full rounded-lg border bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15',
                cuitInvalid ? 'border-rose-500/50 focus:border-rose-500/50' : 'border-white/10 focus:border-amber-500/40',
              )}
            />
            {cuitInvalid && (
              <p className="mt-1 text-[10px] text-rose-400">CUIT debe tener 11 d{'\u00ED'}gitos</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Casillero de notificaciones
            </label>
            <input
              value={casilleroNotif}
              onChange={(e) => setCasilleroNotif(e.target.value)}
              placeholder="Opcional"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending || cuitInvalid}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {updateProfile.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? 'Guardado' : 'Guardar cambios'}
        </button>
        {updateProfile.isError && (
          <span className="text-xs text-rose-400">
            Error al guardar
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change Password Section
// ---------------------------------------------------------------------------

function ChangePasswordSection() {
  const supabase = createClient()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const isValid = currentPwd.length >= 4 && newPwd.length >= 6 && newPwd === confirmPwd

  async function handleChange() {
    if (!isValid) return
    setStatus('loading')
    setErrorMsg('')

    try {
      // Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('No se pudo obtener el email')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      })
      if (signInError) {
        setErrorMsg('La contraseña actual es incorrecta')
        setStatus('error')
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPwd,
      })
      if (updateError) throw updateError

      setStatus('success')
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cambiar contraseña')
      setStatus('error')
    }
  }

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="h-5 w-5 text-amber-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Cambiar contraseña
        </h2>
      </div>

      <div className="space-y-3 max-w-sm">
        {/* Current password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Contraseña actual
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className={cn(
              'h-9 w-full rounded-lg border bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/15',
              confirmPwd && confirmPwd !== newPwd
                ? 'border-rose-500/50 focus:border-rose-500/50'
                : 'border-white/10 focus:border-amber-500/40'
            )}
          />
          {confirmPwd && confirmPwd !== newPwd && (
            <p className="mt-1 text-[10px] text-rose-400">Las contraseñas no coinciden</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleChange}
            disabled={!isValid || status === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {status === 'success' ? 'Contraseña cambiada' : 'Cambiar contraseña'}
          </button>
          {status === 'error' && (
            <span className="text-xs text-rose-400">{errorMsg}</span>
          )}
        </div>
      </div>
    </div>
  )
}

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

// ---------------------------------------------------------------------------
// SAE Credentials Section
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente verificación', color: 'text-zinc-400', bg: 'bg-zinc-500/15', icon: Clock },
  activo:    { label: 'Activo', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  error:     { label: 'Error de conexión', color: 'text-rose-400', bg: 'bg-rose-500/15', icon: AlertCircle },
  desactivado: { label: 'Desactivado', color: 'text-zinc-500', bg: 'bg-zinc-700/20', icon: X },
} as const

function SaeCredentialsSection() {
  const { data: credential, isLoading } = useSaeCredential()
  const save = useSaveSaeCredential()
  const verify = useSaeVerify()
  const remove = useDeleteSaeCredential()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isValid = username.trim().length > 0 && password.length > 0
  const isBusy = save.isPending || verify.isPending

  const handleSave = () => {
    if (!isValid) return
    save.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          setShowForm(false)
          setUsername('')
          setPassword('')
          // Auto-verify immediately after saving so status shows activo/error
          verify.mutate(undefined, {
            onSuccess: () => toast.success('Credenciales SAE verificadas y activas'),
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Credenciales guardadas pero no se pudo verificar con SAE'),
          })
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al guardar')
        },
      }
    )
  }

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Credenciales SAE eliminadas')
        setConfirmDelete(false)
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Error al eliminar')
      },
    })
  }

  const status = credential?.status as keyof typeof STATUS_CONFIG | null ?? null
  const statusCfg = status ? STATUS_CONFIG[status] : null
  const StatusIcon = statusCfg?.icon ?? Database

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Integración SAE
          </h2>
          <span className="text-[10px] text-zinc-500">justucuman.gov.ar</span>
        </div>
        {credential && !showForm && (
          <div className="flex items-center gap-2">
            {credential.status !== 'activo' && (
              <button
                onClick={() => verify.mutate(undefined, {
                  onSuccess: () => toast.success('Conexión SAE verificada'),
                  onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo verificar'),
                })}
                disabled={verify.isPending}
                className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
              >
                {verify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Verificar
              </button>
            )}
            <button
              onClick={() => { setShowForm(true); setUsername(credential.username) }}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Actualizar
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-400" />
        </div>
      ) : credential && !showForm ? (
        /* Credential exists — show info */
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <div className={cn('flex items-center justify-center rounded-full p-1.5', statusCfg?.bg)}>
              <StatusIcon className={cn('h-3.5 w-3.5', statusCfg?.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{credential.username}</p>
              <p className={cn('text-xs', statusCfg?.color ?? 'text-zinc-500')}>
                {statusCfg?.label ?? credential.status}
              </p>
            </div>
          </div>

          {credential.last_error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {credential.last_error}
            </p>
          )}

          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            {credential.last_sync_at && (
              <span>Última sync: {new Date(credential.last_sync_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
            >
              Eliminar credenciales
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400">¿Eliminar credenciales SAE?</span>
              <button
                onClick={handleDelete}
                disabled={remove.isPending}
                className="flex items-center gap-1 rounded bg-rose-600/20 px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-600/30"
              >
                {remove.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : (
        /* No credential or editing — show form */
        <div className="space-y-3 max-w-sm">
          <p className="text-xs text-zinc-500">
            Ingresá tus credenciales del SAE (Sistema de Actuación Electrónica) para sincronizar actuaciones automáticamente.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Usuario SAE
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu.usuario@pjtu.gob.ar"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Contraseña SAE
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Tu contraseña del SAE"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              La contraseña se cifra en el servidor y nunca se expone al cliente.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={!isValid || isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
            >
              <Loader2 className={cn('h-4 w-4', isBusy ? 'animate-spin' : 'hidden')} />
              {!isBusy && <Check className="h-4 w-4" />}
              {save.isPending ? 'Guardando...' : verify.isPending ? 'Verificando con SAE...' : 'Guardar credenciales'}
            </button>
            {showForm && (
              <button
                onClick={() => { setShowForm(false); setUsername(''); setPassword('') }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme Section
// ---------------------------------------------------------------------------

function ThemeSection() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Claro' },
    { value: 'dark' as const, icon: Moon, label: 'Oscuro' },
    { value: 'system' as const, icon: Monitor, label: 'Sistema' },
  ]

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="h-5 w-5 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Apariencia
        </h2>
      </div>

      <div className="flex gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
              theme === opt.value
                ? 'border-amber-400 bg-amber-950/30'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            )}
          >
            <opt.icon
              className={cn(
                'h-5 w-5',
                theme === opt.value
                  ? 'text-amber-400'
                  : 'text-zinc-900 dark:text-zinc-500'
              )}
            />
            <span
              className={cn(
                'text-xs font-medium',
                theme === opt.value
                  ? 'text-amber-300'
                  : 'text-zinc-600 dark:text-zinc-400'
              )}
            >
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Users Section (admin only)
// ---------------------------------------------------------------------------

const ROL_COLORS: Record<string, string> = {
  ADMIN: 'bg-rose-900/30 text-rose-400',
  ABOGADO: 'bg-blue-900/30 text-blue-400',
}

const ASSIGNABLE_ROLES = [
  { value: 'ABOGADO', label: 'Usuario' },
] as const

function UsersSection() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', apellido: '', rol: '', telefono: '' })

  // Invite form
  const [inviteForm, setInviteForm] = useState({ email: '', nombre: '', apellido: '', rol: 'ABOGADO', telefono: '' })
  const [recoveryInfo, setRecoveryInfo] = useState<{ link: string | null; tempPassword: string } | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('apellido', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const inviteUser = useMutation({
    mutationFn: async (form: typeof inviteForm) => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: form,
      })
      if (error) throw new Error(error.message || 'Error al crear usuario')
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; recovery_link: string | null; temp_password: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      setRecoveryInfo({ link: data.recovery_link, tempPassword: data.temp_password })
      toast.success('Usuario creado exitosamente')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const updateUser = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; nombre: string; apellido: string; rol: string; telefono: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: fields.nombre,
          apellido: fields.apellido,
          rol: fields.rol as any,
          telefono: fields.telefono || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      setEditingUser(null)
      toast.success('Usuario actualizado')
    },
    onError: () => toast.error('Error al actualizar usuario'),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ activo, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al cambiar estado'),
  })

  const startEdit = (user: NonNullable<typeof users>[number]) => {
    setEditingUser(user.id)
    setEditForm({
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      telefono: user.telefono ?? '',
    })
  }

  const resetInvite = () => {
    setShowInvite(false)
    setInviteForm({ email: '', nombre: '', apellido: '', rol: 'ABOGADO', telefono: '' })
    setRecoveryInfo(null)
  }

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Usuarios del sistema
          </h2>
          <span className="text-[10px] text-zinc-600">{users?.length ?? 0}</span>
        </div>
        <button
          onClick={() => { resetInvite(); setShowInvite(true) }}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invitar usuario
        </button>
      </div>

      {/* Invite dialog */}
      {showInvite && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 animate-fade-in">
          {recoveryInfo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="h-4 w-4" />
                <p className="text-sm font-medium">Usuario creado</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Contraseña temporal para el primer ingreso:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs text-amber-300 font-mono break-all">
                    {recoveryInfo.tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(recoveryInfo.tempPassword)
                      toast.success('Contraseña copiada')
                    }}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-600 dark:text-zinc-400 hover:text-white transition-colors"
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-900 dark:text-zinc-500">
                  Compartí esta contraseña con el usuario. Podrá cambiarla desde su perfil.
                </p>
              </div>
              <button
                onClick={resetInvite}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nuevo usuario</h3>
                <button onClick={resetInvite} className="text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Email *</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="empleado@email.com"
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Rol *</label>
                  <select
                    value={inviteForm.rol}
                    onChange={(e) => setInviteForm(f => ({ ...f, rol: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Nombre *</label>
                  <input
                    value={inviteForm.nombre}
                    onChange={(e) => setInviteForm(f => ({ ...f, nombre: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Apellido *</label>
                  <input
                    value={inviteForm.apellido}
                    onChange={(e) => setInviteForm(f => ({ ...f, apellido: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Teléfono</label>
                  <input
                    value={inviteForm.telefono}
                    onChange={(e) => setInviteForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="Opcional"
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
              </div>
              <button
                onClick={() => inviteUser.mutate(inviteForm)}
                disabled={!inviteForm.email || !inviteForm.nombre || !inviteForm.apellido || inviteUser.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {inviteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Crear usuario
              </button>
            </div>
          )}
        </div>
      )}

      {/* User list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {(users ?? []).map((user) => (
            <div key={user.id}>
              <div className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                {/* Avatar */}
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                  user.activo !== false ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-zinc-900 dark:text-zinc-500'
                )}>
                  {(user.nombre?.[0] ?? '').toUpperCase()}
                  {(user.apellido?.[0] ?? '').toUpperCase()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', user.activo !== false ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-900 dark:text-zinc-500')}>
                    {user.nombre} {user.apellido}
                    {user.rol === 'ADMIN' && <Shield className="ml-1 inline h-3 w-3 text-rose-400" />}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{user.email}</p>
                </div>

                {/* Role badge */}
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', ROL_COLORS[user.rol] ?? ROL_COLORS.ABOGADO)}>
                  {displayRol(user)}
                </span>

                {/* Actions */}
                {user.rol !== 'ADMIN' && (
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(user)}
                      className="rounded p-1.5 text-zinc-900 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive.mutate({ id: user.id, activo: user.activo === false })}
                      className={cn(
                        'rounded p-1.5 transition-colors',
                        user.activo !== false
                          ? 'text-emerald-500 hover:text-rose-400 hover:bg-white/10'
                          : 'text-zinc-600 hover:text-emerald-400 hover:bg-white/10'
                      )}
                      title={user.activo !== false ? 'Desactivar' : 'Activar'}
                    >
                      {user.activo !== false ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                {/* Active dot (always visible) */}
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', user.activo !== false ? 'bg-emerald-500' : 'bg-slate-600')}
                  title={user.activo !== false ? 'Activo' : 'Inactivo'}
                />
              </div>

              {/* Edit inline form */}
              {editingUser === user.id && (
                <div className="mt-1 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Nombre</label>
                      <input
                        value={editForm.nombre}
                        onChange={(e) => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Apellido</label>
                      <input
                        value={editForm.apellido}
                        onChange={(e) => setEditForm(f => ({ ...f, apellido: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Rol</label>
                      <select
                        value={editForm.rol}
                        onChange={(e) => setEditForm(f => ({ ...f, rol: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Teléfono</label>
                      <input
                        value={editForm.telefono}
                        onChange={(e) => setEditForm(f => ({ ...f, telefono: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => updateUser.mutate({ id: user.id, ...editForm })}
                      disabled={updateUser.isPending}
                      className="flex items-center gap-1 rounded-lg bg-gradient-cyan px-3 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
                    >
                      {updateUser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/5"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalog Editor
// ---------------------------------------------------------------------------

type CatalogoTable = 'tipos_tramite' | 'organismos' | 'catalogo_tipos_tarea' | 'catalogo_tipos_audiencia'

/** Converts snake_case to readable: "contactar_cliente" → "Contactar cliente" */
function formatSnakeCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function CatalogoEditor({
  tableName,
  title,
  icon: IconComponent,
  showAddress = false,
  formatNames = false,
}: {
  tableName: CatalogoTable
  title: string
  icon: typeof List
  showAddress?: boolean
  formatNames?: boolean
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; nombre: string } | null>(null)

  const { data: items, isLoading } = useQuery({
    queryKey: ['catalogo', tableName],
    queryFn: async () => {
      const select = showAddress ? 'id, nombre, activo, direccion' : 'id, nombre, activo'
      const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data as unknown as { id: string; nombre: string; activo?: boolean; direccion?: string }[]).map(item => ({
        ...item,
        activo: item.activo ?? true,
      }))
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ activo } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
    },
  })

  const renameItem = useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ nombre } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
      setEditingId(null)
    },
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
    },
  })

  const addItem = useMutation({
    mutationFn: async (nombre: string) => {
      // Build base payload per table
      let payload: Record<string, unknown>
      if (tableName === 'tipos_tramite') {
        // tipos_tramite requires a unique NOT NULL `codigo` slug
        const slug = nombre
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // strip accents
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        const codigo = slug || `tipo_${Date.now()}`
        payload = { nombre, codigo, activo: true }
      } else {
        payload = { nombre, activo: true }
      }

      const { error } = await supabase.from(tableName).insert(payload as any)

      // Retry with a disambiguating suffix if codigo collides
      if (error && tableName === 'tipos_tramite' && error.code === '23505') {
        const suffix = Date.now().toString(36)
        const retryPayload = { ...payload, codigo: `${payload.codigo}_${suffix}` }
        const { error: retryError } = await supabase
          .from(tableName)
          .insert(retryPayload as any)
        if (retryError) throw retryError
        return
      }
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', tableName] })
      setNewItem('')
    },
  })

  const handleAdd = () => {
    if (!newItem.trim()) return
    addItem.mutate(newItem.trim())
  }

  const startEdit = (id: string, nombre: string) => {
    setEditingId(id)
    setEditingName(nombre)
  }

  const saveEdit = () => {
    if (!editingId || !editingName.trim()) return
    renameItem.mutate({ id: editingId, nombre: editingName.trim() })
  }

  return (
    <div className="glass-card rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <IconComponent className="h-5 w-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <span className="ml-auto text-[10px] text-zinc-600">{items?.length ?? 0}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-400" />
        </div>
      ) : (
        <div className="space-y-1">
          {(items ?? []).map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <button
                onClick={() =>
                  toggleActive.mutate({ id: item.id, activo: !item.activo })
                }
                className={cn(
                  'shrink-0 transition-colors',
                  item.activo ? 'text-amber-400' : 'text-zinc-600'
                )}
                title={item.activo ? 'Desactivar' : 'Activar'}
              >
                {item.activo ? (
                  <ToggleRight className="h-5 w-5" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>

              {editingId === item.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className="h-7 flex-1 rounded border border-amber-500/30 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                  <button onClick={saveEdit} className="text-amber-400 hover:text-amber-300"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <span className={cn('text-sm', item.activo ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-900 dark:text-zinc-500 line-through')}>
                    {formatNames ? formatSnakeCase(item.nombre) : item.nombre}
                  </span>
                  {showAddress && (item as any).direccion && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-900 dark:text-zinc-500 mt-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {(item as any).direccion}
                    </div>
                  )}
                </div>
              )}

              {/* Edit/delete — visible on hover */}
              {editingId !== item.id && (
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(item.id, item.nombre)}
                    className="rounded p-1 text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300"
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ id: item.id, nombre: formatNames ? formatSnakeCase(item.nombre) : item.nombre })}
                    className="rounded p-1 text-zinc-600 hover:text-rose-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add new */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Agregar nuevo..."
              className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              onClick={handleAdd}
              disabled={!newItem.trim() || addItem.isPending}
              className="rounded-lg bg-gradient-cyan px-2.5 py-1.5 text-xs font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
            >
              {addItem.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Agregar'
              )}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { deleteItem.mutate(deleteConfirm!.id); setDeleteConfirm(null) }}
        title="Eliminar elemento"
        description={`¿Eliminar "${deleteConfirm?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteItem.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ConfiguracionPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Configuraci{'\u00F3'}n
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Ajustes del perfil, apariencia y administraci{'\u00F3'}n del sistema.
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

      {/* Admin sections */}
      {isAdmin && (
        <>
          <div className="border-t border-white/10 pt-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              Administraci{'\u00F3'}n
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
