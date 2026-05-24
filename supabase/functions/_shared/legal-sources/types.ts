// ─────────────────────────────────────────────────────────────────────────
// Capa de conectores jurídicos externos
//
// Pensada para sumar nuevos sources sin tocar el resto del sistema. Hoy
// arrancamos con SAIJ; mañana podemos agregar Infoleg, CSJN, BORA, etc.
//
// Cada source implementa la interfaz LegalSource y se registra en
// _shared/legal-sources/index.ts. La edge function legal-lookup rutea
// por (source, tool) sin saber nada del proveedor.
// ─────────────────────────────────────────────────────────────────────────

export interface LegalDocSummary {
  source: string                       // 'saij' | 'infoleg' | ...
  source_doc_id: string                // UUID/GUID propio del proveedor
  tipo: string                         // 'jurisprudencia' | 'legislacion' | 'doctrina' | 'dictamen'
  titulo: string | null
  caratula: string | null
  tribunal: string | null
  jurisdiccion: string | null
  fecha: string | null                 // ISO YYYY-MM-DD si está
  resumen: string | null
  url: string | null                   // link público al doc en el proveedor
  score?: number                       // relevancia 0-1
}

export interface LegalDocFull extends LegalDocSummary {
  texto_completo: string | null
  metadata: Record<string, unknown>
}

export interface SearchInput {
  query: string                        // texto libre
  jurisdiccion?: string                // 'Nacional' | 'Federal' | 'Local' | provincia
  tribunal?: string
  materia?: string                     // 'Civil' | 'Laboral' | ...
  fecha_desde?: string                 // YYYY-MM-DD
  fecha_hasta?: string
  estado_vigencia?: string             // para legislación
  tipo?: string                        // tipo de doc específico
  limit?: number                       // default 10
  offset?: number                      // default 0
}

export interface SearchOutput {
  source: string
  total: number
  results: LegalDocSummary[]
}

export interface LegalSource {
  id: string                           // 'saij' | 'infoleg'
  label: string                        // 'SAIJ — Sistema Argentino de Información Jurídica'
  /** Búsqueda de jurisprudencia */
  searchJurisprudencia(input: SearchInput): Promise<SearchOutput>
  /** Búsqueda de legislación (leyes, decretos, etc.) */
  searchLegislacion(input: SearchInput): Promise<SearchOutput>
  /** Búsqueda de doctrina (artículos académicos) */
  searchDoctrina(input: SearchInput): Promise<SearchOutput>
  /** Devuelve el texto completo + metadata de un documento */
  getDocument(sourceDocId: string): Promise<LegalDocFull>
  /** Resuelve una cita textual a un documento concreto */
  resolveCitation(text: string): Promise<LegalDocFull | SearchOutput>
}

// TTL por tool en segundos. Datos estables = caché larga, novedades = corta.
export const CACHE_TTL: Record<string, number> = {
  searchJurisprudencia: 24 * 3600,     // 24h
  searchLegislacion:    7 * 24 * 3600, // 7 días
  searchDoctrina:       24 * 3600,
  getDocument:          7 * 24 * 3600,
  resolveCitation:      24 * 3600,
  suggestTerms:         24 * 3600,
}

// Rate limit por user (requests por minuto)
export const USER_RATE_LIMIT_PER_MIN = 20
