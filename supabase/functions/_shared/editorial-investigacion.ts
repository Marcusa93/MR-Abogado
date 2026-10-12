// Investigación externa del módulo Editorial (Gemini Deep Research u otra):
// pedido con formato fijo, lectura del informe, descarga de fuentes y
// comprobación literal de citas. Nada de esto usa IA salvo la normalización
// de informes que no respetaron el formato (en editorial-ia).

import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'

export interface Hallazgo {
  afirmacion: string
  tipo: 'norma' | 'fallo' | 'doctrina' | 'dato'
  fuente: string | null
  url: string | null
  cita: string | null
  vigencia: string | null
  confianza: string | null
  numero: string | null
  tribunal: string | null
  fecha: string | null
  jurisdiccion: string | null
}

const TIPOS = ['norma', 'fallo', 'doctrina', 'dato'] as const

// ── Pedido para Deep Research ───────────────────────────────────────────────

export function pedidoDeepResearch(p: {
  titulo: string; problema?: string | null; pregunta?: string | null; hipotesis?: string | null; enfoque?: string | null
}): string {
  return `Actuá como investigador jurídico argentino. Necesito una investigación exhaustiva y verificable para un artículo jurídico.

TEMA: ${p.titulo}
${p.problema ? `PROBLEMA JURÍDICO: ${p.problema}\n` : ''}${p.pregunta ? `PREGUNTA A RESPONDER: ${p.pregunta}\n` : ''}${p.hipotesis ? `HIPÓTESIS DE TRABAJO (confirmala o refutala, no la des por cierta): ${p.hipotesis}\n` : ''}${p.enfoque ? `ENFOQUE: ${p.enfoque}\n` : ''}
JURISDICCIÓN: Argentina, con prioridad en la Provincia de Tucumán. Distinguí siempre lo nacional de lo provincial.

QUÉ INVESTIGAR
1. Normativa aplicable (nacional y de Tucumán): número, artículos concretos, texto vigente, modificaciones y derogaciones.
2. Jurisprudencia: Corte Suprema de Justicia de la Nación, Corte Suprema de Justicia de Tucumán, cámaras de Tucumán y, si aportan, tribunales de otras provincias. Carátula, tribunal, fecha y qué resolvió.
3. Doctrina relevante, si es accesible (autor, obra, año).
4. Posiciones encontradas, cambios de criterio y debates abiertos.

FUENTES A PRIORIZAR
- Normas: infoleg.gob.ar, saij.gob.ar, boletinoficial.gob.ar, boletin.tucuman.gov.ar, digesto y Legislatura de Tucumán (legislaturadetucuman.gob.ar).
- Fallos: sj.csjn.gov.ar / csjn.gov.ar, saij.gob.ar, jurisprudencia del Poder Judicial de Tucumán (justucuman.gov.ar).
- Fuentes secundarias (universidades, colegios de abogados, revistas jurídicas): usalas, pero marcá la confianza como "media".

REGLAS DE PRECISIÓN (muy importantes)
- No inventes normas, artículos, fallos, fechas ni citas. Si no encontrás algo, decilo en la sección final.
- Cada hallazgo debe tener la URL directa de la página donde está (no enlaces de redirección ni de buscadores).
- La "Cita textual" debe ser un fragmento copiado literalmente de esa página, entre 15 y 60 palabras, sin cambiar ni una palabra. Si no podés copiarlo literal, dejala vacía.
- Indicá si la norma está vigente y si fue modificada.

FORMATO DE RESPUESTA (obligatorio, respetalo exactamente; podés escribir antes un resumen breve)
Escribí cada hallazgo en un bloque así:

### HALLAZGO 1
Afirmación: (lo que se sostiene, en una o dos oraciones)
Tipo: norma | fallo | doctrina | dato
Fuente: (nombre: "Ley 26.485, art. 9" / "CSJ Tucumán, 'Carátula', 12/03/2021" / "Autor, Obra, año")
Número: (número de ley, decreto o expediente, si corresponde)
Tribunal: (si es un fallo)
Fecha: (de la norma o del fallo)
Jurisdicción: (Nacional / Tucumán / otra)
URL: (dirección completa y directa)
Cita textual: "(fragmento literal de la página)"
Vigencia: (vigente / modificada por… / derogada / no aplica)
Confianza: alta | media | baja

### HALLAZGO 2
…

Al final agregá:

### DISCREPANCIAS
(dónde las fuentes no coinciden o hay criterios encontrados)

### NO ENCONTRADO
(lo que buscaste y no pudiste confirmar)

Escribí todo en español.`
}

