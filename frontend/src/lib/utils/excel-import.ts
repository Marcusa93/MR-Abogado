import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────

export interface ImportedCliente {
  apellido: string
  nombre: string
  dni: string
  cuil: string | null
  telefono: string | null
}

export interface ImportedExpediente {
  cliente_dni: string
  tramite: string
  estado_interno: string
  fecha_alta: string | null
  numero_expediente: string | null
  observaciones: string | null
  abogado_nombre: string | null
  fecha_resolucion: string | null
}

export interface ImportedTurno {
  cliente_apellido: string
  cliente_nombre: string
  fecha: string
  hora: string | null
  udai: string | null
  abogada: string | null
  tramite: string | null
}

export interface ImportPreview {
  clientes: ImportedCliente[]
  expedientes: ImportedExpediente[]
  turnos: ImportedTurno[]
  stats: {
    totalClientes: number
    totalExpedientes: number
    totalTurnos: number
    hojasProcesadas: string[]
    errores: string[]
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function clean(val: unknown): string {
  if (val == null) return ''
  return String(val).trim()
}

function cleanDni(val: unknown): string {
  if (val == null) return ''
  return String(val).replace(/[^0-9]/g, '').replace(/^0+/, '')
}

function cleanCuil(val: unknown): string | null {
  if (val == null) return null
  const raw = String(val).replace(/[^0-9]/g, '')
  if (raw.length === 11) {
    return `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}`
  }
  // 10 digits or other lengths are malformed — discard
  return null
}

function cleanPhone(val: unknown): string | null {
  if (val == null) return null
  const raw = String(val).replace(/[^0-9+]/g, '')
  return raw.length >= 8 ? raw : null
}

function cleanTime(val: unknown): string | null {
  if (val == null) return null
  // XLSX with cellDates:true returns Date objects for time-only cells
  // (base date is Dec 30 1899, we just need HH:MM)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const h = val.getHours().toString().padStart(2, '0')
    const m = val.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  }
  const s = String(val).trim()
  if (!s) return null
  // Already HH:MM or HH:MM:SS
  const timeMatch = s.match(/^(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  }
  // Try to extract time from a full date string like "Sat Dec 30 1899 13:30:00 GMT..."
  const fullMatch = s.match(/(\d{1,2}):(\d{2}):\d{2}/)
  if (fullMatch) {
    return `${fullMatch[1].padStart(2, '0')}:${fullMatch[2]}`
  }
  return null
}

function parseDate(val: unknown): string | null {
  if (val == null) return null
  // XLSX with cellDates:true returns Date objects for date cells
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0]
  }
  const s = String(val).trim()
  if (!s) return null
  // Try dd/mm/yyyy (Argentine format — must check BEFORE ISO to avoid day/month swap)
  const slashParts = s.split('/')
  if (slashParts.length === 3) {
    const [d, m, y] = slashParts
    const year = y.length === 2 ? `20${y}` : y
    const dt = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`)
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1990) {
      return dt.toISOString().split('T')[0]
    }
  }
  // Try ISO / other formats as fallback
  const iso = new Date(s)
  if (!isNaN(iso.getTime()) && iso.getFullYear() > 1990 && iso.getFullYear() < 2100) {
    return iso.toISOString().split('T')[0]
  }
  return null
}

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  'FEBR ERO', 'SEPT IEMBRE',
]

function isMonthHeader(val: unknown): boolean {
  if (val == null) return false
  const upper = String(val).toUpperCase().trim()
  return MONTH_NAMES.some(m => upper.includes(m)) || /^\d{1,2}\/\d{1,2}$/.test(upper)
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every(cell => cell == null || String(cell).trim() === '')
}

// ── Trámite mapping ───────────────────────────────────────────────────

const TRAMITE_MAP: Record<string, string> = {
  'PUAM': 'puam',
  'JO': 'jubilacion_ordinaria',
  'JO NM': 'jubilacion_ordinaria',
  'JO SDM': 'jubilacion_ordinaria',
  'JO DOCENTE': 'jubilacion_ordinaria',
  'JO DOCENTE 24': 'jubilacion_ordinaria',
  'JO DOCENTE UNIV INV CIENT': 'jubilacion_ordinaria',
  'JO CHOFER 55/25': 'jubilacion_ordinaria',
  'JO CONSTRUCCION': 'jubilacion_ordinaria',
  'JUBILACION': 'jubilacion_ordinaria',
  'JUBILACIÓN COMÚN': 'jubilacion_ordinaria',
  'JUBILACION AGRARIA': 'jubilacion_ordinaria',
  'RTI': 'retiro_por_invalidez',
  'PXF': 'pension_fallecimiento',
  'PxF': 'pension_fallecimiento',
  'PXF DOCENTE EN ACTIV': 'pension_fallecimiento',
  'PENSION': 'pension_fallecimiento',
  'PENSION MADRE DE 7 HIJOS': 'pension_no_contributiva',
  'UCAP': 'ucap',
  'COMPRA DE UCAPS': 'compra_aportes',
  'UCAP + JO': 'ucap',
  'UCAP MAS JO': 'ucap',
  'RECO': 'reajuste_haberes',
  'RECO DOCENTE UNIV': 'reajuste_haberes',
  'REITUMPACION DE PAGO': 'reclamo_haberes',
  'REPAGO': 'reclamo_haberes',
  'NUEVA MORATORIA': 'moratorias',
  'NUEVA MORATORIA CON HIJOS': 'moratorias',
  'MORATORIA': 'moratorias',
}

function mapTramite(raw: string): string {
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  // Exact match (case-sensitive, then case-insensitive)
  if (TRAMITE_MAP[trimmed]) return TRAMITE_MAP[trimmed]
  for (const [key, val] of Object.entries(TRAMITE_MAP)) {
    if (key.toUpperCase() === upper) return val
  }
  // Partial match — ordered from most to least specific
  if (upper.includes('PUAM')) return 'puam'
  if (upper.includes('DOCENTE') && (upper.includes('JO') || upper.includes('JUBILA'))) return 'jubilacion_ordinaria'
  if (upper.includes('JUBILA')) return 'jubilacion_ordinaria'
  if (upper.includes('PENSION') && upper.includes('FALLEC')) return 'pension_fallecimiento'
  if (upper === 'PXF' || upper.startsWith('PXF ') || upper.startsWith('PxF')) return 'pension_fallecimiento'
  if (upper.includes('RTI') || upper.includes('RETIRO') || upper.includes('INVALIDEZ')) return 'retiro_por_invalidez'
  if (upper.includes('UCAP')) return 'ucap'
  if (upper.includes('MORATORIA')) return 'moratorias'
  if (upper === 'RECO' || upper.startsWith('RECO ') || upper.includes('REAJUSTE')) return 'reajuste_haberes'
  return 'otro'
}

// ── Sheet Parsers ─────────────────────────────────────────────────────

function parseTareasPendientes(ws: XLSX.WorkSheet): { clientes: ImportedCliente[]; expedientes: ImportedExpediente[] } {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
  const clientes: ImportedCliente[] = []
  const expedientes: ImportedExpediente[] = []

  for (const row of rows) {
    const dni = cleanDni(row['DNI'])
    if (!dni || dni.length < 7) continue
    const apellido = clean(row['APELLIDO'])
    if (!apellido) continue

    clientes.push({
      apellido: apellido.toUpperCase(),
      nombre: clean(row['NOMBRE']).toUpperCase(),
      dni,
      cuil: cleanCuil(row['CUIL']),
      telefono: cleanPhone(row['CONTACTO']),
    })

    const tarea = clean(row['TAREA'])
    expedientes.push({
      cliente_dni: dni,
      tramite: 'otro',
      estado_interno: 'LISTO_PARA_INICIAR',
      fecha_alta: null,
      numero_expediente: null,
      observaciones: tarea || null,
      abogado_nombre: null,
      fecha_resolucion: null,
    })
  }

  return { clientes, expedientes }
}

function parseTomados(ws: XLSX.WorkSheet): { clientes: ImportedCliente[]; expedientes: ImportedExpediente[] } {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
  const clientes: ImportedCliente[] = []
  const expedientes: ImportedExpediente[] = []

  for (const row of rows) {
    const dni = cleanDni(row['DNI'])
    if (!dni || dni.length < 7) continue
    const apellido = clean(row['APELLIDO'])
    if (!apellido) continue

    clientes.push({
      apellido: apellido.toUpperCase(),
      nombre: clean(row['NOMBRE']).toUpperCase(),
      dni,
      cuil: cleanCuil(row['CUIL']),
      telefono: cleanPhone(row['TELEFONO']),
    })

    const tramiteRaw = clean(row['TRÁMITE']) || clean(row['TRAMITE'])
    const obs = clean(row['PROPIO O ESTUDIO'])

    expedientes.push({
      cliente_dni: dni,
      tramite: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado_interno: 'INICIADO',
      fecha_alta: parseDate(row['fmena'] ?? row['FMENA'] ?? row['Fmena']),
      numero_expediente: null,
      observaciones: obs || null,
      abogado_nombre: null,
      fecha_resolucion: null,
    })
  }

  return { clientes, expedientes }
}

function parseIniciados(ws: XLSX.WorkSheet): { clientes: ImportedCliente[]; expedientes: ImportedExpediente[] } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
  const clientes: ImportedCliente[] = []
  const expedientes: ImportedExpediente[] = []

  // Columns: 0=fecha/mes, 1=Apellido, 2=Nombre, 3=DNI, 4=CUIL, 5=Telefono, 6=Tramite, 7=Clave, 8=Obs, 9=Abogado, 10=?, 11=NroExpediente
  for (const row of rows) {
    if (!Array.isArray(row) || isRowEmpty(row)) continue
    const dni = cleanDni(row[3])
    if (!dni || dni.length < 7) continue
    const apellido = clean(row[1])
    if (!apellido || isMonthHeader(apellido) || isMonthHeader(row[0])) continue

    clientes.push({
      apellido: apellido.toUpperCase(),
      nombre: clean(row[2]).toUpperCase(),
      dni,
      cuil: cleanCuil(row[4]),
      telefono: cleanPhone(row[5]),
    })

    const tramiteRaw = clean(row[6])
    const nroExp = clean(row[11])
    const abogado = clean(row[9])

    expedientes.push({
      cliente_dni: dni,
      tramite: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado_interno: 'INICIADO',
      fecha_alta: parseDate(row[0]),
      numero_expediente: nroExp || null,
      observaciones: clean(row[8]) || null,
      abogado_nombre: abogado || null,
      fecha_resolucion: null,
    })
  }

  return { clientes, expedientes }
}

function parseResueltos(ws: XLSX.WorkSheet): { clientes: ImportedCliente[]; expedientes: ImportedExpediente[] } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
  const clientes: ImportedCliente[] = []
  const expedientes: ImportedExpediente[] = []

  // Columns: 0=?, 1=Apellido, 2=Nombre, 3=DNI, 4=CUIL, 5=Telefono?, 6=Tramite, 7=Abogado, 8=FechaResolucion, 9=Obs, 10=FechaInicio, 11=NroExpediente
  for (const row of rows) {
    if (!Array.isArray(row) || isRowEmpty(row)) continue
    const dni = cleanDni(row[3])
    if (!dni || dni.length < 7) continue
    const apellido = clean(row[1])
    if (!apellido || isMonthHeader(apellido) || isMonthHeader(row[0])) continue

    clientes.push({
      apellido: apellido.toUpperCase(),
      nombre: clean(row[2]).toUpperCase(),
      dni,
      cuil: cleanCuil(row[4]),
      telefono: cleanPhone(row[5]),
    })

    const tramiteRaw = clean(row[6])
    const nroExp = clean(row[11])
    const abogado = clean(row[7])

    expedientes.push({
      cliente_dni: dni,
      tramite: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado_interno: 'FINALIZADO_FAVORABLE',
      fecha_alta: parseDate(row[10]),
      numero_expediente: nroExp || null,
      observaciones: clean(row[9]) || null,
      abogado_nombre: abogado || null,
      fecha_resolucion: parseDate(row[8]),
    })
  }

  return { clientes, expedientes }
}

function parseTurnos(ws: XLSX.WorkSheet): ImportedTurno[] {
  // Use sheet_to_json with headers from the first row — it has proper headers
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
  const turnos: ImportedTurno[] = []

  for (const row of rows) {
    const apellido = clean(row['APELLIDO'])
    const fecha = parseDate(row['TURNO'])
    if (!apellido || !fecha) continue

    turnos.push({
      cliente_apellido: apellido.toUpperCase(),
      cliente_nombre: clean(row['NOMBRE'] ?? '').toUpperCase(),
      fecha,
      hora: cleanTime(row['HORA']),
      udai: clean(row['UDAI']) || null,
      abogada: clean(row['ABOGADA']) || null,
      tramite: clean(row['TRÁMITE'] ?? row['TRAMITE'] ?? '') || null,
    })
  }

  return turnos
}

// ── Main Parser ───────────────────────────────────────────────────────

export function parseExcelFile(file: ArrayBuffer): ImportPreview {
  if (file.byteLength > 50 * 1024 * 1024) {
    throw new Error('El archivo excede el tamaño máximo de 50MB')
  }

  const wb = XLSX.read(file, { type: 'array', cellDates: true })
  const errores: string[] = []
  const hojasProcesadas: string[] = []

  const allClientes: ImportedCliente[] = []
  const allExpedientes: ImportedExpediente[] = []
  let allTurnos: ImportedTurno[] = []

  const sheetParsers: Record<string, () => void> = {
    'TAREAS PENDIENTES': () => {
      const ws = wb.Sheets['TAREAS PENDIENTES']
      if (!ws) return
      const { clientes, expedientes } = parseTareasPendientes(ws)
      allClientes.push(...clientes)
      allExpedientes.push(...expedientes)
      hojasProcesadas.push('TAREAS PENDIENTES')
    },
    'TOMADOS': () => {
      const ws = wb.Sheets['TOMADOS']
      if (!ws) return
      const { clientes, expedientes } = parseTomados(ws)
      allClientes.push(...clientes)
      allExpedientes.push(...expedientes)
      hojasProcesadas.push('TOMADOS')
    },
    'INICIADOS': () => {
      const ws = wb.Sheets['INICIADOS']
      if (!ws) return
      const { clientes, expedientes } = parseIniciados(ws)
      allClientes.push(...clientes)
      allExpedientes.push(...expedientes)
      hojasProcesadas.push('INICIADOS')
    },
    'RESUELTOS': () => {
      const ws = wb.Sheets['RESUELTOS']
      if (!ws) return
      const { clientes, expedientes } = parseResueltos(ws)
      allClientes.push(...clientes)
      allExpedientes.push(...expedientes)
      hojasProcesadas.push('RESUELTOS')
    },
    'TURNOS': () => {
      const ws = wb.Sheets['TURNOS']
      if (!ws) return
      allTurnos = parseTurnos(ws)
      hojasProcesadas.push('TURNOS')
    },
  }

  for (const [name, parser] of Object.entries(sheetParsers)) {
    try {
      parser()
    } catch (e) {
      errores.push(`Error procesando hoja "${name}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Deduplicate clientes by DNI — merge non-null fields, prefer earlier (richer) data
  const clienteMap = new Map<string, ImportedCliente>()
  for (const c of allClientes) {
    const existing = clienteMap.get(c.dni)
    if (!existing) {
      clienteMap.set(c.dni, c)
    } else {
      clienteMap.set(c.dni, {
        apellido: existing.apellido || c.apellido,
        nombre: existing.nombre || c.nombre,
        dni: c.dni,
        cuil: existing.cuil || c.cuil,
        telefono: existing.telefono || c.telefono,
      })
    }
  }

  const uniqueClientes = Array.from(clienteMap.values())

  return {
    clientes: uniqueClientes,
    expedientes: allExpedientes,
    turnos: allTurnos,
    stats: {
      totalClientes: uniqueClientes.length,
      totalExpedientes: allExpedientes.length,
      totalTurnos: allTurnos.length,
      hojasProcesadas,
      errores,
    },
  }
}
