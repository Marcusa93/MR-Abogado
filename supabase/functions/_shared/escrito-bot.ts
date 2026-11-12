// Helpers del bot de escritos (telegram-escrito-webhook): PDF del borrador con
// el formato del estudio, resumen para el chat, aplicar los cambios del
// asistente y mandar documentos/botones a Telegram.
//
// El PDF replica frontend/src/lib/escritos/pdf-escrito.ts (pdf-lib): A4,
// márgenes 2,5 cm, Times 12, interlineado 1,5, sangría de 5 cm, justificado,
// títulos centrados en negrita y subrayados, logo arriba y firma al pie.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'https://esm.sh/pdf-lib@1.17.1'
import { APP_URL, type Admin, type TgButton } from './tareas-telegram.ts'

const TG_API = 'https://api.telegram.org'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Seccion { titulo: string; parrafos: string[] }
export interface Caracter {
  modo: 'apoderado' | 'patrocinante' | 'derecho_propio'
  parte: 'actora' | 'demandada' | 'otra'
  parte_texto?: string
  patrocinado?: { nombre?: string; dni?: string; domicilio?: string }
}
export interface Contenido {
  titulo?: string
  encabezado_juez?: string
  caratula?: string
  presentacion?: string
  caracter?: Caracter | null
  secciones: Seccion[]
}
export interface Abogado {
  nombreCompleto: string
  matricula: string | null
  matriculaLibro: string | null
  matriculaFolio: string | null
  domicilioLegal: string | null
  telefono: string | null
  email: string | null
  casilleroNotif: string | null
  cuit: string | null
}
export interface Cambio {
  accion: 'reemplazar' | 'insertar_despues' | 'eliminar' | 'nueva_seccion' | 'reemplazar_seccion'
  seccion: number
  parrafo?: number | null
  titulo?: string | null
  texto?: string | null
  motivo: string
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export async function tgAccion(token: string, chatId: number, action: 'typing' | 'upload_document') {
  await fetch(`${TG_API}/bot${token}/sendChatAction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {})
}

/** Mantiene el "escribiendo…" mientras corre una tarea larga. */
export async function conAccion<T>(token: string, chatId: number, tarea: Promise<T>): Promise<T> {
  let vivo = true
  ;(async () => { while (vivo) { await tgAccion(token, chatId, 'typing'); await new Promise((r) => setTimeout(r, 4500)) } })()
  try { return await tarea } finally { vivo = false }
}

export async function tgDocumento(token: string, chatId: number, bytes: Uint8Array, nombre: string, caption?: string, keyboard?: TgButton[][]) {
  const fd = new FormData()
  fd.append('chat_id', String(chatId))
  fd.append('document', new Blob([bytes], { type: 'application/pdf' }), nombre)
  if (caption) fd.append('caption', caption.slice(0, 1000))
  if (keyboard?.length) fd.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }))
  const r = await fetch(`${TG_API}/bot${token}/sendDocument`, { method: 'POST', body: fd }).catch(() => null)
  if (!r?.ok) console.warn('[escrito-bot] sendDocument', r?.status, await r?.text().catch(() => ''))
  return !!r?.ok
}

/** Menú de comandos de Telegram (botón "Menú"): completo para los autorizados, reducido para el resto. */
let menuListo = false
export async function configurarMenu(token: string, autorizados: string[]) {
  if (menuListo) return
  menuListo = true
  const set = (commands: { command: string; description: string }[], scope: Record<string, unknown>) =>
    fetch(`${TG_API}/bot${token}/setMyCommands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, scope }),
    }).catch(() => null)
  const basicos = [
    { command: 'tareas', description: 'Mis tareas pendientes' },
    { command: 'hecho', description: 'Marcar una tarea como hecha (ej. /hecho 2)' },
    { command: 'articulo', description: 'Proponer un tema para Editorial' },
    { command: 'ayuda', description: 'Qué puedo hacer acá' },
  ]
  const completos = [
    { command: 'escritos', description: 'Escritos sin terminar y esperando proveído' },
    { command: 'hoy', description: 'Resumen del día' },
    { command: 'tareas', description: 'Pendientes (opcional: nombre)' },
    { command: 'tarea', description: 'Crear tareas' },
    { command: 'hecho', description: 'Marcar una tarea como hecha' },
    { command: 'audiencias', description: 'Audiencias de los próximos 7 días' },
    { command: 'sae', description: 'Notificaciones del SAE de 48 h' },
    { command: 'articulo', description: 'Proponer un tema para Editorial' },
    { command: 'ayuda', description: 'Cómo pedir un escrito y comandos' },
  ]
  await set(basicos, { type: 'default' })
  for (const id of autorizados) if (/^\d+$/.test(id)) await set(completos, { type: 'chat', chat_id: Number(id) })
}

