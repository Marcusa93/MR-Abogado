// ---------------------------------------------------------------------------
// Marco Rossi Estudio Jurídico — Enums del sistema
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Estado Interno del Expediente (workflow judicial)
// ---------------------------------------------------------------------------
export const EstadoInterno = {
  NUEVA_CONSULTA: 'NUEVA_CONSULTA',
  PARA_INICIAR: 'PARA_INICIAR',
  INICIADO: 'INICIADO',
  PRUEBA: 'PRUEBA',
  ALEGATOS: 'ALEGATOS',
  SENTENCIA: 'SENTENCIA',
  APELACION: 'APELACION',
  CORTE: 'CORTE',
  FINALIZADO: 'FINALIZADO',
  NO_VIABLE_RECHAZADO: 'NO_VIABLE_RECHAZADO',
  PAUSADO: 'PAUSADO',
} as const

export type EstadoInterno = (typeof EstadoInterno)[keyof typeof EstadoInterno]

export const ESTADO_INTERNO_VALUES = Object.values(EstadoInterno)

export const ESTADO_INTERNO_LABELS: Record<EstadoInterno, string> = {
  NUEVA_CONSULTA: 'Nueva consulta',
  PARA_INICIAR: 'Para iniciar',
  INICIADO: 'Iniciado',
  PRUEBA: 'Prueba',
  ALEGATOS: 'Alegatos',
  SENTENCIA: 'Sentencia',
  APELACION: 'Apelación',
  CORTE: 'Corte',
  FINALIZADO: 'Finalizado',
  NO_VIABLE_RECHAZADO: 'No viable / rechazado',
  PAUSADO: 'Pausado',
}

export const ESTADO_BADGE_COLORS: Record<EstadoInterno, string> = {
  NUEVA_CONSULTA: 'bg-slate-100 text-zinc-800 border-slate-200',
  PARA_INICIAR: 'bg-violet-100 text-violet-800 border-violet-200',
  INICIADO: 'bg-blue-100 text-blue-800 border-blue-200',
  PRUEBA: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  ALEGATOS: 'bg-amber-100 text-amber-800 border-amber-200',
  SENTENCIA: 'bg-orange-100 text-orange-800 border-orange-200',
  APELACION: 'bg-purple-100 text-purple-800 border-purple-200',
  CORTE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  FINALIZADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  NO_VIABLE_RECHAZADO: 'bg-rose-100 text-rose-800 border-rose-200',
  PAUSADO: 'bg-zinc-100 text-zinc-700 border-zinc-200',
}

export const ESTADOS_TERMINALES = [
  EstadoInterno.FINALIZADO,
  EstadoInterno.NO_VIABLE_RECHAZADO,
] as const

export const ESTADOS_EN_PROCESO = [
  EstadoInterno.INICIADO,
  EstadoInterno.PRUEBA,
  EstadoInterno.ALEGATOS,
  EstadoInterno.SENTENCIA,
  EstadoInterno.APELACION,
  EstadoInterno.CORTE,
] as const

export const ESTADOS_FAVORABLES = [
  EstadoInterno.FINALIZADO,
] as const

// The 5 pipeline states used by the Kanban board
export const ESTADOS_PIPELINE: EstadoInterno[] = [
  'PARA_INICIAR',
  'INICIADO',
  'PRUEBA',
  'SENTENCIA',
  'FINALIZADO',
]

