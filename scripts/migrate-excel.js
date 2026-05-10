#!/usr/bin/env node
/**
 * One-time migration script: Parse Excel → Generate SQL batches
 * Run with: node scripts/migrate-excel.js > scripts/migration-output.json
 */
const XLSX = require('../frontend/node_modules/xlsx');
const path = require('path');

const EXCEL_PATH = '/Users/marcorossi/Downloads/Planilla de Control al 09042026.xlsx';
const ADMIN_USER_ID = '896c14b4-ac24-4c35-bb07-1d8cd287c1b3';

// ── Reference data from DB ──
const TIPO_TRAMITE_MAP = {
  'jubilacion_ordinaria': 'bd4a837f-eb6d-4d25-8906-2dbadd1ccf35',
  'jubilacion_anticipada': 'fa6a2005-c414-471d-bc24-21026144bd9c',
  'pension_fallecimiento': '6bab50e5-baa5-4274-9935-d93fa8aa07f8',
  'pension_invalidez': 'fd35e2fb-9320-4769-b7dc-4890550b4010',
  'moratorias': '528b27a7-bb9d-4a10-a078-d17a5722ebb9',
  'reajuste_haberes': '62242986-53c4-40a0-8427-2ecf02efe818',
  'reclamo_haberes': 'ffaa33db-ecca-45ea-b2f9-54084c25cf61',
  'ucap': 'dced19c1-5ef1-4c25-a0d0-423d1c456521',
  'retiro_por_invalidez': '4604dc76-fcfd-4c22-8853-390a015eb38d',
  'pension_no_contributiva': 'b76a62f7-6bf5-423c-9ea8-d70de417dc4c',
  'otro': '59b44ee2-7e08-4e78-8846-c33fe89e8b60',
  'puam': '1fabe4f1-6d17-4033-9195-36f280c2d847',
  'compra_aportes': '9298a356-74cb-4218-9d82-7ac84ed69907',
};

const TRAMITE_ALIAS = {
  'PUAM': 'puam',
  'JO': 'jubilacion_ordinaria', 'JO NM': 'jubilacion_ordinaria', 'JO SDM': 'jubilacion_ordinaria',
  'JO DOCENTE': 'jubilacion_ordinaria', 'JO DOCENTE 24': 'jubilacion_ordinaria',
  'JO DOCENTE UNIV INV CIENT': 'jubilacion_ordinaria', 'JO CHOFER 55/25': 'jubilacion_ordinaria',
  'JO CONSTRUCCION': 'jubilacion_ordinaria', 'JUBILACION': 'jubilacion_ordinaria',
  'JUBILACIÓN COMÚN': 'jubilacion_ordinaria', 'JUBILACION AGRARIA': 'jubilacion_ordinaria',
  'RTI': 'retiro_por_invalidez',
  'PXF': 'pension_fallecimiento', 'PxF': 'pension_fallecimiento',
  'PXF DOCENTE EN ACTIV': 'pension_fallecimiento', 'PENSION': 'pension_fallecimiento',
  'PENSION MADRE DE 7 HIJOS': 'pension_no_contributiva',
  'UCAP': 'ucap', 'COMPRA DE UCAPS': 'compra_aportes', 'UCAP + JO': 'ucap', 'UCAP MAS JO': 'ucap',
  'RECO': 'reajuste_haberes', 'RECO DOCENTE UNIV': 'reajuste_haberes',
  'REITUMPACION DE PAGO': 'reclamo_haberes', 'REPAGO': 'reclamo_haberes',
  'NUEVA MORATORIA': 'moratorias', 'NUEVA MORATORIA CON HIJOS': 'moratorias', 'MORATORIA': 'moratorias',
};

// ── Helpers ──
function clean(val) {
  if (val == null) return '';
  return String(val).trim();
}

function cleanDni(val) {
  if (val == null) return '';
  return String(val).replace(/[^0-9]/g, '').replace(/^0+/, '');
}

function cleanCuil(val) {
  if (val == null) return null;
  const raw = String(val).replace(/[^0-9]/g, '');
  if (raw.length === 11) return `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}`;
  return null;
}

function cleanPhone(val) {
  if (val == null) return null;
  const raw = String(val).replace(/[^0-9+]/g, '');
  return raw.length >= 8 ? raw : null;
}

function parseDate(val) {
  if (val == null) return null;
  if (val instanceof Date && !isNaN(val.getTime()) && val.getFullYear() > 1990) {
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return null;
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const [d, m, y] = slashParts;
    const year = y.length === 2 ? `20${y}` : y;
    const dt = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1990) return dt.toISOString().split('T')[0];
  }
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && iso.getFullYear() > 1990 && iso.getFullYear() < 2100) {
    return iso.toISOString().split('T')[0];
  }
  return null;
}