// ─── Datos ───────────────────────────────────────────────────────────────────

export async function abogadoDe(admin: Admin, profileId: string): Promise<Abogado | null> {
  const { data } = await admin.from('profiles')
    .select('nombre, apellido, matricula, matricula_libro, matricula_folio, domicilio_legal, telefono, email, casillero_notif, cuit')
    .eq('id', profileId).maybeSingle()
  const p = data as Record<string, string | null> | null
  if (!p) return null
  return {
    nombreCompleto: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim().toUpperCase(),
    matricula: p.matricula ?? null, matriculaLibro: p.matricula_libro ?? null, matriculaFolio: p.matricula_folio ?? null,
    domicilioLegal: p.domicilio_legal ?? null, telefono: p.telefono ?? null, email: p.email ?? null,
    casilleroNotif: p.casillero_notif ?? null, cuit: p.cuit ?? null,
  }
}

// ─── Resumen para el chat ────────────────────────────────────────────────────

const PENDIENTE_RE = /\[(?:COMPLETAR|Completar|completar|DATO|Dato|dato|INDICAR|Indicar|indicar|VERIFICAR|Verificar|verificar|XX+)[^\]]*\]|\[[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 °º/.,;:_()\-]{2,}\]|_{4,}|\bX{3,}\b/g

export function pendientes(c: Contenido): string[] {
  const textos = [c.encabezado_juez, c.caratula, c.presentacion ?? '', ...(c.secciones ?? []).flatMap((s) => [s.titulo, ...(s.parrafos ?? [])])]
  return textos.flatMap((t) => (t ?? '').match(PENDIENTE_RE) ?? [])
}

/** Qué se pide: la sección del petitorio, o el último párrafo con sustancia. */
export function resumenEscrito(c: Contenido): string {
  const secs = c.secciones ?? []
  const pet = [...secs].reverse().find((s) => /petitorio|petito|solicito|pido|por todo lo expuesto/i.test(s.titulo ?? ''))
  let texto = pet ? pet.parrafos.filter((p) => p.trim()).join(' ') : ''
  if (!texto) {
    const ultimos = secs.flatMap((s) => s.parrafos).filter((p) => p.trim().length > 40)
    texto = ultimos[ultimos.length - 1] ?? ''
  }
  texto = texto.replace(/\s+/g, ' ').trim()
  return texto.length > 600 ? `${texto.slice(0, 597).replace(/\s+\S*$/, '')}…` : texto
}

// ─── Aplicar cambios del asistente ───────────────────────────────────────────

/**
 * Aplica todos los cambios. Se aplican de atrás hacia adelante (sección y
 * párrafo descendentes) para que los índices, que vienen numerados sobre el
 * texto original, sigan apuntando al lugar correcto.
 */
export function aplicarCambios(c: Contenido, cambios: Cambio[]): Contenido {
  const ord = [...cambios].sort((a, b) => (b.seccion - a.seccion) || ((b.parrafo ?? 999) - (a.parrafo ?? 999)))
  let out: Contenido = { ...c, secciones: c.secciones.map((s) => ({ ...s, parrafos: [...s.parrafos] })) }
  const parrafosDe = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  for (const x of ord) {
    const secs = out.secciones
    const i = x.seccion - 1
    switch (x.accion) {
      case 'reemplazar': if (secs[i] && x.parrafo) secs[i].parrafos[x.parrafo - 1] = x.texto ?? ''; break
      case 'eliminar': if (secs[i] && x.parrafo) secs[i].parrafos.splice(x.parrafo - 1, 1); break
      case 'insertar_despues': if (secs[i]) secs[i].parrafos.splice(x.parrafo ?? secs[i].parrafos.length, 0, ...parrafosDe(x.texto ?? '')); break
      case 'reemplazar_seccion': if (secs[i]) { secs[i].parrafos = parrafosDe(x.texto ?? ''); if (x.titulo) secs[i].titulo = x.titulo } break
      case 'nueva_seccion': secs.splice(x.seccion, 0, { titulo: x.titulo ?? 'NUEVA SECCIÓN', parrafos: parrafosDe(x.texto ?? '') }); break
    }
    out = { ...out, secciones: secs }
  }
  return out
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const CM = 28.3465
const A4 = { w: 595.28, h: 841.89 }
const MARGEN = 2.5 * CM
const SANGRIA = 5 * CM
const TAM = 12
const INTERLINEA = TAM * 1.5

function apto(t: string): string {
  return t
    .replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u201C\u201D\u2022\u20AC]/g, '')
}

function textoParte(c: Caracter) {
  return c.parte === 'otra' ? (c.parte_texto?.trim() || 'la parte') : c.parte === 'actora' ? 'la parte actora' : 'la parte demandada'
}

