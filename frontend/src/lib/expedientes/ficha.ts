// Ficha del caso: tipos y la lógica pura para aplicar una propuesta.

export type EstadoPrueba = 'ofrecida' | 'producida' | 'pendiente' | 'desistida'
export const ESTADOS_PRUEBA: EstadoPrueba[] = ['ofrecida', 'pendiente', 'producida', 'desistida']
export const ETIQUETA_ESTADO: Record<EstadoPrueba, string> = {
  ofrecida: 'Ofrecida', pendiente: 'Pendiente', producida: 'Producida', desistida: 'Desistida',
}

export interface Prueba { id: string; medio: string; detalle: string; estado: EstadoPrueba }
export interface Resolucion { id: string; fecha: string; texto: string }

export type CampoTexto = 'resumen' | 'demanda' | 'contestacion' | 'proximo_paso'
export const ETIQUETA_CAMPO: Record<CampoTexto, string> = {
  resumen: 'De qué trata', demanda: 'Demanda', contestacion: 'Contestación', proximo_paso: 'Próximo paso',
}

export interface Ficha {
  expediente_id: string
  resumen: string
  demanda: string
  contestacion: string
  prueba: Prueba[]
  resoluciones: Resolucion[]
  proximo_paso: string
  completar: Partial<Record<CampoTexto, string>>
  revisada: boolean
  revisado_hasta: string | null
  updated_at: string
}

export type Cambio =
  | { campo: CampoTexto; modo: 'reemplazar' | 'agregar'; texto: string; completar?: string }
  | { campo: 'prueba'; medio: string; detalle: string; estado: EstadoPrueba; prueba_id?: string }
  | { campo: 'resolucion'; fecha: string; texto: string }
  | { campo: 'etapa'; texto: string }

export interface PropuestaFicha {
  id: string
  expediente_id: string
  origen: 'sae' | 'dictado'
  titulo: string
  cambios: Cambio[]
  created_at: string
}

export function fichaVacia(expedienteId: string): Ficha {
  return {
    expediente_id: expedienteId, resumen: '', demanda: '', contestacion: '', prueba: [], resoluciones: [],
    proximo_paso: '', completar: {}, revisada: true, revisado_hasta: null, updated_at: new Date().toISOString(),
  }
}

/** dd/mm/aaaa → número ordenable. Sin fecha reconocible, al final. */
export function claveFecha(f: string): number {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f)
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 99999999
}

export function ordenarResoluciones(r: Resolucion[]): Resolucion[] {
  return [...r].sort((a, b) => claveFecha(a.fecha) - claveFecha(b.fecha))
}

const nuevoId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/**
 * Aplica los cambios elegidos de una propuesta. No toca la ficha original.
 * Devuelve la ficha nueva y la etapa, si la propuesta trae una.
 */
export function aplicarCambios(ficha: Ficha, cambios: Cambio[]): { ficha: Ficha; etapa: string | null } {
  const f: Ficha = { ...ficha, prueba: [...ficha.prueba], resoluciones: [...ficha.resoluciones], completar: { ...ficha.completar } }
  let etapa: string | null = null
  for (const c of cambios) {
    if (c.campo === 'etapa') { etapa = c.texto; continue }
    if (c.campo === 'resolucion') {
      const repetida = f.resoluciones.some((r) => r.fecha === c.fecha && r.texto === c.texto)
      if (!repetida) f.resoluciones.push({ id: nuevoId(), fecha: c.fecha, texto: c.texto })
      continue
    }
    if (c.campo === 'prueba') {
      const i = c.prueba_id ? f.prueba.findIndex((p) => p.id === c.prueba_id) : -1
      if (i >= 0) f.prueba[i] = { ...f.prueba[i]!, estado: c.estado, detalle: c.detalle || f.prueba[i]!.detalle }
      else f.prueba.push({ id: nuevoId(), medio: c.medio, detalle: c.detalle, estado: c.estado })
      continue
    }
    const actual = f[c.campo].trim()
    f[c.campo] = c.modo === 'reemplazar' || !actual ? c.texto : `${actual}\n${c.texto}`
    // Si responde lo que había que completar, la pregunta se va; si trae una nueva, queda.
    delete f.completar[c.campo]
    if (c.completar) f.completar[c.campo] = c.completar
  }
  f.resoluciones = ordenarResoluciones(f.resoluciones)
  return { ficha: f, etapa }
}

/** Cuántos medios de prueba hay en cada estado, para el resumen de una línea. */
export function conteoPrueba(prueba: Prueba[]): { estado: EstadoPrueba; n: number }[] {
  return ESTADOS_PRUEBA
    .map((estado) => ({ estado, n: prueba.filter((p) => p.estado === estado).length }))
    .filter((x) => x.n > 0)
}

export function siguienteEstado(e: EstadoPrueba): EstadoPrueba {
  return ESTADOS_PRUEBA[(ESTADOS_PRUEBA.indexOf(e) + 1) % ESTADOS_PRUEBA.length]!
}

/** Descripción corta de un cambio para la pantalla de revisión. */
export function describirCambio(c: Cambio, ficha: Ficha | null): { seccion: string; texto: string; nota?: string } {
  if (c.campo === 'etapa') return { seccion: 'Etapa', texto: `Pasa a: ${c.texto}` }
  if (c.campo === 'resolucion') return { seccion: 'Resoluciones', texto: c.fecha ? `${c.fecha}: ${c.texto}` : c.texto }
  if (c.campo === 'prueba') {
    const existente = c.prueba_id ? ficha?.prueba.find((p) => p.id === c.prueba_id) : undefined
    if (existente && existente.estado === c.estado) {
      return { seccion: 'Prueba', texto: `${existente.medio}: ${c.detalle || existente.detalle}`, nota: 'Actualiza el detalle' }
    }
    return existente
      ? { seccion: 'Prueba', texto: `${existente.medio}: ${ETIQUETA_ESTADO[existente.estado].toLowerCase()} → ${ETIQUETA_ESTADO[c.estado].toLowerCase()}`, nota: c.detalle || undefined }
      : { seccion: 'Prueba', texto: `${c.medio} (${ETIQUETA_ESTADO[c.estado].toLowerCase()})`, nota: c.detalle || undefined }
  }
  const reemplaza = c.modo === 'reemplazar' && !!ficha?.[c.campo]?.trim()
  return { seccion: ETIQUETA_CAMPO[c.campo], texto: c.texto, nota: reemplaza ? 'Reemplaza lo que está' : undefined }
}
