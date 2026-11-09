import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { EscritoContenido, GenerateInput } from '@/hooks/use-escritos'

const supabase = createClient()

async function fnError(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json()
        if (body?.error) return new Error(body.error)
      } catch { /* sin JSON */ }
    }
  }
  return error instanceof Error ? error : new Error('Error desconocido')
}

// ─── Perfil de redacción (estudio / abogado) ─────────────────────────────────

export interface PerfilRedaccion {
  id?: string
  ambito: 'estudio' | 'abogado'
  profile_id: string | null
  tono: string | null
  formulas: string | null
  evitar: string | null
  citas: string | null
  notas: string | null
  updated_at?: string
}

export const CAMPOS_PERFIL: { key: keyof Pick<PerfilRedaccion, 'tono' | 'formulas' | 'evitar' | 'citas' | 'notas'>; label: string; ayuda: string }[] = [
  { key: 'tono', label: 'Tono', ayuda: 'Ej.: sobrio y directo; frases cortas; sin adjetivos hostiles.' },
  { key: 'formulas', label: 'Fórmulas preferidas', ayuda: 'Ej.: "Que vengo en legal tiempo y forma a…", "Proveer de conformidad, SERÁ JUSTICIA".' },
  { key: 'evitar', label: 'Nunca hacer', ayuda: 'Ej.: no usar "en la especie"; no citar doctrina sin autor y obra.' },
  { key: 'citas', label: 'Cómo citar', ayuda: 'Ej.: CCyCN con artículo; fallos con carátula, tribunal y fecha; CPCCT abreviado.' },
  { key: 'notas', label: 'Otras indicaciones', ayuda: 'Ej.: siempre reservar el caso federal en escritos de fondo.' },
]

export function usePerfilesRedaccion() {
  const uid = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['redaccion-perfiles', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('redaccion_perfiles')
        .select('id, ambito, profile_id, tono, formulas, evitar, citas, notas, updated_at')
        .or(`ambito.eq.estudio,profile_id.eq.${uid}`)
      if (error) throw error
      const rows = (data ?? []) as PerfilRedaccion[]
      return {
        estudio: rows.find((r) => r.ambito === 'estudio') ?? null,
        abogado: rows.find((r) => r.ambito === 'abogado' && r.profile_id === uid) ?? null,
      }
    },
  })
}

export function useGuardarPerfilRedaccion() {
  const qc = useQueryClient()
  const uid = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (p: Omit<PerfilRedaccion, 'profile_id'> & { profile_id?: string | null }) => {
      const row = {
        ambito: p.ambito,
        profile_id: p.ambito === 'abogado' ? uid : null,
        tono: p.tono || null, formulas: p.formulas || null, evitar: p.evitar || null,
        citas: p.citas || null, notas: p.notas || null,
        updated_at: new Date().toISOString(), updated_by: uid,
      }
      const q = (supabase as any).from('redaccion_perfiles')
      const { error } = p.id ? await q.update(row).eq('id', p.id) : await q.insert(row)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redaccion-perfiles'] }),
  })
}

// ─── Reglas por tipo de escrito ──────────────────────────────────────────────

export interface ReglaTipo { id: string; profile_id: string | null; tipo: string; reglas: string }

export function useReglasTipo() {
  const uid = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['redaccion-reglas', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('redaccion_reglas_tipo')
        .select('id, profile_id, tipo, reglas')
        .or(`profile_id.is.null,profile_id.eq.${uid}`)
        .order('tipo')
      if (error) throw error
      return (data ?? []) as ReglaTipo[]
    },
  })
}

export function useGuardarReglaTipo() {
  const qc = useQueryClient()
  const uid = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (r: { id?: string; tipo: string; reglas: string; delEstudio: boolean }) => {
      const row = { tipo: r.tipo.trim(), reglas: r.reglas.trim(), profile_id: r.delEstudio ? null : uid, updated_at: new Date().toISOString() }
      const q = (supabase as any).from('redaccion_reglas_tipo')
      const { error } = r.id ? await q.update(row).eq('id', r.id) : await q.insert(row)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redaccion-reglas'] }),
  })
}

export function useBorrarReglaTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('redaccion_reglas_tipo').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redaccion-reglas'] }),
  })
}

// ─── Estrategia del expediente ───────────────────────────────────────────────

export function useEstrategiaExpediente(expedienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['expediente-estrategia', expedienteId],
    enabled: !!expedienteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('expedientes').select('estrategia_redaccion').eq('id', expedienteId).maybeSingle()
      if (error) throw error
      return ((data as { estrategia_redaccion?: string | null } | null)?.estrategia_redaccion ?? '') as string
    },
  })
}

