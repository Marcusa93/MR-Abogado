import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Documentación requerida por caso (migración 20261011193612).
// Tablas aún no incluidas en database.types.ts.

export type EstadoDoc = 'pendiente' | 'recibido' | 'no_aplica'

export interface DocumentoRequerido {
  id: string
  expediente_id: string | null
  consulta_id: string | null
  nombre: string
  descripcion: string | null
  obligatorio: boolean
  estado: EstadoDoc
  adjunto_id: string | null
  fuente: 'estudio' | 'cliente' | null
  recibido_at: string | null
  orden: number
  adjunto: { id: string; storage_path: string; nombre_archivo: string } | null
}

export interface PlantillaDoc {
  id: string
  nombre: string
  descripcion: string | null
  items: { nombre: string; descripcion?: string | null; obligatorio?: boolean }[]
}

export interface EnlaceDoc {
  token: string
  expires_at: string
  ultimo_uso_at: string | null
  subidas: number
}

export type CasoDoc = { expedienteId: string; consultaId?: undefined } | { consultaId: string; expedienteId?: undefined }

export const documentacionKeys = {
  lista: (caso: CasoDoc) => ['documentacion', 'lista', caso.expedienteId ?? caso.consultaId] as const,
  enlace: (caso: CasoDoc) => ['documentacion', 'enlace', caso.expedienteId ?? caso.consultaId] as const,
  plantillas: ['documentacion', 'plantillas'] as const,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => createClient() as any

function filtrar<T>(q: T & { eq: (c: string, v: string) => T }, caso: CasoDoc): T {
  return caso.expedienteId ? q.eq('expediente_id', caso.expedienteId) : q.eq('consulta_id', caso.consultaId!)
}

export function useDocumentosRequeridos(caso: CasoDoc) {
  return useQuery({
    queryKey: documentacionKeys.lista(caso),
    queryFn: async () => {
      const q = sb().from('documentos_requeridos')
        .select('*, adjunto:adjuntos(id, storage_path, nombre_archivo)')
        .order('orden', { ascending: true }).order('created_at', { ascending: true })
      const { data, error } = await filtrar(q, caso)
      if (error) throw error
      return (data ?? []) as DocumentoRequerido[]
    },
  })
}

export function usePlantillasDoc() {
  return useQuery({
    queryKey: documentacionKeys.plantillas,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().from('documentacion_plantillas')
        .select('id, nombre, descripcion, items').eq('activo', true).order('nombre')
      if (error) throw error
      return (data ?? []) as PlantillaDoc[]
    },
  })
}

function useInvalidar(caso: CasoDoc) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: documentacionKeys.lista(caso) })
    qc.invalidateQueries({ queryKey: ['adjuntos'] })
  }
}

/** Agrega documentos (uno o los de una plantilla), salteando los que ya están. */
export function useAgregarDocumentos(caso: CasoDoc) {
  const invalidar = useInvalidar(caso)
  return useMutation({
    mutationFn: async ({ items, existentes }: {
      items: { nombre: string; descripcion?: string | null; obligatorio?: boolean }[]
      existentes: DocumentoRequerido[]
    }) => {
      const ya = new Set(existentes.map((d) => d.nombre.trim().toLowerCase()))
      const base = existentes.reduce((m, d) => Math.max(m, d.orden), 0)
      const filas = items
        .filter((i) => i.nombre.trim() && !ya.has(i.nombre.trim().toLowerCase()))
        .map((i, n) => ({
          expediente_id: caso.expedienteId ?? null,
          consulta_id: caso.consultaId ?? null,
          nombre: i.nombre.trim(),
          descripcion: i.descripcion ?? null,
          obligatorio: i.obligatorio ?? true,
          orden: base + n + 1,
        }))
      if (filas.length === 0) return 0
      const { error } = await sb().from('documentos_requeridos').insert(filas)
      if (error) throw error
      return filas.length
    },
    onSuccess: invalidar,
  })
}

export function useCambiarEstadoDoc(caso: CasoDoc) {
  const invalidar = useInvalidar(caso)
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoDoc }) => {
      const ahora = new Date().toISOString()
      const cambios: Record<string, unknown> = { estado, updated_at: ahora }
      if (estado === 'recibido') { cambios.recibido_at = ahora; cambios.fuente = 'estudio' }
      if (estado === 'pendiente') { cambios.recibido_at = null; cambios.fuente = null }
      const { error } = await sb().from('documentos_requeridos').update(cambios).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useEliminarDoc(caso: CasoDoc) {
  const invalidar = useInvalidar(caso)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from('documentos_requeridos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useGuardarComoPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nombre, docs }: { nombre: string; docs: DocumentoRequerido[] }) => {
      const items = docs.map((d) => ({ nombre: d.nombre, descripcion: d.descripcion, obligatorio: d.obligatorio }))
      const { error } = await sb().from('documentacion_plantillas')
        .upsert({ nombre: nombre.trim(), items, activo: true, updated_at: new Date().toISOString() }, { onConflict: 'nombre' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentacionKeys.plantillas }),
  })
}

/** Enlace vigente del caso (no crea uno nuevo). */
export function useEnlaceDoc(caso: CasoDoc) {
  return useQuery({
    queryKey: documentacionKeys.enlace(caso),
    queryFn: async () => {
      const q = sb().from('documentacion_enlaces')
        .select('token, expires_at, ultimo_uso_at, subidas')
        .is('revocado_at', null).gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false }).limit(1)
      const { data, error } = await filtrar(q, caso)
      if (error) throw error
      return ((data ?? [])[0] ?? null) as EnlaceDoc | null
    },
  })
}

export function useCrearEnlaceDoc(caso: CasoDoc) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb().rpc('documentacion_enlace', {
        p_expediente_id: caso.expedienteId ?? null,
        p_consulta_id: caso.consultaId ?? null,
      })
      if (error) throw error
      const fila = (Array.isArray(data) ? data[0] : data) as { token: string; expires_at: string }
      return fila
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentacionKeys.enlace(caso) }),
  })
}

export function useRevocarEnlaceDoc(caso: CasoDoc) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb().rpc('documentacion_enlace_revocar', {
        p_expediente_id: caso.expedienteId ?? null,
        p_consulta_id: caso.consultaId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentacionKeys.enlace(caso) }),
  })
}

export async function abrirAdjunto(storagePath: string) {
  const { data, error } = await createClient().storage.from('adjuntos').createSignedUrl(storagePath, 300)
  if (error || !data?.signedUrl) throw new Error('No se pudo abrir el archivo')
  window.open(data.signedUrl, '_blank', 'noopener')
}

export const urlEnlace = (token: string) => `${window.location.origin}/subir/${token}`
