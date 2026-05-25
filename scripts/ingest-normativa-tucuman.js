#!/usr/bin/env node
/**
 * One-off: subir códigos procesales y acordadas de Tucumán al módulo de normativa.
 *
 * Replica el flujo de useUploadNormativa (frontend/src/hooks/use-normativa.ts):
 *   1. SHA256 del archivo.
 *   2. Upload al bucket normativa-originales (path: <user_id>/<doc_id>.pdf).
 *   3. Insert en normativa_documentos con estado 'pendiente'.
 *   4. Invoke edge function normativa-ingest (que chunkea + embebe en background).
 *
 * Idempotente: si ya existe un documento con el mismo checksum para el user,
 * lo skipea y reporta el id existente.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/ingest-normativa-tucuman.js
 *
 * Output: tabla con codigo/título/id de cada documento para usar después al
 * linkear el rulebook (tipos_proceso_normas.normativa_documento_id).
 */

const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { createClient } = require('../frontend/node_modules/@supabase/supabase-js')

const SUPABASE_URL = 'https://ftxpilbvjfxfkjkrbrnl.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OWNER_USER_ID = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb' // Marco (DIRECTOR)
const PDF_DIR = path.join(__dirname, '..', 'tmp', 'normativa-tucuman')

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: falta SUPABASE_SERVICE_ROLE_KEY en el environment.')
  console.error('Uso: SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/ingest-normativa-tucuman.js')
  process.exit(1)
}

const DOCUMENTOS = [
  {
    file: 'cpl.pdf',
    titulo: 'Código Procesal Laboral de Tucumán',
    tipo: 'codigo',
    numero: null,
    jurisdiccion: 'tucuman',
    fuente: 'Poder Judicial de Tucumán',
    fecha: null,
    metadata: { categoria: 'codigo_procesal', fuero: 'laboral' },
  },
  {
    file: 'cpa.pdf',
    titulo: 'Código Procesal Administrativo de Tucumán',
    tipo: 'codigo',
    numero: null,
    jurisdiccion: 'tucuman',
    fuente: 'Poder Judicial de Tucumán',
    fecha: null,
    metadata: { categoria: 'codigo_procesal', fuero: 'administrativo' },
  },
  {
    file: 'cpf.pdf',
    titulo: 'Código Procesal de Familia de Tucumán',
    tipo: 'codigo',
    numero: null,
    jurisdiccion: 'tucuman',
    fuente: 'Poder Judicial de Tucumán',
    fecha: null,
    metadata: { categoria: 'codigo_procesal', fuero: 'familia' },
  },
  {
    file: 'ac-1562-22.pdf',
    titulo: 'Acordada 1562/22 — Reglamento del Expediente Digital (Tucumán)',
    tipo: 'acordada',
    numero: '1562/22',
    jurisdiccion: 'tucuman',
    fuente: 'CSJT',
    fecha: null,
    metadata: { categoria: 'expediente_digital', año: 2022, rol: 'base' },
  },
  {
    file: 'ac-879-23.pdf',
    titulo: 'Acordada 879/23 — Modificatoria reglamento expediente digital',
    tipo: 'acordada',
    numero: '879/23',
    jurisdiccion: 'tucuman',
    fuente: 'CSJT',
    fecha: null,
    metadata: { categoria: 'expediente_digital', año: 2023, rol: 'modificatoria', modifica: '1562/22' },
  },
  {
    file: 'ac-880-23.pdf',
    titulo: 'Acordada 880/23 — Modificatoria reglamento expediente digital',
    tipo: 'acordada',
    numero: '880/23',
    jurisdiccion: 'tucuman',
    fuente: 'CSJT',
    fecha: null,
    metadata: { categoria: 'expediente_digital', año: 2023, rol: 'modificatoria', modifica: '1562/22' },
  },
  {
    file: 'ac-1012-24.pdf',
    titulo: 'Acordada 1012/24 — Modificatoria reglamento expediente digital',
    tipo: 'acordada',
    numero: '1012/24',
    jurisdiccion: 'tucuman',
    fuente: 'CSJT',
    fecha: null,
    metadata: { categoria: 'expediente_digital', año: 2024, rol: 'modificatoria', modifica: '1562/22' },
  },
  {
    file: 'ac-835-25.pdf',
    titulo: 'Acordada 835/25 — Modificatoria reglamento expediente digital',
    tipo: 'acordada',
    numero: '835/25',
    jurisdiccion: 'tucuman',
    fuente: 'CSJT',
    fecha: null,
    metadata: { categoria: 'expediente_digital', año: 2025, rol: 'modificatoria', modifica: '1562/22' },
  },
]

