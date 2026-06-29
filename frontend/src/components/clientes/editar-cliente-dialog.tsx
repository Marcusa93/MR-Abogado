import { useState, useEffect } from 'react'
import { useUpdateCliente, type ClienteWithExpedientes } from '@/hooks/use-clientes'
import { toast } from '@/stores/toast-store'
import { PROVINCIAS } from '@/types/enums'
import { X, Loader2, Save, User, Building2 } from 'lucide-react'
import { CuilInput } from '@/components/shared/cuil-input'

const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15'
const labelClass = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300'
const sectionClass = 'text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3'
const errorClass = 'mt-1 text-xs text-rose-400'

type TipoPersona = 'fisica' | 'juridica'

interface Props {
  open: boolean
  onClose: () => void
  cliente: ClienteWithExpedientes
}

export function EditarClienteDialog({ open, onClose, cliente }: Props) {
  const update = useUpdateCliente()

  const [tipoPersona, setTipoPersona] = useState<TipoPersona>(
    ((cliente as any).tipo_persona as TipoPersona) ?? 'fisica',
  )

  // Persona física
  const [dni, setDni] = useState(cliente.dni ?? '')
  const [nombre, setNombre] = useState(cliente.nombre ?? '')
  const [apellido, setApellido] = useState(cliente.apellido ?? '')
  const [fechaNacimiento, setFechaNacimiento] = useState(cliente.fecha_nacimiento ?? '')

  // Persona jurídica
  const [razonSocial, setRazonSocial] = useState((cliente as any).razon_social ?? '')
  const [responsableNombre, setResponsableNombre] = useState((cliente as any).responsable_nombre ?? '')
  const [responsableCargo, setResponsableCargo] = useState((cliente as any).responsable_cargo ?? '')

  // Común
  const [cuil, setCuil] = useState(cliente.cuil ?? '')
  const [email, setEmail] = useState(cliente.email ?? '')
  const [telefono, setTelefono] = useState(cliente.telefono ?? '')
  const [telefonoAlt, setTelefonoAlt] = useState(cliente.telefono_alt ?? '')
  const [domicilio, setDomicilio] = useState(cliente.domicilio ?? '')
  const [localidad, setLocalidad] = useState(cliente.localidad ?? '')
  const [provincia, setProvincia] = useState(cliente.provincia ?? '')
  const [notas, setNotas] = useState(cliente.notas ?? '')

  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setTipoPersona(((cliente as any).tipo_persona as TipoPersona) ?? 'fisica')
      setDni(cliente.dni ?? '')
      setNombre(cliente.nombre ?? '')
      setApellido(cliente.apellido ?? '')
      setFechaNacimiento(cliente.fecha_nacimiento ?? '')
      setRazonSocial((cliente as any).razon_social ?? '')
      setResponsableNombre((cliente as any).responsable_nombre ?? '')
      setResponsableCargo((cliente as any).responsable_cargo ?? '')
      setCuil(cliente.cuil ?? '')
      setEmail(cliente.email ?? '')
      setTelefono(cliente.telefono ?? '')
      setTelefonoAlt(cliente.telefono_alt ?? '')
      setDomicilio(cliente.domicilio ?? '')
      setLocalidad(cliente.localidad ?? '')
      setProvincia(cliente.provincia ?? '')
      setNotas(cliente.notas ?? '')
      setTouched(false)
    }
  }, [open, cliente])

  const isValid =
    tipoPersona === 'fisica'
      ? dni.trim().length >= 7 && nombre.trim().length > 0 && apellido.trim().length > 0
      : razonSocial.trim().length > 0 && cuil.trim().length > 0

  const handleSubmit = async () => {
    setTouched(true)
    if (!isValid) return

    try {
      await update.mutateAsync({
        id: cliente.id,
        tipo_persona: tipoPersona,
        ...(tipoPersona === 'fisica'
          ? {
              dni: dni.trim(),
              nombre: nombre.trim(),
              apellido: apellido.trim(),
              fecha_nacimiento: fechaNacimiento || null,
              razon_social: null,
              responsable_nombre: null,
              responsable_cargo: null,
            }
          : {
              razon_social: razonSocial.trim(),
              responsable_nombre: responsableNombre.trim() || null,
              responsable_cargo: responsableCargo.trim() || null,
              nombre: null,
              apellido: null,
              dni: null,
            }),
        cuil: cuil.trim() || null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        telefono_alt: telefonoAlt.trim() || null,
        domicilio: domicilio.trim() || null,
        localidad: localidad.trim() || null,
        provincia: provincia || null,
        notas: notas.trim() || null,
      } as never)
      toast.success('Cliente actualizado correctamente')
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-zinc-900/80 border border-white/10 p-6 shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Editar cliente</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Tipo de persona */}
          <div>
            <p className={sectionClass}>Tipo de cliente</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipoPersona('fisica')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  tipoPersona === 'fisica'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-white/10'
                }`}
              >
                <User className="h-4 w-4" />
                Física
              </button>
              <button
                type="button"
                onClick={() => setTipoPersona('juridica')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  tipoPersona === 'juridica'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-white/10'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Jurídica
              </button>
            </div>
          </div>

          {/* Datos principales */}
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
                    className={`${inputClass} ${touched && dni.trim().length < 7 ? 'border-rose-500/50' : ''}`}
                  />
                  {touched && !dni.trim() && <p className={errorClass}>Obligatorio</p>}
                </div>
                <div>
                  <label className={labelClass}>CUIL</label>
                  <CuilInput value={cuil} onChange={setCuil} />
                </div>
                <div>
                  <label className={labelClass}>Fecha de nacimiento</label>
                  <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className={sectionClass}>Datos de la persona jurídica</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Razón social *</label>
                  <input
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder="Ej: Empresa S.A."
                    className={`${inputClass} ${touched && !razonSocial.trim() ? 'border-rose-500/50' : ''}`}
                  />
                  {touched && !razonSocial.trim() && <p className={errorClass}>Obligatorio</p>}
                </div>
                <div>
                  <label className={labelClass}>CUIT *</label>
                  <CuilInput value={cuil} onChange={setCuil} />
                  {touched && !cuil.trim() && <p className={errorClass}>Obligatorio</p>}
                </div>
                <div>
                  <label className={labelClass}>Nombre del responsable</label>
                  <input value={responsableNombre} onChange={(e) => setResponsableNombre(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Cargo del responsable</label>
                  <input value={responsableCargo} onChange={(e) => setResponsableCargo(e.target.value)} placeholder="Gerente, Apoderado…" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {/* Contacto */}
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
              <div className="col-span-2">
                <label className={labelClass}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Domicilio */}
          <div>
            <p className={sectionClass}>Domicilio {tipoPersona === 'juridica' ? 'legal' : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Domicilio</label>
                <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} className={inputClass} />
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
            </div>
          </div>

          {/* Notas */}
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

        <div className="mt-6 flex justify-end gap-2 border-t border-white/5 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-5 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