function cleanTime(val) {
  if (val == null) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    const h = val.getHours().toString().padStart(2, '0');
    const m = val.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  const s = String(val).trim();
  const tm = s.match(/(\d{1,2}):(\d{2})/);
  if (tm) return `${tm[1].padStart(2, '0')}:${tm[2]}`;
  return null;
}

function mapTramite(raw) {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (TRAMITE_ALIAS[trimmed]) return TRAMITE_ALIAS[trimmed];
  for (const [key, val] of Object.entries(TRAMITE_ALIAS)) {
    if (key.toUpperCase() === upper) return val;
  }
  if (upper.includes('PUAM')) return 'puam';
  if (upper.includes('DOCENTE') && (upper.includes('JO') || upper.includes('JUBILA'))) return 'jubilacion_ordinaria';
  if (upper.includes('JUBILA')) return 'jubilacion_ordinaria';
  if (upper.includes('PENSION') && upper.includes('FALLEC')) return 'pension_fallecimiento';
  if (upper === 'PXF' || upper.startsWith('PXF ') || upper.startsWith('PxF')) return 'pension_fallecimiento';
  if (upper.includes('RTI') || upper.includes('RETIRO') || upper.includes('INVALIDEZ')) return 'retiro_por_invalidez';
  if (upper.includes('UCAP')) return 'ucap';
  if (upper.includes('MORATORIA')) return 'moratorias';
  if (upper === 'RECO' || upper.startsWith('RECO ') || upper.includes('REAJUSTE')) return 'reajuste_haberes';
  return 'otro';
}

const MONTH_NAMES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','FEBR ERO','SEPT IEMBRE'];
function isMonthHeader(val) {
  if (val == null) return false;
  const upper = String(val).toUpperCase().trim();
  return MONTH_NAMES.some(m => upper.includes(m)) || /^\d{1,2}\/\d{1,2}$/.test(upper);
}

function isRowEmpty(row) {
  return row.every(cell => cell == null || String(cell).trim() === '');
}

function esc(val) {
  if (val == null) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// ── Parse Excel ──
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });

// Collect all clients and expedientes
const clienteMap = new Map(); // dni → { apellido, nombre, cuil, telefono }
const expedientes = []; // { dni, tramite_code, estado, fecha_alta, nro_exp, obs, abogado, fecha_res }
const turnos = []; // { apellido, nombre, fecha, hora, udai, abogada, tramite }

// ── TAREAS PENDIENTES ──
{
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['TAREAS PENDIENTES']);
  for (const row of rows) {
    const dni = cleanDni(row['DNI']);
    if (!dni || dni.length < 7) continue;
    const apellido = clean(row['APELLIDO']);
    if (!apellido) continue;

    if (!clienteMap.has(dni)) {
      clienteMap.set(dni, {
        apellido: apellido.toUpperCase(),
        nombre: clean(row['NOMBRE']).toUpperCase(),
        cuil: cleanCuil(row['CUIL']),
        telefono: cleanPhone(row['CONTACTO']),
      });
    }

    const tarea = clean(row['TAREA']);
    expedientes.push({
      dni, tramite_code: 'otro', estado: 'TOMADO_LISTO_PARA_INICIAR',
      fecha_alta: null, nro_exp: null, obs: tarea || null, abogado: null, fecha_res: null,
    });
  }
  console.error(`TAREAS PENDIENTES: ${rows.length} rows → ${expedientes.length} expedientes`);
}

// ── TOMADOS ──
{
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['TOMADOS']);
  const before = expedientes.length;
  for (const row of rows) {
    const dni = cleanDni(row['DNI']);
    if (!dni || dni.length < 7) continue;
    const apellido = clean(row['APELLIDO']);
    if (!apellido) continue;

    if (!clienteMap.has(dni)) {
      clienteMap.set(dni, {
        apellido: apellido.toUpperCase(),
        nombre: clean(row['NOMBRE']).toUpperCase(),
        cuil: cleanCuil(row['CUIL']),
        telefono: cleanPhone(row['TELEFONO']),
      });
    } else {
      const existing = clienteMap.get(dni);
      if (!existing.telefono) existing.telefono = cleanPhone(row['TELEFONO']);
      if (!existing.cuil) existing.cuil = cleanCuil(row['CUIL']);
    }

    const tramiteRaw = clean(row['TRÁMITE']) || clean(row['TRAMITE']);
    const obs = clean(row['PROPIO O ESTUDIO']);
    expedientes.push({
      dni, tramite_code: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado: 'EN_TRAMITE_ANSES',
      fecha_alta: parseDate(row['fmena'] || row['FMENA'] || row['Fmena']),
      nro_exp: null, obs: obs || null, abogado: null, fecha_res: null,
    });
  }
  console.error(`TOMADOS: ${rows.length} rows → ${expedientes.length - before} expedientes`);
}

