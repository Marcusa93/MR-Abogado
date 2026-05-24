// ─────────────────────────────────────────────────────────────────────────
// BogaBot — tool definitions + handlers
//
// Schemas en formato Anthropic tool-use (JSON Schema). El edge function
// ejecuta los read-only handlers in-loop y devuelve los write como
// "needs_confirmation" para que el cliente los confirme antes de tocar
// la DB.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface UserInfo {
  user_id: string
  rol: string
  is_staff: boolean   // admin / abogado → ve todos; otros sólo donde sean miembro
}

export interface ToolHandlerResult {
  // Para read-only: el JSON que se le devuelve al modelo
  result?: unknown
  // Para write: pendiente de confirmación
  pending_action?: {
    type: string
    label: string
    description: string
    resolved_args: Record<string, unknown>
  }
  error?: string
}

// ─── Helpers de resolución de referencias ─────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function clienteLabel(c: { apellido?: string | null; nombre?: string | null } | null | undefined): string {
  if (!c) return 'Sin cliente'
  return `${c.apellido ?? ''} ${c.nombre ?? ''}`.trim() || 'Sin nombre'
}

function expedienteLabel(e: {
  numero?: string | null
  caratula?: string | null
  clientes?: { apellido?: string | null; nombre?: string | null } | null
}): string {
  return e.caratula || e.numero || clienteLabel(e.clientes) || 'Expediente'
}

/**
 * Devuelve la lista de ids de expedientes que el user puede ver:
 *   - null = is_staff (DIRECTOR — sin restricción)
 *   - []   = no ve nada
 *   - [...] = unión de responsable + creador + miembro
 *
 * Modelo (post-migración 053):
 *   - DIRECTOR ve todo (is_staff=true).
 *   - ABOGADO/COLABORADOR ven donde son abogado_responsable, creador
 *     o miembro formal en expediente_miembros.
 */
async function getAllowedExpedienteIds(
  admin: SupabaseClient,
  user: UserInfo,
): Promise<string[] | null> {
  if (user.is_staff) return null
  const [m, own] = await Promise.all([
    admin.from('expediente_miembros').select('expediente_id').eq('profile_id', user.user_id),
    admin.from('expedientes')
      .select('id')
      .or(`abogado_responsable_id.eq.${user.user_id},created_by.eq.${user.user_id}`)
      .is('deleted_at', null),
  ])
  const ids = new Set<string>()
  for (const row of (m.data ?? [])) ids.add((row as any).expediente_id)
  for (const row of (own.data ?? [])) ids.add((row as any).id)
  return [...ids]
}

/**
 * ¿El user puede ver este expediente puntual? Acepta director,
 * responsable, creador o miembro.
 */
async function canAccessExpediente(
  admin: SupabaseClient,
  user: UserInfo,
  expedienteId: string,
): Promise<boolean> {
  if (user.is_staff) return true
  const [m, own] = await Promise.all([
    admin.from('expediente_miembros').select('rol').eq('profile_id', user.user_id).eq('expediente_id', expedienteId).maybeSingle(),
    admin.from('expedientes')
      .select('id')
      .eq('id', expedienteId)
      .or(`abogado_responsable_id.eq.${user.user_id},created_by.eq.${user.user_id}`)
      .maybeSingle(),
  ])
  return !!(m.data || own.data)
}

