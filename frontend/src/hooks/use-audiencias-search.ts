import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// useSearchAudiencias — búsqueda semántica cross-audiencias
// ---------------------------------------------------------------------------

export interface AudienciaSearchSnippet {
  chunk_index: number
  content: string
  score: number
}

export interface AudienciaSearchHit {
  transcript_id: string
  expediente_id: string
  expediente_caratula: string | null
  expediente_numero: string | null
  transcript_at: string | null
  audio_filename: string | null
  top_score: number
  snippets: AudienciaSearchSnippet[]
}

export function useSearchAudiencias(query: string, expedienteId?: string) {
  const supabase = createClient()
  const enabled = query.trim().length >= 3

  return useQuery<AudienciaSearchHit[]>({
    queryKey: ['audiencias-search', query.trim().toLowerCase(), expedienteId ?? 'all'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('audiencias-transcripts-search', {
        body: { query: query.trim(), expediente_id: expedienteId },
      })
      if (error) throw new Error(error.message || 'Error al buscar')
      if (data?.error) throw new Error(data.error)
      return (data?.results ?? []) as AudienciaSearchHit[]
    },
  })
}

// ---------------------------------------------------------------------------
// usePersonasRecurrentes — agregación de partes_presentes
// ---------------------------------------------------------------------------

export interface PersonaRecurrente {
  nombre_normalizado: string
  nombre_display: string
  apariciones: number
  transcript_ids: string[]
  expediente_ids: string[]
  ultima_aparicion: string | null
}

export function usePersonasRecurrentes(minApariciones = 1) {
  const supabase = createClient()

  return useQuery<PersonaRecurrente[]>({
    queryKey: ['personas-recurrentes', minApariciones],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC nueva — types/database.types.ts aún no regenerado, cast explícito
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('audiencias_personas_recurrentes', {
        min_apariciones: minApariciones,
        limit_personas: 200,
      })
      if (error) throw error
      return (data ?? []) as PersonaRecurrente[]
    },
  })
}

// ---------------------------------------------------------------------------
// useReingestTranscript — botón manual para reingestar un transcript específico
// ---------------------------------------------------------------------------

export function useReingestTranscript() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (transcriptId: string) => {
      const { data, error } = await supabase.functions.invoke('audiencias-transcripts-ingest', {
        body: { transcript_id: transcriptId },
      })
      if (error) throw new Error(error.message || 'Error al ingestar')
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; chunks_created: number; transcript_id: string }
    },
  })
}