// ── INICIADOS ──
{
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['INICIADOS'], { header: 1 });
  const before = expedientes.length;
  for (const row of rows) {
    if (!Array.isArray(row) || isRowEmpty(row)) continue;
    const dni = cleanDni(row[3]);
    if (!dni || dni.length < 7) continue;
    const apellido = clean(row[1]);
    if (!apellido || isMonthHeader(apellido) || isMonthHeader(row[0])) continue;

    if (!clienteMap.has(dni)) {
      clienteMap.set(dni, {
        apellido: apellido.toUpperCase(),
        nombre: clean(row[2]).toUpperCase(),
        cuil: cleanCuil(row[4]),
        telefono: cleanPhone(row[5]),
      });
    }

    const tramiteRaw = clean(row[6]);
    expedientes.push({
      dni, tramite_code: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado: 'INICIADO_EN_ANSES',
      fecha_alta: parseDate(row[0]),
      nro_exp: clean(row[11]) || null, obs: clean(row[8]) || null,
      abogado: clean(row[9]) || null, fecha_res: null,
    });
  }
  console.error(`INICIADOS: → ${expedientes.length - before} expedientes`);
}

// ── RESUELTOS ──
{
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['RESUELTOS'], { header: 1 });
  const before = expedientes.length;
  for (const row of rows) {
    if (!Array.isArray(row) || isRowEmpty(row)) continue;
    const dni = cleanDni(row[3]);
    if (!dni || dni.length < 7) continue;
    const apellido = clean(row[1]);
    if (!apellido || isMonthHeader(apellido) || isMonthHeader(row[0])) continue;

    if (!clienteMap.has(dni)) {
      clienteMap.set(dni, {
        apellido: apellido.toUpperCase(),
        nombre: clean(row[2]).toUpperCase(),
        cuil: cleanCuil(row[4]),
        telefono: cleanPhone(row[5]),
      });
    }

    const tramiteRaw = clean(row[6]);
    expedientes.push({
      dni, tramite_code: tramiteRaw ? mapTramite(tramiteRaw) : 'otro',
      estado: 'RESUELTO_FAVORABLEMENTE',
      fecha_alta: parseDate(row[10]),
      nro_exp: clean(row[11]) || null, obs: clean(row[9]) || null,
      abogado: clean(row[7]) || null, fecha_res: parseDate(row[8]),
    });
  }
  console.error(`RESUELTOS: → ${expedientes.length - before} expedientes`);
}

// ── TURNOS ──
{
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['TURNOS']);
  for (const row of rows) {
    const apellido = clean(row['APELLIDO']);
    const fecha = parseDate(row['TURNO']);
    if (!apellido || !fecha) continue;
    turnos.push({
      apellido: apellido.toUpperCase(),
      nombre: clean(row['NOMBRE'] || '').toUpperCase(),
      fecha, hora: cleanTime(row['HORA']) || '09:00',
      udai: clean(row['UDAI']) || null,
      abogada: clean(row['ABOGADA']) || null,
      tramite: clean(row['TRÁMITE'] || row['TRAMITE'] || '') || null,
    });
  }
  console.error(`TURNOS: ${turnos.length} parsed`);
}

// ── Deduplicate expedientes by (dni + tramite + estado) ──
const expDedup = new Map();
for (const exp of expedientes) {
  const key = `${exp.dni}|${exp.tramite_code}|${exp.estado}`;
  if (!expDedup.has(key)) {
    expDedup.set(key, exp);
  } else {
    // Merge: keep the one with more data
    const existing = expDedup.get(key);
    if (!existing.nro_exp && exp.nro_exp) existing.nro_exp = exp.nro_exp;
    if (!existing.obs && exp.obs) existing.obs = exp.obs;
    if (!existing.abogado && exp.abogado) existing.abogado = exp.abogado;
    if (!existing.fecha_res && exp.fecha_res) existing.fecha_res = exp.fecha_res;
    if (!existing.fecha_alta && exp.fecha_alta) existing.fecha_alta = exp.fecha_alta;
  }
}
const uniqueExp = Array.from(expDedup.values());

console.error(`\n=== TOTALS ===`);
console.error(`Unique clients: ${clienteMap.size}`);
console.error(`Unique expedientes: ${uniqueExp.length}`);
console.error(`Turnos: ${turnos.length}`);

// ── Output as JSON for processing ──
const output = {
  clientes: Array.from(clienteMap.entries()).map(([dni, c]) => ({ dni, ...c })),
  expedientes: uniqueExp,
  turnos,
};

console.log(JSON.stringify(output));
