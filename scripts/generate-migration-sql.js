#!/usr/bin/env node
/**
 * Generate SQL migration batches from parsed Excel data
 * Outputs SQL files that can be run via execute_sql
 */
const data = require('/tmp/migration-data.json');
const fs = require('fs');

const ADMIN_USER_ID = '896c14b4-ac24-4c35-bb07-1d8cd287c1b3';

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

function esc(val) {
  if (val == null) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// ── 1. CLIENTS: INSERT ON CONFLICT ──
const clientBatches = [];
const BATCH_SIZE = 50;

for (let i = 0; i < data.clientes.length; i += BATCH_SIZE) {
  const batch = data.clientes.slice(i, i + BATCH_SIZE);
  const values = batch.map(c =>
    `(${esc(c.apellido)}, ${esc(c.nombre)}, ${esc(c.dni)}, ${esc(c.cuil)}, ${esc(c.telefono)}, '${ADMIN_USER_ID}'::uuid)`
  ).join(',\n  ');

  clientBatches.push(
    `INSERT INTO clientes (apellido, nombre, dni, cuil, telefono, created_by)
VALUES
  ${values}
ON CONFLICT (dni) DO UPDATE SET
  telefono = COALESCE(clientes.telefono, EXCLUDED.telefono),
  cuil = COALESCE(clientes.cuil, EXCLUDED.cuil),
  updated_at = now();`
  );
}

// ── 2. EXPEDIENTES: INSERT with subquery for client_id ──
// Skip if expediente already exists for same client+tipo+estado
const expBatches = [];

for (let i = 0; i < data.expedientes.length; i += BATCH_SIZE) {
  const batch = data.expedientes.slice(i, i + BATCH_SIZE);
  const stmts = batch.map((exp, idx) => {
    const tipoId = TIPO_TRAMITE_MAP[exp.tramite_code] || TIPO_TRAMITE_MAP['otro'];
    const nro = exp.nro_exp || `IMP-${String(i + idx).padStart(4, '0')}`;
    const fechaAlta = exp.fecha_alta || 'CURRENT_DATE';
    const fechaAltaVal = exp.fecha_alta ? `'${exp.fecha_alta}'::date` : 'CURRENT_DATE';
    const fechaRes = exp.fecha_res ? `'${exp.fecha_res}'::date` : 'NULL';

    // Find client name for caratula
    const cliente = data.clientes.find(c => c.dni === exp.dni);
    const clienteName = cliente ? `${cliente.apellido} ${cliente.nombre}` : 'DESCONOCIDO';
    const tramiteLabel = Object.entries(TIPO_TRAMITE_MAP).find(([k,v]) => v === tipoId)?.[0] || 'otro';
    const caratula = `${clienteName} s/ ${tramiteLabel}`;

    return `INSERT INTO expedientes (numero, cliente_id, tipo_tramite_id, estado_interno, fecha_alta, numero_expediente, observaciones, caratula, created_by, fecha_resolucion)
SELECT ${esc(nro)}, c.id, '${tipoId}'::uuid, ${esc(exp.estado)}, ${fechaAltaVal}, ${esc(nro)}, ${esc(exp.obs)}, ${esc(caratula)}, '${ADMIN_USER_ID}'::uuid, ${fechaRes}
FROM clientes c
WHERE c.dni = ${esc(exp.dni)} AND c.deleted_at IS NULL
AND NOT EXISTS (
  SELECT 1 FROM expedientes e
  WHERE e.cliente_id = c.id AND e.tipo_tramite_id = '${tipoId}'::uuid
    AND e.estado_interno = ${esc(exp.estado)} AND e.deleted_at IS NULL
)
LIMIT 1;`;
  });

  expBatches.push(stmts.join('\n'));
}

// ── 3. TURNOS: Match by client name, find most recent expediente ──
const turnoBatches = [];

for (let i = 0; i < data.turnos.length; i += BATCH_SIZE) {
  const batch = data.turnos.slice(i, i + BATCH_SIZE);
  const stmts = batch.map(t => {
    const nota = t.tramite ? `Trámite: ${t.tramite}` : null;

    return `INSERT INTO turnos_anses (expediente_id, fecha, hora, tipo_turno, estado, notas, created_by)
SELECT e.id, '${t.fecha}'::date, '${t.hora}'::time, 'INICIO_TRAMITE', 'REALIZADO', ${esc(nota)}, '${ADMIN_USER_ID}'::uuid
FROM expedientes e
JOIN clientes c ON c.id = e.cliente_id
WHERE c.deleted_at IS NULL AND e.deleted_at IS NULL AND e.archivado = false
  AND UPPER(c.apellido) = ${esc(t.apellido)}
  AND (${esc(t.nombre)} = '' OR UPPER(c.nombre) LIKE '%' || ${esc(t.nombre)} || '%')
AND NOT EXISTS (
  SELECT 1 FROM turnos_anses t2 WHERE t2.expediente_id = e.id AND t2.fecha = '${t.fecha}'::date
)
ORDER BY e.created_at DESC
LIMIT 1;`;
  });

  turnoBatches.push(stmts.join('\n'));
}

// Write all batches to files
const allBatches = {
  clients: clientBatches,
  expedientes: expBatches,
  turnos: turnoBatches,
};

fs.writeFileSync('/tmp/migration-batches.json', JSON.stringify(allBatches));
console.log(`Generated: ${clientBatches.length} client batches, ${expBatches.length} exp batches, ${turnoBatches.length} turno batches`);
