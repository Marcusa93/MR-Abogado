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
    mutationFn: async ({ file, driveFileId, contexto, plataformas, onStage }: {
      file?: File
      driveFileId?: string
      contexto?: string
      plataformas?: string[]
      onStage?: (s: string) => void
    }): Promise<{ created: number }> => {
      if (driveFileId) {
        onStage?.('Procesando desde Drive: audio → transcripción → IA…')
        const { data: proc, error } = await supabase.functions.invoke('contenido-desde-video', {
          body: { action: 'process', drive_file_id: driveFileId, contexto: contexto || undefined, plataformas },
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
        body: { action: 'process', path, contexto: contexto || undefined, plataformas },
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

// ── Guion de Reel ────────────────────────────────────────────────────────────
// Se guarda dentro de contenidos (categoria 'video_guion') con el cuerpo en JSON
// marcado {"_tipo":"guion_reel", ...}. Estos helpers lo generan y lo parsean.

export interface GuionReel {
  tema: string
  titulo: string
  duracion_estimada: string
  hooks: string[]
  escenas: { n: number; a_camara: string; visual: string; texto_pantalla: string }[]
  cierre: string
  cta: string
  notas_edicion: string
}

/** Si el contenido es un guion de Reel (JSON marcado en cuerpo), lo devuelve parseado. */
export function parseGuionReel(c: Pick<Contenido, 'cuerpo'>): GuionReel | null {
  const raw = c.cuerpo?.trim()
  if (!raw || raw[0] !== '{') return null
  try {
    const g = JSON.parse(raw) as Partial<GuionReel> & { _tipo?: string }
    if (g._tipo !== 'guion_reel') return null
    return {
      tema: g.tema ?? '',
      titulo: g.titulo ?? 'Guion de Reel',
      duracion_estimada: g.duracion_estimada ?? '',
      hooks: Array.isArray(g.hooks) ? g.hooks : [],
      escenas: Array.isArray(g.escenas) ? g.escenas : [],
      cierre: g.cierre ?? '',
      cta: g.cta ?? '',
      notas_edicion: g.notas_edicion ?? '',
    }
  } catch { return null }
}

// Genera un guion de Reel desde audio (grabado/subido), texto o URL de noticia.
export function useGenerarGuionReel() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audio, texto, url, contexto, onStage }: {
      audio?: Blob
      texto?: string
      url?: string
      contexto?: string
      onStage?: (s: string) => void
    }): Promise<{ id: string }> => {
      if (audio) {
        onStage?.('Preparando subida del audio…')
        const ext = audio.type.includes('webm') ? 'webm' : audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : 'ogg'
        const { data: init, error: e1 } = await supabase.functions.invoke('guion-reel-generar', {
          body: { action: 'init', filename: `idea.${ext}` },
        })
        if (e1) throw await fnErr(e1)
        if ((init as { error?: string })?.error) throw new Error((init as { error: string }).error)
        const { path, token } = init as { path: string; token: string }

        onStage?.('Subiendo audio…')
        const up = await supabase.storage.from('contenidos-media').uploadToSignedUrl(path, token, audio)
        if (up.error) throw new Error(`Subida falló: ${up.error.message}`)

        onStage?.('Transcribiendo y escribiendo el guion…')
        const { data: proc, error: e3 } = await supabase.functions.invoke('guion-reel-generar', {
          body: { action: 'process', path, contexto: contexto || undefined },
        })
        if (e3) throw await fnErr(e3)
        if ((proc as { error?: string })?.error) throw new Error((proc as { error: string }).error)
        return proc as { id: string }
      }

      onStage?.('Escribiendo el guion…')
      const { data: proc, error } = await supabase.functions.invoke('guion-reel-generar', {
        body: { action: 'process', texto: texto || undefined, url: url || undefined, contexto: contexto || undefined },
      })
      if (error) throw await fnErr(error)
      if ((proc as { error?: string })?.error) throw new Error((proc as { error: string }).error)
      return proc as { id: string }
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
      // El borrado va por edge function con service role: valida rol server-side
      // y bypassea RLS, evitando el 403 intermitente del PATCH directo.
      const { data, error } = await supabase.functions.invoke('contenido-eliminar', {
        body: { id },
      })
      if (error) {
        // Intentar extraer el mensaje real del cuerpo de la respuesta
        let msg = error instanceof Error ? error.message : 'No se pudo eliminar'
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any)?.context
          if (ctx && typeof ctx.json === 'function') {
            const b = await ctx.json()
            if (b?.error) msg = b.error
          }
        } catch { /* noop */ }
        throw new Error(msg)
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contenidos'] })
      qc.invalidateQueries({ queryKey: ['hoy-en-el-estudio'] })
    },
  })
}
