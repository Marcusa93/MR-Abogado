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
  origen: 'radar' | 'sentencia' | 'manual' | 'actuacion' | 'actualizacion'
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
  creado_por: string | null
  asignado_a: string | null
  nota_asignacion: string | null
  fecha_limite: string | null
  articulo_id: string | null
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
  bibliografia: string[]
  a_verificar: string[]
  alertas_confidencialidad: string[]
  adaptaciones: Partial<Record<'linkedin' | 'redes' | 'boletin', string>>
  version: number
  modelo_ia: string | null
  aprobado_at: string | null
  publicado_at: string | null
  publicado_url: string | null
  creado_por: string | null
  asignado_a: string | null
  aprobacion_pedida_at: string | null
  observaciones: string | null
  devuelto_at: string | null
  verificacion_citas: CitaVerificada[]
  citas_verificadas_at: string | null
  informe_externo: string | null
  informe_cargado_at: string | null
  eje_id: string | null
  formato_revista: { resumen: string; palabras_clave: string[]; cuerpo: string; notas: Record<string, string> } | null
  formato_revista_version: number | null
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
  autor_id: string | null
  created_at: string
}

export interface CitaVerificada {
  entrada: string
  tipo: 'norma' | 'fallo' | 'doctrina' | 'otro'
  estado: 'encontrada' | 'no_encontrada' | 'manual'
  documento: { titulo: string; url: string | null } | null
  nota: string
}

export interface MiembroEditorial { id: string; nombre: string; apellido: string | null; editorial_aprueba: boolean }

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

/** Aprobar y publicar es solo de Marco (profiles.editorial_aprueba); el resto colabora. */
export function usePuedeAprobarEditorial() {
  const profileId = useAuthStore((s) => s.profile?.id)
  return useQuery({
    queryKey: [...editorialKeys.acceso, 'aprobar', profileId],
    enabled: !!profileId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().rpc('can_aprobar_editorial')
      if (error) return false
      return data === true
    },
  })
}

/** Quienes trabajan en el módulo (Marco y colaboradores). */
export function useEquipoEditorial() {
  return useQuery({
    queryKey: [...editorialKeys.acceso, 'equipo'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().from('profiles').select('id, nombre, apellido, editorial_aprueba')
        .eq('acceso_editorial', true).eq('activo', true).order('nombre')
      if (error) throw error
      return (data ?? []) as MiembroEditorial[]
    },
  })
}

export const nombreCorto = (m?: { nombre: string; apellido: string | null } | null) =>
  m ? `${m.nombre}${m.apellido ? ` ${m.apellido}` : ''}` : 'Alguien'

/** Asigna (o desasigna con null) una propuesta a un colaborador; le avisa por Telegram. */
export function useAsignarPropuesta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { propuesta_id: string; asignado_a: string | null; nota?: string; fecha_limite?: string | null }) => {
      const { data, error } = await createClient().functions.invoke('editorial-ia', { body: { modo: 'asignar', ...v } })
      if (error) {
        const ctx = (error as { context?: unknown }).context
        const msg = ctx instanceof Response ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null
        throw new Error(msg ?? error.message)
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { ok: boolean; avisado: boolean }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: editorialKeys.propuestas }),
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
        .select('id, estado, tipo, titulo, bajada, version, updated_at, aprobado_at, alertas_confidencialidad, a_verificar, creado_por, asignado_a, aprobacion_pedida_at, devuelto_at, eje_id')
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
export const CORTE_CONEXION = 'Se cortó la conexión mientras la IA trabajaba.'

export function useEditorialIA() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silencioso: true },
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
        throw new Error(CORTE_CONEXION)
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
      if (estado === 'aprobado') { cambios.aprobado_at = ahora; cambios.aprobacion_pedida_at = null }
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

