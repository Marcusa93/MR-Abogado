import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface EscritoSeccion {
  titulo: string
  parrafos: string[]
}

export interface EscritoContenido {
  titulo: string
  encabezado_juez: string
  caratula: string
  secciones: EscritoSeccion[]
}

export interface Escrito {
  id: string
  expediente_id: string
  user_id: string
  template_id: string | null
  titulo: string
  tipo: string
  estado: 'borrador' | 'final' | 'firmado' | 'presentado_sae' | 'presentado'
  contenido: EscritoContenido
  contexto_movement_ids: string[]
  instrucciones_usuario: string | null
  registro_tonal: 'retorico' | 'procesal' | null
  modelo_ia: string | null
  pdf_firmado_path: string | null
  pdf_firmado_at: string | null
  firmante_cn: string | null
  presentado_sae_at: string | null
  presentacion_sae: {
    nro_comprobante: string | null
    categoria: string
    descripcion: string
    presenta_documentacion: boolean
    oficina?: string | null
    fuero?: string
    submit_url?: string
  } | null
  created_at: string
  updated_at: string
}

async function extractFnError(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json()
        if (body?.error) return new Error(body.error)
      } catch { /* not JSON */ }
    }
  }
  return error instanceof Error ? error : new Error('Error desconocido')
}

// ─── Lista de escritos por expediente ────────────────────────────────────────

export function useEscritos(expedienteId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['escritos', expedienteId],
    enabled: !!expedienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escritos' as never)
        .select('*')
        .eq('expediente_id', expedienteId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Escrito[]
    },
  })
}

// ─── Tipos usados previamente por este usuario (para autocomplete) ───────────

export function useEscritoTiposPrevios() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['escrito-tipos-previos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escritos' as never)
        .select('tipo')
        .limit(200)
      if (error) throw error
      const set = new Set<string>()
      for (const row of (data ?? []) as { tipo: string }[]) {
        if (row.tipo) set.add(row.tipo)
      }
      return Array.from(set).sort()
    },
  })
}

// ─── Generar escrito (invoca edge function) ──────────────────────────────────

interface GenerateInput {
  expediente_id: string
  tipo: string
  titulo?: string
  instrucciones?: string
  template_id?: string | null
}

interface GenerateResult {
  escrito_id: string
  contenido: EscritoContenido
  modelo: string
  registro_tonal: 'retorico' | 'procesal'
  claves_usadas: number
}

export function useGenerateEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateInput): Promise<GenerateResult> => {
      const { data, error } = await supabase.functions.invoke('escritos-generate', {
        body: input,
      })
      if (error) throw await extractFnError(error)
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as GenerateResult
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escrito-tipos-previos'] })
    },
  })
}

// ─── Update / Delete ─────────────────────────────────────────────────────────

export function useUpdateEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      expediente_id: string
      patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>
    }) => {
      const { error } = await supabase
        .from('escritos' as never)
        .update(input.patch as never)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
    },
  })
}

export function useDeleteEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; expediente_id: string }) => {
      const { error } = await supabase
        .from('escritos' as never)
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
    },
  })
}

// ─── Adjuntar PDF firmado ───────────────────────────────────────────────────

export function useAttachSignedPdf() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { escrito_id: string; expediente_id: string; file: File }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      if (input.file.type !== 'application/pdf') throw new Error('El archivo debe ser PDF')
      if (input.file.size > 7864320) throw new Error('El PDF excede el límite de 7.5 MB del portal del SAE')

      const path = `${user.id}/${input.escrito_id}.pdf`
      const { error: upErr } = await supabase
        .storage.from('escritos-firmados')
        .upload(path, input.file, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr

      // Best-effort: detectar firma embebida buscando el dictionary /Sig en el PDF.
      // No es validación criptográfica, solo señal de que hay algo firmado adentro.
      const head = await input.file.slice(0, Math.min(input.file.size, 5_000_000)).text().catch(() => '')
      const tail = await input.file.slice(Math.max(0, input.file.size - 200_000)).text().catch(() => '')
      const hasSignature = /\/Type\s*\/Sig\b|\/SubFilter\s*\/(adbe\.pkcs7|ETSI\.CAdES)/i.test(head + tail)

      const { error: updErr } = await supabase
        .from('escritos' as never)
        .update({
          estado: 'firmado',
          pdf_firmado_path: path,
          pdf_firmado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', input.escrito_id)
      if (updErr) throw updErr

      return { hasSignature }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
    },
  })
}

// ─── Presentar al portal del SAE ────────────────────────────────────────────

export interface PresentarPayload {
  escrito_id: string
  expediente_id: string
  categoria: string
  descripcion: string
  presenta_documentacion: boolean
}

export interface PresentarResult {
  ok: boolean
  escrito_id?: string
  nro_comprobante?: string | null
  presentacion?: Record<string, unknown>
}

export function usePresentarEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PresentarPayload): Promise<PresentarResult> => {
      const { data, error } = await supabase.functions.invoke('escritos-presentar', {
        body: {
          escrito_id: input.escrito_id,
          categoria: input.categoria,
          descripcion: input.descripcion,
          presenta_documentacion: input.presenta_documentacion,
        },
      })
      if (error) throw await extractFnError(error)
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo presentar')
      return data as PresentarResult
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
    },
  })
}

// Dry-run: trae categorías reales del portal sin presentar nada.
export interface PortalFormInfo {
  ok: true
  dry_run: true
  categorias: { nombre: string; id: string }[]
  expediente: { caratula?: string; oficina?: string; fueroSlug: string }
}

export function useFetchPortalCategorias() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (escrito_id: string): Promise<PortalFormInfo> => {
      const { data, error } = await supabase.functions.invoke('escritos-presentar', {
        body: { escrito_id, dry_run: true },
      })
      if (error) throw await extractFnError(error)
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo conectar al portal')
      return data as PortalFormInfo
    },
  })
}
