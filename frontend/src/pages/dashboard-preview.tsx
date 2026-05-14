import { DashboardView, type ProductivityMetricsData } from '@/pages/dashboard'
import type { DashboardMetrics } from '@/hooks/use-dashboard-metrics'
import type { TareaWithRelations } from '@/hooks/use-tareas'
import type { PlazoProximo, ActuacionReciente } from '@/hooks/use-sae-dashboard'
import type { AlertaWithExpediente } from '@/hooks/use-alertas'
import type { ExpedienteWithRelations } from '@/hooks/use-expedientes'
import { getExpCategory, type PipelineCategory } from '@/hooks/use-panel-expedientes'

function isoDayOffset(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function isoTimestampOffset(hours: number) {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

const metrics: DashboardMetrics = {
  total_expedientes: 42,
  en_tramite: 27,
  turnos_semana: 6,
  tareas_vencidas: 3,
  alertas_activas: 5,
  tasa_exito: 87,
  honorarios_pendientes: 2,
  total_expedientes_delta: 8,
  en_tramite_delta: 4,
  turnos_semana_delta: -6,
  tareas_vencidas_delta: 12,
  alertas_activas_delta: -3,
  expedientes_recientes: [],
  turnos_proximos: [
    {
      id: 'turno-1',
      expediente_id: 'exp-2',
      numero: 'EXP-2026-018',
      cliente_nombre: 'Lucía',
      cliente_apellido: 'Suárez',
      tipo_turno: 'AUDIENCIA',
      fecha: isoDayOffset(1),
      hora: '09:30:00',
      estado: 'CONFIRMADO',
    },
    {
      id: 'turno-2',
      expediente_id: 'exp-3',
      numero: 'EXP-2026-024',
      cliente_nombre: 'Federico',
      cliente_apellido: 'Paz',
      tipo_turno: 'INICIO_TRAMITE',
      fecha: isoDayOffset(3),
      hora: '11:00:00',
      estado: 'PENDIENTE',
    },
    {
      id: 'turno-3',
      expediente_id: 'exp-4',
      numero: 'EXP-2026-027',
      cliente_nombre: 'Camila',
      cliente_apellido: 'Riera',
      tipo_turno: 'PERICIAL',
      fecha: isoDayOffset(5),
      hora: '08:45:00',
      estado: 'CONFIRMADO',
    },
  ],
}

const prodMetrics: ProductivityMetricsData = {
  tareasProximas48h: 4,
  tiempoPromedioResolucion: 19,
  expedientesEstancados: 2,
}

const expedientes = [
  {
    id: 'exp-1',
    numero: 'EXP-2026-011',
    caratula: 'Molina c/ Plataforma Digital SA',
    estado_interno: 'NUEVA_CONSULTA',
    prioridad: 'ALTA',
    clientes: { id: 'cli-1', nombre: 'Valentina', apellido: 'Molina', telefono: '3815551001' },
    tipos_tramite: { id: 'tipo-1', nombre: 'Daños digitales' },
    miembros: [{ rol: 'abogado', perfil: { nombre: 'Marco', apellido: 'Rossi' } }],
    audiencias: [],
    tareas: [{ id: 't-11', estado: 'PENDIENTE' }],
  },
  {
    id: 'exp-2',
    numero: 'EXP-2026-018',
    caratula: 'Suárez c/ Red Social Global',
    estado_interno: 'PARA_INICIAR',
    prioridad: 'URGENTE',
    clientes: { id: 'cli-2', nombre: 'Lucía', apellido: 'Suárez', telefono: '3815551002' },
    tipos_tramite: { id: 'tipo-2', nombre: 'Reclamo de reputación' },
    miembros: [{ rol: 'abogado', perfil: { nombre: 'Nicolás', apellido: 'Alba' } }],
    audiencias: [{ id: 'a-1', estado: 'CONFIRMADA', fecha: isoDayOffset(1) }],
    tareas: [{ id: 't-21', estado: 'EN_PROGRESO' }, { id: 't-22', estado: 'PENDIENTE' }],
  },
  {
    id: 'exp-3',
    numero: 'EXP-2026-024',
    caratula: 'Paz c/ SaaS Metrics Inc.',
    estado_interno: 'INICIADO',
    prioridad: 'MEDIA',
    clientes: { id: 'cli-3', nombre: 'Federico', apellido: 'Paz', telefono: '3815551003' },
    tipos_tramite: { id: 'tipo-3', nombre: 'Contrato tecnológico' },
    miembros: [{ rol: 'abogado', perfil: { nombre: 'Marco', apellido: 'Rossi' } }],
    audiencias: [{ id: 'a-2', estado: 'PENDIENTE', fecha: isoDayOffset(3) }],
    tareas: [{ id: 't-31', estado: 'PENDIENTE' }],
  },
  {
    id: 'exp-4',
    numero: 'EXP-2026-027',
    caratula: 'Riera c/ Proveedor Cloud',
    estado_interno: 'FINALIZADO',
    prioridad: 'BAJA',
    clientes: { id: 'cli-4', nombre: 'Camila', apellido: 'Riera', telefono: '3815551004' },
    tipos_tramite: { id: 'tipo-4', nombre: 'Incumplimiento de servicio' },
    miembros: [{ rol: 'abogado', perfil: { nombre: 'Marco', apellido: 'Rossi' } }],
    audiencias: [],
    tareas: [],
  },
  {
    id: 'exp-5',
    numero: 'EXP-2026-030',
    caratula: 'Torres c/ Marketplace Uno',
    estado_interno: 'NO_VIABLE_RECHAZADO',
    prioridad: 'MEDIA',
    clientes: { id: 'cli-5', nombre: 'Ignacio', apellido: 'Torres', telefono: null },
    tipos_tramite: { id: 'tipo-5', nombre: 'Baja de contenido' },
    miembros: [],
    audiencias: [],
    tareas: [],
  },
] as any as ExpedienteWithRelations[]

const previewTasks = [
  {
    id: 'task-1',
    titulo: 'Revisar borrador de carta documento',
    estado: 'PENDIENTE',
    prioridad: 'URGENTE',
    fecha_vencimiento: isoDayOffset(0),
    expediente: {
      id: 'exp-2',
      numero: 'EXP-2026-018',
      caratula: 'Suárez c/ Red Social Global',
      clientes: { id: 'cli-2', nombre: 'Lucía', apellido: 'Suárez', dni: null, cuil: null },
    },
  },
  {
    id: 'task-2',
    titulo: 'Llamar a cliente por prueba electrónica',
    estado: 'EN_PROGRESO',
    prioridad: 'ALTA',
    fecha_vencimiento: isoDayOffset(1),
    expediente: {
      id: 'exp-3',
      numero: 'EXP-2026-024',
      caratula: 'Paz c/ SaaS Metrics Inc.',
      clientes: { id: 'cli-3', nombre: 'Federico', apellido: 'Paz', dni: null, cuil: null },
    },
  },
  {
    id: 'task-3',
    titulo: 'Subir constancia y etiquetar evidencia',
    estado: 'PENDIENTE',
    prioridad: 'MEDIA',
    fecha_vencimiento: isoDayOffset(4),
    expediente: {
      id: 'exp-1',
      numero: 'EXP-2026-011',
      caratula: 'Molina c/ Plataforma Digital SA',
      clientes: { id: 'cli-1', nombre: 'Valentina', apellido: 'Molina', dni: null, cuil: null },
    },
  },
] as any as TareaWithRelations[]

const previewPlazos: PlazoProximo[] = [
  {
    movement_id: 'mov-1',
    expediente_id: 'exp-3',
    expediente_numero: 'EXP-2026-024',
    expediente_caratula: 'Paz c/ SaaS Metrics Inc.',
    numero_sae: 'SAE-8821',
    movimiento_titulo: 'Traslado de demanda',
    movimiento_fecha: isoDayOffset(-1),
    plazo: {
      dias: 2,
      habiles: true,
      vence_aprox: isoDayOffset(1),
      descripcion: 'Contestar traslado con respaldo documental y evidencia capturada.',
    },
    diasRestantes: 1,
    prioridad: 'URGENTE',
  },
  {
    movement_id: 'mov-2',
    expediente_id: 'exp-2',
    expediente_numero: 'EXP-2026-018',
    expediente_caratula: 'Suárez c/ Red Social Global',
    numero_sae: 'SAE-8840',
    movimiento_titulo: 'Intimación',
    movimiento_fecha: isoDayOffset(-2),
    plazo: {
      dias: 5,
      habiles: false,
      vence_aprox: isoDayOffset(3),
      descripcion: 'Responder intimación y dejar preparada la pieza de reserva probatoria.',
    },
    diasRestantes: 3,
    prioridad: 'ALTA',
  },
]

const previewActuaciones: ActuacionReciente[] = [
  {
    id: 'act-1',
    expediente_id: 'exp-2',
    expediente_numero: 'EXP-2026-018',
    expediente_caratula: 'Suárez c/ Red Social Global',
    titulo: 'Decreto que habilita ampliación de prueba',
    tipo_movimiento: 'decreto',
    fecha: isoDayOffset(-1),
    created_at: isoTimestampOffset(-6),
    ai_summary: 'Conviene preparar el escrito con anexos digitales antes de la audiencia del día siguiente.',
    ai_suggested_action: null,
    numero_sae: 'SAE-8840',
  },
  {
    id: 'act-2',
    expediente_id: 'exp-3',
    expediente_numero: 'EXP-2026-024',
    expediente_caratula: 'Paz c/ SaaS Metrics Inc.',
    titulo: 'Audiencia fijada por mesa digital',
    tipo_movimiento: 'audiencia',
    fecha: isoDayOffset(3),
    created_at: isoTimestampOffset(-18),
    ai_summary: 'La citación exige confirmar asistencia y adjuntar soporte documental técnico.',
    ai_suggested_action: null,
    numero_sae: 'SAE-8821',
  },
]

const alertas = [
  {
    id: 'alert-1',
    titulo: 'Audiencia mañana',
    mensaje: 'Preparar escrito y revisar carpeta probatoria.',
    tipo: 'TURNO_PROXIMO',
    created_at: isoTimestampOffset(-3),
    expediente: { id: 'exp-2', numero: 'EXP-2026-018', caratula: 'Suárez c/ Red Social Global' },
  },
  {
    id: 'alert-2',
    titulo: 'Seguimiento pendiente',
    mensaje: 'El cliente pidió actualización de estrategia.',
    tipo: 'SEGUIMIENTO_PENDIENTE',
    created_at: isoTimestampOffset(-11),
    expediente: { id: 'exp-1', numero: 'EXP-2026-011', caratula: 'Molina c/ Plataforma Digital SA' },
  },
] as any as AlertaWithExpediente[]

const pipelineCounts = expedientes.reduce((acc, exp) => {
  const category = getExpCategory(exp)
  acc[category] += 1
  acc.total += 1
  return acc
}, {
  analisis: 0,
  iniciar: 0,
  iniciados: 0,
  favorable: 0,
  desfavorable: 0,
  total: 0,
} as Record<PipelineCategory, number> & { total: number })

export default function DashboardPreviewPage() {
  return (
    <DashboardView
      greeting="Buen día"
      userName="Marco"
      subtitle="Tenés 3 tareas pendientes y 6 turnos esta semana"
      todayLabel={new Date().toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}
      metricsLoading={false}
      metrics={metrics}
      pipelineCounts={pipelineCounts}
      panelLoading={false}
      panelError={false}
      expedientes={expedientes}
      prodMetrics={prodMetrics}
      alertas={alertas}
      previewTasks={previewTasks}
      previewPlazos={previewPlazos}
      previewActuaciones={previewActuaciones}
    />
  )
}
