// PDF del escrito con el formato del estudio, generado en el navegador (pdf-lib,
// carga diferida): A4, márgenes 2,5 cm, Times 12, interlineado 1,5, sangría de
// 5 cm en la primera línea, justificado, títulos centrados en negrita y
// subrayados, logo arriba y firma al pie. Sirve para firmar en firmar.gob.ar.

import type { EscritoContenido } from '@/hooks/use-escritos'
import type { EscritoEncabezadoAbogado } from '@/components/expedientes/escrito-preview'
import { textoParte } from '@/components/expedientes/caracter-escrito'

const CM = 28.3465
const A4 = { w: 595.28, h: 841.89 }
const MARGEN = 2.5 * CM
const SANGRIA = 5 * CM
const TAM = 12
const INTERLINEA = TAM * 1.5

/** Pasa el logo SVG a PNG con un canvas (pdf-lib no embebe SVG). */
async function logoPng(): Promise<Uint8Array | null> {
  try {
    const img = new Image()
    img.src = '/logo/mr-logo-azul.svg'
    await img.decode()
    const alto = 160
    const ancho = Math.round((img.naturalWidth / img.naturalHeight) * alto) || 400
    const canvas = document.createElement('canvas')
    canvas.width = ancho; canvas.height = alto
    canvas.getContext('2d')!.drawImage(img, 0, 0, ancho, alto)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** Times estándar usa WinAnsi: se reemplazan los caracteres que no puede dibujar. */
function apto(t: string): string {
  return t
    .replace(/[‘’‛]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/ /g, ' ').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ“”•€]/g, '')
}

function encabezado(c: EscritoContenido, a: EscritoEncabezadoAbogado): { negrita: string; resto: string } {
  const datos: string[] = []
  if (a.matricula) datos.push(`de la matrícula ${a.matricula}${a.matriculaLibro ? ` Libro ${a.matriculaLibro}` : ''}${a.matriculaFolio ? ` Folio ${a.matriculaFolio}` : ''}`)
  if (c.caracter?.modo === 'patrocinante') {
    const p = c.caracter.patrocinado
    const partes = [
      p?.dni ? `DNI N° ${p.dni}` : '',
      p?.domicilio ? `con domicilio real en ${p.domicilio}` : '',
      c.caracter.parte === 'otra' ? textoParte(c.caracter) : `en mi carácter de ${c.caracter.parte === 'actora' ? 'parte actora' : 'parte demandada'}`,
      `por mi propio derecho, con el patrocinio letrado del Dr. ${a.nombreCompleto}, abogado`,
      ...datos,
      a.domicilioLegal ? `constituyendo domicilio legal en ${a.domicilioLegal}` : '',
      a.casilleroNotif ? `y casillero de notificaciones ${a.casilleroNotif}` : '',
      a.email ? `mail: ${a.email}` : '',
    ].filter(Boolean)
    return { negrita: (p?.nombre || '—').toUpperCase(), resto: `, ${partes.join(', ')}.` }
  }
  const partes = [
    'abogado', ...datos,
    a.domicilioLegal ? `con domicilio en ${a.domicilioLegal}` : '',
    a.telefono ? `N° de Celular ${a.telefono}` : '',
    a.email ? `mail: ${a.email}` : '',
    a.casilleroNotif ? `constituyéndolo a los efectos legales en casillero de notificaciones ${a.casilleroNotif}` : '',
    a.cuit ? `CUIL N° ${a.cuit}` : '',
  ].filter(Boolean)
  return { negrita: a.nombreCompleto, resto: `, ${partes.join(', ')}.` }
}

