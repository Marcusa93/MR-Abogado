import { z } from 'zod'
import { isValidCuil } from '@/lib/utils/cuil-validator'

const cuilSchema = z
  .string()
  .regex(/^\d{2}-\d{8}-\d$/, 'El CUIL/CUIT debe tener el formato XX-XXXXXXXX-X')
  .refine(isValidCuil, {
    message: 'El CUIL/CUIT ingresado no es válido (dígito verificador incorrecto)',
  })

export const clienteSchema = z
  .object({
    tipo_persona: z.enum(['fisica', 'juridica']).default('fisica'),

    // Persona física
    dni: z
      .union([z.literal(''), z.string().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos')])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    nombre: z
      .union([z.literal(''), z.string().min(2).max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    apellido: z
      .union([z.literal(''), z.string().min(2).max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    fecha_nacimiento: z
      .union([z.literal(''), z.string().date()])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    estado_civil: z
      .union([z.literal(''), z.string()])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    ocupacion: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    obra_social: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    // Persona jurídica
    razon_social: z
      .union([z.literal(''), z.string().min(2).max(200)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    responsable_nombre: z
      .union([z.literal(''), z.string().max(200)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    responsable_cargo: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    // Común
    cuil: z
      .union([z.literal(''), cuilSchema])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    email: z
      .union([z.literal(''), z.string().email('El email no es válido')])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    telefono: z
      .union([z.literal(''), z.string().min(6).max(20)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    telefono_alternativo: z
      .union([z.literal(''), z.string().max(20)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    calle: z
      .union([z.literal(''), z.string().max(200)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    altura: z
      .union([z.literal(''), z.string().max(20)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    barrio: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    localidad: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    provincia: z
      .union([z.literal(''), z.string()])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    codigo_postal: z
      .union([z.literal(''), z.string().max(10)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    clave_arca: z
      .union([z.literal(''), z.string().max(100)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),

    notas: z
      .union([z.literal(''), z.string().max(2000)])
      .optional()
      .transform((val) => (val === '' ? undefined : val || undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.tipo_persona === 'fisica') {
      if (!data.nombre?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['nombre'], message: 'El nombre es obligatorio' })
      }
      if (!data.apellido?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['apellido'], message: 'El apellido es obligatorio' })
      }
      if (!data.dni?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['dni'], message: 'El DNI es obligatorio' })
      }
    } else {
      if (!data.razon_social?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['razon_social'], message: 'La razón social es obligatoria' })
      }
      if (!data.cuil?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['cuil'], message: 'El CUIT es obligatorio para persona jurídica' })
      }
    }
  })

export type ClienteFormValues = z.input<typeof clienteSchema>
export type ClientePayload = z.output<typeof clienteSchema>
