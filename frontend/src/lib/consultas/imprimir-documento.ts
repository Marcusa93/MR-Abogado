// Imprime (o guarda como PDF) un documento armado en el DOM, en una ventana aparte.
//
// - La tapa (.doc-portada) va a sangre: página con nombre propio y margen 0.
// - El resto lleva los márgenes de los escritos (2,5 cm) en todas las páginas,
//   no solo en la primera.
// - Se fuerzan los colores de fondo (la tapa es navy) y se copian las fuentes de
//   la app (Montserrat, si está cargada) para que la tapa salga igual.

export const CSS_DOCUMENTO = `
  @page { size: A4; margin: 2.5cm; }
  @page portada { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-portada { page: portada; break-after: page; }
  /* Anchos automáticos: con 21cm fijos Chrome achica todo para que entre en el margen */
  .doc, .doc-portada { width: auto !important; }
  .doc-contenido { width: auto !important; padding: 0 !important; }
  .doc-titulo, .doc-seccion { break-after: avoid; }
  .doc-bloque, tr, li { break-inside: avoid; }
  /* Navegadores sin páginas con nombre: todo a margen 0 y el margen va en el contenido */
  @supports not (page: portada) {
    @page { margin: 0; }
    .doc-contenido { padding: 2.5cm !important; }
  }
  @media screen {
    body { background: #e5e7eb; padding: 24px 0; }
    .doc { width: 21cm !important; margin: 0 auto; box-shadow: 0 2px 24px rgba(0,0,0,.15); }
    .doc-portada { width: 21cm !important; }
    .doc-contenido { padding: 2.5cm !important; width: 21cm !important; background: #fff; }
  }
`

/** Las reglas @font-face de la app (para que la tapa use la misma tipografía). */
function fuentesDeLaApp(): string {
  const out: string[] = []
  for (const hoja of Array.from(document.styleSheets)) {
    let reglas: CSSRuleList
    try { reglas = hoja.cssRules } catch { continue }
    for (const r of Array.from(reglas)) {
      if (r instanceof CSSFontFaceRule && /montserrat/i.test(r.cssText)) out.push(r.cssText)
    }
  }
  return out.join('\n')
}

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function imprimirDocumento(nodo: HTMLElement | null, titulo: string): Promise<boolean> {
  if (!nodo) return false
  const w = window.open('', '_blank', 'width=960,height=800')
  if (!w) return false
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>${escapar(titulo)}</title>
    <style>${fuentesDeLaApp()}\n${CSS_DOCUMENTO}</style>
  </head><body>${nodo.innerHTML}</body></html>`)
  w.document.close()
  // Esperar imágenes (logo, monograma) y fuentes antes de abrir el diálogo
  await Promise.all(Array.from(w.document.images).map((img) =>
    img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r })))
  try { await w.document.fonts?.ready } catch { /* sin API de fuentes */ }
  await new Promise((r) => setTimeout(r, 150))
  w.onafterprint = () => w.close()
  w.focus()
  w.print()
  return true
}
