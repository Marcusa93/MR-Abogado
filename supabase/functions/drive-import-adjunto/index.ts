// Importa un archivo desde Google Drive al bucket adjuntos del expediente
// y dispara el análisis IA si corresponde.
//
// Body: { file_id, expediente_id, file_name?, categoria?, descripcion? }
// Returns: { adjunto_id, storage_path }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getValidAccessToken, downloadDriveFile } from '../_shared/google-drive.ts'

const AUTO_ANALYZE_CATEGORIAS = new Set(['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json({ error: 'Drive no está configurado en el servidor' }, 500)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as
      | { file_id?: string; expediente_id?: string; file_name?: string; categoria?: string; descripcion?: string }
      | null

    const fileId = body?.file_id
    const expedienteId = body?.expediente_id
    if (!fileId) return json({ error: 'Falta file_id' }, 400)
    if (!expedienteId) return json({ error: 'Falta expediente_id' }, 400)

    // Verificar acceso al expediente vía RLS
    const { data: exp, error: expErr } = await anonClient
      .from('expedientes')
      .select('id')
      .eq('id', expedienteId)
      .is('deleted_at', null)
      .maybeSingle()
    if (expErr) throw expErr
    if (!exp) return json({ error: 'Expediente no encontrado o sin permisos' }, 404)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Token vigente de Drive
    const accessToken = await getValidAccessToken({
      serviceClient, profileId: user.id, clientId, clientSecret,
    })

    // 2) Descargar el archivo
    const file = await downloadDriveFile({ accessToken, fileId })

    // Solo soportamos PDF (igual que upload normal). Si no es PDF, error claro.
    if (file.mimeType !== 'application/pdf') {
      return json({
        error: `Tipo de archivo no soportado: ${file.mimeType}. Por ahora solo PDF.`,
      }, 400)
    }

    if (file.data.byteLength > 50 * 1024 * 1024) {
      return json({ error: 'El archivo supera el límite de 50 MB.' }, 400)
    }

    // 3) Subir al bucket adjuntos
    const storageName = `${expedienteId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`
    const { error: uploadErr } = await serviceClient.storage
      .from('adjuntos')
      .upload(storageName, new Uint8Array(file.data), {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      })
    if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`)

    // 4) Insertar en adjuntos
    const nombreOriginal = body?.file_name || file.name || 'Documento'
    const finalName = nombreOriginal.toLowerCase().endsWith('.pdf') ? nombreOriginal : `${nombreOriginal}.pdf`
    const categoria = body?.categoria ?? null

    const { data: adj, error: adjErr } = await serviceClient
      .from('adjuntos')
      .insert({
        expediente_id: expedienteId,
        nombre_archivo: finalName,
        tipo_mime: 'application/pdf',
        tamano_bytes: file.data.byteLength,
        storage_path: storageName,
        categoria,
        descripcion: body?.descripcion ?? `Importado desde Google Drive`,
        uploaded_by: user.id,
      })
      .select('id')
      .single()
    if (adjErr) {
      // Rollback storage
      await serviceClient.storage.from('adjuntos').remove([storageName]).catch(() => {})
      throw new Error(`Insert adjunto: ${adjErr.message}`)
    }

    // 5) Auto-trigger análisis si categoría lo amerita
    // El analyze-adjunto necesita el texto extraído del PDF (lo hace el cliente),
    // pero en este flow no tenemos el texto. Lo dejamos sin auto-trigger; el user
    // puede clickear "Analizar" desde la tab Documentos.

    return json({
      success: true,
      adjunto_id: adj.id,
      storage_path: storageName,
      file_name: finalName,
      analyze_pending: categoria ? AUTO_ANALYZE_CATEGORIAS.has(categoria) : false,
    })

  } catch (err) {
    console.error('[drive-import-adjunto]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})
