import { z } from 'zod'
import { isValidCuil } from '@/lib/utils/cuil-validator'

// ---------------------------------------------------------------------------
// CUIL custom refinement
// ---------------------------------------------------------------------------

const cuilSchema = z
  .string()
  .regex(
    /^\d{2}-\d{8}-\d$/,
    'El CUIL debe tener el formato XX-XXXXXXXX-X'
  )
  .refine(isValidCuil, {
    message: 'El CUIL ingresado no es valido (digito verificador incorrecto)',
  })

// ---------------------------------------------------------------------------
// Cliente create / update schema
// ---------------------------------------------------------------------------

export const clienteSchema = z.object({
  dni: z
    .string()
    .min(1, 'El DNI es obligatorio')
    .regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 digitos'),

  cuil: z
    .union([z.literal(''), cuilSchema])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  nombre: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar los 100 caracteres'),

  apellido: z
    .string()
    .min(1, 'El apellido es obligatorio')
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(100, 'El apellido no puede superar los 100 caracteres'),

  fecha_nacimiento: z
    .union([z.literal(''), z.string().date()])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  email: z
    .union([z.literal(''), z.string().email('El email no es valido')])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  telefono: z
    .union([
      z.literal(''),
      z
        .string()
        .min(6, 'El telefono debe tener al menos 6 caracteres')
        .max(20, 'El telefono no puede superar los 20 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  telefono_alternativo: z
    .union([
      z.literal(''),
      z.string().max(20, 'El telefono no puede superar los 20 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  calle: z
    .union([
      z.literal(''),
      z.string().max(200, 'La calle no puede superar los 200 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  altura: z
    .union([
      z.literal(''),
      z.string().max(20, 'La altura no puede superar los 20 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  barrio: z
    .union([
      z.literal(''),
      z.string().max(100, 'El barrio no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  localidad: z
    .union([
      z.literal(''),
      z.string().max(100, 'La localidad no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  provincia: z
    .union([z.literal(''), z.string()])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  codigo_postal: z
    .union([
      z.literal(''),
      z.string().max(10, 'El codigo postal no puede superar los 10 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  ocupacion: z
    .union([
      z.literal(''),
      z.string().max(100, 'La ocupacion no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  estado_civil: z
    .union([z.literal(''), z.string()])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  obra_social: z
    .union([
      z.literal(''),
      z
        .string()
        .max(100, 'La obra social no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  clave_arca: z
    .union([
      z.literal(''),
      z.string().max(100, 'La clave ARCA no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  clave_anses: z
    .union([
      z.literal(''),
      z.string().max(100, 'La clave ANSES no puede superar los 100 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),

  notas: z
    .union([
      z.literal(''),
      z.string().max(2000, 'Las notas no pueden superar los 2000 caracteres'),
    ])
    .optional()
    .transform((val) => (val === '' ? undefined : val || undefined)),
})

export type ClienteFormValues = z.input<typeof clienteSchema>
export type ClientePayload = z.output<typeof clienteSchema>
