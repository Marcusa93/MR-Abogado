import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables, TablesInsert } from '@/types/database.types'
import { expedientesKeys } from '@/hooks/use-expedientes'
import { extractPdfText } from '@/lib/utils/pdf-text'

// Categorías que disparan análisis IA automático al subir.
const AUTO_ANALYZE_CATEGORIAS = new Set(['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion'])

// ---------------------------------------------------------------------------
// useAdjuntos — lista de archivos adjuntos de un expediente
// ---------------------------------------------------------------------------

export function useAdjuntos(expedienteId: string | undefined) {
  const supabase = createClient()

  return useQuery<Tables<'adjuntos'>[]>({
    queryKey: ['adjuntos', expedienteId],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      if (!expedienteId) return []

      const { data, error } = await supabase
        .from('adjuntos')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!expedienteId,
  })
}

// ---------------------------------------------------------------------------
// convertImageToPdf — converts a JPG/PNG file to a PDF using jsPDF
// ---------------------------------------------------------------------------

async function convertImageToPdf(imageFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = async () => {
        try {
          const { jsPDF } = await import('jspdf')
          const orientation = img.width > img.height ? 'l' : 'p'
          const pdf = new jsPDF({
            orientation,
            unit: 'px',
            format: [img.width, img.height],
            compress: true,
          })

          const format = imageFile.type === 'image/png' ? 'PNG' : 'JPEG'
          pdf.addImage(reader.result as string, format, 0, 0, img.width, img.height, undefined, 'MEDIUM')

          const pdfBlob = pdf.output('blob')
          const pdfName = imageFile.name.replace(/\.(png|jpe?g)$/i, '.pdf')
          resolve(new File([pdfBlob], pdfName, { type: 'application/pdf' }))
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = () => reject(new Error('No se pudo leer la imagen'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(imageFile)
  })
}

// ---------------------------------------------------------------------------
// useUploadAdjunto — sube un archivo a storage + inserta registro en adjuntos
// Images (PNG/JPG) are automatically converted to PDF before upload.
// ---------------------------------------------------------------------------

export function useUploadAdjunto() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      expedienteId,
      file: rawFile,
      customName,
      categoria,
      descripcion,
      uploadedBy,
    }: {
      expedienteId: string
      file: File
      customName?: string
      categoria?: string
      descripcion?: string
      uploadedBy?: string
    }) => {
      // Convert images to PDF automatically
      const isImage = rawFile.type.startsWith('image/')
      const file = isImage ? await convertImageToPdf(rawFile) : rawFile

      // Enforce 50MB limit after conversion
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('El archivo supera el límite de 50 MB.')
      }

      // Generate a unique storage path (always .pdf)
      const storageName = `${expedienteId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('adjuntos')
        .upload(storageName, file, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`)

      // Insert the DB record
      const baseName = customName || rawFile.name.replace(/\.[^/.]+$/, '')
      const originalName = `${baseName}.pdf`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertData: any = {
        expediente_id: expedienteId,
        nombre_archivo: originalName,
        tipo_mime: 'application/pdf',
        tamano_bytes: file.size,
        storage_path: storageName,
        categoria: categoria || null,
        descripcion: descripcion ?? null,
        uploaded_by: uploadedBy ?? null,
      }

      const { data, error } = await supabase
        .from('adjuntos')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        // Rollback: remove orphaned storage object
        await supabase.storage.from('adjuntos').remove([storageName]).catch(() => {})
        throw error
      }

      // Auto-trigger análisis IA si la categoría lo amerita. Fire-and-forget:
      // si falla, el adjunto ya está guardado y el usuario puede reintentar
      // manualmente con el botón "Analizar con IA".
      if (categoria && AUTO_ANALYZE_CATEGORIAS.has(categoria) && data?.id) {
        void analyzeInBackground({
          supabase,
          adjuntoId: data.id,
          expedienteId,
          pdfFile: file,
          queryClient,
        })
      }

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos', variables.expedienteId] })
      queryClient.invalidateQueries({ queryKey: expedientesKeys.detail(variables.expedienteId) })
    },
  })
}