export async function generarPdfEscrito(c: EscritoContenido, a: EscritoEncabezadoAbogado): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const fuente = await doc.embedFont(StandardFonts.TimesRoman)
  const negrita = await doc.embedFont(StandardFonts.TimesRomanBold)
  const anchoUtil = A4.w - 2 * MARGEN
  let pagina = doc.addPage([A4.w, A4.h])
  let y = A4.h - MARGEN

  const nuevaPagina = () => { pagina = doc.addPage([A4.w, A4.h]); y = A4.h - MARGEN }
  const asegurar = (alto: number) => { if (y - alto < MARGEN) nuevaPagina() }

  // pegada: va sin espacio antes (la coma después de un nombre en negrita)
  type Palabra = { t: string; f: typeof fuente; pegada?: boolean }
  /** Párrafo justificado con sangría; admite un primer tramo en negrita. */
  const parrafo = (tramos: Palabra[][], opts: { sangria?: number; centrado?: boolean; subrayado?: boolean; despues?: number } = {}) => {
    const palabras: Palabra[] = tramos.flat()
    const espacio = (f: typeof fuente) => f.widthOfTextAtSize(' ', TAM)
    let i = 0
    let primera = true
    while (i < palabras.length) {
      const inicio = primera ? (opts.sangria ?? SANGRIA) : 0
      const disponible = anchoUtil - inicio
      const linea: Palabra[] = []
      let ancho = 0
      while (i < palabras.length) {
        const w = palabras[i]!.f.widthOfTextAtSize(palabras[i]!.t, TAM)
        const extra = linea.length && !palabras[i]!.pegada ? espacio(palabras[i]!.f) : 0
        if (linea.length && ancho + extra + w > disponible) break
        linea.push(palabras[i]!); ancho += extra + w; i++
      }
      asegurar(INTERLINEA)
      const ultima = i >= palabras.length
      const huecos = linea.slice(1).filter((p) => !p.pegada).length
      const libre = disponible - ancho
      const extraPorHueco = !ultima && !opts.centrado && huecos > 0 ? libre / huecos : 0
      let x = MARGEN + inicio + (opts.centrado ? libre / 2 : 0)
      const base = y - TAM
      linea.forEach((p, k) => {
        if (k > 0 && !p.pegada) x += espacio(linea[k - 1]!.f) + extraPorHueco
        const w = p.f.widthOfTextAtSize(p.t, TAM)
        pagina.drawText(p.t, { x, y: base, size: TAM, font: p.f, color: rgb(0, 0, 0) })
        const sig = linea[k + 1]
        if (opts.subrayado) pagina.drawLine({ start: { x, y: base - 1.5 }, end: { x: x + w + (sig && !sig.pegada ? espacio(p.f) + extraPorHueco : 0), y: base - 1.5 }, thickness: 0.6, color: rgb(0, 0, 0) })
        x += w
      })
      y -= INTERLINEA
      primera = false
    }
    y -= opts.despues ?? TAM * 0.6
  }
  const palabrasDe = (t: string, f: typeof fuente): Palabra[] => apto(t).split(/\s+/).filter(Boolean).map((x) => ({ t: x, f }))

  // Logo
  const png = await logoPng()
  if (png) {
    const img = await doc.embedPng(png)
    const alto = 52
    const ancho = (img.width / img.height) * alto
    pagina.drawImage(img, { x: (A4.w - ancho) / 2, y: y - alto, width: ancho, height: alto })
    y -= alto + 1.2 * CM
  }

  parrafo([palabrasDe(`“${c.titulo}”`, negrita)], { sangria: 0, centrado: true, subrayado: true, despues: 0.9 * CM })
  parrafo([palabrasDe(c.encabezado_juez ?? '', negrita)], { sangria: 0, subrayado: true, despues: 0 })
  parrafo([palabrasDe(`JUICIO: “${c.caratula ?? ''}”`, negrita)], { sangria: 0, subrayado: true, despues: 0.8 * CM })

  const enc = encabezado(c, a)
  const resto = palabrasDe(enc.resto.replace(/^,\s*/, ''), fuente)
  parrafo([palabrasDe(enc.negrita, negrita), [{ t: ',', f: fuente, pegada: true }], resto])
  if (c.presentacion) parrafo([palabrasDe(c.presentacion, fuente)], { despues: TAM })

  for (const s of c.secciones ?? []) {
    y -= TAM * 0.6
    asegurar(INTERLINEA * 3)
    parrafo([palabrasDe(s.titulo ?? '', negrita)], { sangria: 0, centrado: true, subrayado: true })
    for (const p of s.parrafos ?? []) if (p?.trim()) parrafo([palabrasDe(p, fuente)])
  }

  // Firma
  y -= 2 * CM
  asegurar(INTERLINEA * 4)
  const firma = (lineas: { t: string; f: typeof fuente; size?: number }[], centroX: number) => {
    let yy = y
    for (const l of lineas) {
      const size = l.size ?? TAM
      const w = l.f.widthOfTextAtSize(apto(l.t), size)
      pagina.drawText(apto(l.t), { x: centroX - w / 2, y: yy - size, size, font: l.f, color: rgb(0, 0, 0) })
      yy -= size * 1.4
    }
  }
  const mat = a.matricula ? `Matrícula ${a.matricula}${a.matriculaLibro ? ` Libro ${a.matriculaLibro}` : ''}${a.matriculaFolio ? ` Folio ${a.matriculaFolio}` : ''}` : ''
  if (c.caracter?.modo === 'patrocinante') {
    const p = c.caracter.patrocinado
    firma([{ t: (p?.nombre || '—').toUpperCase(), f: negrita }, ...(p?.dni ? [{ t: `DNI N° ${p.dni}`, f: fuente, size: 10 }] : [])], MARGEN + anchoUtil * 0.25)
    firma([{ t: a.nombreCompleto, f: negrita }, { t: `Abogado patrocinante${a.matricula ? ` · Matrícula ${a.matricula}` : ''}`, f: fuente, size: 10 }], MARGEN + anchoUtil * 0.75)
  } else {
    firma([{ t: a.nombreCompleto, f: negrita }, ...(mat ? [{ t: mat, f: fuente, size: 10 }] : [])], A4.w / 2)
  }

  doc.setTitle(apto(c.titulo ?? 'Escrito'))
  doc.setAuthor(apto(a.nombreCompleto))
  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

export function nombreArchivoEscrito(titulo: string): string {
  return (titulo || 'escrito').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'escrito'
}

export async function descargarPdfEscrito(c: EscritoContenido, a: EscritoEncabezadoAbogado, titulo: string) {
  const blob = await generarPdfEscrito(c, a)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivoEscrito(titulo)}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 15_000)
}
