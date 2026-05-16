// Helper minimalista para mandar emails vía Resend.
// Requiere secret: RESEND_API_KEY (re_xxxxx)
// El "from" debe usar un dominio verificado en Resend.

const RESEND_URL = 'https://api.resend.com/emails'
// Casilla institucional del estudio. Si responden al email, el reply
// llega acá (que es una casilla real, no un alias).
const DEFAULT_FROM = 'MR Abogado <estudio@marcorossi.com.ar>'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string                 // opcional: si se omite, Resend genera desde el HTML
  from?: string                  // override del DEFAULT_FROM
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY no configurada' }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        tags: input.tags,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${errText.slice(0, 300)}` }
    }

    const payload = await res.json().catch(() => null) as { id?: string } | null
    return { ok: true, id: payload?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

// Escapa para insertar texto plano dentro de HTML sin riesgo de inyección.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