export function useGuardarEstrategia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ expedienteId, texto }: { expedienteId: string; texto: string }) => {
      const { error } = await (supabase as any).from('expedientes').update({ estrategia_redaccion: texto.trim() || null }).eq('id', expedienteId)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['expediente-estrategia', v.expedienteId] }),
  })
}

// ─── Qué sabe la IA / Esquema (escritos-generate sin stream) ────────────────

export type Calidad = 'auto' | 'preciso' | 'rapido'

export interface ContextoIA {
  modelo: string
  modelo_nombre: string
  calidad: 'preciso' | 'rapido'
  motivo_modelo: string
  expediente: { caratula: string | null; fuero: string | null; tiene_brief: boolean } | null
  actuaciones_son_claves: boolean
  actuaciones: { fecha: string; tipo: string; titulo: string }[]
  novedades_estudio: number
  normativa: { chunk_id: number; titulo: string; articulo: string | null; fijada: boolean }[]
  jurisprudencia: { chunk_id: number; caratula: string; tribunal: string | null; fijada: boolean }[]
  aprendizajes: string[]
  perfil: { estudio: boolean; abogado: boolean; reglas_tipo: string[]; estrategia_expediente: boolean }
  estilo: string | null
  responde_a_providencia: boolean
  escrito_contraparte: boolean
  esquema_aprobado: boolean
  instrucciones: boolean
}

export interface Esquema {
  objetivo?: string
  argumentos?: { titulo: string; desarrollo?: string; fundamento?: string }[]
  defensas_contrarias?: { argumento: string; respuesta?: string }[]
  prueba?: string[]
  riesgos?: string[]
  datos_faltantes?: string[]
}

export type GenerateInputIA = GenerateInput & { calidad?: Calidad; esquema?: Esquema | null }

