// ---------------------------------------------------------------------------
// CSV Export utility
// ---------------------------------------------------------------------------

import { createClient } from '@/lib/supabase/client'

interface ExportableExpediente {
  numero: string
  caratula: string
  estado_interno: string
  prioridad: string
  fecha_inicio: string
  cliente_nombre: string
  cliente_apellido: string
  cliente_dni: string
  tipo_tramite: string
  responsable: string
  observaciones: string
}

/**
 * Fetches all expedientes and exports them as a CSV file download.
 */
export async function exportExpedientesToCSV(): Promise<void> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('expedientes')
    .select(`
      numero,
      caratula,
      estado_interno,
      prioridad,
      fecha_alta,
      observaciones,
      clientes (nombre, apellido, dni, telefono, email),
      tipos_tramite (nombre),
      miembros:expediente_miembros(rol, perfil:profiles!expediente_miembros_profile_id_fkey(nombre, apellido))
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) throw new Error('No hay expedientes para exportar')

  const rows: ExportableExpediente[] = data.map((e) => {
    const cliente = e.clientes as Record<string, string> | null
    const tipo = e.tipos_tramite as Record<string, string> | null
    // Find first member with rol='abogado' for the responsable column
    const miembros = (e.miembros as any[]) ?? []
    const abogadoMiembro = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
    return {
      numero: (e as any).numero ?? '',
      caratula: e.caratula ?? '',
      estado_interno: e.estado_interno,
      prioridad: e.prioridad,
      fecha_inicio: (e as any).fecha_alta ?? '',
      cliente_nombre: cliente?.nombre ?? '',
      cliente_apellido: cliente?.apellido ?? '',
      cliente_dni: cliente?.dni ?? '',
      tipo_tramite: tipo?.nombre ?? '',
      responsable: abogadoMiembro ? `${abogadoMiembro.apellido} ${abogadoMiembro.nombre}` : '',
      observaciones: e.observaciones ?? '',
    }
  })

  // Build CSV
  const headers = [
    'Número Expediente',
    'Carátula',
    'Estado',
    'Prioridad',
    'Fecha Inicio',
    'Cliente Apellido',
    'Cliente Nombre',
    'Cliente DNI',
    'Tipo Trámite',
    'Responsable',
    'Observaciones',
  ]

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.numero,
        escapeCSV(row.caratula),
        row.estado_interno,
        row.prioridad,
        row.fecha_inicio,
        escapeCSV(row.cliente_apellido),
        escapeCSV(row.cliente_nombre),
        row.cliente_dni,
        escapeCSV(row.tipo_tramite),
        escapeCSV(row.responsable),
        escapeCSV(row.observaciones),
      ].join(',')
    ),
  ].join('\n')

  // Download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `expedientes_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
