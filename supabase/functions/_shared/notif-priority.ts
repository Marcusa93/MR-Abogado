// ─── Clasificación de urgencia para notif SAE ────────────────────────────────
// Llama a Claude Haiku con un prompt mínimo para determinar:
//   - prioridad: urgente | normal | info
//   - plazo_estimado_dias: int o null
//   - resumen: una sola línea para el feed
//
// Diseñado para ser barato (~$0.0001 por notif) y rápido (~1-2s con Haiku).
// Si falla, devuelve null y el caller deja la notif sin clasificar.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

export interface PriorityClassification {
  prioridad: 'urgente' | 'normal' | 'info'
  plazo_estimado_dias: number | null
  resumen: string
  tipo_acto: string | null
  dias: number | null
  es_habiles: boolean | null
  base_legal: string | null
  confianza: 'alta' | 'media' | 'baja'
}

const SYSTEM_PROMPT = `Sos un asistente jurídico de Tucumán, Argentina. Clasificás notificaciones del portal SAE por urgencia y calculás plazos procesales.

Reglas de prioridad:
- "urgente": plazos perentorios <= 5 días hábiles (traslados de demanda, intimaciones de pago, audiencias dentro de 7 días, recursos a interponer, oposiciones).
- "normal": acción esperable pero sin urgencia inmediata (proveídos, decretos de trámite, ofrecimientos de prueba con plazo > 5 días).
- "info": puro registro, sin acción requerida (constancias, comprobantes, simples notificaciones de pase a despacho).

Plazos procesales comunes (CPCC Tucumán y legislación aplicable):
- Traslado de demanda: 15 días hábiles (art. 338 CPCC)
- Traslado de excepción: 5 días hábiles (art. 347 CPCC)
- Intimación de pago: 5 días hábiles
- Reposición/oposición: 3 días hábiles (art. 240 CPCC)
- Apelación: 5 días hábiles (art. 254 CPCC)
- Ofrecimiento de prueba: 10 días hábiles (variable por fuero)
- Respuesta a cautelar: 5 días hábiles

Devolvé EXACTAMENTE este JSON, sin texto adicional:

{
  "prioridad": "urgente" | "normal" | "info",
  "plazo_estimado_dias": número entero de días hábiles | null,
  "resumen": "frase de hasta 90 caracteres describiendo qué requiere el abogado",
  "tipo_acto": "traslado_demanda" | "traslado_excepcion" | "intimacion_pago" | "citacion_audiencia" | "ofrecimiento_prueba" | "recurso_reposicion" | "apelacion" | "oposicion" | "cautelar" | "otro" | null,
  "dias": número entero del plazo | null,
  "es_habiles": true | false | null,
  "base_legal": "artículo y norma" | null,
  "confianza": "alta" | "media" | "baja"
}

Reglas para tipo_acto y confianza:
- "alta": el tipo de acto y plazo son inequívocos en el texto.
- "media": razonablemente inferible pero el texto no lo confirma explícitamente.
- "baja": no identificable con certeza. En este caso tipo_acto = null, dias = null.
- Si no hay plazo procesal (casos "info"), tipo_acto = null, dias = null, es_habiles = null, confianza = "baja".

Sé conservador con "urgente": solo cuando el texto sugiere plazo perentorio claramente <= 5 días hábiles. Cuando dudes, marcá "normal".`

interface NotifInput {
  tipo: string | null
  titulo: string | null
  caratula: string | null
  fuero: string | null
  oficina: string | null
}

export async function classifyNotifPriority(
  notif: NotifInput,
  timeoutMs = 8000,
): Promise<PriorityClassification | null> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    console.warn('classifyNotifPriority: OPENROUTER_API_KEY not set')
    return null
  }

  const userPrompt = [
    notif.tipo && `TIPO: ${notif.tipo}`,
    notif.titulo && `TÍTULO: ${notif.titulo}`,
    notif.caratula && `CARÁTULA: ${notif.caratula}`,
    notif.fuero && `FUERO: ${notif.fuero}`,
    notif.oficina && `OFICINA: ${notif.oficina}`,
  ].filter(Boolean).join('\n')

  if (!userPrompt) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado System',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 350,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      console.warn('classifyNotifPriority HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as Partial<PriorityClassification>
    if (!parsed.prioridad || !['urgente', 'normal', 'info'].includes(parsed.prioridad)) return null

    return {
      prioridad: parsed.prioridad as 'urgente' | 'normal' | 'info',
      plazo_estimado_dias: typeof parsed.plazo_estimado_dias === 'number'
        ? parsed.plazo_estimado_dias
        : null,
      resumen: typeof parsed.resumen === 'string' ? parsed.resumen.slice(0, 200) : '',
      tipo_acto: typeof parsed.tipo_acto === 'string' ? parsed.tipo_acto : null,
      dias: typeof parsed.dias === 'number' && parsed.dias > 0 ? Math.round(parsed.dias) : null,
      es_habiles: typeof parsed.es_habiles === 'boolean' ? parsed.es_habiles : null,
      base_legal: typeof parsed.base_legal === 'string' ? parsed.base_legal.slice(0, 100) : null,
      confianza: parsed.confianza === 'alta' || parsed.confianza === 'media' ? parsed.confianza : 'baja',
    }
  } catch (e) {
    console.warn('classifyNotifPriority failed:', e instanceof Error ? e.message : 'unknown')
    return null
  } finally {
    clearTimeout(timeout)
  }
}
