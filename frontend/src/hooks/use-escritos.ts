import { useState, useRef } from 'react'
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
  presentacion?: string
  secciones: EscritoSeccion[]
}

export interface EscritoSnapshot {
  contenido: EscritoContenido
  saved_at: string
}

export interface Escrito {
  id: string
  expediente_id: string | null
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
  historial?: EscritoSnapshot[] | null
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

// ─── Modelos/plantillas de estilo guardados por el usuario ───────────────────

export interface EscritoTemplate {
  id: string
  user_id: string
  nombre: string
  tipo: string
  descripcion: string | null
  categoria: 'estilo' | 'modelo'
  contenido_modelo: EscritoContenido | null
  compartido: boolean
  created_at: string
}

export function useEscritoTemplates() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['escrito-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escrito_templates' as never)
        .select('id, user_id, nombre, tipo, descripcion, categoria, contenido_modelo, compartido, created_at')
        .eq('is_active', true as never)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as EscritoTemplate[]
    },
  })
}

// Modelos estructurales compartidos del estudio + propios del usuario
export function useEscritoModelos() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['escrito-modelos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escrito_templates' as never)
        .select('id, user_id, nombre, tipo, descripcion, categoria, contenido_modelo, compartido, created_at')
        .eq('categoria', 'modelo' as never)
        .eq('is_active', true as never)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as EscritoTemplate[]
    },
  })
}

// Todos los escritos del usuario (independientes + vinculados a expedientes)
export interface EscritoConExpediente extends Escrito {
  expediente?: { numero: string; caratula: string | null } | null
}

export function useAllEscritos(filtros?: { expedienteId?: string; search?: string }) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['escritos-all', filtros],
    queryFn: async () => {
      let q = (supabase as any)
        .from('escritos')
        .select('*, expediente:expedientes(numero, caratula)')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (filtros?.expedienteId) q = q.eq('expediente_id', filtros.expedienteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as EscritoConExpediente[]
    },
  })
}

// ─── Generar escrito (invoca edge function) ──────────────────────────────────

export interface GenerateInput {
  expediente_id?: string | null
  tipo: string
  titulo?: string
  instrucciones?: string
  template_id?: string | null
  /** ID del modelo estructural (escrito_templates con categoria='modelo') */
  modelo_id?: string | null
  /** Contenido del modelo a usar como borrador base. */
  borrador_previo?: EscritoContenido
  /** Texto de un modelo de ejemplo pegado por el usuario para imitar el estilo. */
  estilo_texto?: string | null
  /** Si viene, el modelo pegado se guarda como template reutilizable con este nombre. */
  guardar_como?: string | null
  /** Modo idea libre: el abogado describe qué presentar; la IA infiere el tipo. */
  idea_libre?: string | null
  /** Providencia (movimiento SAE) a la que este escrito responde. */
  responde_a_movimiento_id?: string | null
  /** Texto del escrito de la contraparte que se quiere contestar (pegado desde el PDF). */
  escrito_contraparte_texto?: string | null
  /** Actuaciones adicionales a incluir explícitamente en el contexto (por ID). */
  actuaciones_extra_ids?: string[] | null
}

interface GenerateResult {
  escrito_id: string
  contenido: EscritoContenido
  modelo: string
  registro_tonal: 'retorico' | 'procesal'
  claves_usadas: number
}

// Transcribe un audio (grabado o subido) a texto vía edge function.
export function useTranscribirAudio() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (audio: Blob): Promise<string> => {
      const ext = audio.type.includes('webm') ? 'webm' : audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : 'ogg'
      const { data: init, error: e1 } = await supabase.functions.invoke('transcribir-audio', {
        body: { action: 'init', filename: `idea.${ext}` },
      })
      if (e1) throw await extractFnError(e1)
      if ((init as { error?: string })?.error) throw new Error((init as { error: string }).error)
      const { path, token } = init as { path: string; token: string }

      const up = await supabase.storage.from('contenidos-media').uploadToSignedUrl(path, token, audio)
      if (up.error) throw new Error(`Subida falló: ${up.error.message}`)

      const { data: proc, error: e3 } = await supabase.functions.invoke('transcribir-audio', {
        body: { action: 'process', path },
      })
      if (e3) throw await extractFnError(e3)
      if ((proc as { error?: string })?.error) throw new Error((proc as { error: string }).error)
      return (proc as { texto: string }).texto
    },
  })
}

