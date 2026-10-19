// Exporta un artículo editorial a Word (.doc) o PDF (impresión del navegador)
// con formato de escrito: A4, márgenes 2,5 cm, Times New Roman 12, interlineado
// 1,5, justificado, y la bibliografía APA siempre al final (sangría francesa).

interface ArticuloExport {
  titulo: string
  bajada: string | null
  cuerpo: string
  bibliografia: string[]
  autor?: string
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(texto: string): string {
  return esc(texto)
    .replace(/\[VERIFICAR[^\]]*\]/g, (m) => `<span style="background:#fff3a0">${m}</span>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_/g, '$1<i>$2</i>')
}

function markdownAHtml(md: string): string {
  const out: string[] = []
  let parrafo: string[] = []
  let lista: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const cerrarParrafo = () => { if (parrafo.length) { out.push(`<p class="cuerpo">${inline(parrafo.join(' '))}</p>`); parrafo = [] } }
  const cerrarLista = () => { if (lista) { out.push(`<${lista.tag}>${lista.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${lista.tag}>`); lista = null } }

  for (const linea of md.replace(/\r\n/g, '\n').split('\n')) {
    const l = linea.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l)
    if (!l.trim()) { cerrarParrafo(); cerrarLista(); continue }
    if (h) { cerrarParrafo(); cerrarLista(); out.push(`<p class="subtitulo">${inline(h[2] ?? '')}</p>`) }
    else if (ul || ol) {
      cerrarParrafo()
      const tag = ol ? 'ol' : 'ul'
      if (!lista || lista.tag !== tag) { cerrarLista(); lista = { tag, items: [] } }
      lista.items.push((ul ?? ol)?.[1] ?? '')
    } else if (l.startsWith('>')) { cerrarParrafo(); cerrarLista(); out.push(`<p class="cita">${inline(l.replace(/^>\s?/, ''))}</p>`) }
    else { cerrarLista(); parrafo.push(l.trim()) }
  }
  cerrarParrafo(); cerrarLista()
  return out.join('\n')
}

const ESTILOS = `
  @page { size: 21cm 29.7cm; margin: 2.5cm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 150%; color: #000; }
  p { margin: 0 0 12pt 0; text-align: justify; line-height: 150%; }
  .titulo { text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 6pt; }
  .bajada { text-align: center; font-style: italic; }
  .autor { text-align: center; margin-bottom: 24pt; }
  .cuerpo { text-indent: 1.27cm; }
  .subtitulo { font-weight: bold; margin-top: 12pt; text-align: left; }
  .cita { margin-left: 1.27cm; margin-right: 1.27cm; }
  ul, ol { margin: 0 0 12pt 1.27cm; line-height: 150%; }
  li { text-align: justify; }
  .referencias { text-align: center; font-weight: bold; margin-top: 24pt; page-break-before: always; }
  .ref { margin-left: 1.27cm; text-indent: -1.27cm; text-align: left; }
`

function documentoHtml(a: ArticuloExport, paraWord: boolean): string {
  const bibliografia = [...a.bibliografia].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }))
  const cabecera = paraWord
    ? '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    : '<!doctype html><html lang="es">'
  return `${cabecera}
<head><meta charset="utf-8"><title>${esc(a.titulo)}</title>
${paraWord ? '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' : ''}
<style>${ESTILOS}</style></head>
<body>
<p class="titulo">${inline(a.titulo)}</p>
${a.bajada ? `<p class="bajada">${inline(a.bajada)}</p>` : ''}
<p class="autor">${esc(a.autor ?? 'Marco Rossi')}</p>
${markdownAHtml(a.cuerpo)}
<p class="referencias">Referencias</p>
${bibliografia.length
    ? bibliografia.map((r) => `<p class="ref">${inline(r)}</p>`).join('\n')
    : '<p class="ref"><span style="background:#fff3a0">[Bibliografía pendiente]</span></p>'}
</body></html>`
}

function nombreArchivo(titulo: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80)
  return base || 'articulo'
}

/** Descarga el artículo como documento de Word (.doc), editable. */
export function descargarWord(a: ArticuloExport) {
  const blob = new Blob(['﻿', documentoHtml(a, true)], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivo(a.titulo)}.doc`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Abre el diálogo de impresión para guardar como PDF. Devuelve false si el navegador bloqueó la ventana. */
export function imprimirPdf(a: ArticuloExport): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(documentoHtml(a, false).replace('</body>',
    '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 200))</script></body>'))
  w.document.close()
  return true
}


// ── Formato revista: notas al pie, resumen, palabras clave y membrete ───────

export interface RevistaExport {
  titulo: string
  bajada: string | null
  bibliografia: string[]
  revista: { resumen: string; palabras_clave: string[]; cuerpo: string; notas: Record<string, string> }
  autor?: string
}

const MEMBRETE = 'ESTUDIO JURÍDICO DR. MARCO ROSSI · San Miguel de Tucumán'

/** Llamada a nota: en Word es una nota al pie real; en el PDF, un superíndice con las notas al final. */
function conNotas(html: string, paraWord: boolean): string {
  return html.replace(/\[\^(\d+)\]/g, (_, n: string) => paraWord
    ? `<a style="mso-footnote-id:ftn${n}" href="#_ftn${n}" name="_ftnref${n}"><span class="MsoFootnoteReference"><span style="mso-special-character:footnote"><![if !supportFootnotes]>[${n}]<![endif]></span></span></a>`
    : `<sup>${n}</sup>`)
}

const notaHtml = (t: string) => inline(t).replace(/\[(Falta|Faltan|Año|Ley aprobatoria|[^\]]*verific)[^\]]*\]/gi, (m) => `<span style="background:#fff3a0">${m}</span>`)

const ESTILOS_REVISTA = ESTILOS + `
  .membrete { text-align: center; font-size: 9pt; letter-spacing: 1pt; color: #444; border-bottom: 0.5pt solid #999; padding-bottom: 6pt; margin-bottom: 24pt; }
  .resumen-titulo { font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; }
  .resumen { font-size: 11pt; line-height: 130%; text-align: justify; }
  .claves { font-size: 11pt; margin-bottom: 24pt; }
  p.MsoFootnoteText, .nota { font-size: 10pt; line-height: 115%; margin: 0 0 4pt 0; text-align: justify; text-indent: 0; }
  span.MsoFootnoteReference { vertical-align: super; font-size: 8pt; }
  .notas-titulo { font-weight: bold; margin-top: 24pt; }
`

function documentoRevista(a: RevistaExport, paraWord: boolean): string {
  const r = a.revista
  const numeros = Object.keys(r.notas).map(Number).sort((x, y) => x - y)
  // Si la IA repitió título o bajada al comienzo del cuerpo, se sacan (ya van en el encabezado)
  const plano = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const lineas = r.cuerpo.replace(/\r\n/g, '\n').split('\n')
  while (lineas.length) {
    const l = plano(lineas[0]!.replace(/^#+\s*|[*_]/g, ''))
    if (!l || l === plano(a.titulo) || (a.bajada && l === plano(a.bajada))) lineas.shift()
    else break
  }
  const cuerpo = conNotas(markdownAHtml(lineas.join('\n')), paraWord)
  const bibliografia = [...a.bibliografia].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }))
  const notasWord = numeros.map((n) =>
    `<div style="mso-element:footnote" id="ftn${n}"><p class="MsoFootnoteText"><a style="mso-footnote-id:ftn${n}" href="#_ftnref${n}" name="_ftn${n}"><span class="MsoFootnoteReference"><span style="mso-special-character:footnote"><![if !supportFootnotes]>[${n}]<![endif]></span></span></a> ${notaHtml(r.notas[String(n)] ?? '')}</p></div>`).join('\n')
  const notasPdf = numeros.map((n) => `<p class="nota"><sup>${n}</sup> ${notaHtml(r.notas[String(n)] ?? '')}</p>`).join('\n')
  const cabecera = paraWord
    ? '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    : '<!doctype html><html lang="es">'
  return `${cabecera}
<head><meta charset="utf-8"><title>${esc(a.titulo)}</title>
${paraWord ? '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' : ''}
<style>${ESTILOS_REVISTA}</style></head>
<body>
<p class="membrete">${esc(MEMBRETE)}</p>
<p class="titulo">${inline(a.titulo)}</p>
${a.bajada ? `<p class="bajada">${inline(a.bajada)}</p>` : ''}
<p class="autor">${esc(a.autor ?? 'Marco Rossi')}</p>
${r.resumen ? `<p class="resumen-titulo">Resumen</p><p class="resumen">${inline(r.resumen)}</p>` : ''}
${r.palabras_clave.length ? `<p class="claves"><b>Palabras clave:</b> ${esc(r.palabras_clave.join('; '))}.</p>` : ''}
${cuerpo}
${paraWord ? '' : (numeros.length ? `<p class="notas-titulo">Notas</p>\n${notasPdf}` : '')}
${bibliografia.length ? `<p class="referencias">Bibliografía</p>\n${bibliografia.map((x) => `<p class="ref">${inline(x)}</p>`).join('\n')}` : ''}
${paraWord && numeros.length ? `<div style="mso-element:footnote-list"><br clear="all" style="mso-special-character:line-break"><hr align="left" size="1" width="33%">\n${notasWord}\n</div>` : ''}
</body></html>`
}

export function descargarWordRevista(a: RevistaExport) {
  const blob = new Blob(['﻿', documentoRevista(a, true)], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivo(a.titulo)}-revista.doc`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function imprimirPdfRevista(a: RevistaExport): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(documentoRevista(a, false).replace('</body>',
    '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 200))</script></body>'))
  w.document.close()
  return true
}
