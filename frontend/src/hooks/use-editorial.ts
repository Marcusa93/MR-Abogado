import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

// Módulo editorial (migración 20261011223926). Solo para quien tiene
// profiles.acceso_editorial (Marco). Tablas aún no incluidas en database.types.ts.

export type TipoArticulo = 'divulgacion' | 'analisis_profesional' | 'actualidad' | 'reflexion' | 'jurisprudencial'
export type EstadoArticulo = 'investigacion' | 'borrador' | 'aprobado' | 'publicado' | 'archivado'

export const TIPO_ARTICULO_LABEL: Record<TipoArticulo, string> = {
  divulgacion: 'Divulgación jurídica',
  analisis_profesional: 'Análisis profesional',
  actualidad: 'Actualidad',
  reflexion: 'Reflexión o perspectiva',
  jurisprudencial: 'Análisis jurisprudencial',
}

export const ESTADO_ARTICULO_LABEL: Record<EstadoArticulo, string> = {
  investigacion: 'Investigación',
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
  archivado: 'Archivado',
}

export interface Propuesta {
  id: string
  origen: 'radar' | 'sentencia' | 'manual'
  estado: 'propuesta' | 'en_curso' | 'descartada'
  titulo: string
  problema: string | null
  pregunta: string | null
  fuentes: { tipo?: string; descripcion?: string }[]
  hipotesis: string | null
  relevancia: string | null
  enfoque: string | null
  actualidad: number | null
  interes: number | null
  originalidad: number | null
  riesgos: string | null
  tipo_sugerido: TipoArticulo | null
  movement_id: string | null
  expediente_id: string | null
  created_at: string
}

export interface Articulo {
  id: string
  propuesta_id: string | null
  estado: EstadoArticulo
  tipo: TipoArticulo
  titulo: string
  bajada: string | null
  cuerpo: string
  investigacion: string | null
  revision_critica: string | null
  referencias: { cita?: string; fuente?: string; verificada?: boolean }[]
  a_verificar: string[]
  alertas_confidencialidad: string[]
  adaptaciones: Partial<Record<'linkedin' | 'redes' | 'boletin', string>>
  version: number
  modelo_ia: string | null
  aprobado_at: string | null
  publicado_at: string | null
  publicado_url: string | null
  created_at: string
  updated_at: string
}

export interface Version {
  id: string
  version: number
  origen: 'ia' | 'marco'
  modo: string | null
  titulo: string
  bajada: string | null
  cuerpo: string
  created_at: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => createClient() as any

export const editorialKeys = {
  acceso: ['editorial', 'acceso'] as const,
  propuestas: ['editorial', 'propuestas'] as const,
  articulos: ['editorial', 'articulos'] as const,
  articulo: (id: string) => ['editorial', 'articulo', id] as const,
  versiones: (id: string) => ['editorial', 'versiones', id] as const,
}

export function useAccesoEditorial() {
  const profileId = useAuthStore((s) => s.profile?.id)
  return useQuery({
    queryKey: [...editorialKeys.acceso, profileId],
    enabled: !!profileId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().rpc('can_access_editorial')
      if (error) return false
      return data === true
    },
  })
}

export function usePropuestas() {
  return useQuery({
    queryKey: editorialKeys.propuestas,
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_propuestas').select('*')
        .neq('estado', 'descartada').order('created_at', { ascending: false }).limit(60)
      if (error) throw error
      return (data ?? []) as Propuesta[]
    },
  })
}

export function useArticulos() {
  return useQuery({
    queryKey: editorialKeys.articulos,
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_articulos')
        .select('id, estado, tipo, titulo, bajada, version, updated_at, aprobado_at, alertas_confidencialidad, a_verificar')
        .order('updated_at', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as Articulo[]
    },
  })
}

export function useArticulo(id: string) {
  return useQuery({
    queryKey: editorialKeys.articulo(id),
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_articulos').select('*').eq('id', id).single()
      if (error) throw error
      return data as Articulo
    },
  })
}