// Extrae texto del PDF y llama a analyze-adjunto en background.
// No throws: errores se persisten en adjuntos.ai_error por la edge function.
async function analyzeInBackground({
  supabase,
  adjuntoId,
  expedienteId,
  pdfFile,
  queryClient,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  adjuntoId: string
  expedienteId: string
  pdfFile: File | Blob
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any
}) {
  try {
    const { text } = await extractPdfText(pdfFile, { maxChars: 100_000 })
    if (!text.trim()) return
    await supabase.functions.invoke('analyze-adjunto', {
      body: { adjunto_id: adjuntoId, document_text: text },
    })
  } catch (err) {
    console.warn('[analyzeInBackground] falló', err)
  } finally {
    queryClient.invalidateQueries({ queryKey: ['adjuntos', expedienteId] })
  }
}

// ---------------------------------------------------------------------------
// useAnalyzeAdjunto — análisis manual (botón "Analizar con IA")
// ---------------------------------------------------------------------------

export function useAnalyzeAdjunto() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      adjuntoId,
      expedienteId,
      storagePath,
      force = false,
    }: {
      adjuntoId: string
      expedienteId: string
      storagePath: string
      force?: boolean
    }) => {
      // Bajar el PDF vía signed URL y extraer texto en el cliente.
      const { data: signed, error: signError } = await supabase.storage
        .from('adjuntos')
        .createSignedUrl(storagePath, 300)
      if (signError || !signed?.signedUrl) {
        throw new Error(signError?.message || 'No se pudo acceder al archivo.')
      }

      const { text } = await extractPdfText(signed.signedUrl, { maxChars: 100_000 })
      if (!text.trim()) {
        throw new Error('El PDF no tiene texto extraíble (probablemente escaneado). No se puede analizar con IA.')
      }

      const { data, error } = await supabase.functions.invoke('analyze-adjunto', {
        body: { adjunto_id: adjuntoId, document_text: text, force },
      })
      if (error) throw new Error(error.message || 'Error al analizar')
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; cached?: boolean; summary?: string; extracted?: unknown; model?: string }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos', variables.expedienteId] })
    },
  })
}

// ---------------------------------------------------------------------------
// useChatAdjunto — pregunta puntual al doc (Q&A grounded en el texto)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useChatAdjunto() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      adjuntoId,
      question,
      history = [],
      documentText,
    }: {
      adjuntoId: string
      question: string
      history?: ChatMessage[]
      /** Texto del PDF si ya lo tenés extraído. Si no, la function usa ai_full_text de la BD. */
      documentText?: string
    }) => {
      const { data, error } = await supabase.functions.invoke('chat-adjunto', {
        body: { adjunto_id: adjuntoId, question, history, document_text: documentText },
      })
      if (error) throw new Error(error.message || 'Error al consultar')
      if (data?.error) throw new Error(data.error)
      return data as { answer: string; model: string; truncated?: boolean }
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteAdjunto — elimina el archivo de storage + borra registro
// ---------------------------------------------------------------------------

export function useDeleteAdjunto() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      adjuntoId,
      storagePath,
      expedienteId,
    }: {
      adjuntoId: string
      storagePath: string
      expedienteId: string
    }) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('adjuntos')
        .remove([storagePath])

      if (storageError) {
        console.warn('Error deleting from storage:', storageError)
      }

      // Delete DB record
      const { error } = await supabase
        .from('adjuntos')
        .delete()
        .eq('id', adjuntoId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos', variables.expedienteId] })
      queryClient.invalidateQueries({ queryKey: expedientesKeys.detail(variables.expedienteId) })
    },
  })
}

// ---------------------------------------------------------------------------
// useAdjuntosConsulta — lista adjuntos de una consulta
// ---------------------------------------------------------------------------