async function resolveExpediente(
  admin: SupabaseClient,
  ref: string,
  user: UserInfo,
): Promise<{ id: string; label: string } | { error: string; candidates?: string[] }> {
  const raw = ref.trim()
  if (!raw) return { error: 'Falta referencia al expediente' }

  // UUID directo
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    const { data } = await admin
      .from('expedientes')
      .select('id, numero, caratula, clientes:clientes(apellido, nombre)')
      .eq('id', raw)
      .maybeSingle()
    if (!data) return { error: `No encuentro el expediente con id ${raw}` }
    return { id: data.id, label: expedienteLabel(data as any) }
  }

  const allowedIds = await getAllowedExpedienteIds(admin, user)
  if (allowedIds && allowedIds.length === 0) {
    return { error: `No tenés expedientes visibles para buscar` }
  }

  // Buscar por número, número SAE o carátula
  const term = `%${raw.replace(/[%_\\]/g, '')}%`
  let q1 = admin
    .from('expedientes')
    .select('id, numero, numero_sae, caratula, clientes:clientes(apellido, nombre)')
    .is('deleted_at', null)
    .or(`numero.ilike.${term},numero_sae.ilike.${term},caratula.ilike.${term}`)
  if (allowedIds) q1 = q1.in('id', allowedIds)
  const { data: byNum } = await q1.limit(10)

  let candidates = (byNum ?? []) as any[]

  // Si no hubo match, intentar por nombre de cliente
  if (candidates.length === 0) {
    const { data: clientes } = await admin
      .from('clientes')
      .select('id, nombre, apellido')
      .or(`apellido.ilike.${term},nombre.ilike.${term}`)
      .limit(10)
    if (clientes && clientes.length > 0) {
      const clienteIds = (clientes as any[]).map(c => c.id)
      let q2 = admin
        .from('expedientes')
        .select('id, numero, caratula, clientes:clientes(apellido, nombre)')
        .in('cliente_id', clienteIds)
        .is('deleted_at', null)
      if (allowedIds) q2 = q2.in('id', allowedIds)
      const { data: byCli } = await q2.limit(10)
      candidates = (byCli ?? []) as any[]
    }
  }

  if (candidates.length === 0) {
    return { error: `No encuentro ningún expediente que matchee "${raw}"` }
  }
  if (candidates.length > 1) {
    return {
      error: `Hay ${candidates.length} expedientes que matchean "${raw}". Pedile al usuario que precise.`,
      candidates: candidates.map(c => expedienteLabel(c)),
    }
  }
  return { id: candidates[0].id, label: expedienteLabel(candidates[0]) }
}

async function resolveProfile(
  admin: SupabaseClient,
  ref: string | null | undefined,
): Promise<{ id: string; label: string } | { error: string }> {
  if (!ref) return { error: 'Falta referencia al usuario' }
  const raw = ref.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    const { data } = await admin.from('profiles').select('id, nombre, apellido').eq('id', raw).maybeSingle()
    if (!data) return { error: 'Usuario no encontrado' }
    return { id: data.id, label: `${(data as any).nombre} ${(data as any).apellido}`.trim() }
  }
  const term = `%${raw.replace(/[%_\\]/g, '')}%`
  const { data } = await admin
    .from('profiles')
    .select('id, nombre, apellido, email')
    .or(`nombre.ilike.${term},apellido.ilike.${term},email.ilike.${term}`)
    .limit(5)
  const list = (data ?? []) as any[]
  if (list.length === 0) return { error: `No encuentro un usuario que matchee "${raw}"` }
  if (list.length > 1) {
    const names = list.map(p => `${p.nombre} ${p.apellido}`).join(', ')
    return { error: `Hay varios usuarios que matchean "${raw}": ${names}. Pedí precisión.` }
  }
  return { id: list[0].id, label: `${list[0].nombre} ${list[0].apellido}`.trim() }
}

// ─── Definiciones de Tools (formato Anthropic) ────────────────────────────

