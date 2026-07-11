import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { displayRol } from '@/lib/utils/display-rol'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Users, UserPlus, Pencil, Trash2, Check, X, Loader2, Shield, ToggleLeft, ToggleRight, Copy } from 'lucide-react'

const ROL_COLORS: Record<string, string> = {
  DIRECTOR: 'bg-amber-900/30 text-amber-400',
  ADMIN: 'bg-rose-900/30 text-rose-400',
  ABOGADO: 'bg-blue-900/30 text-blue-400',
  SECRETARIA: 'bg-emerald-900/30 text-emerald-400',
  COLABORADOR: 'bg-violet-900/30 text-violet-400',
}

const ASSIGNABLE_ROLES = [
  { value: 'ABOGADO', label: 'Abogado' },
  { value: 'SECRETARIA', label: 'Secretaria' },
  { value: 'COLABORADOR', label: 'Colaborador' },
] as const

export function UsersSection() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { profile: currentProfile } = useAuth()
  // Solo un DIRECTOR puede nombrar a otro DIRECTOR (socio del estudio).
  const assignableRoles = currentProfile?.rol === 'DIRECTOR'
    ? [...ASSIGNABLE_ROLES, { value: 'DIRECTOR', label: 'Director' }]
    : ASSIGNABLE_ROLES
  const [showInvite, setShowInvite] = useState(false)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', apellido: '', rol: '', telefono: '' })
  const [deletingUser, setDeletingUser] = useState<{ id: string; nombre: string } | null>(null)

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

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: id } })
      if (error) {
        // Intentar leer el mensaje del cuerpo (FunctionsHttpError)
        const ctx = (error as { context?: Response }).context
        if (ctx instanceof Response) {
          const body = await ctx.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw new Error(error.message || 'Error al eliminar usuario')
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      setDeletingUser(null)
      toast.success('Usuario eliminado')
    },
    onError: (err: Error) => {
      setDeletingUser(null)
      toast.error(err.message)
    },
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
          <span className="text-[10px] text-zinc-600 dark:text-zinc-300">{users?.length ?? 0}</span>
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
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  Contraseña temporal para el primer ingreso:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2 text-xs text-amber-300 font-mono break-all">
                    {recoveryInfo.tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(recoveryInfo.tempPassword)
                      toast.success('Contraseña copiada')
                    }}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-600 dark:text-zinc-300 hover:text-white transition-colors"
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-700 dark:text-zinc-300">
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
                <button onClick={resetInvite} className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Email *</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="empleado@email.com"
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Rol *</label>
                  <select
                    value={inviteForm.rol}
                    onChange={(e) => setInviteForm(f => ({ ...f, rol: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Nombre *</label>
                  <input
                    value={inviteForm.nombre}
                    onChange={(e) => setInviteForm(f => ({ ...f, nombre: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Apellido *</label>
                  <input
                    value={inviteForm.apellido}
                    onChange={(e) => setInviteForm(f => ({ ...f, apellido: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Teléfono</label>
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
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600 dark:text-zinc-300" />
        </div>
      ) : (
        <div className="space-y-2">
          {(users ?? []).map((user) => (
            <div key={user.id}>
              <div className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                {/* Avatar */}
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                  user.activo !== false ? 'bg-blue-900 text-blue-300' : 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300'
                )}>
                  {(user.nombre?.[0] ?? '').toUpperCase()}
                  {(user.apellido?.[0] ?? '').toUpperCase()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', user.activo !== false ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300')}>
                    {user.nombre} {user.apellido}
                    {user.rol === 'ADMIN' && <Shield className="ml-1 inline h-3 w-3 text-rose-400" />}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{user.email}</p>
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
                      className="rounded p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/10 transition-colors"
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
                          : 'text-zinc-600 dark:text-zinc-300 hover:text-emerald-400 hover:bg-white/10'
                      )}
                      title={user.activo !== false ? 'Desactivar' : 'Activar'}
                    >
                      {user.activo !== false ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setDeletingUser({ id: user.id, nombre: `${user.nombre} ${user.apellido}`.trim() })}
                      className="rounded p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-rose-400 hover:bg-white/10 transition-colors"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Nombre</label>
                      <input
                        value={editForm.nombre}
                        onChange={(e) => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Apellido</label>
                      <input
                        value={editForm.apellido}
                        onChange={(e) => setEditForm(f => ({ ...f, apellido: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Rol</label>
                      <select
                        value={editForm.rol}
                        onChange={(e) => setEditForm(f => ({ ...f, rol: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Teléfono</label>
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
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/5"
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

      <ConfirmDialog
        open={deletingUser !== null}
        onClose={() => setDeletingUser(null)}
        onConfirm={() => { if (deletingUser) deleteUser.mutate(deletingUser.id) }}
        title="¿Eliminar usuario?"
        description={`Vas a eliminar a ${deletingUser?.nombre ?? ''}. Esta acción no se puede deshacer. Si el usuario tiene expedientes o datos asociados, no se podrá eliminar (desactivalo en su lugar).`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  )
}
