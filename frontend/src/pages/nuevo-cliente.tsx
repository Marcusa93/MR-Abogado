import { useState, useEffect } from 'react'
import { useNavigate, useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useCreateCliente } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import {
  ESTADO_CIVIL_VALUES,
  ESTADO_CIVIL_LABELS,
  PROVINCIAS,
} from '@/types/enums'
import { ArrowLeft, Loader2, Save, Eye, EyeOff } from 'lucide-react'
import { CuilInput } from '@/components/shared/cuil-input'
import type { AfipData } from '@/hooks/use-cuil-validation'

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'
const errorClass = 'mt-1 text-xs text-rose-500'
const sectionClass = 'text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3 flex items-center gap-2 before:h-px before:w-3 before:bg-gradient-to-r before:from-amber-500/50 before:to-transparent'

export default function NuevoClientePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createCliente = useCreateCliente()

  // Required
  const [dni, setDni] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')

  // Optional identity
  const [cuil, setCuil] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [ocupacion, setOcupacion] = useState('')
  const [obraSocial, setObraSocial] = useState('')

  // Contact
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [telefonoAlt, setTelefonoAlt] = useState('')

  // Address
  const [calle, setCalle] = useState('')
  const [altura, setAltura] = useState('')
  const [barrio, setBarrio] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [provincia, setProvincia] = useState('Tucuman')
  const [codigoPostal, setCodigoPostal] = useState('4000')

  // Claves
  const [claveArca, setClaveArca] = useState('')
  const [showClaveArca, setShowClaveArca] = useState(false)

  // Notes
  const [notas, setNotas] = useState('')

  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isDirty = !submitted && (dni.trim().length > 0 || nombre.trim().length > 0 || apellido.trim().length > 0)

  // Block in-app navigation when form has data
  const blocker = useBlocker(isDirty)

  // Block browser-level navigation (refresh, close, external links)
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const isValid =
    dni.trim().length > 0 &&
    nombre.trim().length > 0 &&
    apellido.trim().length > 0

  const handleSubmit = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      setSubmitted(true)
      const result = await createCliente.mutateAsync({
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cuil: cuil.trim() || null,
        fecha_nacimiento: fechaNacimiento || null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        telefono_alt: telefonoAlt.trim() || null,
        domicilio: [calle.trim(), altura.trim(), barrio.trim()].filter(Boolean).join(', ') || null,
        localidad: localidad.trim() || null,
        provincia: provincia || null,
        notas: notas.trim() || null,
        created_by: profile?.id ?? '',
      })
      toast.success('Cliente creado correctamente')
      navigate(`/clientes/${result.id}`)
    } catch {
      setSubmitted(false)
      // Error handled by mutation + global toast
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Back + Title */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Nuevo Cliente
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Completa los datos del nuevo cliente del estudio.
        </p>
      </div>

      {/* Form */}
      <div className="glass-card rounded-xl p-6">
        <div className="space-y-6">
          {/* --- Identity section --- */}
          <div>
            <p className={sectionClass}>Datos personales</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Apellido *</label>
                <input
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className={`${inputClass} ${touched && !apellido.trim() ? 'border-rose-500/50' : ''}`}
                />
                {touched && !apellido.trim() && <p className={errorClass}>Obligatorio</p>}
              </div>
              <div>
                <label className={labelClass}>Nombre *</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className={`${inputClass} ${touched && !nombre.trim() ? 'border-rose-500/50' : ''}`}
                />
                {touched && !nombre.trim() && <p className={errorClass}>Obligatorio</p>}
              </div>
              <div>
                <label className={labelClass}>DNI *</label>
                <input
                  value={dni}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                    setDni(v)
                  }}
                  inputMode="numeric"
                  maxLength={8}
                  className={`${inputClass} ${touched && (!dni.trim() || (dni.trim().length > 0 && (dni.trim().length < 7 || dni.trim().length > 8))) ? 'border-rose-500/50' : ''}`}
                />
                {touched && !dni.trim() && <p className={errorClass}>Obligatorio</p>}
                {touched && dni.trim().length > 0 && dni.trim().length < 7 && <p className={errorClass}>DNI inválido (7 u 8 dígitos)</p>}
              </div>
              <div>
                <label className={labelClass}>CUIL</label>
                <CuilInput
                  value={cuil}
                  onChange={setCuil}
                  dniValue={dni}
                  onAfipData={(data: AfipData) => {
                    // Auto-fill name if fields are empty
                    if (data.nombre && !apellido.trim() && !nombre.trim()) {
                      const parts = data.nombre.split(' ')
                      if (parts.length >= 2) {
                        setApellido(parts[0])
                        setNombre(parts.slice(1).join(' '))
                      }
                    }
                    // Auto-fill address if empty
                    if (data.domicilio) {
                      if (data.domicilio.direccion && !calle.trim()) {
                        setCalle(data.domicilio.direccion)
                      }
                      if (data.domicilio.localidad && !localidad.trim()) {
                        setLocalidad(data.domicilio.localidad)
                      }
                      if (data.domicilio.provincia && !provincia) {
                        setProvincia(data.domicilio.provincia)
                      }
                      if (data.domicilio.codigoPostal && !codigoPostal.trim()) {
                        setCodigoPostal(data.domicilio.codigoPostal)
                      }
                    }
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>Fecha de nacimiento</label>
                <input
                  type="date"
                  value={fechaNacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Estado civil</label>
                <select
                  value={estadoCivil}
                  onChange={(e) => setEstadoCivil(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-</option>
                  {ESTADO_CIVIL_VALUES.map((ec) => (
                    <option key={ec} value={ec}>{ESTADO_CIVIL_LABELS[ec]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Ocupación</label>
                <select
                  value={ocupacion}
                  onChange={(e) => setOcupacion(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Seleccionar...</option>
                  <option value="Empleado Publico">Empleado Público</option>
                  <option value="Empleado Privado">Empleado Privado</option>
                  <option value="Monotributista">Monotributista</option>
                  <option value="Monotributista Social">Monotributista Social</option>
                  <option value="Autonomo">Autónomo</option>
                  <option value="Empleado Domestico">Empleado Doméstico</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Obra social</label>
                <input
                  value={obraSocial}
                  onChange={(e) => setObraSocial(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* --- Contact section --- */}
          <div>
            <p className={sectionClass}>Contacto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Teléfono alternativo</label>
                <input
                  value={telefonoAlt}
                  onChange={(e) => setTelefonoAlt(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* --- Address section --- */}
          <div>
            <p className={sectionClass}>Domicilio</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Calle</label>
                <input
                  value={calle}
                  onChange={(e) => setCalle(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Altura</label>
                <input
                  value={altura}
                  onChange={(e) => setAltura(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Barrio</label>
                <input
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Localidad</label>
                <input
                  value={localidad}
                  onChange={(e) => setLocalidad(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Provincia</label>
                <select
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Código postal</label>
                <input
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* --- Claves section --- */}
          <div>
            <p className={sectionClass}>Claves de acceso</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Clave ARCA (ex AFIP)</label>
                <div className="relative">
                  <input
                    type={showClaveArca ? 'text' : 'password'}
                    value={claveArca}
                    onChange={(e) => setClaveArca(e.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowClaveArca(!showClaveArca)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showClaveArca ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* --- Notes --- */}
          <div>
            <label className={labelClass}>Notas internas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/5 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createCliente.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-5 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createCliente.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Crear cliente
          </button>
        </div>
      </div>

      {/* Unsaved changes warning */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="¿Descartar cambios?"
        description="Tenés cambios sin guardar en este formulario. Si salís ahora, se perderán."
        confirmLabel="Salir sin guardar"
        variant="danger"
      />
    </div>
  )
}
