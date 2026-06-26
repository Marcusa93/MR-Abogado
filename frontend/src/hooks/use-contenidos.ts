import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export const CATEGORIAS_CONTENIDO = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'email_cliente', label: 'Email a cliente' },
  { value: 'whatsapp_difusion', label: 'WhatsApp difusión' },
  { value: 'blog', label: 'Blog' },
  { value: 'video_guion', label: 'Guion video' },
  { value: 'otro', label: 'Otro' },
] as const

export const ESTADOS_CONTENIDO = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'archivado', label: 'Archivado' },
] as const

export type CategoriaContenido = typeof CATEGORIAS_CONTENIDO[number]['value']
export type EstadoContenido = typeof ESTADOS_CONTENIDO[number]['value']

export interface Contenido {
  id: string
  titulo: string
  categoria: CategoriaContenido
  estado: EstadoContenido
  cuerpo: string | null
  notas_internas: string | null
  hashtags: string | null
  enlace_referencia: string | null
  publicar_el: string | null
  publicado_at: string | null
  publicado_url: string | null
  created_by: string
  asignado_a: string | null
  created_at: string
  updated_at: string
}

export interface ContenidoFiltros {
  categoria?: CategoriaContenido | null
  estado?: EstadoContenido | null
}

export function useContenidos(filtros: ContenidoFiltros = {}) {
  const supabase = createClient()
  return useQuery<Contenido[]>({
    queryKey: ['contenidos', filtros.categoria ?? 'all', filtros.estado ?? 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from as any)('contenidos').select('*').is('deleted_at', null).order('updated_at', { ascending: false })
      if (filtros.categoria) q = q.eq('categoria', filtros.categoria)
      if (filtros.estado) q = q.eq('estado', filtros.estado)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Contenido[]
    },
  })
}

export function useCreateContenido() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      titulo: string
      categoria: CategoriaContenido
      cuerpo?: string | null
      hashtags?: string | null
      publicar_el?: string | null
      created_by: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('contenidos')
        .insert({
          ...input,
          estado: 'borrador',
        })
        .select()
        .single()
      if (error) throw error
      return data as Contenido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contenidos'] })
      qc.invalidateQueries({ queryKey: ['hoy-en-el-estudio'] })
    },
  })
}

async function fnErr(error: unknown): Promise<Error> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    const b = await ctx.json().catch(() => null)
    if (b?.error) return new Error(b.error)
  }
  return error instanceof Error ? error : new Error('Error desconocido')
}

// Sube un video, le extrae audio, transcribe y genera tarjetas por plataforma.
export function useGenerarContenidoDesdeVideo() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, driveFileId, contexto, onStage }: {
      file?: File
      driveFileId?: string
      contexto?: string
      onStage?: (s: string) => void
    }): Promise<{ created: number }> => {
      if (driveFileId) {
        onStage?.('Procesando desde Drive: audio → transcripción → IA…')
        const { data: proc, error } = await supabase.functions.invoke('contenido-desde-video', {
          body: { action: 'process', drive_file_id: driveFileId, contexto: contexto || undefined },
        })
        if (error) throw await fnErr(error)
        if ((proc as { error?: string })?.error) throw new Error((proc as { error: string }).error)
        return proc as { created: number }
      }
      if (!file) throw new Error('Falta el archivo de video')
      onStage?.('Preparando subida…')
      const { data: init, error: e1 } = await supabase.functions.invoke('contenido-desde-video', {
        body: { action: 'init', filename: file.name },
      })
      if (e1) throw await fnErr(e1)
      if ((init as { error?: string })?.error) throw new Error((init as { error: string }).error)
      const { path, token } = init as { path: string; token: string }

      onStage?.('Subiendo video…')
      const up = await supabase.storage.from('contenidos-media').uploadToSignedUrl(path, token, file)
      if (up.error) throw new Error(`Subida falló: ${up.error.message}`)

      onStage?.('Procesando: audio → transcripción → IA…')
      const { data: proc, error: e3 } = await supabase.functions.invoke('contenido-desde-video', {
        body: { action: 'process', path, contexto: contexto || undefined },
      })
      if (e3) throw await fnErr(e3)
      if ((proc as { error?: string })?.error) throw new Error((proc as { error: string }).error)
      return proc as { created: number }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contenidos'] }) },
  })
}

export function useUpdateContenido() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...changes }: { id: string } & Partial<Contenido>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('contenidos').update(changes).eq('id', id).select().single()
      if (error) throw error
      return data as Contenido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contenidos'] })
      qc.invalidateQueries({ queryKey: ['hoy-en-el-estudio'] })
    },
  })
}

export function useDeleteContenido() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)('contenidos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contenidos'] })
      qc.invalidateQueries({ queryKey: ['hoy-en-el-estudio'] })
    },
  })
}