export function useAdjuntosConsulta(consultaId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['adjuntos-consulta', consultaId],
    staleTime: 30_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refetchInterval: (query: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = query.state.data as any[] | undefined
      const hasPending = data?.some((a: any) => !a.ai_analyzed_at && !a.ai_error)
      return hasPending ? 4000 : false
    },
    queryFn: async () => {
      if (!consultaId) return []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('adjuntos')
        .select('*')
        .eq('consulta_id', consultaId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[]
    },
    enabled: !!consultaId,
  })
}

// ---------------------------------------------------------------------------
// analyzeConsultaAdjuntoInBackground — análisis IA asíncrono para adjuntos de consulta
// ---------------------------------------------------------------------------

async function analyzeConsultaAdjuntoInBackground({
  supabase,
  adjuntoId,
  consultaId,
  file,
  isImage,
  isAudio,
  queryClient,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  adjuntoId: string
  consultaId: string
  file: File
  isImage: boolean
  isAudio: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any
}) {
  try {
    if (isAudio) {
      // Audio: transcribir con Groq Whisper (edge function descarga con service_role)
      await supabase.functions.invoke('transcribe-adjunto', {
        body: { adjunto_id: adjuntoId },
      })
    } else if (isImage) {
      // Para imágenes: la edge function genera la signed URL internamente con service_role.
      await supabase.functions.invoke('analyze-adjunto', {
        body: { adjunto_id: adjuntoId },
      })
    } else {
      // Para PDFs: extraer texto en el cliente y pasarlo a la edge function.
      const { text } = await extractPdfText(file, { maxChars: 100_000 })
      await supabase.functions.invoke('analyze-adjunto', {
        body: { adjunto_id: adjuntoId, document_text: text },
      })
    }
  } catch (err) {
    console.warn('[analyzeConsultaAdjuntoInBackground] falló', err)
  } finally {
    queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', consultaId] })
  }
}

// ---------------------------------------------------------------------------
// useUploadAdjuntoConsulta — sube un adjunto para una consulta (nativo sin conversión)
// ---------------------------------------------------------------------------

export function useUploadAdjuntoConsulta() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      consultaId,
      file,
    }: {
      consultaId: string
      file: File
    }) => {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('El archivo supera el límite de 50 MB.')
      }

      const isImage = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/') || file.type === 'video/mp4' || file.type === 'video/webm'
      const ext = file.name.split('.').pop() ?? (isImage ? 'jpg' : isAudio ? 'mp3' : 'pdf')
      const storageName = `consultas/${consultaId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('adjuntos')
        .upload(storageName, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertData: any = {
        consulta_id: consultaId,
        nombre_archivo: file.name,
        tipo_mime: file.type,
        tamano_bytes: file.size,
        storage_path: storageName,
        categoria: null,
        descripcion: null,
        uploaded_by: user.id,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('adjuntos')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        await supabase.storage.from('adjuntos').remove([storageName]).catch(() => {})
        throw error
      }

      // Disparar análisis/transcripción en background (siempre, para consultas)
      if (data?.id) {
        void analyzeConsultaAdjuntoInBackground({
          supabase,
          adjuntoId: data.id,
          consultaId,
          file,
          isImage,
          isAudio,
          queryClient,
        })
      }

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', variables.consultaId] })
    },
  })
}

// ---------------------------------------------------------------------------
// useMigrateConsultaAdjuntos — mueve adjuntos de consulta → expediente al convertir
// ---------------------------------------------------------------------------

export function useMigrateConsultaAdjuntos() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      consultaId,
      expedienteId,
    }: {
      consultaId: string
      expedienteId: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('adjuntos')
        .update({ expediente_id: expedienteId, consulta_id: null })
        .eq('consulta_id', consultaId)
        .is('deleted_at', null)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos-consulta', variables.consultaId] })
      queryClient.invalidateQueries({ queryKey: ['adjuntos', variables.expedienteId] })
    },
  })
}
