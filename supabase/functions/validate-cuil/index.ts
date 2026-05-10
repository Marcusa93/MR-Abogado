// ---------------------------------------------------------------------------
// Supabase Edge Function: validate-cuil
// Validates a CUIL against AFIP's free public padron API and returns
// contributor data (name, tax status, address, activities).
// Deploy: supabase functions deploy validate-cuil --no-verify-jwt
// ---------------------------------------------------------------------------

import { corsHeaders } from '../_shared/cors.ts'

// Free AFIP public padron API (no auth needed)
const AFIP_API_URL = 'https://afip.tangofactura.com/Rest/GetContribuyenteFull'

interface AfipPersona {
  // The API returns these fields (among others)
  idPersona?: number
  tipoPersona?: string
  tipoClave?: string
  nombre?: string
  razonSocial?: string
  estadoClave?: string
  domicilioFiscal?: {
    direccion?: string
    localidad?: string
    codPostal?: string
    idProvincia?: number
    descripcionProvincia?: string
  }
  actividades?: Array<{
    descripcionActividad?: string
    idActividad?: number
    periodo?: number
  }>
  impuestos?: Array<{
    descripcionImpuesto?: string
    idImpuesto?: number
    estado?: string
    periodo?: number
  }>
  errorGetData?: boolean
  errorMessage?: string
}

const PROVINCIA_MAP: Record<number, string> = {
  0: 'Ciudad Autónoma de Buenos Aires',
  1: 'Buenos Aires',
  2: 'Catamarca',
  3: 'Córdoba',
  4: 'Corrientes',
  5: 'Entre Ríos',
  6: 'Jujuy',
  7: 'Mendoza',
  8: 'La Rioja',
  9: 'Salta',
  10: 'San Juan',
  11: 'San Luis',
  12: 'Santa Fe',
  13: 'Santiago del Estero',
  14: 'Tucumán',
  16: 'Chaco',
  17: 'Chubut',
  18: 'Formosa',
  19: 'Misiones',
  20: 'Neuquén',
  21: 'La Pampa',
  22: 'Río Negro',
  23: 'Santa Cruz',
  24: 'Tierra del Fuego',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const cuil: string = (body.cuil ?? '').replace(/[-\s]/g, '')

    if (!cuil || cuil.length !== 11 || !/^\d{11}$/.test(cuil)) {
      return new Response(
        JSON.stringify({ valid: false, message: 'CUIL debe tener 11 dígitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Call AFIP free API
    const afipRes = await fetch(`${AFIP_API_URL}?cuit=${cuil}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    if (!afipRes.ok) {
      return new Response(
        JSON.stringify({ valid: true, message: 'Formato válido (AFIP no disponible)', afip: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data: AfipPersona = await afipRes.json()

    if (data.errorGetData || data.errorMessage) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: data.errorMessage ?? 'CUIL no encontrado en AFIP',
          afip: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Build clean response
    const nombre = data.nombre ?? data.razonSocial ?? null
    const domicilio = data.domicilioFiscal
    const provincia = domicilio?.idProvincia != null
      ? (PROVINCIA_MAP[domicilio.idProvincia] ?? domicilio.descripcionProvincia ?? null)
      : null

    const actividades = (data.actividades ?? [])
      .slice(0, 5)
      .map((a) => a.descripcionActividad ?? 'Sin descripción')

    const impuestos = (data.impuestos ?? [])
      .filter((i) => i.estado === 'ACTIVO')
      .map((i) => i.descripcionImpuesto ?? '')
      .filter(Boolean)

    const response = {
      valid: true,
      nombre,
      message: nombre ? `AFIP: ${nombre}` : 'CUIL verificado en AFIP',
      afip: {
        cuil,
        nombre,
        tipoPersona: data.tipoPersona ?? null,
        estadoClave: data.estadoClave ?? null,
        domicilio: domicilio
          ? {
              direccion: domicilio.direccion ?? null,
              localidad: domicilio.localidad ?? null,
              codigoPostal: domicilio.codPostal ?? null,
              provincia,
            }
          : null,
        actividades,
        impuestosActivos: impuestos,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return new Response(
      JSON.stringify({ valid: true, message: 'Formato válido (AFIP no disponible)', afip: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