async function llamarGenerador<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/escritos-generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: false }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Error ${res.status}`)
  return data as T
}

export function useContextoIA() {
  return useMutation({
    mutationFn: async (input: GenerateInputIA) => {
      const r = await llamarGenerador<{ contexto: ContextoIA }>({ ...input, solo_contexto: true })
      return r.contexto
    },
  })
}

export function useEsquemaEscrito() {
  return useMutation({
    mutationFn: async (input: GenerateInputIA) =>
      llamarGenerador<{ esquema: Esquema; contexto: ContextoIA }>({ ...input, modo: 'esquema' }),
  })
}

// ─── Asistente sobre el borrador ─────────────────────────────────────────────

export interface CambioPropuesto {
  accion: 'reemplazar' | 'insertar_despues' | 'eliminar' | 'nueva_seccion' | 'reemplazar_seccion'
  seccion: number
  parrafo?: number | null
  titulo?: string | null
  texto?: string | null
  motivo: string
}

export interface MensajeAsistente {
  role: 'user' | 'assistant'
  content: string
  cambios?: CambioPropuesto[]
  estados?: ('pendiente' | 'aceptado' | 'rechazado')[]
  modelo?: string
}

export function useAsistenteEscrito() {
  return useMutation({
    mutationFn: async (input: {
      escrito_id: string
      contenido: EscritoContenido
      mensajes: { role: 'user' | 'assistant'; content: string }[]
      foco?: { seccion: number; parrafo?: number | null } | null
      calidad?: Calidad
    }) => {
      const { data, error } = await supabase.functions.invoke('escrito-asistente', { body: input })
      if (error) throw await fnError(error)
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { respuesta: string; cambios: CambioPropuesto[]; modelo_nombre: string }
    },
  })
}

/** Aplica un cambio propuesto al contenido. Devuelve el contenido nuevo. */
export function aplicarCambio(c: EscritoContenido, x: CambioPropuesto): EscritoContenido {
  const secs = c.secciones.map((s) => ({ ...s, parrafos: [...s.parrafos] }))
  const i = x.seccion - 1
  const parrafosDe = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  switch (x.accion) {
    case 'reemplazar':
      if (secs[i] && x.parrafo) secs[i].parrafos[x.parrafo - 1] = x.texto ?? ''
      break
    case 'eliminar':
      if (secs[i] && x.parrafo) secs[i].parrafos.splice(x.parrafo - 1, 1)
      break
    case 'insertar_despues':
      if (secs[i]) secs[i].parrafos.splice(x.parrafo ?? secs[i].parrafos.length, 0, ...parrafosDe(x.texto ?? ''))
      break
    case 'reemplazar_seccion':
      if (secs[i]) { secs[i].parrafos = parrafosDe(x.texto ?? ''); if (x.titulo) secs[i].titulo = x.titulo }
      break
    case 'nueva_seccion':
      secs.splice(x.seccion, 0, { titulo: x.titulo ?? 'NUEVA SECCIÓN', parrafos: parrafosDe(x.texto ?? '') })
      break
  }
  return { ...c, secciones: secs }
}

/** Texto actual que el cambio va a tocar (para mostrar el antes). */
export function textoAnterior(c: EscritoContenido, x: CambioPropuesto): string | null {
  const s = c.secciones[x.seccion - 1]
  if (!s) return null
  if (x.accion === 'reemplazar' || x.accion === 'eliminar') return x.parrafo ? s.parrafos[x.parrafo - 1] ?? null : null
  if (x.accion === 'reemplazar_seccion') return s.parrafos.join('\n\n')
  return null
}

// ─── Citas del escrito ───────────────────────────────────────────────────────

export interface CitaEscrito {
  id: string
  chunk_id: number | null
  documento_id: string | null
  cita_texto: string
  fuente: 'normativa' | 'jurisprudencia'
  was_pinned: boolean
  documento?: string | null
}

export function useCitasEscrito(escritoId: string | null | undefined) {
  return useQuery({
    queryKey: ['escrito-citas', escritoId],
    enabled: !!escritoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('escrito_citas')
        .select('id, chunk_id, documento_id, cita_texto, fuente, was_pinned')
        .eq('escrito_id', escritoId)
        .order('orden')
      if (error) throw error
      const citas = (data ?? []) as CitaEscrito[]
      const normIds = [...new Set(citas.filter((c) => c.fuente === 'normativa' && c.documento_id).map((c) => c.documento_id!))]
      const jurIds = [...new Set(citas.filter((c) => c.fuente === 'jurisprudencia' && c.documento_id).map((c) => c.documento_id!))]
      const [n, j] = await Promise.all([
        normIds.length ? (supabase as any).from('normativa_documentos').select('id, titulo').in('id', normIds) : { data: [] },
        jurIds.length ? (supabase as any).from('jurisprudencia_documentos').select('id, caratula').in('id', jurIds) : { data: [] },
      ])
      const nombres = new Map<string, string>([
        ...((n.data ?? []) as { id: string; titulo: string }[]).map((d) => [d.id, d.titulo] as [string, string]),
        ...((j.data ?? []) as { id: string; caratula: string }[]).map((d) => [d.id, d.caratula] as [string, string]),
      ])
      return citas.map((c) => ({ ...c, documento: c.documento_id ? nombres.get(c.documento_id) ?? null : null }))
    },
  })
}

// ─── Aprendizajes propuestos a partir de este escrito ───────────────────────

export function useAprendizajesDeEscrito(escritoId: string | null | undefined) {
  return useQuery({
    queryKey: ['aprendizajes', 'escrito', escritoId],
    enabled: !!escritoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('aprendizajes_rulebook')
        .select('id, contenido, target_kind, target_ref_text, confidence, proposed, is_active')
        .eq('source_escrito_id', escritoId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; contenido: string; target_kind: string; target_ref_text: string | null; confidence: string; proposed: boolean }[]
    },
  })
}

// ─── Revisión antes de firmar ────────────────────────────────────────────────

export interface ControlFormalItem { requisito: string; estado: 'cumple' | 'falta' | 'revisar' | 'no_aplica'; detalle?: string }

export interface RevisionFormal {
  modelo?: string
  modelo_nombre?: string
  diagnostico: {
    control_formal?: ControlFormalItem[]
    argumentos_sin_norma?: { argumento: string; norma_sugerida?: string }[]
    hechos_no_acreditados?: { hecho: string; prueba_sugerida?: string }[]
    citas_jurisprudenciales?: { cita: string; estado: string; doctrina_o_motivo?: string }[]
    peticiones_sin_fundamento?: { peticion: string; falta: string }[]
    contradicciones?: { seccion_a: string; seccion_b: string; resolucion_sugerida?: string }[]
    alertas_plazo_fatal?: { norma: string; plazo: string; vencimiento_estimado?: string | null }[]
    observaciones_estructurales?: string[]
    sintesis?: { evaluacion?: string; resumen?: string }
  }
}

export function useRevisarEscrito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (escritoId: string) => {
      const { data, error } = await supabase.functions.invoke('diagnose-escrito', { body: { escrito_id: escritoId } })
      if (error) throw await fnError(error)
      const d = data as { ok?: boolean; error?: string; diagnostico?: RevisionFormal['diagnostico']; modelo?: string; modelo_nombre?: string }
      if (!d?.ok) throw new Error(d?.error ?? 'No se pudo revisar')
      return { diagnostico: d.diagnostico ?? {}, modelo: d.modelo, modelo_nombre: d.modelo_nombre } as RevisionFormal
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escritos-all'] })
      qc.invalidateQueries({ queryKey: ['escritos'] })
    },
  })
}