/** Propuestas de actualización abiertas de un artículo. */
export function useActualizacionesArticulo(articuloId: string) {
  return useQuery({
    queryKey: [...editorialKeys.propuestas, 'actualizacion', articuloId],
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_propuestas').select('*')
        .eq('articulo_id', articuloId).eq('estado', 'propuesta').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Propuesta[]
    },
  })
}

/** Última versión que leí de un artículo (para mostrar qué cambió desde entonces). */
export function useMiLectura(articuloId: string) {
  const profileId = useAuthStore((s) => s.profile?.id)
  return useQuery({
    queryKey: ['editorial', 'lectura', articuloId, profileId],
    enabled: !!profileId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await sb().from('editorial_lecturas').select('version, leido_at')
        .eq('articulo_id', articuloId).eq('profile_id', profileId).maybeSingle()
      return (data ?? null) as { version: number; leido_at: string } | null
    },
  })
}

export async function marcarLeido(articuloId: string, profileId: string, version: number) {
  await sb().from('editorial_lecturas').upsert(
    { articulo_id: articuloId, profile_id: profileId, version, leido_at: new Date().toISOString() },
    { onConflict: 'articulo_id,profile_id' },
  )
}

export type EstadoHallazgo = 'pendiente' | 'comprobado' | 'parcial' | 'no_encontrado' | 'sin_acceso' | 'sin_fuente'

export interface HallazgoEditorial {
  id: string
  fuente_id: string | null
  orden: number
  afirmacion: string
  tipo: 'norma' | 'fallo' | 'doctrina' | 'dato'
  fuente: string | null
  url: string | null
  cita: string | null
  vigencia: string | null
  confianza: string | null
  numero: string | null
  tribunal: string | null
  fecha: string | null
  jurisdiccion: string | null
  estado: EstadoHallazgo
  detalle: string | null
}

export interface FuenteEditorial {
  id: string
  url: string
  titulo: string | null
  estado: 'pendiente' | 'ok' | 'sin_acceso' | 'manual'
  error: string | null
  en_base: boolean
}

/** Hallazgos de la investigación externa (Gemini Deep Research), con su comprobación. */
export function useHallazgos(articuloId: string) {
  return useQuery({
    queryKey: ['editorial', 'hallazgos', articuloId],
    queryFn: async () => {
      const [{ data: hs, error: e1 }, { data: fs, error: e2 }] = await Promise.all([
        sb().from('editorial_hallazgos').select('*').eq('articulo_id', articuloId).order('orden'),
        sb().from('editorial_fuentes').select('id, url, titulo, estado, error, en_base').eq('articulo_id', articuloId),
      ])
      if (e1) throw e1
      if (e2) throw e2
      return { hallazgos: (hs ?? []) as HallazgoEditorial[], fuentes: (fs ?? []) as FuenteEditorial[] }
    },
  })
}

/** Llama a editorial-ia sin invalidar todo el módulo (para tandas largas). */
export async function llamarEditorial<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke('editorial-ia', { body })
  if (error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const msg = await ctx.json().then((j: { error?: string }) => j.error).catch(() => null)
      throw new Error(msg ?? error.message)
    }
    throw new Error('Se cortó la conexión. Si el proceso terminó, el resultado aparece al recargar.')
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