function encabezado(c: Contenido, a: Abogado): { negrita: string; resto: string } {
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

let logoCache: Uint8Array | null | undefined
async function logoPng(): Promise<Uint8Array | null> {
  if (logoCache !== undefined) return logoCache
  try {
    const r = await fetch(`${APP_URL}/logo/mr-logo-azul.png`)
    logoCache = r.ok ? new Uint8Array(await r.arrayBuffer()) : null
  } catch { logoCache = null }
  return logoCache
}

export async function pdfEscrito(c: Contenido, a: Abogado): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fuente = await doc.embedFont(StandardFonts.TimesRoman)
  const negrita = await doc.embedFont(StandardFonts.TimesRomanBold)
  const anchoUtil = A4.w - 2 * MARGEN
  let pagina = doc.addPage([A4.w, A4.h])
  let y = A4.h - MARGEN
  const nuevaPagina = () => { pagina = doc.addPage([A4.w, A4.h]); y = A4.h - MARGEN }
  const asegurar = (alto: number) => { if (y - alto < MARGEN) nuevaPagina() }

  type Palabra = { t: string; f: PDFFont; pegada?: boolean }
  const parrafo = (tramos: Palabra[][], opts: { sangria?: number; centrado?: boolean; subrayado?: boolean; despues?: number } = {}) => {
    const palabras = tramos.flat()
    const espacio = (f: PDFFont) => f.widthOfTextAtSize(' ', TAM)
    let i = 0
    let primera = true
    while (i < palabras.length) {
      const inicio = primera ? (opts.sangria ?? SANGRIA) : 0
      const disponible = anchoUtil - inicio
      const linea: Palabra[] = []
      let ancho = 0
      while (i < palabras.length) {
        const w = palabras[i].f.widthOfTextAtSize(palabras[i].t, TAM)
        const extra = linea.length && !palabras[i].pegada ? espacio(palabras[i].f) : 0
        if (linea.length && ancho + extra + w > disponible) break
        linea.push(palabras[i]); ancho += extra + w; i++
      }
      asegurar(INTERLINEA)
      const ultima = i >= palabras.length
      const huecos = linea.slice(1).filter((p) => !p.pegada).length
      const libre = disponible - ancho
      const extraPorHueco = !ultima && !opts.centrado && huecos > 0 ? libre / huecos : 0
      let x = MARGEN + inicio + (opts.centrado ? libre / 2 : 0)
      const base = y - TAM
      linea.forEach((p, k) => {
        if (k > 0 && !p.pegada) x += espacio(linea[k - 1].f) + extraPorHueco
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
  const palabrasDe = (t: string, f: PDFFont): Palabra[] => apto(t).split(/\s+/).filter(Boolean).map((x) => ({ t: x, f }))

  const png = await logoPng()
  if (png) {
    try {
      const img = await doc.embedPng(png)
      const alto = 52
      const ancho = (img.width / img.height) * alto
      pagina.drawImage(img, { x: (A4.w - ancho) / 2, y: y - alto, width: ancho, height: alto })
      y -= alto + 1.2 * CM
    } catch { /* sin logo */ }
  }

  parrafo([palabrasDe(`“${c.titulo ?? ''}”`, negrita)], { sangria: 0, centrado: true, subrayado: true, despues: 0.9 * CM })
  parrafo([palabrasDe(c.encabezado_juez ?? '', negrita)], { sangria: 0, subrayado: true, despues: 0 })
  parrafo([palabrasDe(`JUICIO: “${c.caratula ?? ''}”`, negrita)], { sangria: 0, subrayado: true, despues: 0.8 * CM })
  const enc = encabezado(c, a)
  parrafo([palabrasDe(enc.negrita, negrita), [{ t: ',', f: fuente, pegada: true }], palabrasDe(enc.resto.replace(/^,\s*/, ''), fuente)])
  if (c.presentacion) parrafo([palabrasDe(c.presentacion, fuente)], { despues: TAM })
  for (const s of c.secciones ?? []) {
    y -= TAM * 0.6
    asegurar(INTERLINEA * 3)
    parrafo([palabrasDe(s.titulo ?? '', negrita)], { sangria: 0, centrado: true, subrayado: true })
    for (const p of s.parrafos ?? []) if (p?.trim()) parrafo([palabrasDe(p, fuente)])
  }

  y -= 2 * CM
  asegurar(INTERLINEA * 4)
  const firma = (lineas: { t: string; f: PDFFont; size?: number }[], centroX: number) => {
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
  return await doc.save()
}

export function nombreArchivo(titulo: string): string {
  return (titulo || 'escrito').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'escrito'
}
