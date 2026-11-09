import type { EscritoContenido } from '@/hooks/use-escritos'

/** Datos del expediente que completan una plantilla. */
export interface DatosPlantilla {
  encabezado: string
  caratula: string
  expte: string
  cliente: string
}

export const VARIABLES_PLANTILLA: { k: keyof DatosPlantilla; etiqueta: string }[] = [
  { k: 'encabezado', etiqueta: 'Encabezado (juzgado)' },
  { k: 'caratula', etiqueta: 'Carátula' },
  { k: 'expte', etiqueta: 'N° de expediente' },
  { k: 'cliente', etiqueta: 'Cliente' },
]

const VACIO: Record<keyof DatosPlantilla, string> = {
  encabezado: '[ENCABEZADO DEL JUZGADO]',
  caratula: '[CARÁTULA]',
  expte: '[N° DE EXPEDIENTE]',
  cliente: '[NOMBRE DEL CLIENTE]',
}

// Marcadores que usan los modelos cargados a mano o extraídos por la IA
const MARCADORES: { re: RegExp; k: keyof DatosPlantilla }[] = [
  { re: /\[(?:CAR[AÁ]TULA|CARATULA DEL EXPEDIENTE)\]/gi, k: 'caratula' },
  { re: /\[(?:N[°º]?\s*(?:DE\s+)?EXPEDIENTE|N[UÚ]MERO DE EXPEDIENTE|EXPEDIENTE|EXPTE\.?)\]/gi, k: 'expte' },
  { re: /\[(?:NOMBRE DEL CLIENTE|CLIENTE)\]/gi, k: 'cliente' },
]

function reemplazar(s: string, d: DatosPlantilla): string {
  let out = s.replace(/\{\{\s*(encabezado|caratula|expte|cliente)\s*\}\}/g, (_, k: keyof DatosPlantilla) => d[k]?.trim() || VACIO[k])
  for (const m of MARCADORES) out = out.replace(m.re, () => d[m.k]?.trim() || VACIO[m.k])
  return out
}

/** Completa la plantilla con los datos del expediente. Lo que falta queda como [DATO] para la guía. */
export function aplicarPlantilla(c: EscritoContenido, d: DatosPlantilla): EscritoContenido {
  return {
    ...c,
    titulo: reemplazar(c.titulo ?? '', d),
    encabezado_juez: reemplazar(c.encabezado_juez || '{{encabezado}}', d),
    caratula: reemplazar(c.caratula || '{{caratula}} - Expte. N° {{expte}}', d),
    secciones: (c.secciones ?? []).map((s) => ({ titulo: reemplazar(s.titulo ?? '', d), parrafos: (s.parrafos ?? []).map((p) => reemplazar(p, d)) })),
  }
}

/** Inverso: al guardar un escrito como plantilla, los datos del expediente pasan a variables. */
export function aVariables(c: EscritoContenido, d: Partial<DatosPlantilla>): EscritoContenido {
  const pares = (Object.entries(d) as [keyof DatosPlantilla, string | undefined][])
    .filter(([, v]) => v && v.trim().length >= 3)
    .sort((a, b) => (b[1]!.length - a[1]!.length))
  const sub = (s: string) => pares.reduce((acc, [k, v]) => acc.split(v!.trim()).join(`{{${k}}}`), s)
  return {
    ...c,
    titulo: sub(c.titulo ?? ''),
    encabezado_juez: sub(c.encabezado_juez ?? ''),
    caratula: sub(c.caratula ?? ''),
    secciones: (c.secciones ?? []).map((s) => ({ titulo: sub(s.titulo), parrafos: s.parrafos.map(sub) })),
  }
}

/** Encabezado sugerido según la oficina del SAE cuando no hay escritos previos. */
export function encabezadoDesdeSae(jurisdiccion: string | null | undefined, oficina: string | null | undefined): string {
  const j = (jurisdiccion ?? '').trim()
  const o = (oficina ?? '').toLowerCase()
  if (/mediaci/i.test(j) || o.includes('mediaci')) return 'SR. DIRECTOR DEL CENTRO DE MEDIACIÓN JUDICIAL'
  if (o.includes('apelaci')) return 'EXCMA. CÁMARA DE APELACIONES EN LO CIVIL Y COMERCIAL COMÚN — SALA [SALA]'
  if (!j) return VACIO.encabezado
  return `SR. JUEZ DE PRIMERA INSTANCIA EN LO ${j.toUpperCase()} DE LA [N°] NOMINACIÓN`
}

// ─── Medición: cuánto cambió el abogado ─────────────────────────────────────

export function textoPlano(c: EscritoContenido | null | undefined): string {
  if (!c) return ''
  return [c.encabezado_juez, c.caratula, ...(c.secciones ?? []).flatMap((s) => [s.titulo, ...(s.parrafos ?? [])])]
    .filter(Boolean).join('\n')
}

const palabras = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * Porcentaje del texto cambiado entre dos versiones, por palabras:
 * 100 · (1 − 2·LCS / (|a| + |b|)). 0 = idéntico, 100 = nada en común.
 */
export function porcentajeEdicion(original: string, final: string): number {
  const a = palabras(original)
  const b = palabras(final)
  if (!a.length && !b.length) return 0
  if (!a.length || !b.length) return 100
  // Recorta prefijo y sufijo comunes (lo habitual en correcciones puntuales)
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fa = a.length - 1, fb = b.length - 1
  while (fa >= ini && fb >= ini && a[fa] === b[fb]) { fa--; fb-- }
  const comun = ini + (a.length - 1 - fa)
  const ma = a.slice(ini, fa + 1)
  const mb = b.slice(ini, fb + 1)
  let lcs = 0
  if (ma.length && mb.length) {
    if (ma.length * mb.length > 25_000_000) {
      // Textos enormes: aproximación por conjunto de palabras
      const cuenta = new Map<string, number>()
      for (const w of ma) cuenta.set(w, (cuenta.get(w) ?? 0) + 1)
      for (const w of mb) { const n = cuenta.get(w) ?? 0; if (n > 0) { lcs++; cuenta.set(w, n - 1) } }
    } else {
      let prev = new Int32Array(mb.length + 1)
      let cur = new Int32Array(mb.length + 1)
      for (let i = 1; i <= ma.length; i++) {
        for (let j = 1; j <= mb.length; j++) {
          cur[j] = ma[i - 1] === mb[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!)
        }
        ;[prev, cur] = [cur, prev]
      }
      lcs = prev[mb.length]!
    }
  }
  const total = comun + lcs
  return Math.round(1000 * (1 - (2 * total) / (a.length + b.length))) / 10
}
