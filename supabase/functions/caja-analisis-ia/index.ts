// Analiza gastos e ingresos del estudio con LLM para detectar errores, mejoras y recuperables.
// Modes:
//   1. Cron (x-cron-secret header): corre a las 8am AR, sin auth de usuario
//   2. Manual: requiere auth con rol DIRECTOR
// Resultados en: caja_ia_observaciones
// Push a DIRECTOR si hay observaciones

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const FUNCTION_NAME = 'caja-analisis-ia'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const GASTO_CAT: Record<string, string> = {
  timbrado: 'Timbrado judicial', oficios: 'Oficios', pericia: 'Pericia',
  viaticos: 'Viáticos', cedulas: 'Cédulas/Notificaciones', fotocopias: 'Fotocopias',
  estacionamiento: 'Estacionamiento', alquiler: 'Alquiler',
  servicios: 'Servicios (luz/internet)', sueldos: 'Sueldos',
  honorarios_externos: 'Honorarios externos', impuestos: 'Impuestos',
  software: 'Software', libros_bibliografia: 'Libros/Bibliografía', otro: 'Otro',
}

const INGRESO_TIPO: Record<string, string> = {
  abono_mensual: 'Abono mensual', honorario_expediente: 'Honorario de expediente',
  anticipo: 'Anticipo', consulta: 'Consulta',
  pacto_quota_litis: 'Pacto cuota litis', otro: 'Otro',
}

interface ObservacionIA {
  tipo: 'gasto' | 'ingreso'
  registro_id: string
  nivel: 'alerta' | 'error'
  observacion: string
  sugerencia: string | null
  campo_afectado: string | null
  valor_sugerido: string | null
}

