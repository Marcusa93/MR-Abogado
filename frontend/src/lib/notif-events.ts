// Mantener en sync con supabase/functions/_shared/notif-events.ts

export interface NotifEvent {
  key: string
  label: string
  desc: string
  pushDefault: boolean
  emailDefault: boolean
}

export const NOTIF_EVENTS: NotifEvent[] = [
  {
    key: 'MENCION',
    label: '@ Mención',
    desc: 'Cuando alguien te menciona con @ en una nota, tarea o comentario.',
    pushDefault: true,
    emailDefault: false,
  },
  {
    key: 'TAREA_ASIGNADA',
    label: 'Tarea asignada',
    desc: 'Cuando alguien te asigna una tarea nueva.',
    pushDefault: true,
    emailDefault: true,
  },
  {
    key: 'VENCIMIENTO_TAREA',
    label: 'Tarea por vencer',
    desc: 'Cuando una de tus tareas vence hoy o mañana.',
    pushDefault: true,
    emailDefault: false,
  },
  {
    key: 'AUDIENCIA_PROXIMA',
    label: 'Audiencia próxima',
    desc: 'Audiencia tuya en las próximas 24h.',
    pushDefault: true,
    emailDefault: true,
  },
  {
    key: 'SEGUIMIENTO_PENDIENTE',
    label: 'Seguimiento pendiente',
    desc: 'Movimientos en expedientes tuyos que requieren acción.',
    pushDefault: true,
    emailDefault: false,
  },
  {
    key: 'ESTADO_CAMBIO',
    label: 'Cambio de estado',
    desc: 'Cambio de estado en un expediente que seguís.',
    pushDefault: false,
    emailDefault: false,
  },
  {
    key: 'DOCUMENTO_FALTANTE',
    label: 'Documento faltante',
    desc: 'Falta documentación requerida en un expediente.',
    pushDefault: false,
    emailDefault: false,
  },
  {
    key: 'SISTEMA',
    label: 'Avisos del sistema',
    desc: 'Mensajes importantes del sistema (mantenimiento, novedades).',
    pushDefault: true,
    emailDefault: false,
  },
]

export type NotifPrefs = Record<string, { push: boolean; email: boolean }>

export function resolvedPref(prefs: NotifPrefs | null | undefined, key: string): { push: boolean; email: boolean } {
  const ev = NOTIF_EVENTS.find(e => e.key === key)
  if (!ev) return { push: false, email: false }
  const userPref = prefs?.[key]
  return {
    push: userPref?.push ?? ev.pushDefault,
    email: userPref?.email ?? ev.emailDefault,
  }
}
