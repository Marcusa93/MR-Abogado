import { useQuery } from '@tanstack/react-query'

const MONEDAPI_KEY = import.meta.env.VITE_MONEDAPI_KEY as string | undefined

export interface CotizacionUSD {
  compra: number
  venta: number
  actualizacion?: string
}

function normalizeResponse(data: unknown): CotizacionUSD | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.compra === 'number' && typeof d.venta === 'number') {
    return { compra: d.compra, venta: d.venta, actualizacion: d.actualizacion as string | undefined }
  }
  if (typeof d.buy === 'number' && typeof d.sell === 'number') {
    return { compra: d.buy, venta: d.sell }
  }
  if (typeof d.value_buy === 'number' && typeof d.value_sell === 'number') {
    return { compra: d.value_buy, venta: d.value_sell }
  }
  if (d.usd && typeof d.usd === 'object') return normalizeResponse(d.usd)
  if (d.oficial && typeof d.oficial === 'object') return normalizeResponse(d.oficial)
  return null
}

// Cotización USD/ARS desde monedapi.ar — refresca cada 30 min
export function useUsdRate() {
  return useQuery<CotizacionUSD | null>({
    queryKey: ['cotizacion-usd'],
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      if (!MONEDAPI_KEY) return null
      const res = await fetch('https://monedapi.ar/v1/cotizacion/usd', {
        headers: { Authorization: `Bearer ${MONEDAPI_KEY}` },
      })
      if (!res.ok) return null
      const data: unknown = await res.json()
      return normalizeResponse(data)
    },
  })
}