const SYSTEM_PROMPT = `Sos el asesor de gestión financiera del Estudio Jurídico de Marco Rossi (Tucumán, Argentina). Analizás gastos e ingresos para detectar problemas y mejoras.

Detectá específicamente:
1. Gastos con categoría "otro" que tienen categoría más específica disponible
2. Gastos sin descripción (¿para qué fue el gasto?)
3. Gastos sin expediente vinculado pero cuya descripción sugiere que pertenecen a un caso (ej: "pericia para...", "cédula de...", "timbrado causa...")
4. Gastos marcados como NO recuperables que por su naturaleza o descripción deberían cobrarse al cliente (cédulas, timbrados judiciales, pericias, viáticos de expediente)
5. Gastos marcados como recuperables pero sin expediente vinculado (¿cómo se cobra sin saber a qué expediente pertenece?)
6. Ingresos sin cliente asignado (SIN_CLIENTE) siendo que no son de tipo consulta sin persona identificada
7. Ingresos de tipo "otro" que tienen tipo más específico disponible
8. Posibles duplicados: misma fecha + mismo monto + misma categoría/tipo
9. Montos inusuales para su categoría (ej: un "timbrado" de $500.000, un "estacionamiento" de $50.000)

Devolvé SOLO un JSON array válido. Sin markdown. Sin texto extra antes o después del JSON.
Si no encontrás problemas, devolvé: []

Formato de cada item:
{
  "tipo": "gasto" o "ingreso",
  "registro_id": "UUID-exacto-del-registro",
  "nivel": "alerta" o "error",
  "observacion": "descripción clara del problema en español rioplatense",
  "sugerencia": "qué hacer para corregirlo, o null",
  "campo_afectado": "categoria" o "recuperable" o "descripcion" o "tipo" o "cliente_id" o "expediente_id" o "monto",
  "valor_sugerido": "valor concreto o null"
}

Reglas:
- "error" = problema claro que hay que corregir (ej: gasto sin descripción, ingreso sin cliente cuando hay monto significativo)
- "alerta" = probable mejora o caso a revisar (ej: categoría posiblemente incorrecta, recuperable probablemente mal marcado)
- Usá el UUID completo del registro_id tal como aparece en los datos
- No marques como error algo que sea claramente correcto`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Auth: cron secret o usuario autenticado DIRECTOR
    const cronSecret = Deno.env.get('CRON_SECRET')
    const isCron = Boolean(cronSecret && req.headers.get('x-cron-secret') === cronSecret)
    let userId: string | null = null

    if (!isCron) {
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: { user }, error: authErr } = await anonClient.auth.getUser()
      if (authErr || !user) return json(req, { error: 'No autorizado' }, 401)

      const { data: profile } = await admin
        .from('profiles').select('rol').eq('id', user.id).single()
      if (profile?.rol !== 'DIRECTOR') {
        return json(req, { error: 'Solo el director del estudio puede ejecutar este análisis' }, 403)
      }
      userId = user.id
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

    // Últimos 60 días
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [gastosRes, ingresosRes] = await Promise.all([
      admin.from('gastos')
        .select('id, fecha, monto, moneda, categoria, descripcion, expediente_id, recuperable, recuperado_at')
        .gte('fecha', since).is('deleted_at', null)
        .order('fecha', { ascending: false }).limit(150),
      admin.from('ingresos')
        .select('id, fecha, monto, moneda, tipo, descripcion, cliente_id, expediente_id')
        .gte('fecha', since).is('deleted_at', null)
        .order('fecha', { ascending: false }).limit(150),
    ])

    if (gastosRes.error) return json(req, { error: gastosRes.error.message }, 500)
    if (ingresosRes.error) return json(req, { error: ingresosRes.error.message }, 500)

    const gastos = gastosRes.data ?? []
    const ingresos = ingresosRes.data ?? []

    if (gastos.length === 0 && ingresos.length === 0) {
      return json(req, { ok: true, observaciones: 0, message: 'Sin registros en el período' })
    }

    const gastosText = gastos.map(g => {
      const cat = GASTO_CAT[g.categoria] ?? g.categoria
      const rec = g.recuperable ? 'recuperable=SÍ' : 'recuperable=NO'
      const exp = g.expediente_id ? `exp=vinculado` : 'exp=SIN_EXPEDIENTE'
      const ya = g.recuperado_at ? ' [YA_RECUPERADO]' : ''
      return `ID:${g.id} | ${g.fecha} | ${g.moneda} ${g.monto} | ${cat} | ${rec} | ${exp}${ya} | desc:"${g.descripcion ?? ''}"`
    }).join('\n')

    const ingresosText = ingresos.map(i => {
      const tipo = INGRESO_TIPO[i.tipo] ?? i.tipo
      const cliente = i.cliente_id ? 'cliente=vinculado' : 'cliente=SIN_CLIENTE'
      const exp = i.expediente_id ? 'exp=vinculado' : 'exp=sin_expediente'
      return `ID:${i.id} | ${i.fecha} | ${i.moneda} ${i.monto} | ${tipo} | ${cliente} | ${exp} | desc:"${i.descripcion ?? ''}"`
    }).join('\n')

    const userMessage = `Período: últimos 60 días (desde ${since})

GASTOS (${gastos.length}):
${gastosText || '(ninguno)'}

INGRESOS (${ingresos.length}):
${ingresosText || '(ninguno)'}

Analizá y devolvé observaciones como JSON array usando los UUID completos de cada registro.`

    const inputBytes = new TextEncoder().encode(userMessage).length

    if (!isCron && userId) {
      const guard = await checkLlmGuard(admin, userId, FUNCTION_NAME, inputBytes)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)
      logLlmCall(admin, userId, FUNCTION_NAME, inputBytes)
    }

    const llmRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Caja IA',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    })

    if (!llmRes.ok) {
      const errText = await llmRes.text()
      console.error('[caja-analisis-ia] LLM error:', llmRes.status, errText.slice(0, 300))
      return json(req, { error: `LLM error: ${llmRes.status}` }, 502)
    }

    const llmData = await llmRes.json()
    const rawContent: string = llmData?.choices?.[0]?.message?.content ?? '[]'

    let observaciones: ObservacionIA[] = []
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        observaciones = parsed.filter((o): o is ObservacionIA =>
          o !== null && typeof o === 'object' &&
          (o.tipo === 'gasto' || o.tipo === 'ingreso') &&
          typeof o.registro_id === 'string' && o.registro_id.length > 10 &&
          (o.nivel === 'alerta' || o.nivel === 'error') &&
          typeof o.observacion === 'string',
        )
      }
    } catch {
      console.error('[caja-analisis-ia] parse error, raw:', rawContent.slice(0, 400))
    }

    // Validate registro_ids against actual data to prevent hallucinations
    const validGastoIds = new Set(gastos.map(g => g.id))
    const validIngresoIds = new Set(ingresos.map(i => i.id))
    observaciones = observaciones.filter(o =>
      (o.tipo === 'gasto' && validGastoIds.has(o.registro_id)) ||
      (o.tipo === 'ingreso' && validIngresoIds.has(o.registro_id)),
    )

    // Replace active observations for the affected records
    const registroIds = [...new Set(observaciones.map(o => o.registro_id))]
    if (registroIds.length > 0) {
      await admin.from('caja_ia_observaciones')
        .delete()
        .in('registro_id', registroIds)
        .is('aplicado_at', null)
        .is('descartado_at', null)
    }

    if (observaciones.length > 0) {
      const now = new Date().toISOString()
      await admin.from('caja_ia_observaciones').insert(
        observaciones.map(o => ({
          tipo: o.tipo,
          registro_id: o.registro_id,
          nivel: o.nivel,
          observacion: o.observacion,
          sugerencia: o.sugerencia ?? null,
          campo_afectado: o.campo_afectado ?? null,
          valor_sugerido: o.valor_sugerido ?? null,
          analizado_at: now,
        })),
      )
    }

    // Push a directores si hay observaciones
    if (observaciones.length > 0) {
      const pubKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY')
      const privKey = Deno.env.get('VAPID_PRIVATE_KEY')
      const subject = Deno.env.get('VAPID_SUBJECT')

      if (pubKey && privKey && subject) {
        webpush.setVapidDetails(subject, pubKey, privKey)

        const { data: directors } = await admin
          .from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true)

        if (directors?.length) {
          const { data: subs } = await admin
            .from('push_subscriptions').select('endpoint, p256dh_key, auth_key')
            .in('user_id', directors.map(d => d.id))

          const errCount = observaciones.filter(o => o.nivel === 'error').length
          const warnCount = observaciones.filter(o => o.nivel === 'alerta').length
          const total = observaciones.length

          const title = errCount > 0
            ? `${errCount} problema${errCount > 1 ? 's' : ''} detectado${errCount > 1 ? 's' : ''} en caja`
            : `${warnCount} sugerencia${warnCount > 1 ? 's' : ''} de mejora en caja`

          const lines: string[] = []
          if (errCount > 0) lines.push(`⚠ ${errCount} error${errCount > 1 ? 'es' : ''} a corregir`)
          if (warnCount > 0) lines.push(`· ${warnCount} alerta${warnCount > 1 ? 's' : ''} de revisión`)

          const payload = JSON.stringify({
            title,
            body: lines.join('\n'),
            url: '/caja',
            tag: 'caja-analisis-ia',
          })

          const toRemove: string[] = []
          for (const sub of (subs ?? [])) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
                payload,
              )
            } catch (err: unknown) {
              const code = (err as { statusCode?: number })?.statusCode
              if (code === 404 || code === 410) toRemove.push(sub.endpoint)
            }
          }
          if (toRemove.length) {
            await admin.from('push_subscriptions').delete().in('endpoint', toRemove)
          }
        }
      }
    }

    console.log(`[caja-analisis-ia] ${gastos.length}g + ${ingresos.length}i → ${observaciones.length} obs`)

    return json(req, {
      ok: true,
      gastos_analizados: gastos.length,
      ingresos_analizados: ingresos.length,
      observaciones: observaciones.length,
      errores: observaciones.filter(o => o.nivel === 'error').length,
      alertas: observaciones.filter(o => o.nivel === 'alerta').length,
    })
  } catch (err) {
    console.error('[caja-analisis-ia]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})