export const BOGABOT_TOOLS = [
  {
    name: 'search_expediente',
    description: 'Busca expedientes por número, número SAE, carátula o nombre/apellido del cliente. La tool entiende los separadores judiciales típicos en la consulta: "Rossi con Sosa", "Rossi c/ Sosa", "Rossi vs Sosa", "Rossi contra Sosa" → busca carátulas que contengan AMBAS partes (actor y demandado). Devuelve hasta `limit` matches con info resumida.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar — número (ej. "EXP-2026-0042"), apellido, palabras de la carátula, o frase con "con/c-slash/vs/contra" para buscar por actor y demandado simultáneamente' },
        limit: { type: 'integer', description: 'Máximo de resultados a devolver', default: 5, minimum: 1, maximum: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_expediente',
    description: 'Devuelve el detalle completo de un expediente: cliente, tipo trámite, estado, prioridad, observaciones, tareas pendientes, próxima audiencia, miembros asignados. Si no tenés el id exacto, primero usá search_expediente.',
    input_schema: {
      type: 'object',
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente (obtenido con search_expediente)' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'get_ultima_actuacion',
    description: 'Devuelve la última actividad cronológica de un expediente. Consulta tres fuentes y devuelve la más reciente: (1) sae_movements = actuaciones reales del juzgado SAE (lo más importante: proveídos, audiencias, traslados, etc.); (2) sae_notificaciones = cédulas del casillero digital; (3) seguimientos internos del estudio. Útil para "qué se sabe de X", "última novedad", "qué pasó en el expediente Y".',
    input_schema: {
      type: 'object',
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'list_actuaciones_sae',
    description: 'Lista las actuaciones del expediente desde sae_movements (movimientos del juzgado), ordenadas cronológicamente (más recientes primero). Útil cuando el usuario pide "el historial", "las últimas actuaciones" o "qué pasó en el expediente Y".',
    input_schema: {
      type: 'object',
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente' },
        limit: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
        solo_claves: { type: 'boolean', description: 'Solo movimientos marcados como clave (is_key)', default: false },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'list_tareas',
    description: 'Lista tareas con filtros opcionales. Sin filtros devuelve las pendientes del usuario actual. Útil para "qué tareas tengo", "tareas vencidas", "tareas de X expediente".',
    input_schema: {
      type: 'object',
      properties: {
        solo_vencidas: { type: 'boolean', description: 'Solo tareas con vencimiento < hoy y no completadas', default: false },
        solo_mis_tareas: { type: 'boolean', description: 'Solo las asignadas al usuario que pregunta', default: false },
        expediente_id: { type: 'string', description: 'UUID — filtrar por expediente' },
        fecha_hasta: { type: 'string', description: 'Solo tareas con vencimiento ≤ esta fecha (YYYY-MM-DD)' },
        prioridad: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] },
        limit: { type: 'integer', default: 15, minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'list_audiencias',
    description: 'Lista audiencias por rango de fechas. Sin filtros devuelve las próximas 14 días.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD inclusive. Default: hoy.' },
        hasta: { type: 'string', description: 'YYYY-MM-DD inclusive. Default: hoy + 14 días.' },
        expediente_id: { type: 'string' },
        limit: { type: 'integer', default: 15, minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'list_notif_sae',
    description: 'Lista notificaciones del portal SAE del usuario actual. Por defecto solo no leídas, más recientes primero.',
    input_schema: {
      type: 'object',
      properties: {
        solo_no_leidas: { type: 'boolean', default: true },
        solo_urgentes: { type: 'boolean', description: 'Solo las marcadas urgentes por IA', default: false },
        fuero: { type: 'string', description: 'Slug del fuero (ej. "civil", "familia")' },
        limit: { type: 'integer', default: 10, minimum: 1, maximum: 30 },
      },
    },
  },
  // ─── Write tools — devuelven "pending_action", no ejecutan ──────────
  {
    name: 'crear_tarea',
    description: 'Prepara una tarea para crear. NO la crea — devuelve un payload pendiente para que el usuario confirme. El usuario verá los detalles y un botón "Confirmar".',
    input_schema: {
      type: 'object',
      properties: {
        expediente_ref: { type: 'string', description: 'Carátula, número o apellido del cliente del expediente' },
        titulo: { type: 'string', description: 'Título corto de la tarea' },
        descripcion: { type: 'string', description: 'Descripción opcional' },
        fecha_vencimiento: { type: 'string', description: 'YYYY-MM-DD opcional' },
        asignado_ref: { type: 'string', description: 'Nombre/apellido del usuario al que asignar. Si se omite, queda sin asignar.' },
        prioridad: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'], default: 'MEDIA' },
      },
      required: ['expediente_ref', 'titulo'],
    },
  },
  {
    name: 'completar_tarea',
    description: 'Prepara una tarea para marcar como completada. NO la marca — devuelve un payload pendiente para que el usuario confirme.',
    input_schema: {
      type: 'object',
      properties: {
        tarea_ref: { type: 'string', description: 'Título exacto o UUID de la tarea (mejor usar el título tal como apareció en una list_tareas previa).' },
      },
      required: ['tarea_ref'],
    },
  },
  // ─── Tools jurídicas externas (SAIJ via legal-lookup) ──────────────
  {
    name: 'buscar_jurisprudencia',
    description: 'Busca fallos judiciales en SAIJ (Sistema Argentino de Información Jurídica). Útil cuando el usuario pregunta por jurisprudencia, fallos similares, doctrina judicial sobre un tema. Devuelve hasta 10 fallos con carátula, tribunal, fecha y resumen.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto libre — palabras clave, partes, materia (ej. "responsabilidad médica daño moral")' },
        jurisdiccion: { type: 'string', description: 'Filtro opcional: "Nacional", "Federal", "Local", o nombre de provincia' },
        tribunal: { type: 'string', description: 'Filtro opcional por tribunal específico' },
        materia: { type: 'string', description: 'Rama del derecho: "Civil", "Laboral", "Penal", "Comercial", "Administrativo", "Constitucional", "Procesal"' },
        fecha_desde: { type: 'string', description: 'YYYY-MM-DD opcional' },
        fecha_hasta: { type: 'string', description: 'YYYY-MM-DD opcional' },
        limit: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'buscar_normativa',
    description: 'Busca legislación (leyes, decretos, códigos, resoluciones) en SAIJ. Útil para verificar normativa vigente, encontrar artículos específicos, ver decretos sobre un tema.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Número de norma o tema (ej. "Ley 24240", "daños y perjuicios")' },
        jurisdiccion: { type: 'string', description: '"Nacional", "Federal", "Local"' },
        tipo: { type: 'string', description: 'Filtro: "Ley", "Decreto", "Ley/Código", "Resolución"' },
        estado_vigencia: { type: 'string', description: 'Filtro: "Vigente, de alcance general" para solo vigente' },
        materia: { type: 'string', description: 'Tema/rama (mismas opciones que jurisprudencia)' },
        limit: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'resolver_cita_legal',
    description: 'Resuelve una cita textual (ej. "Ley 24.240", "art. 1738 CCCN", "Código Civil y Comercial") al documento real en SAIJ. Devuelve texto completo + metadata.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'La cita tal como la escribió el usuario o aparece en un escrito' },
      },
      required: ['text'],
    },
  },
] as const