export const VALID_ESTADO_TRANSITIONS: Record<EstadoInterno, EstadoInterno[]> = {
  NUEVA_CONSULTA: [...ESTADOS_PIPELINE, 'NO_VIABLE_RECHAZADO'],
  PARA_INICIAR: ESTADOS_PIPELINE.filter(s => s !== 'PARA_INICIAR' as EstadoInterno).concat(['NO_VIABLE_RECHAZADO']),
  INICIADO: ['PRUEBA', 'ALEGATOS', 'SENTENCIA', 'APELACION', 'CORTE', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  PRUEBA: ['ALEGATOS', 'SENTENCIA', 'APELACION', 'CORTE', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  ALEGATOS: ['SENTENCIA', 'APELACION', 'CORTE', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  SENTENCIA: ['APELACION', 'CORTE', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  APELACION: ['CORTE', 'SENTENCIA', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  CORTE: ['SENTENCIA', 'FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO'],
  FINALIZADO: [...ESTADOS_PIPELINE],
  NO_VIABLE_RECHAZADO: [...ESTADOS_PIPELINE],
  PAUSADO: [...ESTADOS_PIPELINE, 'NO_VIABLE_RECHAZADO'],
}

export function isEstadoTerminal(estado: string): boolean {
  return ESTADOS_TERMINALES.includes(estado as (typeof ESTADOS_TERMINALES)[number])
}

export function isEstadoEnProceso(estado: string): boolean {
  return ESTADOS_EN_PROCESO.includes(estado as (typeof ESTADOS_EN_PROCESO)[number])
}

// ---------------------------------------------------------------------------
// Fuero judicial
// ---------------------------------------------------------------------------
export const Fuero = {
  CIVIL: 'civil',
  LABORAL: 'laboral',
  PENAL: 'penal',
  FAMILIA: 'familia',
  ADMINISTRATIVO: 'administrativo',
  COMERCIAL: 'comercial',
  PREVISIONAL: 'previsional',
  OTRO: 'otro',
} as const

export type Fuero = (typeof Fuero)[keyof typeof Fuero]

export const FUERO_VALUES = Object.values(Fuero)

export const FUERO_LABELS: Record<Fuero, string> = {
  civil: 'Civil',
  laboral: 'Laboral',
  penal: 'Penal',
  familia: 'Familia',
  administrativo: 'Administrativo',
  comercial: 'Comercial',
  previsional: 'Previsional',
  otro: 'Otro',
}

// ---------------------------------------------------------------------------
// Tipo de organismo externo
// ---------------------------------------------------------------------------
export const TipoOrganismo = {
  JUZGADO: 'juzgado',
  CAMARA: 'camara',
  TRIBUNAL: 'tribunal',
  MINISTERIO: 'ministerio',
  ORGANISMO_ADMINISTRATIVO: 'organismo_administrativo',
  OTRO: 'otro',
} as const

export type TipoOrganismo = (typeof TipoOrganismo)[keyof typeof TipoOrganismo]

export const TIPO_ORGANISMO_VALUES = Object.values(TipoOrganismo)

export const TIPO_ORGANISMO_LABELS: Record<TipoOrganismo, string> = {
  juzgado: 'Juzgado',
  camara: 'Cámara',
  tribunal: 'Tribunal',
  ministerio: 'Ministerio',
  organismo_administrativo: 'Organismo Administrativo',
  otro: 'Otro',
}

// ---------------------------------------------------------------------------
// Prioridad
// ---------------------------------------------------------------------------
export const Prioridad = {
  BAJA: 'BAJA',
  MEDIA: 'MEDIA',
  ALTA: 'ALTA',
  URGENTE: 'URGENTE',
} as const

export type Prioridad = (typeof Prioridad)[keyof typeof Prioridad]

export const PRIORIDAD_VALUES = Object.values(Prioridad)

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
}

export const PRIORIDAD_COLORS: Record<Prioridad, string> = {
  BAJA: 'bg-slate-100 text-zinc-700 border-slate-200',
  MEDIA: 'bg-blue-100 text-blue-700 border-blue-200',
  ALTA: 'bg-orange-100 text-orange-700 border-orange-200',
  URGENTE: 'bg-red-100 text-red-700 border-red-200',
}

export const PRIORIDAD_DOT_COLORS: Record<Prioridad, string> = {
  BAJA: 'bg-slate-400',
  MEDIA: 'bg-blue-500',
  ALTA: 'bg-orange-500',
  URGENTE: 'bg-red-500',
}

// ---------------------------------------------------------------------------
// Rol de usuario
// ---------------------------------------------------------------------------
export const Rol = {
  ADMIN: 'ADMIN',
  ABOGADO: 'ABOGADO',
  COLABORADOR: 'COLABORADOR',
} as const

export type Rol = (typeof Rol)[keyof typeof Rol]

export const ROL_VALUES = Object.values(Rol)

export const ROL_LABELS: Record<Rol, string> = {
  ADMIN: 'Administrador',
  ABOGADO: 'Abogado/a',
  COLABORADOR: 'Colaborador/a',
}

// ---------------------------------------------------------------------------
// Estado de audiencia
// ---------------------------------------------------------------------------
export const EstadoAudiencia = {
  PENDIENTE: 'PENDIENTE',
  CONFIRMADA: 'CONFIRMADA',
  REALIZADA: 'REALIZADA',
  CANCELADA: 'CANCELADA',
  POSTERGADA: 'POSTERGADA',
} as const

export type EstadoAudiencia = (typeof EstadoAudiencia)[keyof typeof EstadoAudiencia]

export const ESTADO_AUDIENCIA_VALUES = Object.values(EstadoAudiencia)

export const ESTADO_AUDIENCIA_LABELS: Record<EstadoAudiencia, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
  POSTERGADA: 'Postergada',
}

export const ESTADO_AUDIENCIA_COLORS: Record<EstadoAudiencia, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CONFIRMADA: 'bg-blue-100 text-blue-800 border-blue-200',
  REALIZADA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELADA: 'bg-red-100 text-red-800 border-red-200',
  POSTERGADA: 'bg-purple-100 text-purple-800 border-purple-200',
}

// ---------------------------------------------------------------------------
// Estado de tarea
// ---------------------------------------------------------------------------
export const EstadoTarea = {
  PENDIENTE: 'PENDIENTE',
  EN_PROGRESO: 'EN_PROGRESO',
  COMPLETADA: 'COMPLETADA',
  CANCELADA: 'CANCELADA',
} as const

export type EstadoTarea = (typeof EstadoTarea)[keyof typeof EstadoTarea]

export const ESTADO_TAREA_VALUES = Object.values(EstadoTarea)

export const ESTADO_TAREA_LABELS: Record<EstadoTarea, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
}

export const ESTADO_TAREA_COLORS: Record<EstadoTarea, string> = {
  PENDIENTE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  EN_PROGRESO: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETADA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELADA: 'bg-slate-100 text-zinc-800 border-slate-200',
}

// ---------------------------------------------------------------------------
// Tipo de alerta
// ---------------------------------------------------------------------------
export const TipoAlerta = {
  SEGUIMIENTO_PENDIENTE: 'SEGUIMIENTO_PENDIENTE',
  AUDIENCIA_PROXIMA: 'AUDIENCIA_PROXIMA',
  TAREA_VENCIDA: 'TAREA_VENCIDA',
  SIN_RESPONSABLE: 'SIN_RESPONSABLE',
  DOCUMENTO_FALTANTE: 'DOCUMENTO_FALTANTE',
  ESTADO_CAMBIO: 'ESTADO_CAMBIO',
  SISTEMA: 'SISTEMA',
  MENCION: 'MENCION',
  CUSTOM: 'CUSTOM',
} as const

export type TipoAlerta = (typeof TipoAlerta)[keyof typeof TipoAlerta]

export const TIPO_ALERTA_VALUES = Object.values(TipoAlerta)

export const TIPO_ALERTA_LABELS: Record<TipoAlerta, string> = {
  SEGUIMIENTO_PENDIENTE: 'Seguimiento pendiente',
  AUDIENCIA_PROXIMA: 'Audiencia próxima',
  TAREA_VENCIDA: 'Tarea vencida',
  SIN_RESPONSABLE: 'Sin responsable',
  DOCUMENTO_FALTANTE: 'Documento faltante',
  ESTADO_CAMBIO: 'Cambio de estado',
  SISTEMA: 'Sistema',
  MENCION: 'Mención',
  CUSTOM: 'Personalizada',
}

export const TIPO_ALERTA_COLORS: Record<TipoAlerta, string> = {
  SEGUIMIENTO_PENDIENTE: 'bg-amber-100 text-amber-800 border-amber-200',
  AUDIENCIA_PROXIMA: 'bg-blue-100 text-blue-800 border-blue-200',
  TAREA_VENCIDA: 'bg-red-100 text-red-800 border-red-200',
  SIN_RESPONSABLE: 'bg-orange-100 text-orange-800 border-orange-200',
  DOCUMENTO_FALTANTE: 'bg-orange-100 text-orange-800 border-orange-200',
  ESTADO_CAMBIO: 'bg-violet-100 text-violet-800 border-violet-200',
  SISTEMA: 'bg-slate-100 text-zinc-800 border-slate-200',
  MENCION: 'bg-pink-100 text-pink-800 border-pink-200',
  CUSTOM: 'bg-slate-100 text-zinc-700 border-slate-200',
}

// ---------------------------------------------------------------------------
// Canal de seguimiento
// ---------------------------------------------------------------------------
export const CanalSeguimiento = {
  WEB: 'web',
  TELEFONO: 'telefono',
  PRESENCIAL: 'presencial',
  EMAIL: 'email',
} as const

export type CanalSeguimiento = (typeof CanalSeguimiento)[keyof typeof CanalSeguimiento]

export const CANAL_SEGUIMIENTO_VALUES = Object.values(CanalSeguimiento)

export const CANAL_SEGUIMIENTO_LABELS: Record<CanalSeguimiento, string> = {
  web: 'Web / Portal',
  telefono: 'Teléfono',
  presencial: 'Presencial',
  email: 'Email',
}

// ---------------------------------------------------------------------------
// Rol en expediente_miembros
// ---------------------------------------------------------------------------
export const RolMiembro = {
  ABOGADO: 'abogado',
  COLABORADOR: 'colaborador',
} as const

export type RolMiembro = (typeof RolMiembro)[keyof typeof RolMiembro]

export const ROL_MIEMBRO_VALUES = Object.values(RolMiembro)

export const ROL_MIEMBRO_LABELS: Record<RolMiembro, string> = {
  abogado: 'Abogado/a',
  colaborador: 'Colaborador/a',
}

// ---------------------------------------------------------------------------
// Acción de auditoría
// ---------------------------------------------------------------------------
export const AccionAudit = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const

export type AccionAudit = (typeof AccionAudit)[keyof typeof AccionAudit]

export const ACCION_AUDIT_LABELS: Record<AccionAudit, string> = {
  INSERT: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
}

// ---------------------------------------------------------------------------
// Estado civil
// ---------------------------------------------------------------------------
export const EstadoCivil = {
  SOLTERO: 'SOLTERO',
  CASADO: 'CASADO',
  DIVORCIADO: 'DIVORCIADO',
  VIUDO: 'VIUDO',
  UNION_CONVIVENCIAL: 'UNION_CONVIVENCIAL',
} as const

export type EstadoCivil = (typeof EstadoCivil)[keyof typeof EstadoCivil]

export const ESTADO_CIVIL_VALUES = Object.values(EstadoCivil)

export const ESTADO_CIVIL_LABELS: Record<EstadoCivil, string> = {
  SOLTERO: 'Soltero/a',
  CASADO: 'Casado/a',
  DIVORCIADO: 'Divorciado/a',
  VIUDO: 'Viudo/a',
  UNION_CONVIVENCIAL: 'Unión convivencial',
}

// ---------------------------------------------------------------------------
// Provincias argentinas
// ---------------------------------------------------------------------------
export const PROVINCIAS = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const

export type Provincia = (typeof PROVINCIAS)[number]
