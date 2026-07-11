import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { User, Save, Loader2, Check } from 'lucide-react'

export function ProfileSection() {
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
      if (cuitInvalid) throw new Error('CUIT inválido (debe tener 11 dígitos)')
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
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-700 dark:text-zinc-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
            Tel{'é'}fono
          </label>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>
      </div>

      {/* Datos profesionales — usados en encabezado de escritos */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
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
              Matr{'í'}cula
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
              placeholder="25 de mayo 545, San Miguel de Tucumán"
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
              <p className="mt-1 text-[10px] text-rose-400">CUIT debe tener 11 d{'í'}gitos</p>
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