/** Suma a la base de normativa o jurisprudencia una fuente comprobada. */
export function useSumarFuenteABase(articuloId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ h }: { h: HallazgoEditorial }) => {
      if (!h.fuente_id) throw new Error('Sin fuente')
      const { data: f, error } = await sb().from('editorial_fuentes').select('texto, url').eq('id', h.fuente_id).single()
      if (error) throw error
      const texto = String((f as { texto: string | null }).texto ?? '')
      if (texto.length < 200) throw new Error('La fuente no tiene texto suficiente')
      const fn = h.tipo === 'fallo' ? 'jurisprudencia-ingest' : 'normativa-ingest'
      // La base guarda fecha tipo date: solo se manda si es una fecha completa
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(h.fecha ?? '') ? h.fecha
        : (() => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(h.fecha ?? ''); return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null })()
      const body = h.tipo === 'fallo'
        ? { mode: 'paste', texto, caratula: h.fuente ?? h.afirmacion.slice(0, 200), tribunal: h.tribunal, fecha: iso, jurisdiccion: h.jurisdiccion, numero: h.numero, sumario: h.afirmacion }
        : { mode: 'paste', texto, titulo: h.fuente ?? h.afirmacion.slice(0, 200), tipo: 'norma', numero: h.numero, fecha: iso, jurisdiccion: h.jurisdiccion, fuente: (f as { url: string }).url }
      const { data, error: e2 } = await createClient().functions.invoke(fn, { body })
      if (e2) {
        const ctx = (e2 as { context?: unknown }).context
        const msg = ctx instanceof Response ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null
        throw new Error(msg ?? e2.message)
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      await sb().from('editorial_fuentes').update({ en_base: true }).eq('id', h.fuente_id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial', 'hallazgos', articuloId] }),
  })
}

// ── Aprendizaje: líneas temáticas, guía de estilo y biblioteca de evidencia ──

export interface Eje { id: string; nombre: string; descripcion: string | null }
export interface TesisEje { id: string; eje_id: string | null; articulo_id: string | null; tipo: 'tesis' | 'pregunta'; texto: string; vigente: boolean; propuesta_id: string | null }
export interface ReglaEstilo { id: string; regla: string; antes: string | null; despues: string | null; origen: 'aprendida' | 'manual'; activa: boolean; veces: number }
export interface Evidencia { id: string; tipo: string; afirmacion: string; fuente: string | null; url: string | null; cita: string | null; vigencia: string | null; usos: number; verificado_at: string }

export function useEjes() {
  return useQuery({
    queryKey: ['editorial', 'ejes'],
    queryFn: async () => {
      const [{ data: ejes, error }, { data: tesis, error: e2 }] = await Promise.all([
        sb().from('editorial_ejes').select('id, nombre, descripcion').order('nombre'),
        sb().from('editorial_tesis').select('*').eq('vigente', true).order('created_at'),
      ])
      if (error) throw error
      if (e2) throw e2
      return { ejes: (ejes ?? []) as Eje[], tesis: (tesis ?? []) as TesisEje[] }
    },
  })
}

export function useEstilo() {
  return useQuery({
    queryKey: ['editorial', 'estilo'],
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_estilo').select('*').order('veces', { ascending: false }).order('created_at')
      if (error) throw error
      return (data ?? []) as ReglaEstilo[]
    },
  })
}

export function useEvidencia() {
  return useQuery({
    queryKey: ['editorial', 'evidencia'],
    queryFn: async () => {
      const { data, error } = await sb().from('editorial_evidencia').select('id, tipo, afirmacion, fuente, url, cita, vigencia, usos, verificado_at').order('verificado_at', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []) as Evidencia[]
    },
  })
}

/** Escrituras simples del módulo (reglas, ejes, tesis); invalida todo Editorial. */
export function useEditarEditorial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (op: { tabla: 'editorial_estilo' | 'editorial_ejes' | 'editorial_tesis' | 'editorial_articulos' | 'editorial_propuestas'; accion: 'insert' | 'update' | 'delete'; id?: string; datos?: Record<string, unknown> }) => {
      const t = sb().from(op.tabla)
      const { data, error } = op.accion === 'insert' ? await t.insert(op.datos).select('id').single()
        : op.accion === 'update' ? await t.update(op.datos).eq('id', op.id)
        : await t.delete().eq('id', op.id)
      if (error) throw error
      return data as { id: string } | null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial'] }),
  })
}

/** Guarda la bibliografía APA editada a mano (una entrada por línea). */
export function useGuardarBibliografia(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bibliografia: string[]) => {
      const { error } = await sb().from('editorial_articulos')
        .update({ bibliografia, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: editorialKeys.articulo(id) }),
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