// ─── Handlers ─────────────────────────────────────────────────────────────

type Handler = (admin: SupabaseClient, user: UserInfo, args: any) => Promise<ToolHandlerResult>

export const TOOL_HANDLERS: Record<string, Handler> = {

  search_expediente: async (admin, user, args) => {
    const q = String(args.query ?? '').trim()
    const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 20)
    if (!q) return { error: 'query vacía' }

    const allowedIds = await getAllowedExpedienteIds(admin, user)
    if (allowedIds && allowedIds.length === 0) {
      return { result: { count: 0, items: [] } }
    }

    // Detectar separadores judiciales en la consulta (con, c/, contra, vs,
    // versus, v., &, /). Si hay >=2 partes, busco carátula que las contenga
    // a TODAS — interpreta "Rossi con Sosa", "Rossi vs Sosa", etc.
    const SEPARATORS = /\b(con|contra|vs|versus|v\.s\.)\b|\s+c\/\s*|\s*\/\s*/gi
    const partes = q
      .split(SEPARATORS)
      .map(s => (s || '').trim())
      .filter(s => s.length >= 2 && !/^(con|contra|vs|versus|v\.s\.)$/i.test(s))

    const term = `%${q.replace(/[%_\\]/g, '')}%`

    // Buscar por número/carátula. ORDEN IMPORTANTE: filtros (.or, .in, .is)
    // ANTES de .limit() o el chain pierde .or().
    let q1 = admin
      .from('expedientes')
      .select('id, numero, numero_sae, caratula, estado_interno, prioridad, clientes:clientes(apellido, nombre)')
      .is('deleted_at', null)

    if (partes.length >= 2) {
      // Multi-parte: carátula debe contener TODAS las partes (AND).
      for (const p of partes) {
        const t = `%${p.replace(/[%_\\]/g, '')}%`
        q1 = q1.ilike('caratula', t)
      }
    } else {
      // Single: número o carátula o numero_sae.
      q1 = q1.or(`numero.ilike.${term},numero_sae.ilike.${term},caratula.ilike.${term}`)
    }

    if (allowedIds) q1 = q1.in('id', allowedIds)
    const { data: direct } = await q1.limit(limit)

    let results = (direct ?? []) as any[]

    // Suplementar con búsqueda por cliente si faltan (solo en consultas
    // single-parte; para multi-parte el match por carátula ya es bueno).
    if (results.length < limit && partes.length < 2) {
      const { data: clientes } = await admin
        .from('clientes')
        .select('id')
        .or(`apellido.ilike.${term},nombre.ilike.${term}`)
        .limit(5)
      if (clientes && clientes.length > 0) {
        const ids = (clientes as any[]).map(c => c.id)
        let q2 = admin
          .from('expedientes')
          .select('id, numero, caratula, estado_interno, prioridad, clientes:clientes(apellido, nombre)')
          .in('cliente_id', ids)
          .is('deleted_at', null)
        if (allowedIds) q2 = q2.in('id', allowedIds)
        const { data: byCli } = await q2.limit(limit - results.length)
        const seenIds = new Set(results.map(r => r.id))
        for (const e of (byCli ?? []) as any[]) {
          if (!seenIds.has(e.id)) results.push(e)
        }
      }
    }

    return {
      result: {
        count: results.length,
        items: results.map(e => ({
          id: e.id,
          numero: e.numero,
          caratula: e.caratula,
          cliente: clienteLabel(e.clientes),
          estado: e.estado_interno,
          prioridad: e.prioridad,
        })),
      },
    }
  },

  get_expediente: async (admin, user, args) => {
    const id = String(args.expediente_id ?? '').trim()
    if (!id) return { error: 'expediente_id requerido' }

    if (!(await canAccessExpediente(admin, user, id))) {
      return { error: 'No tenés permiso para ver este expediente' }
    }

    const { data: exp, error } = await admin
      .from('expedientes')
      .select(`
        id, numero, numero_sae, caratula, estado_interno, prioridad, fecha_alta, observaciones, updated_at,
        clientes:clientes(id, apellido, nombre),
        tipos_tramite:tipos_tramite(nombre),
        miembros:expediente_miembros(rol, perfil:profiles(nombre, apellido, rol))
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error || !exp) return { error: 'Expediente no encontrado' }
    const e = exp as any

    const today = new Date().toISOString().split('T')[0]
    const { data: tareasPend } = await admin
      .from('tareas')
      .select('id, titulo, fecha_vencimiento, prioridad, estado, asignado:profiles!tareas_asignado_a_fkey(nombre, apellido)')
      .eq('expediente_id', id)
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(10)

    const { data: proxAud } = await admin
      .from('audiencias')
      .select('id, fecha, hora, tipo, organismo')
      .eq('expediente_id', id)
      .gte('fecha', today)
      .neq('estado', 'CANCELADA')
      .order('fecha')
      .limit(5)

    return {
      result: {
        id: e.id,
        numero: e.numero,
        numero_sae: e.numero_sae,
        caratula: e.caratula,
        cliente: clienteLabel(e.clientes),
        tipo_tramite: e.tipos_tramite?.nombre ?? null,
        estado: e.estado_interno,
        prioridad: e.prioridad,
        fecha_alta: e.fecha_alta,
        observaciones: e.observaciones,
        actualizado: e.updated_at,
        miembros: (e.miembros ?? []).map((m: any) => ({
          rol: m.rol,
          nombre: m.perfil ? `${m.perfil.nombre} ${m.perfil.apellido}` : '?',
        })),
        tareas_pendientes: (tareasPend ?? []).map((t: any) => ({
          id: t.id,
          titulo: t.titulo,
          vencimiento: t.fecha_vencimiento,
          prioridad: t.prioridad,
          estado: t.estado,
          asignado: t.asignado ? `${t.asignado.nombre} ${t.asignado.apellido}` : null,
        })),
        proximas_audiencias: (proxAud ?? []).map((a: any) => ({
          id: a.id, fecha: a.fecha, hora: a.hora, tipo: a.tipo, organismo: a.organismo,
        })),
      },
    }
  },

  get_ultima_actuacion: async (admin, user, args) => {
    const id = String(args.expediente_id ?? '').trim()
    if (!id) return { error: 'expediente_id requerido' }

    if (!(await canAccessExpediente(admin, user, id))) {
      return { error: 'No tenés permiso' }
    }

    // Consultamos 3 fuentes en paralelo. La principal son sae_movements
    // (actuaciones reales del juzgado vía SAE). Las otras dos son:
    // - sae_notificaciones: cédulas/notif del casillero digital
    // - expediente_seguimientos: notas internas del estudio
    const [movRes, notifRes, segRes] = await Promise.all([
      admin.from('sae_movements')
        .select('id, fecha, titulo, cuerpo, tipo_movimiento, ai_summary, tiene_documentos, is_key, is_audiencia')
        .eq('expediente_id', id)
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('sae_notificaciones')
        .select('id, fecha_emision, created_at, tipo, titulo, ia_resumen, prioridad')
        .eq('expediente_id', id)
        .order('fecha_emision', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('expediente_seguimientos')
        .select('id, created_at, canal, observacion, autor:profiles(nombre, apellido)')
        .eq('expediente_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const mov = movRes.data as any
    const notif = notifRes.data as any
    const seg = segRes.data as any

    type Cand = { ts: string; payload: Record<string, unknown> }
    const candidates: Cand[] = []

    if (mov) {
      candidates.push({
        ts: mov.fecha ?? '',
        payload: {
          fuente: 'sae_movement',
          fecha: mov.fecha,
          titulo: mov.titulo,
          cuerpo: mov.cuerpo ? String(mov.cuerpo).slice(0, 500) : null,
          tipo_movimiento: mov.tipo_movimiento,
          resumen_ia: mov.ai_summary,
          tiene_documentos: mov.tiene_documentos,
          es_clave: mov.is_key,
          es_audiencia: mov.is_audiencia,
          actuacion_id: mov.id,
        },
      })
    }
    if (notif) {
      candidates.push({
        ts: notif.fecha_emision ?? notif.created_at,
        payload: {
          fuente: 'sae_notificacion',
          fecha: notif.fecha_emision ?? notif.created_at,
          tipo: notif.tipo,
          titulo: notif.titulo,
          resumen: notif.ia_resumen,
          prioridad: notif.prioridad,
          notif_id: notif.id,
        },
      })
    }
    if (seg) {
      candidates.push({
        ts: seg.created_at,
        payload: {
          fuente: 'seguimiento_interno',
          fecha: seg.created_at,
          canal: seg.canal,
          observacion: seg.observacion,
          autor: seg.autor ? `${seg.autor.nombre} ${seg.autor.apellido}` : null,
          seguimiento_id: seg.id,
        },
      })
    }

    if (candidates.length === 0) return { result: { found: false, expediente_id: id } }
    candidates.sort((a, b) => b.ts.localeCompare(a.ts))
    return {
      result: {
        found: true,
        expediente_id: id,
        link: `/expedientes/${id}`,
        ...candidates[0].payload,
      },
    }
  },

  list_actuaciones_sae: async (admin, user, args) => {
    const id = String(args.expediente_id ?? '').trim()
    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 50)
    if (!id) return { error: 'expediente_id requerido' }

    if (!(await canAccessExpediente(admin, user, id))) {
      return { error: 'No tenés permiso' }
    }

    let q = admin
      .from('sae_movements')
      .select('id, fecha, titulo, cuerpo, tipo_movimiento, ai_summary, tiene_documentos, is_key, is_audiencia')
      .eq('expediente_id', id)

    if (args.solo_claves) q = q.eq('is_key', true)

    const { data } = await q
      .order('fecha', { ascending: false, nullsFirst: false })
      .order('synced_at', { ascending: false })
      .limit(limit)

    return {
      result: {
        count: (data ?? []).length,
        expediente_id: id,
        link: `/expedientes/${id}`,
        items: (data ?? []).map((m: any) => ({
          id: m.id,
          fecha: m.fecha,
          titulo: m.titulo,
          cuerpo: m.cuerpo ? String(m.cuerpo).slice(0, 300) : null,
          tipo: m.tipo_movimiento,
          resumen_ia: m.ai_summary,
          tiene_documentos: m.tiene_documentos,
          es_clave: m.is_key,
          es_audiencia: m.is_audiencia,
        })),
      },
    }
  },

  list_tareas: async (admin, user, args) => {
    const today = new Date().toISOString().split('T')[0]
    const limit = Math.min(Math.max(Number(args.limit ?? 15), 1), 50)

    const allowedIds = await getAllowedExpedienteIds(admin, user)
    if (allowedIds && allowedIds.length === 0) {
      return { result: { count: 0, items: [] } }
    }

    let q = admin
      .from('tareas')
      .select('id, titulo, fecha_vencimiento, prioridad, estado, expediente_id, expediente:expedientes!tareas_expediente_id_fkey(numero, caratula, clientes:clientes(apellido, nombre)), asignado:profiles!tareas_asignado_a_fkey(nombre, apellido)')
      .neq('estado', 'CANCELADA')

    if (args.solo_vencidas) {
      q = q.lt('fecha_vencimiento', today).in('estado', ['PENDIENTE', 'EN_PROGRESO'])
    } else {
      q = q.in('estado', ['PENDIENTE', 'EN_PROGRESO'])
    }
    if (args.solo_mis_tareas) q = q.eq('asignado_a', user.user_id)
    if (args.expediente_id) q = q.eq('expediente_id', args.expediente_id)
    if (args.fecha_hasta) q = q.lte('fecha_vencimiento', args.fecha_hasta)
    if (args.prioridad) q = q.eq('prioridad', args.prioridad)
    if (allowedIds) q = q.in('expediente_id', allowedIds)

    const { data } = await q
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(limit)

    return {
      result: {
        count: (data ?? []).length,
        items: (data ?? []).map((t: any) => ({
          id: t.id,
          titulo: t.titulo,
          vencimiento: t.fecha_vencimiento,
          prioridad: t.prioridad,
          estado: t.estado,
          expediente: expedienteLabel(t.expediente),
          asignado: t.asignado ? `${t.asignado.nombre} ${t.asignado.apellido}` : null,
        })),
      },
    }
  },

  list_audiencias: async (admin, user, args) => {
    const today = new Date().toISOString().split('T')[0]
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
    const desde = args.desde || today
    const hasta = args.hasta || in14
    const limit = Math.min(Math.max(Number(args.limit ?? 15), 1), 50)

    const allowedIds = await getAllowedExpedienteIds(admin, user)
    if (allowedIds && allowedIds.length === 0) {
      return { result: { count: 0, rango: { desde, hasta }, items: [] } }
    }

    let q = admin
      .from('audiencias')
      .select('id, fecha, hora, tipo, organismo, observaciones, expediente_id, expediente:expedientes!audiencias_expediente_id_fkey(numero, caratula, clientes:clientes(apellido, nombre))')
      .neq('estado', 'CANCELADA')
      .gte('fecha', desde)
      .lte('fecha', hasta)

    if (args.expediente_id) q = q.eq('expediente_id', args.expediente_id)
    if (allowedIds) q = q.in('expediente_id', allowedIds)
    const { data } = await q.order('fecha').order('hora').limit(limit)

    return {
      result: {
        count: (data ?? []).length,
        rango: { desde, hasta },
        items: (data ?? []).map((a: any) => ({
          id: a.id, fecha: a.fecha, hora: a.hora, tipo: a.tipo, organismo: a.organismo,
          observaciones: a.observaciones,
          expediente: expedienteLabel(a.expediente),
        })),
      },
    }
  },

  list_notif_sae: async (admin, user, args) => {
    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30)
    const nowIso = new Date().toISOString()

    // Filtros antes de .order/.limit
    let q = admin
      .from('sae_notificaciones')
      .select('id, fecha_emision, tipo, titulo, ia_resumen, prioridad, leida, numero_expediente, raw_payload, expediente:expedientes(caratula, clientes:clientes(apellido, nombre))')
      .eq('profile_id', user.user_id)
      .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)

    if (args.solo_no_leidas !== false) q = q.eq('leida', false)
    if (args.solo_urgentes) q = q.eq('prioridad', 'urgente')
    if (args.fuero) q = q.eq('raw_payload->>fuero', args.fuero)

    const { data } = await q
      .order('fecha_emision', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    return {
      result: {
        count: (data ?? []).length,
        items: (data ?? []).map((n: any) => ({
          id: n.id,
          fecha: n.fecha_emision,
          tipo: n.tipo,
          titulo: n.titulo,
          resumen: n.ia_resumen,
          prioridad: n.prioridad,
          leida: n.leida,
          numero_expediente: n.numero_expediente,
          expediente_vinculado: n.expediente ? expedienteLabel(n.expediente) : null,
          fuero: n.raw_payload?.fuero,
        })),
      },
    }
  },

  // ─── Write tools — resuelven refs y devuelven payload pendiente ────────

  crear_tarea: async (admin, user, args) => {
    const titulo = String(args.titulo ?? '').trim()
    if (!titulo) return { error: 'titulo requerido' }
    const expRef = String(args.expediente_ref ?? '').trim()
    if (!expRef) return { error: 'expediente_ref requerido' }

    const exp = await resolveExpediente(admin, expRef, user)
    if ('error' in exp) return { error: exp.error }

    let asignado: { id: string; label: string } | null = null
    if (args.asignado_ref) {
      const r = await resolveProfile(admin, String(args.asignado_ref))
      if ('error' in r) return { error: r.error }
      asignado = r
    }

    const prioridad = args.prioridad ?? 'MEDIA'
    const fecha = args.fecha_vencimiento || null

    return {
      pending_action: {
        type: 'crear_tarea',
        label: 'Crear tarea',
        description: `Crear "${titulo}" en ${exp.label}${asignado ? ` para ${asignado.label}` : ''}${fecha ? ` con vencimiento ${fecha}` : ''} (prioridad ${prioridad}).`,
        resolved_args: {
          expediente_id: exp.id,
          expediente_label: exp.label,
          titulo,
          descripcion: args.descripcion ?? null,
          fecha_vencimiento: fecha,
          asignado_a: asignado?.id ?? null,
          asignado_label: asignado?.label ?? null,
          prioridad,
        },
      },
    }
  },

  completar_tarea: async (admin, user, args) => {
    const ref = String(args.tarea_ref ?? '').trim()
    if (!ref) return { error: 'tarea_ref requerido' }

    // Resolver: id directo o por titulo
    let tareaRow: any = null
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
      const { data } = await admin
        .from('tareas')
        .select('id, titulo, estado, expediente_id, expediente:expedientes(caratula, numero, clientes:clientes(apellido, nombre))')
        .eq('id', ref)
        .maybeSingle()
      tareaRow = data
    } else {
      const allowedIds = await getAllowedExpedienteIds(admin, user)
      if (allowedIds && allowedIds.length === 0) {
        return { error: `No tenés tareas visibles para completar` }
      }
      let q = admin
        .from('tareas')
        .select('id, titulo, estado, expediente_id, expediente:expedientes(caratula, numero, clientes:clientes(apellido, nombre))')
        .ilike('titulo', `%${ref.replace(/[%_\\]/g, '')}%`)
        .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      if (allowedIds) q = q.in('expediente_id', allowedIds)
      const { data } = await q.limit(5)
      const list = (data ?? []) as any[]
      if (list.length === 0) return { error: `No encuentro una tarea pendiente que matchee "${ref}"` }
      if (list.length > 1) {
        const names = list.map(t => `${t.titulo} (${expedienteLabel(t.expediente)})`).join('; ')
        return { error: `Hay varias tareas pendientes: ${names}. Pedí precisión.` }
      }
      tareaRow = list[0]
    }

    if (!tareaRow) return { error: 'Tarea no encontrada' }
    if (tareaRow.estado === 'COMPLETADA') return { error: 'La tarea ya está completada' }

    return {
      pending_action: {
        type: 'completar_tarea',
        label: 'Completar tarea',
        description: `Marcar como completada "${tareaRow.titulo}" en ${expedienteLabel(tareaRow.expediente)}.`,
        resolved_args: {
          tarea_id: tareaRow.id,
          tarea_titulo: tareaRow.titulo,
          expediente_label: expedienteLabel(tareaRow.expediente),
        },
      },
    }
  },

  // ─── Handlers de tools jurídicas (proxy a legal-lookup) ────────────
  buscar_jurisprudencia: async (_admin, user, args) => {
    return await callLegalLookup(user.user_id, 'saij', 'searchJurisprudencia', {
      query: args.query, jurisdiccion: args.jurisdiccion, tribunal: args.tribunal,
      materia: args.materia, fecha_desde: args.fecha_desde, fecha_hasta: args.fecha_hasta,
      limit: args.limit ?? 5,
    })
  },

  buscar_normativa: async (_admin, user, args) => {
    return await callLegalLookup(user.user_id, 'saij', 'searchLegislacion', {
      query: args.query, jurisdiccion: args.jurisdiccion, tipo: args.tipo,
      estado_vigencia: args.estado_vigencia, materia: args.materia,
      limit: args.limit ?? 5,
    })
  },

  resolver_cita_legal: async (_admin, user, args) => {
    return await callLegalLookup(user.user_id, 'saij', 'resolveCitation', { text: args.text })
  },
}

// Helper: invoca legal-lookup con service_role y propaga el user_id real
// para que esa función pueda rate-limit y loguear correctamente.
async function callLegalLookup(
  userId: string,
  source: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const res = await fetch(`${supabaseUrl}/functions/v1/legal-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ source, tool, args, on_behalf_of_user_id: userId }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { error: data?.error ?? `legal-lookup ${res.status}` }
    }
    return { result: data.result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'legal-lookup failed' }
  }
}
