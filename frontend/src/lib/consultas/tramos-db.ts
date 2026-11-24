// Respaldo local (IndexedDB) de una entrevista en curso: los tramos de audio
// que todavía no se transcribieron y el texto ya obtenido. Vive solo en este
// dispositivo y se borra al guardar o descartar la entrevista. Si IndexedDB no
// está disponible (modo privado), todo sigue funcionando en memoria.

export type MuestraTono = { t: number; f: number }
export interface TramoGuardado { id: string; consultaId: string; idx: number; blob: Blob; creado: number; tonos?: MuestraTono[] }
export interface SegmentoEntrevista { id: string; tramo: number; texto: string; inicio?: number; tono?: number | null; hablante?: 'C' | 'A' | 'O' }
export interface MarcaEntrevista { id: string; tramo: number; seg: number; nota: string }
export type ModoEntrevista = 'cliente' | 'terceros' | 'solo'
export interface BorradorEntrevista { consultaId: string; segmentos: SegmentoEntrevista[]; marcas?: MarcaEntrevista[]; modo?: ModoEntrevista; msGrabados?: number; siguienteTramo: number; inicio: number; actualizado: number }

const DB = 'mr-consulta-entrevista'
let abierta: Promise<IDBDatabase | null> | null = null

function abrir(): Promise<IDBDatabase | null> {
  if (abierta) return abierta
  abierta = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => {
        const db = r.result
        const t = db.createObjectStore('tramos', { keyPath: 'id' })
        t.createIndex('consultaId', 'consultaId')
        db.createObjectStore('borradores', { keyPath: 'consultaId' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return abierta
}

async function op<T>(store: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await abrir()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(store, modo).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export const guardarTramo = (t: TramoGuardado) => op('tramos', 'readwrite', (s) => s.put(t))
export const borrarTramo = (id: string) => op('tramos', 'readwrite', (s) => s.delete(id))
export async function tramosDe(consultaId: string): Promise<TramoGuardado[]> {
  const r = await op<TramoGuardado[]>('tramos', 'readonly', (s) => s.index('consultaId').getAll(consultaId))
  return (r ?? []).sort((a, b) => a.idx - b.idx)
}
export const guardarBorrador = (b: BorradorEntrevista) => op('borradores', 'readwrite', (s) => s.put(b))
export const leerBorrador = (consultaId: string) => op<BorradorEntrevista | undefined>('borradores', 'readonly', (s) => s.get(consultaId))
export async function borrarEntrevista(consultaId: string) {
  for (const t of await tramosDe(consultaId)) await borrarTramo(t.id)
  await op('borradores', 'readwrite', (s) => s.delete(consultaId))
  await borrarAudio(consultaId)
}

// ── Respaldo del audio completo ─────────────────────────────────────────────
// Además de los tramos (que se borran al transcribirse), se guarda el audio
// entero de la entrevista en este dispositivo, en pedazos de pocos segundos.
// Es la red de seguridad: si la transcripción falla, se corta internet o el
// servidor responde mal, el audio sigue acá y se puede descargar. Se borra al
// guardar o descartar la entrevista, y a los 30 días si quedó abandonado.
// Base aparte (sin cambiar la versión de la de tramos) para no trabar pestañas
// abiertas con la versión anterior de la app.

export interface PedazoAudio { id: string; consultaId: string; parte: number; orden: number; mime: string; blob: Blob; creado: number }
export interface ParteAudio { parte: number; mime: string; blob: Blob; creado: number }

const DB_AUDIO = 'mr-consulta-audio'
const VIDA_AUDIO = 30 * 24 * 60 * 60 * 1000
let audioAbierta: Promise<IDBDatabase | null> | null = null

function abrirAudio(): Promise<IDBDatabase | null> {
  if (audioAbierta) return audioAbierta
  audioAbierta = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB_AUDIO, 1)
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('pedazos', { keyPath: 'id' })
        s.createIndex('consultaId', 'consultaId')
      }
      r.onsuccess = () => {
        const db = r.result
        db.onversionchange = () => { db.close(); audioAbierta = null }
        resolve(db)
        purgarAudioViejo(db)
      }
      r.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return audioAbierta
}

function purgarAudioViejo(db: IDBDatabase) {
  try {
    const limite = Date.now() - VIDA_AUDIO
    const cur = db.transaction('pedazos', 'readwrite').objectStore('pedazos').openCursor()
    cur.onsuccess = () => {
      const c = cur.result
      if (!c) return
      if ((c.value as PedazoAudio).creado < limite) c.delete()
      c.continue()
    }
  } catch { /* sin respaldo no se rompe nada */ }
}

async function opAudio<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await abrirAudio()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction('pedazos', modo).objectStore('pedazos'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function guardarPedazoAudio(p: Omit<PedazoAudio, 'id'>): Promise<boolean> {
  const id = `${p.consultaId}|${String(p.parte).padStart(4, '0')}|${String(p.orden).padStart(6, '0')}`
  return (await opAudio('readwrite', (s) => s.put({ ...p, id }))) !== null
}

/** El audio respaldado de una consulta, una entrada por cada vez que se arrancó o retomó la grabación. */
export async function audioDe(consultaId: string): Promise<ParteAudio[]> {
  const r = await opAudio<PedazoAudio[]>('readonly', (s) => s.index('consultaId').getAll(consultaId))
  const partes = new Map<number, PedazoAudio[]>()
  for (const p of r ?? []) partes.set(p.parte, [...(partes.get(p.parte) ?? []), p])
  return [...partes.entries()].sort((a, b) => a[0] - b[0]).map(([parte, ps]) => {
    const orden = ps.sort((a, b) => a.orden - b.orden)
    return { parte, mime: orden[0]!.mime, blob: new Blob(orden.map((p) => p.blob), { type: orden[0]!.mime }), creado: orden[0]!.creado }
  })
}

export async function borrarAudio(consultaId: string) {
  const r = await opAudio<IDBValidKey[]>('readonly', (s) => s.index('consultaId').getAllKeys(consultaId))
  for (const k of r ?? []) await opAudio('readwrite', (s) => s.delete(k))
}
