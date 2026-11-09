// aprendizajes-consolidar — ordena las reglas aprendidas de un abogado.
//
// Detecta reglas que dicen lo mismo con otras palabras y propone una versión
// fusionada; marca las que son demasiado puntuales de un caso y las que se
// contradicen. No modifica nada: el abogado aplica cada propuesta desde la UI
// (RPC aprendizajes_fusionar / descartar).
//
// Body: { owner_id?: string }   — por defecto, el propio usuario. El director puede pedir el de otro.
// Returns: { grupos, puntuales, contradicciones, total, modelo, uso }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { MODELO, leerUso } from '../_shared/modelos-ia.ts'

const FUNCTION_NAME = 'aprendizajes-consolidar'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = MODELO.equilibrado

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Regla {
  id: string
  contenido: string
  target_kind: string
  target_ref_text: string | null
  proposed: boolean
  observed_in_cases: number
  confidence: string
}

const SISTEMA = `Ordenás las reglas de redacción que un sistema aprendió de las correcciones de un abogado de Tucumán (Argentina).

Te paso las reglas numeradas. Muchas dicen lo mismo con otras palabras. Tu tarea:

1. GRUPOS: juntá las reglas que expresan la MISMA preferencia (aunque cambie la redacción o el ámbito declarado). Para cada grupo redactá UNA regla fusionada: clara, en una o dos oraciones, imperativa, en español rioplatense formal, que conserve las condiciones relevantes ("cuando...", "en escritos de..."). Si las reglas del grupo tienen ámbitos distintos, usá el más general que sea fiel. Solo grupos de 2 o más reglas.
2. PUNTUALES: reglas que solo sirven para un caso concreto (nombres, hechos o argumentos de un expediente) y no se pueden aplicar a otros escritos.
3. CONTRADICCIONES: pares o grupos de reglas que piden cosas opuestas (por ejemplo, usar y no usar "V.S."). Describí el conflicto en una oración.

No inventes reglas que no estén en la lista. Cada número puede aparecer en un solo grupo.

Devolvé SOLO JSON, sin bloque de código:
{"grupos":[{"reglas":[1,4,9],"regla":"texto fusionado","ambito":"petitorio"}],"puntuales":[{"regla":12,"motivo":"..."}],"contradicciones":[{"reglas":[3,7],"detalle":"..."}]}`

function parseJson(raw: string): unknown {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  if (!s.startsWith('{')) {
    const i = s.indexOf('{')
    const j = s.lastIndexOf('}')
    if (i >= 0 && j > i) s = s.slice(i, j + 1)
  }
  try { return JSON.parse(s) } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anon.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => ({})) as { owner_id?: string }
    const ownerId = body?.owner_id || user.id
    if (ownerId !== user.id) {
      const { data: esDirector } = await anon.rpc('is_director')
      if (!esDirector) return json(req, { error: 'Solo la dirección puede ordenar los aprendizajes de otro abogado' }, 403)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin
      .from('aprendizajes_rulebook')
      .select('id, contenido, target_kind, target_ref_text, proposed, observed_in_cases, confidence')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(400)
    if (error) return json(req, { error: error.message }, 500)
    const reglas = (data ?? []) as Regla[]
    if (reglas.length < 2) return json(req, { grupos: [], puntuales: [], contradicciones: [], total: reglas.length })

    const lista = reglas.map((r, i) => `${i + 1}. [${r.target_ref_text || r.target_kind}] ${r.contenido.replace(/\s+/g, ' ').trim()}`).join('\n')
    const inputBytes = new TextEncoder().encode(lista).length
    const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    const ac = new AbortController()
    const tid = setTimeout(() => ac.abort(), 140_000)
    let res: Response
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
          'HTTP-Referer': 'https://app.marcorossi.com.ar',
          'X-Title': 'MR Abogado ordenar aprendizajes',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SISTEMA },
            { role: 'user', content: `## Reglas (${reglas.length})\n${lista}` },
          ],
          temperature: 0,
          max_tokens: 12_000,
          usage: { include: true },
        }),
        signal: ac.signal,
      })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return json(req, { error: 'El modelo tardó demasiado. Probá de nuevo.' }, 504)
      throw e
    } finally {
      clearTimeout(tid)
    }
    if (!res.ok) {
      console.error('[aprendizajes-consolidar] OpenRouter', res.status, (await res.text()).slice(0, 300))
      return json(req, { error: `El modelo respondió con error (${res.status})` }, 502)
    }
    const payload = await res.json()
    const uso = leerUso(payload)
    logLlmCall(admin, user.id, FUNCTION_NAME, inputBytes, { costo_usd: uso.costo_usd, modelo: MODEL })
    const parsed = parseJson(String(payload?.choices?.[0]?.message?.content ?? '')) as {
      grupos?: { reglas?: number[]; regla?: string; ambito?: string }[]
      puntuales?: { regla?: number; motivo?: string }[]
      contradicciones?: { reglas?: number[]; detalle?: string }[]
    } | null
    if (!parsed) return json(req, { error: 'El modelo devolvió una respuesta incompleta. Probá de nuevo.' }, 502)

    const usados = new Set<number>()
    const ref = (n: unknown) => (typeof n === 'number' && n >= 1 && n <= reglas.length ? reglas[n - 1] : null)
    const grupos = (parsed.grupos ?? []).map((g) => {
      const idx = [...new Set((g.reglas ?? []).filter((n) => ref(n) && !usados.has(n)))]
      idx.forEach((n) => usados.add(n))
      const items = idx.map((n) => ref(n)!)
      return {
        regla: String(g.regla ?? '').trim(),
        ambito: g.ambito ? String(g.ambito).trim() : null,
        ids: items.map((r) => r.id),
        originales: items.map((r) => ({ id: r.id, contenido: r.contenido, proposed: r.proposed, observed_in_cases: r.observed_in_cases })),
      }
    }).filter((g) => g.ids.length >= 2 && g.regla)

    const puntuales = (parsed.puntuales ?? [])
      .map((p) => ({ r: ref(p.regla), motivo: String(p.motivo ?? '').trim() }))
      .filter((p) => p.r && !usados.has(reglas.indexOf(p.r) + 1))
      .map((p) => ({ id: p.r!.id, contenido: p.r!.contenido, proposed: p.r!.proposed, motivo: p.motivo }))

    const contradicciones = (parsed.contradicciones ?? [])
      .map((c) => ({ items: (c.reglas ?? []).map(ref).filter(Boolean) as Regla[], detalle: String(c.detalle ?? '').trim() }))
      .filter((c) => c.items.length >= 2)
      .map((c) => ({ detalle: c.detalle, reglas: c.items.map((r) => ({ id: r.id, contenido: r.contenido })) }))

    return json(req, { grupos, puntuales, contradicciones, total: reglas.length, modelo: MODEL, uso })
  } catch (err) {
    console.error('[aprendizajes-consolidar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})
