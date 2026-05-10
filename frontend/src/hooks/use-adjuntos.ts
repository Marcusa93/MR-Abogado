import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Tables, TablesInsert } from '@/types/database.types'
import { expedientesKeys } from '@/hooks/use-expedientes'

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
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adjuntos', variables.expedienteId] })
      queryClient.invalidateQueries({ queryKey: expedientesKeys.detail(variables.expedienteId) })
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