// ── Lectura del informe ─────────────────────────────────────────────────────

const limpio = (v: string | undefined | null) => {
  const t = (v ?? '').replace(/^["“”'«»*_\s]+|["“”'«»*_\s]+$/g, '').trim()
  return t && !/^(\(|—|-|n\/a|no aplica|ninguna?|s\/d)$/i.test(t) ? t : null
}

/** Lee los bloques "### HALLAZGO n" del formato pedido. Devuelve [] si el informe no lo respetó. */
export function parsearBloques(texto: string): Hallazgo[] {
  const partes = texto.replace(/\r\n/g, '\n').split(/^\s*#{1,4}\s*\**\s*HALLAZGO\s*\d*\**.*$/gim).slice(1)
  const out: Hallazgo[] = []
  for (const parte of partes) {
    const bloque = parte.split(/^\s*#{1,4}\s*\**\s*(DISCREPANCIAS|NO ENCONTRADO)/im)[0] ?? ''
    const campo = (nombre: string) => {
      const m = new RegExp(`^\\s*[-*]?\\s*\\**${nombre}\\**\\s*:\\s*([\\s\\S]*?)(?=^\\s*[-*]?\\s*\\**(?:Afirmaci[oó]n|Tipo|Fuente|N[uú]mero|Tribunal|Fecha|Jurisdicci[oó]n|URL|Cita textual|Vigencia|Confianza)\\**\\s*:|$(?![\\s\\S]))`, 'im').exec(bloque)
      return m ? m[1]!.trim() : null
    }
    const afirmacion = limpio(campo('Afirmaci[oó]n'))
    if (!afirmacion) continue
    const tipoRaw = (campo('Tipo') ?? '').toLowerCase()
    const url = (campo('URL') ?? '').match(/https?:\/\/[^\s)>\]"]+/)?.[0] ?? null
    out.push({
      afirmacion,
      tipo: (TIPOS.find((t) => tipoRaw.includes(t)) ?? 'dato'),
      fuente: limpio(campo('Fuente')),
      url,
      cita: limpio(campo('Cita textual')),
      vigencia: limpio(campo('Vigencia')),
      confianza: limpio(campo('Confianza'))?.toLowerCase() ?? null,
      numero: limpio(campo('N[uú]mero')),
      tribunal: limpio(campo('Tribunal')),
      fecha: limpio(campo('Fecha')),
      jurisdiccion: limpio(campo('Jurisdicci[oó]n')),
    })
  }
  return out
}

/** Normaliza lo que devuelve la IA cuando el informe vino en prosa. */
export function hallazgoDesdeIA(h: Record<string, unknown>): Hallazgo | null {
  const s = (k: string) => limpio(typeof h[k] === 'string' ? h[k] as string : h[k] == null ? null : String(h[k]))
  const afirmacion = s('afirmacion')
  if (!afirmacion) return null
  const tipo = String(h.tipo ?? '').toLowerCase()
  const url = (s('url') ?? '').match(/https?:\/\/[^\s)>\]"]+/)?.[0] ?? null
  return {
    afirmacion, tipo: TIPOS.find((t) => tipo.includes(t)) ?? 'dato', fuente: s('fuente'), url, cita: s('cita'),
    vigencia: s('vigencia'), confianza: s('confianza')?.toLowerCase() ?? null, numero: s('numero'),
    tribunal: s('tribunal'), fecha: s('fecha'), jurisdiccion: s('jurisdiccion'),
  }
}

// ── Fuentes ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 12_000_000

function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ({ aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', laquo: '«', raquo: '»', ordm: 'º', deg: '°' } as Record<string, string>)[e] ?? m)
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
}

/** Baja una fuente y devuelve su texto. Sigue redirecciones (los links de Gemini suelen ser redirecciones). */
export async function obtenerFuente(url: string): Promise<{ ok: true; texto: string; urlFinal: string; titulo: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    })
    if (res.status === 404 || res.status === 410) return { ok: false, error: `La página no existe (${res.status}): el link puede estar mal o ser inventado` }
    if (!res.ok) return { ok: false, error: `La página respondió ${res.status}` }
    const tipo = res.headers.get('content-type') ?? ''
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) return { ok: false, error: 'Archivo demasiado grande' }
    let texto = ''
    let titulo: string | null = null
    if (tipo.includes('pdf') || /\.pdf($|\?)/i.test(res.url)) {
      const pdf = await getDocumentProxy(buf)
      texto = (await extractText(pdf, { mergePages: true })).text as unknown as string
    } else {
      // Muchos sitios oficiales (InfoLEG) están en latin1 sin declararlo en el encabezado
      const cabecera = new TextDecoder('latin1').decode(buf.slice(0, 4096))
      const declarado = /charset=([\w-]+)/i.exec(tipo)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(cabecera)?.[1] ?? ''
      let html = new TextDecoder(/8859|latin|1252/i.test(declarado) ? 'windows-1252' : 'utf-8').decode(buf)
      if ((html.match(/\uFFFD/g) ?? []).length > 20) html = new TextDecoder('windows-1252').decode(buf)
      titulo = /<title[^>]*>([^<]{3,300})<\/title>/i.exec(html)?.[1]?.trim() ?? null
      texto = htmlATexto(html)
    }
    if (texto.replace(/\s/g, '').length < 300) return { ok: false, error: 'La página no tiene texto legible (puede requerir JavaScript o usuario)' }
    return { ok: true, texto: texto.slice(0, 3_000_000), urlFinal: res.url, titulo }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: /timed? ?out|abort/i.test(msg) ? 'La página tardó demasiado en responder' : `No se pudo abrir: ${msg.slice(0, 160)}` }
  }
}

// ── Comprobación de citas ───────────────────────────────────────────────────

export function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** ¿La cita está en el texto de la fuente? Exacta (normalizada) o con diferencias. */
export function comprobarCita(cita: string | null, textoFuente: string): { estado: 'comprobado' | 'parcial' | 'no_encontrado'; detalle: string } {
  const c = normalizar(cita ?? '')
  const palabras = c ? c.split(' ') : []
  if (palabras.length < 4) {
    return { estado: 'parcial', detalle: 'La fuente abrió, pero el hallazgo no trae una cita textual para comprobar.' }
  }
  const t = normalizar(textoFuente)
  if (t.includes(c)) return { estado: 'comprobado', detalle: 'La cita textual está en la fuente.' }
  // Coincidencia por fragmentos de 4 palabras
  const n = 4
  const fr = new Set<string>()
  const pt = t.split(' ')
  for (let i = 0; i + n <= pt.length; i++) fr.add(pt.slice(i, i + n).join(' '))
  let total = 0, hay = 0
  for (let i = 0; i + n <= palabras.length; i++) { total++; if (fr.has(palabras.slice(i, i + n).join(' '))) hay++ }
  const prop = total ? hay / total : 0
  if (prop >= 0.6) return { estado: 'parcial', detalle: `La cita aparece con diferencias (${Math.round(prop * 100)}% coincide).` }
  return { estado: 'no_encontrado', detalle: prop > 0 ? `Solo coincide el ${Math.round(prop * 100)}% de la cita: la fuente no dice eso textualmente.` : 'La cita no aparece en la fuente.' }
}
