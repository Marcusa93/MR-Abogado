import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface RubroExtracted {
  concepto: string
  monto: number | null
  moneda: 'ARS' | 'USD'
  fundamento?: string | null
}
export interface NormaExtracted { norma: string; uso?: string | null }
export interface JurisExtracted { cita: string; uso?: string | null }
export interface AiExtractedShape {
  tipo_documento?: string
  rubros_reclamados?: RubroExtracted[]
  normativa_citada?: NormaExtracted[]
  jurisprudencia_citada?: JurisExtracted[]
  resultado?: string | null
}

export interface MatchedAdjunto {
  adjunto_id: string
  tipo_documento: string | null
  ai_summary: string | null
  ai_extracted: AiExtractedShape | null
}

export interface ExpedienteSimilarHit {
  expediente_id: string
  caratula: string | null
  numero: string | null
  top_score: number
  matched_adjuntos: MatchedAdjunto[]
  snippets: { content: string; score: number }[]
}

export interface ExpedienteSimilaresResponse {
  source_summaries: string[]
  results: ExpedienteSimilarHit[]
  message?: string
}

export function useExpedienteSimilares(expedienteId: string | undefined) {
  const supabase = createClient()

  return useQuery<ExpedienteSimilaresResponse>({
    queryKey: ['expediente-similares', expedienteId],
    enabled: Boolean(expedienteId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('expediente-similares', {
        body: { expediente_id: expedienteId, limit: 5 },
      })
      if (error) throw new Error(error.message || 'Error al buscar similares')
      if (data?.error) throw new Error(data.error)
      return data as ExpedienteSimilaresResponse
    },
  })
}
