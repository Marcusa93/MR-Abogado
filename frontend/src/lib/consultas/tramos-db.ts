// Respaldo local (IndexedDB) de una entrevista en curso: los tramos de audio
// que todavía no se transcribieron y el texto ya obtenido. Vive solo en este
// dispositivo y se borra al guardar o descartar la entrevista. Si IndexedDB no
// está disponible (modo privado), todo sigue funcionando en memoria.

export type MuestraTono = { t: number; f: number }
export interface TramoGuardado { id: string; consultaId: string; idx: number; blob: Blob; creado: number; tonos?: MuestraTono[] }
export interface SegmentoEntrevista { id: string; tramo: number; texto: string; inicio?: number; tono?: number | null; hablante?: 'C' | 'A' | 'O' }
export interface MarcaEntrevista { id: string; tramo: number; seg: number; nota: string }
export type ModoEntrevista = 'cliente' | 'terceros' | 'solo'
export interface BorradorEntrevista { consultaId: string; segmentos: SegmentoEntrevista[]; marcas?: MarcaEntrevista[]; modo?: ModoEntrevista; siguienteTramo: number; inicio: number; actualizado: number }

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
}