export function useGenerateEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const progressRef = useRef(setProgressMsg)
  progressRef.current = setProgressMsg

  const mutation = useMutation({
    mutationFn: async (input: GenerateInput): Promise<GenerateResult> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No autenticado')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const res = await fetch(`${supabaseUrl}/functions/v1/escritos-generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...input, stream: true }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(`Error ${res.status}: ${text.slice(0, 200)}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: GenerateResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages (double-newline separated)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.split('\n')
          const eventLine = lines.find(l => l.startsWith('event: '))
          const dataLine = lines.find(l => l.startsWith('data: '))
          if (!dataLine) continue

          const event = eventLine?.slice(7).trim() ?? 'message'
          let data: unknown
          try { data = JSON.parse(dataLine.slice(6)) } catch { continue }

          if (event === 'progress') {
            const d = data as { step: string; message: string }
            progressRef.current(d.message)
          } else if (event === 'done') {
            result = data as GenerateResult
          } else if (event === 'error') {
            const d = data as { error: string }
            throw new Error(d.error)
          }
        }
      }

      if (!result) throw new Error('No se recibió resultado del servidor')
      return result
    },
    onMutate: () => { setProgressMsg('Iniciando...') },
    onSettled: () => { setProgressMsg(null) },
    onSuccess: (_data, vars) => {
      if (vars.expediente_id) queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
      queryClient.invalidateQueries({ queryKey: ['escrito-tipos-previos'] })
      queryClient.invalidateQueries({ queryKey: ['escrito-templates'] })
      if (vars.responde_a_movimiento_id && vars.expediente_id) {
        queryClient.invalidateQueries({ queryKey: ['sae-movements', vars.expediente_id] })
      }
    },
  })

  return { ...mutation, progressMsg }
}

// ─── Crear modelo estructural (guarda en escrito_templates) ─────────────────

export function useCrearModelo() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      nombre: string
      tipo: string
      descripcion?: string
      contenido_modelo: EscritoContenido
      compartido?: boolean
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data, error } = await (supabase as any)
        .from('escrito_templates')
        .insert({
          user_id: user.id,
          nombre: input.nombre,
          tipo: input.tipo,
          descripcion: input.descripcion ?? null,
          categoria: 'modelo',
          contenido_modelo: input.contenido_modelo,
          compartido: input.compartido ?? true,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as EscritoTemplate
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escrito-modelos'] })
      queryClient.invalidateQueries({ queryKey: ['escrito-templates'] })
    },
  })
}

// ─── Extraer modelo desde texto (invoca edge function) ──────────────────────

export function useExtraerModelo() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: { texto: string; nombre?: string; tipo?: string }) => {
      const { data, error } = await supabase.functions.invoke('escrito-extraer-modelo', {
        body: input,
      })
      if (error) throw await extractFnError(error)
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { contenido: EscritoContenido; nombre: string; tipo: string }
    },
  })
}

// ─── Vincular escrito a expediente (retroactivo) ────────────────────────────

export function useVincularEscritoAExpediente() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { escrito_id: string; expediente_id: string }) => {
      const { error } = await (supabase as any)
        .from('escritos')
        .update({ expediente_id: input.expediente_id })
        .eq('id', input.escrito_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
      queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
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
      expediente_id: string | null
      patch: Partial<Pick<Escrito, 'titulo' | 'tipo' | 'estado' | 'contenido'>>
      snapshotAntes?: EscritoContenido
    }) => {
      if (input.snapshotAntes && input.patch.contenido !== undefined) {
        const snap: EscritoSnapshot = {
          contenido: input.snapshotAntes,
          saved_at: new Date().toISOString(),
        }
        await (supabase as any).rpc('push_escrito_snapshot', {
          p_escrito_id: input.id,
          p_snapshot: snap,
        }).catch(() => {}) // non-blocking
      }
      const { error } = await supabase
        .from('escritos' as never)
        .update(input.patch as never)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      if (vars.expediente_id) queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
      if (vars.patch.contenido !== undefined) {
        supabase.functions.invoke('escrito-extraer-aprendizajes', { body: { escrito_id: vars.id } }).catch(() => {})
      }
    },
  })
}

