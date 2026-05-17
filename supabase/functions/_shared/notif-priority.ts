// ─── Clasificación de urgencia para notif SAE ────────────────────────────────
// Llama a Claude Haiku con un prompt mínimo para determinar:
//   - prioridad: urgente | normal | info
//   - plazo_estimado_dias: int o null
//   - resumen: una sola línea para el feed
//
// Diseñado para ser barato (~$0.0001 por notif) y rápido (~1-2s con Haiku).
// Si falla, devuelve null y el caller deja la notif sin clasificar.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-3.5-haiku'

export interface PriorityClassification {
  prioridad: 'urgente' | 'normal' | 'info'
  plazo_estimado_dias: number | null
  resumen: string
}

const SYSTEM_PROMPT = `Sos un asistente jurídico de Tucumán, Argentina. Clasificás notificaciones del portal SAE por urgencia.

Reglas:
- "urgente": plazos perentorios <= 5 días hábiles (traslados de demanda, intimaciones de pago, audiencias dentro de 7 días, recursos a interponer, oposiciones).
- "normal": acción esperable pero sin urgencia inmediata (proveídos, decretos de trámite, ofrecimientos de prueba con plazo > 5 días).
- "info": puro registro, sin acción requerida (constancias, comprobantes, simples notificaciones de pase a despacho).

Devolvé EXACTAMENTE este JSON, sin texto adicional:

{
  "prioridad": "urgente" | "normal" | "info",
  "plazo_estimado_dias": número entero de días hábiles | null si no es estimable,
  "resumen": "frase corta de hasta 90 caracteres describiendo qué requiere el abogado"
}

Sé conservador con "urgente": solo cuando el texto sugiere plazo perentorio o claramente <= 5 días hábiles. Cuando dudes, marcá "normal".`

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
        max_tokens: 200,
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
    }
  } catch (e) {
    console.warn('classifyNotifPriority failed:', e instanceof Error ? e.message : 'unknown')
    return null
  } finally {
    clearTimeout(timeout)
  }
}
