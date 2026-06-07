import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export const TIPOS_CONTACTO = [
  { value: 'juez', label: 'Juez/a' },
  { value: 'perito', label: 'Perito' },
  { value: 'abogado_contraparte', label: 'Abogado/a contraparte' },
  { value: 'secretario', label: 'Secretario/a' },
  { value: 'mediador', label: 'Mediador/a' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'defensor', label: 'Defensor/a' },
  { value: 'otro', label: 'Otro' },
] as const

export type TipoContacto = typeof TIPOS_CONTACTO[number]['value']
export type ScopeContacto = 'personal' | 'compartido' | 'universal'

export interface ContactoProfesional {
  id: string
  tipo: TipoContacto
  nombre: string
  nombre_normalizado: string
  alias_normalizados: string[]
  dni: string | null
  matricula: string | null
  organismo_id: string | null
  telefono: string | null
  telefono_alt: string | null
  email: string | null
  domicilio: string | null
  especialidad: string | null
  observaciones: string | null
  scope: ScopeContacto
  owner_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PersonaSinContacto {
  nombre_normalizado: string
  nombre_display: string
  apariciones: number
  fuentes: string[]
  ultima_aparicion: string | null
}

export interface ContactoAudiencia {
  transcript_id: string
  expediente_id: string
  expediente_caratula: string | null
  expediente_numero: string | null
  fecha: string | null
  audio_filename: string | null
  resumen: string | null
}

export interface ContactoAprendizaje {
  id: string
  target_kind: string
  contenido: string
  confidence: string
  observed_in_cases: number
  created_at: string
  expediente_id: string | null
}

export interface ContactoDetalle360 {
  contacto: ContactoProfesional & { organismo_nombre: string | null }
  audiencias: ContactoAudiencia[]
  aprendizajes: ContactoAprendizaje[]
  stats: {
    audiencias_count: number
    aprendizajes_count: number
    expedientes_count: number
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useContactosProfesionales(filtros: { tipo?: TipoContacto | null } = {}) {
  const supabase = createClient()
  return useQuery<ContactoProfesional[]>({
    queryKey: ['contactos-profesionales', filtros.tipo ?? 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from as any)('contactos_profesionales')
        .select('*')
        .is('deleted_at', null)
        .order('nombre', { ascending: true })
      if (filtros.tipo) q = q.eq('tipo', filtros.tipo)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ContactoProfesional[]
    },
  })
}

export function useContactoDetalle360(contactoId: string | undefined) {
  const supabase = createClient()
  return useQuery<ContactoDetalle360>({
    queryKey: ['contacto-360', contactoId],
    enabled: Boolean(contactoId),
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('contacto_detalle_360', { p_contacto_id: contactoId })
      if (error) throw error
      return data as ContactoDetalle360
    },
  })
}

export function usePersonasSinContacto(minApariciones = 3) {
  const supabase = createClient()
  return useQuery<PersonaSinContacto[]>({
    queryKey: ['personas-sin-contacto', minApariciones],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('personas_sin_contacto', {
        p_min_apariciones: minApariciones,
        p_limit: 30,
      })
      if (error) throw error
      return (data ?? []) as PersonaSinContacto[]
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateContacto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tipo: TipoContacto
      nombre: string
      alias?: string[]
      dni?: string | null
      matricula?: string | null
      organismo_id?: string | null
      telefono?: string | null
      email?: string | null
      especialidad?: string | null
      observaciones?: string | null
      scope?: ScopeContacto
      owner_id: string
    }) => {
      const payload = {
        tipo: input.tipo,
        nombre: input.nombre,
        nombre_normalizado: '', // se rellena por trigger
        alias_normalizados: input.alias ?? [],
        dni: input.dni ?? null,
        matricula: input.matricula ?? null,
        organismo_id: input.organismo_id ?? null,
        telefono: input.telefono ?? null,
        email: input.email ?? null,
        especialidad: input.especialidad ?? null,
        observaciones: input.observaciones ?? null,
        scope: input.scope ?? 'personal',
        owner_id: input.owner_id,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('contactos_profesionales')
        .insert(payload).select().single()
      if (error) throw error
      return data as ContactoProfesional
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contactos-profesionales'] })
      qc.invalidateQueries({ queryKey: ['personas-sin-contacto'] })
    },
  })
}

export function useUpdateContacto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...changes }: { id: string } & Partial<ContactoProfesional>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('contactos_profesionales')
        .update(changes).eq('id', id).select().single()
      if (error) throw error
      return data as ContactoProfesional
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['contactos-profesionales'] })
      qc.invalidateQueries({ queryKey: ['contacto-360', variables.id] })
    },
  })
}

export function useDeleteContacto() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('contactos_profesionales')
        .update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contactos-profesionales'] })
      qc.invalidateQueries({ queryKey: ['personas-sin-contacto'] })
    },
  })
}