export function useDeleteEscrito() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; expediente_id: string | null }) => {
      const { error } = await supabase
        .from('escritos' as never)
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      if (vars.expediente_id) queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
    },
  })
}

// ─── Historial de versiones ──────────────────────────────────────────────────

export function useEscritoHistorial() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const pushSnapshot = useMutation({
    mutationFn: async (input: { id: string; snapshot: EscritoContenido }) => {
      const snap: EscritoSnapshot = {
        contenido: input.snapshot,
        saved_at: new Date().toISOString(),
      }
      await (supabase as any).rpc('push_escrito_snapshot', {
        p_escrito_id: input.id,
        p_snapshot: snap,
      })
    },
  })

  const restore = useMutation({
    mutationFn: async (input: {
      id: string
      expediente_id: string | null
      contenido: EscritoContenido
      current_snapshot: EscritoContenido
    }) => {
      // Save current as snapshot first
      const snap: EscritoSnapshot = {
        contenido: input.current_snapshot,
        saved_at: new Date().toISOString(),
      }
      await (supabase as any).rpc('push_escrito_snapshot', {
        p_escrito_id: input.id,
        p_snapshot: snap,
      })
      // Then restore
      const { error } = await (supabase as any)
        .from('escritos')
        .update({ contenido: input.contenido })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      if (vars.expediente_id) queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
    },
  })

  return { pushSnapshot, restore }
}

// ─── Refinar párrafo o sección con IA ───────────────────────────────────────

interface RefinarInput {
  expediente_id?: string | null
  escrito_titulo?: string
  registro_tonal?: 'retorico' | 'procesal' | null
  titulo_seccion?: string
  texto_actual: string
  instruccion: string
  alcance: 'seccion' | 'parrafo' | 'insertar'
}

export function useRefinarEscrito() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: RefinarInput): Promise<{ resultado: string }> => {
      const { data, error } = await supabase.functions.invoke('escrito-refinar', { body: input })
      if (error) throw await extractFnError(error)
      if (!data?.ok) throw new Error(data?.error ?? 'Error al refinar el texto')
      return data as { resultado: string }
    },
  })
}

// ─── Adjuntar PDF firmado ───────────────────────────────────────────────────

export function useAttachSignedPdf() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { escrito_id: string; expediente_id: string | null; file: File }) => {
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
      if (vars.expediente_id) queryClient.invalidateQueries({ queryKey: ['escritos', vars.expediente_id] })
      queryClient.invalidateQueries({ queryKey: ['escritos-all'] })
      supabase.functions.invoke('escrito-extraer-aprendizajes', { body: { escrito_id: vars.escrito_id, trigger: 'firmar' } }).catch(() => {})
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

// ─── Extraer cita jurídica desde URL externa ─────────────────────────────────

export interface ReferenciaExterna {
  tipo: 'fallo' | 'normativa' | 'doctrina' | 'otro'
  tribunal: string | null
  fecha: string | null
  caratula: string | null
  numero: string | null
  extracto: string | null
  cita_formal: string
  fuente_url: string
}

export function useFetchReferencia() {
  const supabase = createClient()
  return useMutation({
    mutationFn: async (url: string): Promise<ReferenciaExterna> => {
      const { data, error } = await supabase.functions.invoke('escrito-fetch-referencia', {
        body: { url },
      })
      if (error) throw await extractFnError(error)
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as ReferenciaExterna
    },
  })
}
