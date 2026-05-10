// ---------------------------------------------------------------------------
// CUIL real-time validation hook
// Validates format locally + verifies against AFIP via Supabase Edge Function
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef } from 'react'
import { isValidCuil, formatCuil } from '@/lib/utils/cuil-validator'
import { createClient } from '@/lib/supabase/client'

export interface AfipDomicilio {
  direccion: string | null
  localidad: string | null
  codigoPostal: string | null
  provincia: string | null
}

export interface AfipData {
  cuil: string
  nombre: string | null
  tipoPersona: string | null
  estadoClave: string | null
  domicilio: AfipDomicilio | null
  actividades: string[]
  impuestosActivos: string[]
}

export interface CuilValidationResult {
  status: 'idle' | 'validating' | 'valid' | 'invalid' | 'error'
  /** Name returned by AFIP (for cross-check) */
  nombre?: string | null
  /** Full AFIP contributor data */
  afip?: AfipData | null
  /** Error or info message */
  message?: string
}

/**
 * Hook that validates CUIL in two steps:
 * 1. Local format + check digit validation (instant)
 * 2. Remote AFIP lookup via Supabase Edge Function (async)
 *
 * If the Edge Function is not deployed, falls back to local-only validation.
 */
export function useCuilValidation() {
  const [result, setResult] = useState<CuilValidationResult>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const validate = useCallback((rawCuil: string) => {
    // Cancel any pending request
    abortRef.current?.abort()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    const cuil = rawCuil.replace(/[-\s]/g, '')

    // Empty — reset
    if (!cuil || cuil.length < 11) {
      setResult({ status: 'idle' })
      return
    }

    // Step 1: Local validation
    if (!isValidCuil(cuil)) {
      setResult({
        status: 'invalid',
        message: 'CUIL inválido (formato o dígito verificador incorrecto)',
      })
      return
    }

    // Step 2: Debounce remote check (500ms)
    setResult({ status: 'validating', message: 'Verificando en AFIP...' })

    timeoutRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const supabase = createClient()
        const formatted = formatCuil(cuil)

        // Call Supabase Edge Function that proxies AFIP lookup
        const { data, error } = await supabase.functions.invoke('validate-cuil', {
          body: { cuil: formatted },
        })

        if (controller.signal.aborted) return

        if (error) {
          // Edge function not available — fall back to local-only
          setResult({
            status: 'valid',
            message: 'Formato válido (verificación AFIP no disponible)',
          })
          return
        }

        if (data?.valid) {
          setResult({
            status: 'valid',
            nombre: data.nombre ?? null,
            afip: data.afip ?? null,
            message: data.nombre
              ? `AFIP: ${data.nombre}`
              : 'CUIL verificado en AFIP',
          })
        } else {
          setResult({
            status: 'invalid',
            message: data?.message ?? 'CUIL no encontrado en AFIP',
          })
        }
      } catch (err: any) {
        if (controller.signal.aborted) return
        // Network error or edge function not deployed — local validation is enough
        setResult({
          status: 'valid',
          message: 'Formato válido (verificación AFIP no disponible)',
        })
      }
    }, 500)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setResult({ status: 'idle' })
  }, [])

  return { result, validate, reset }
}
