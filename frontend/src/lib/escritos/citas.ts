import type { EscritoContenido } from '@/hooks/use-escritos'

export interface CitaDetectada {
  texto: string
  tipo: 'norma' | 'fallo'
  respaldada: boolean
  /** Fuente propia que la respalda, si hay. */
  fuente?: string
}

const RE_NORMA = /\b(?:arts?\.|art[íi]culos?)\s*\d+[°º]?(?:\s*(?:,|y|e|inc\.?\s*\w+)\s*\d*[°º]?)*(?:\s*(?:del?|de la)?\s*(?:ley\s*(?:n[°º.]?\s*)?[\d.]+(?:\/\d+)?|CCyCN|CCCN|C\.?C\.?y\.?C\.?N?|CPCCT?|CPCCN|CPPT|CPLT|LCT|LDC|LCQ|C\.?N\.?|Constituci[oó]n\s+(?:Nacional|Provincial)))?/gi
const RE_LEY = /\bley\s*(?:n[°º.]?\s*)?\d{1,2}\.?\d{3}\b/gi
const RE_FALLO = /(?:["“«])([^"”»]{3,90}?\s+c\/\s*[^"”»]{2,90}?)(?:["”»])|\bFallos\s*:?\s*\d{2,3}\s*:\s*\d+/g

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function textoDe(c: EscritoContenido): string {
  return (c.secciones ?? []).filter((s) => !/^(petitorio|personer)/i.test(s.titulo)).flatMap((s) => s.parrafos).join('\n')
}

/**
 * Busca citas de normas y fallos en el escrito y marca cuáles tienen respaldo
 * en las fuentes que usó la IA (normativa y fallos del corpus del estudio).
 * No dice que una cita sea falsa: dice cuáles hay que verificar a mano.
 */
export function detectarCitas(
  c: EscritoContenido,
  respaldos: { texto: string; documento?: string | null; fuente: 'normativa' | 'jurisprudencia' }[],
): CitaDetectada[] {
  const texto = textoDe(c)
  const caratulaPropia = norm(c.caratula ?? '').split(' c/')[0]?.slice(0, 20) ?? ''
  const base = respaldos.map((r) => ({ ...r, n: norm(`${r.documento ?? ''} ${r.texto}`) }))
  const vistas = new Set<string>()
  const out: CitaDetectada[] = []

  const agregar = (raw: string, tipo: 'norma' | 'fallo') => {
    const t = raw.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '')
    const k = norm(t)
    if (t.length < 5 || vistas.has(k)) return
    if (tipo === 'fallo' && caratulaPropia && k.includes(caratulaPropia)) return
    vistas.add(k)
    let hit: (typeof base)[number] | undefined
    if (tipo === 'norma') {
      const nums = k.match(/\d+/g) ?? []
      const cuerpo = k.match(/ley\s*(?:n[°º.]?\s*)?[\d.]+|ccycn|cccn|cpcc?t?|cpccn|cppt|lct|ldc|constitucion/)?.[0]?.replace(/\./g, '')
      hit = base.find((b) => b.fuente === 'normativa' && nums.every((n) => b.n.includes(n)) && (!cuerpo || b.n.replace(/\./g, '').includes(cuerpo.replace(/\s/g, '').slice(0, 6)) || b.n.includes(cuerpo)))
    } else {
      const primera = k.split(' c/')[0]?.split(' ').filter((w) => w.length > 3)[0]
      hit = primera ? base.find((b) => b.fuente === 'jurisprudencia' && b.n.includes(primera)) : undefined
    }
    out.push({ texto: t, tipo, respaldada: !!hit, fuente: hit?.documento ?? undefined })
  }

  for (const m of texto.matchAll(RE_NORMA)) agregar(m[0], 'norma')
  for (const m of texto.matchAll(RE_LEY)) {
    if (![...vistas].some((v) => v.includes(norm(m[0])))) agregar(m[0], 'norma')
  }
  for (const m of texto.matchAll(RE_FALLO)) agregar(m[1] ?? m[0], 'fallo')
  return out
}
