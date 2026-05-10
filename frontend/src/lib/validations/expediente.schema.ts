import { z } from 'zod'
import { ESTADO_INTERNO_VALUES, PRIORIDAD_VALUES, FUERO_VALUES } from '@/types/enums'

export const expedienteCreateSchema = z.object({
  caratula: z.string().min(1, 'La carátula es obligatoria').max(300),

  cliente_id: z.string().min(1, 'Debe seleccionar un cliente'),

  tipo_tramite_id: z
    .union([z.literal(''), z.string().uuid()])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),

  organismo_id: z
    .union([z.literal(''), z.string().uuid()])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),

  fuero: z
    .enum(FUERO_VALUES as [string, ...string[]])
    .optional()
    .nullable(),

  estado_interno: z
    .enum(ESTADO_INTERNO_VALUES as [string, ...string[]])
    .default('NUEVA_CONSULTA'),

  prioridad: z
    .enum(PRIORIDAD_VALUES as [string, ...string[]])
    .default('MEDIA'),

  numero_sae: z
    .union([z.literal(''), z.string().max(100)])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),

  fecha_inicio_proceso: z
    .union([z.literal(''), z.string().date()])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),

  observaciones: z
    .union([z.literal(''), z.string().max(5000)])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),
})

export const expedienteUpdateSchema = expedienteCreateSchema.partial().extend({
  fecha_cierre: z
    .union([z.literal(''), z.string().date()])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),
})

export const estadoChangeSchema = z.object({
  estado_nuevo: z.enum(ESTADO_INTERNO_VALUES as [string, ...string[]], {
    message: 'Debe seleccionar un estado',
  }),
  motivo: z
    .union([z.literal(''), z.string().max(500)])
    .optional()
    .transform((val) => (val === '' ? null : val ?? null)),
})

export type ExpedienteCreateValues = z.input<typeof expedienteCreateSchema>
export type ExpedienteCreatePayload = z.output<typeof expedienteCreateSchema>
export type ExpedienteUpdateValues = z.input<typeof expedienteUpdateSchema>
export type ExpedienteUpdatePayload = z.output<typeof expedienteUpdateSchema>
export type EstadoChangeValues = z.input<typeof estadoChangeSchema>
export type EstadoChangePayload = z.output<typeof estadoChangeSchema>
