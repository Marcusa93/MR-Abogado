import { useQuery } from '@tanstack/react-query'

const MONEDAPI_KEY = import.meta.env.VITE_MONEDAPI_KEY as string | undefined

export interface CotizacionUSD {
  compra: number
  venta: number
  actualizacion?: string
}

// MonedAPI /api/cotizaciones devuelve un array con entradas por origen
async function fetchMonedapi(): Promise<CotizacionUSD | null> {
  if (!MONEDAPI_KEY) return null
  try {
    const res = await fetch('https://monedapi.ar/api/cotizaciones', {
      headers: { Authorization: `Bearer ${MONEDAPI_KEY}` },
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!Array.isArray(data)) return null
    // Preferir BNA, caer a la primera entrada USD disponible
    const bna = data.find((d: any) => d.origen === 'BNA' && d.moneda === 'USD')
    const entry = bna ?? data.find((d: any) => d.moneda === 'USD')
    if (!entry) return null
    return {
      compra: Number(entry.compra),
      venta: Number(entry.venta),
      actualizacion: entry.actualizado ?? undefined,
    }
  } catch {
    return null
  }
}

// Fallback público: Bluelytics BNA oficial, sin autenticación
async function fetchBluelytics(): Promise<CotizacionUSD | null> {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const oficial = data.oficial as Record<string, number> | undefined
    if (!oficial) return null
    return { compra: oficial.value_buy, venta: oficial.value_sell }
  } catch {
    return null
  }
}

// Cotización USD/ARS (BNA). Usa MonedAPI si hay clave, Bluelytics como fallback.
// Refresca cada 30 minutos.
export function useUsdRate() {
  return useQuery<CotizacionUSD | null>({
    queryKey: ['cotizacion-usd'],
    staleTime: 0,
    gcTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const result = await fetchMonedapi()
      if (result) return result
      return fetchBluelytics()
    },
  })
}