async function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function processOne(supabase, def) {
  const filePath = path.join(PDF_DIR, def.file)
  const buf = await fs.readFile(filePath)
  const checksum = await sha256(buf)

  // Idempotencia: ¿ya existe?
  const { data: existing } = await supabase
    .from('normativa_documentos')
    .select('id, titulo, estado')
    .eq('user_id', OWNER_USER_ID)
    .eq('checksum', checksum)
    .maybeSingle()

  if (existing) {
    return { file: def.file, id: existing.id, status: 'already_existed', estado: existing.estado }
  }

  const docId = crypto.randomUUID()
  const storagePath = `${OWNER_USER_ID}/${docId}.pdf`

  // 1) Upload al bucket
  const { error: upErr } = await supabase.storage
    .from('normativa-originales')
    .upload(storagePath, buf, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new Error(`upload ${def.file}: ${upErr.message}`)

  // 2) Insert documento
  const { error: docErr } = await supabase
    .from('normativa_documentos')
    .insert({
      id: docId,
      user_id: OWNER_USER_ID,
      titulo: def.titulo,
      tipo: def.tipo,
      numero: def.numero,
      jurisdiccion: def.jurisdiccion,
      fuente: def.fuente,
      fecha: def.fecha,
      source_file_path: storagePath,
      source_file_name: def.file,
      source_mime_type: 'application/pdf',
      checksum,
      estado: 'pendiente',
      metadata: def.metadata || {},
    })

  if (docErr) {
    await supabase.storage.from('normativa-originales').remove([storagePath]).catch(() => {})
    throw new Error(`insert ${def.file}: ${docErr.message}`)
  }

  // 3) Invocar ingest (responde 202, procesa en background)
  const { error: fnErr } = await supabase.functions.invoke('normativa-ingest', {
    body: { documento_id: docId },
  })
  if (fnErr) {
    console.warn(`  ⚠ ${def.file}: ingest invoke falló (${fnErr.message}). Quedó en 'pendiente', reintentable desde UI.`)
  }

  return { file: def.file, id: docId, status: fnErr ? 'uploaded_ingest_failed' : 'uploaded_ingest_started' }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results = []
  for (const def of DOCUMENTOS) {
    try {
      process.stdout.write(`→ ${def.file} ... `)
      const r = await processOne(supabase, def)
      console.log(r.status === 'already_existed' ? `ya existía (id ${r.id}, estado ${r.estado})` : r.status)
      results.push({ ...def, ...r })
    } catch (e) {
      console.error(`FAIL: ${e.message}`)
      results.push({ ...def, status: 'error', error: e.message })
    }
  }

  console.log('\n────────────────────────────────────────────────────')
  console.log('Resumen (copialo para el rulebook):')
  console.log('────────────────────────────────────────────────────')
  for (const r of results) {
    if (r.id) console.log(`  ${r.file.padEnd(18)} → ${r.id}  [${r.titulo}]`)
    else console.log(`  ${r.file.padEnd(18)} → ERROR: ${r.error}`)
  }
  console.log('\nNota: la ingesta corre en background. Pasados ~2-3 min revisar')
  console.log('en la UI que cada documento esté en estado "indexado".')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
