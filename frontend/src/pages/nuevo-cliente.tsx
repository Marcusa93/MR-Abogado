import { useState, useEffect, useRef } from 'react'
import { useNavigate, useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PageHeader } from '@/components/shared/page-header'
import { useCreateCliente } from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import {
  ESTADO_CIVIL_VALUES,
  ESTADO_CIVIL_LABELS,
  PROVINCIAS,
} from '@/types/enums'
import { ArrowLeft, Loader2, Save, Eye, EyeOff, User, Building2 } from 'lucide-react'
import { CuilInput } from '@/components/shared/cuil-input'
import type { AfipData } from '@/hooks/use-cuil-validation'

const inputClass = 'field h-9 py-0'
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400'
const errorClass = 'mt-1 text-xs font-medium text-rose-500'
const sectionClass = 'eyebrow mb-3'

type TipoPersona = 'fisica' | 'juridica'

export default function NuevoClientePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createCliente = useCreateCliente()

  const [tipoPersona, setTipoPersona] = useState<TipoPersona>('fisica')

  // Persona física
  const [dni, setDni] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [ocupacion, setOcupacion] = useState('')
  const [obraSocial, setObraSocial] = useState('')

  // Persona jurídica
  const [razonSocial, setRazonSocial] = useState('')
  const [responsableNombre, setResponsableNombre] = useState('')
  const [responsableCargo, setResponsableCargo] = useState('')

  // Común
  const [cuil, setCuil] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [telefonoAlt, setTelefonoAlt] = useState('')

  // Domicilio
  const [calle, setCalle] = useState('')
  const [altura, setAltura] = useState('')
  const [barrio, setBarrio] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [provincia, setProvincia] = useState('Tucuman')
  const [codigoPostal, setCodigoPostal] = useState('4000')

  // Claves
  const [claveArca, setClaveArca] = useState('')
  const [showClaveArca, setShowClaveArca] = useState(false)

  const [notas, setNotas] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const hasFisicaData = dni.trim().length > 0 || nombre.trim().length > 0 || apellido.trim().length > 0
  const hasJuridicaData = razonSocial.trim().length > 0
  const isDirty = !submitted && (hasFisicaData || hasJuridicaData)

  const blocker = useBlocker(isDirty)
  const proceedingRef = useRef(false)

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const isValid =
    tipoPersona === 'fisica'
      ? dni.trim().length >= 7 && nombre.trim().length > 0 && apellido.trim().length > 0
      : razonSocial.trim().length > 0

  const handleSubmit = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      setSubmitted(true)
      const domicilio = [calle.trim(), altura.trim(), barrio.trim()].filter(Boolean).join(', ') || null
      const result = await createCliente.mutateAsync({
        tipo_persona: tipoPersona,
        ...(tipoPersona === 'fisica'
          ? {
              dni: dni.trim(),
              nombre: nombre.trim(),
              apellido: apellido.trim(),
              fecha_nacimiento: fechaNacimiento || null,
            }
          : {
              razon_social: razonSocial.trim(),
              responsable_nombre: responsableNombre.trim() || null,
              responsable_cargo: responsableCargo.trim() || null,
              // nombre/apellido vacíos para jurídica
              nombre: null,
              apellido: null,
              dni: null,
            }),
        cuil: cuil.trim() || null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        telefono_alt: telefonoAlt.trim() || null,
        domicilio,
        localidad: localidad.trim() || null,
        provincia: provincia || null,
        notas: notas.trim() || null,
        created_by: profile?.id ?? '',
      } as never)
      toast.success('Cliente creado correctamente')
      navigate(`/clientes/${result.id}`)
    } catch {
      setSubmitted(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex items-center gap-1 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <PageHeader
          title="Nuevo Cliente"
          subtitle="Completá los datos del nuevo cliente del estudio."
        />
      </div>

      <div className="app-card p-5 sm:p-6">
        <div className="space-y-6">

          {/* ── Toggle tipo de persona ──────────────────────────────────── */}
          <div>
            <p className={sectionClass}>Tipo de cliente</p>
            <div className="segmented" role="group" aria-label="Tipo de cliente">
              <button
                type="button"
                onClick={() => setTipoPersona('fisica')}
                aria-pressed={tipoPersona === 'fisica'}
                className="px-3 py-2 text-[13px] font-semibold"
              >
                <User className="h-4 w-4" />
                Persona física
              </button>
              <button
                type="button"
                onClick={() => setTipoPersona('juridica')}
                aria-pressed={tipoPersona === 'juridica'}
                className="px-3 py-2 text-[13px] font-semibold"
              >
                <Building2 className="h-4 w-4" />
                Persona jurídica
              </button>
            </div>
          </div>

          {/* ── Datos principales ──────────────────────────────────────── */}
          {tipoPersona === 'fisica' ? (
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
                    onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    inputMode="numeric"
                    maxLength={8}
                    className={`${inputClass} ${touched && (dni.trim().length < 7) ? 'border-rose-500/50' : ''}`}
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
                      if (data.nombre && !apellido.trim() && !nombre.trim()) {
                        const parts = data.nombre.split(' ')
                        if (parts.length >= 2) {
                          setApellido(parts[0])
                          setNombre(parts.slice(1).join(' '))
                        }
                      }
                      if (data.domicilio) {
                        if (data.domicilio.direccion && !calle.trim()) setCalle(data.domicilio.direccion)
                        if (data.domicilio.localidad && !localidad.trim()) setLocalidad(data.domicilio.localidad)
                        if (data.domicilio.provincia && !provincia) setProvincia(data.domicilio.provincia)
                        if (data.domicilio.codigoPostal && !codigoPostal.trim()) setCodigoPostal(data.domicilio.codigoPostal)
                      }
                    }}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fecha de nacimiento</label>
                  <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Estado civil</label>
                  <select value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} className={inputClass}>
                    <option value="">-</option>
                    {ESTADO_CIVIL_VALUES.map((ec) => (
                      <option key={ec} value={ec}>{ESTADO_CIVIL_LABELS[ec]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Ocupación</label>
                  <select value={ocupacion} onChange={(e) => setOcupacion(e.target.value)} className={inputClass}>
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
                  <input value={obraSocial} onChange={(e) => setObraSocial(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className={sectionClass}>Datos de la persona jurídica</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Razón social *</label>
                  <input
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder="Ej: Empresa S.A., Cooperativa de Trabajo…"
                    className={`${inputClass} ${touched && !razonSocial.trim() ? 'border-rose-500/50' : ''}`}
                  />
                  {touched && !razonSocial.trim() && <p className={errorClass}>Obligatorio</p>}
                </div>
                <div>
                  <label className={labelClass}>CUIT</label>
                  <CuilInput
                    value={cuil}
                    onChange={setCuil}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nombre del responsable</label>
                  <input
                    value={responsableNombre}
                    onChange={(e) => setResponsableNombre(e.target.value)}
                    placeholder="Apoderado, gerente…"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cargo del responsable</label>
                  <input
                    value={responsableCargo}
                    onChange={(e) => setResponsableCargo(e.target.value)}
                    placeholder="Ej: Gerente General, Apoderado"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Contacto ───────────────────────────────────────────────── */}
          <div>
            <p className={sectionClass}>Contacto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Teléfono alternativo</label>
                <input value={telefonoAlt} onChange={(e) => setTelefonoAlt(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* ── Domicilio ──────────────────────────────────────────────── */}
          <div>
            <p className={sectionClass}>Domicilio {tipoPersona === 'juridica' ? 'legal' : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Calle</label>
                <input value={calle} onChange={(e) => setCalle(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Altura</label>
                <input value={altura} onChange={(e) => setAltura(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Barrio</label>
                <input value={barrio} onChange={(e) => setBarrio(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Localidad</label>
                <input value={localidad} onChange={(e) => setLocalidad(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Provincia</label>
                <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className={inputClass}>
                  <option value="">-</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Código postal</label>
                <input value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* ── Claves ─────────────────────────────────────────────────── */}
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                    tabIndex={-1}
                  >
                    {showClaveArca ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Notas ──────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Notas internas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="field resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-white/[0.08]">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createCliente.isPending}
            className="btn btn-primary px-5"
          >
            {createCliente.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Crear cliente
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => { if (!proceedingRef.current) blocker.reset?.() }}
        onConfirm={() => { proceedingRef.current = true; blocker.proceed?.() }}
        title="¿Descartar cambios?"
        description="Tenés cambios sin guardar en este formulario. Si salís ahora, se perderán."
        confirmLabel="Salir sin guardar"
        variant="danger"
      />
    </div>
  )
}
