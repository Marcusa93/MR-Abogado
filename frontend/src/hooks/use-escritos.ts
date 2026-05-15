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
  estado: 'borrador' | 'final' | 'presentado'
  contenido: EscritoContenido
  contexto_movement_ids: string[]
  instrucciones_usuario: string | null
  registro_tonal: 'retorico' | 'procesal' | null
  modelo_ia: string | null
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