export function useVersiones(id: string) {
  return useQuery({
    queryKey: editorialKeys.versiones(id),
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_versiones')
        .select('*').eq('articulo_id', id).order('version', { ascending: false })
      if (error) throw error
      return (data ?? []) as Version[]
    },
  })
}

/** Llama a la IA editorial (radar, investigar, redactar, revisar, adaptar, chequeo). */
export function useEditorialIA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await createClient().functions.invoke('editorial-ia', { body })
      if (error) {
        const ctx = (error as { context?: unknown }).context
        if (ctx instanceof Response) {
          const msg = await ctx.json().then((j: { error?: string }) => j.error).catch(() => null)
          throw new Error(msg ?? error.message)
        }
        // Se cortó la conexión (red del celular, pantalla bloqueada): la IA
        // puede haber terminado igual del lado del servidor.
        throw new Error('Se cortó la conexión mientras la IA trabajaba. Si terminó, el resultado aparece en unos segundos; si no, probá de nuevo.')
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as Record<string, unknown>
    },
    // También ante error: el pedido pudo completarse aunque se cortara la respuesta
    onSettled: () => qc.invalidateQueries({ queryKey: ['editorial'] }),
  })
}

export function useActualizarPropuesta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...cambios }: { id: string } & Partial<Propuesta>) => {
      const { error } = await sb().from('editorial_propuestas').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: editorialKeys.propuestas }),
  })
}

export function useCrearPropuestaManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { titulo: string; problema: string; pregunta: string }) => {
      const { data, error } = await sb().from('editorial_propuestas')
        .insert({ origen: 'manual', titulo: p.titulo, problema: p.problema || null, pregunta: p.pregunta || null })
        .select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: editorialKeys.propuestas }),
  })
}

/** Guarda la edición de Marco como nueva versión. */
export function useGuardarArticulo(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ articulo, titulo, bajada, cuerpo, modo = 'edicion' }: {
      articulo: Articulo; titulo: string; bajada: string; cuerpo: string; modo?: string
    }) => {
      const version = articulo.version + 1
      const { error: vErr } = await sb().from('editorial_versiones').insert({
        articulo_id: id, version, origen: 'marco', modo, titulo, bajada, cuerpo,
      })
      if (vErr) throw vErr
      const { error } = await sb().from('editorial_articulos').update({
        titulo, bajada, cuerpo, version,
        estado: articulo.estado === 'investigacion' ? 'borrador' : articulo.estado,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: editorialKeys.articulo(id) })
      qc.invalidateQueries({ queryKey: editorialKeys.versiones(id) })
      qc.invalidateQueries({ queryKey: editorialKeys.articulos })
    },
  })
}

export function useCambiarEstadoArticulo(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ estado, publicado_url }: { estado: EstadoArticulo; publicado_url?: string | null }) => {
      const ahora = new Date().toISOString()
      const cambios: Record<string, unknown> = { estado, updated_at: ahora }
      if (estado === 'aprobado') cambios.aprobado_at = ahora
      if (estado === 'borrador') cambios.aprobado_at = null
      if (estado === 'publicado') { cambios.publicado_at = ahora; cambios.publicado_url = publicado_url ?? null }
      const { error } = await sb().from('editorial_articulos').update(cambios).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: editorialKeys.articulo(id) })
      qc.invalidateQueries({ queryKey: editorialKeys.articulos })
    },
  })
}

/** Manda una adaptación aprobada al módulo Contenidos como borrador. */
export function useEnviarAContenidos() {
  const profileId = useAuthStore((s) => s.profile?.id)
  return useMutation({
    mutationFn: async ({ titulo, texto, categoria }: { titulo: string; texto: string; categoria: 'linkedin' | 'instagram' | 'newsletter' }) => {
      const { error } = await sb().from('contenidos').insert({
        titulo, cuerpo: texto, categoria, estado: 'borrador', created_by: profileId,
        notas_internas: 'Adaptación de un artículo aprobado en el módulo Editorial.',
      })
      if (error) throw error
    },
  })
}
