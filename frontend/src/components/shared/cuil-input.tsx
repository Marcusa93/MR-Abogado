// ---------------------------------------------------------------------------
// CUIL Input with real-time validation + AFIP data display
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { formatCuil } from '@/lib/utils/cuil-validator'
import { useCuilValidation } from '@/hooks/use-cuil-validation'
import type { AfipData } from '@/hooks/use-cuil-validation'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink, Check } from 'lucide-react'

interface CuilInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Pre-fill the 8 central digits from the DNI field */
  dniValue?: string
  /** Called when AFIP returns a name for cross-checking */
  onAfipName?: (nombre: string) => void
  /** Called with full AFIP data when available */
  onAfipData?: (data: AfipData) => void
  /** Show constancia download button when valid (default: true) */
  showConstancia?: boolean
}

export function CuilInput({
  value,
  onChange,
  className,
  dniValue,
  onAfipName,
  onAfipData,
  showConstancia = true,
}: CuilInputProps) {
  const { result, validate, reset } = useCuilValidation()

  // Auto-fill central 8 digits when DNI changes and CUIL is empty or only has prefix
  useEffect(() => {
    if (!dniValue || dniValue.length < 7) return
    const currentDigits = value.replace(/[^0-9]/g, '')
    // Only auto-fill if CUIL is empty or just the prefix (2 digits)
    if (currentDigits.length <= 2) {
      const padded = dniValue.padStart(8, '0')
      const prefix = currentDigits.length === 2 ? currentDigits : ''
      if (prefix) {
        onChange(`${prefix}-${padded}-`)
      }
    }
  }, [dniValue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value.replace(/[-\s]/g, '').length >= 11) {
      validate(value)
    } else if (value.length === 0) {
      reset()
    }
  }, [value, validate, reset])

  // Notify parent when AFIP returns a name
  useEffect(() => {
    if (result.status === 'valid' && result.nombre && onAfipName) {
      onAfipName(result.nombre)
    }
  }, [result, onAfipName])

  // Notify parent when AFIP returns full data
  useEffect(() => {
    if (result.status === 'valid' && result.afip && onAfipData) {
      onAfipData(result.afip)
    }
  }, [result, onAfipData])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Strip non-digits
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 11)

    // Progressive mask: XX-XXXXXXXX-X
    let formatted = ''
    for (let i = 0; i < digits.length; i++) {
      if (i === 2 || i === 10) formatted += '-'
      formatted += digits[i]
    }

    onChange(formatted)
  }

  const [copied, setCopied] = useState(false)

  const handleOpenConstancia = () => {
    const cuil = value.replace(/[-\s]/g, '')
    if (cuil.length !== 11) return

    // Copy CUIL without dashes so user can paste it directly in AFIP
    navigator.clipboard.writeText(cuil).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })

    // Open AFIP constancia page in new tab
    window.open(
      'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do',
      '_blank',
    )
  }

  const borderColor =
    result.status === 'valid'
      ? 'border-emerald-500/50 focus:border-emerald-500/50 focus:ring-emerald-500/20'
      : result.status === 'invalid'
        ? 'border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20'
        : result.status === 'validating'
          ? 'border-amber-500/50 focus:border-amber-500/40 focus:ring-amber-500/15'
          : 'border-white/10 focus:border-amber-500/40 focus:ring-amber-500/15'

  return (
    <div>
      <div className="relative">
        <input
          value={value}
          onChange={handleChange}
          className={cn(
            'h-9 w-full rounded-lg border bg-white/5 px-3 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2',
            borderColor,
            className,
          )}
          placeholder="20-12345678-9"
          maxLength={13}
        />
        {/* Status icon */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {result.status === 'validating' && (
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          )}
          {result.status === 'valid' && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          {result.status === 'invalid' && (
            <XCircle className="h-4 w-4 text-rose-400" />
          )}
        </div>
      </div>

      {/* Status message */}
      {result.message && result.status !== 'idle' && (
        <p
          className={cn(
            'mt-1 text-xs flex items-center gap-1',
            result.status === 'valid' && 'text-emerald-400',
            result.status === 'invalid' && 'text-rose-400',
            result.status === 'validating' && 'text-amber-400',
            result.status === 'error' && 'text-amber-400',
          )}
        >
          {result.status === 'error' && <AlertCircle className="h-3 w-3" />}
          {result.message}
        </p>
      )}

      {/* AFIP data card + constancia button */}
      {result.status === 'valid' && (
        <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs space-y-1.5">
          {result.afip?.estadoClave && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                result.afip.estadoClave === 'ACTIVO' ? 'bg-emerald-400' : 'bg-amber-400',
              )} />
              <span className="text-zinc-600 dark:text-zinc-400">Estado AFIP:</span>
              <span className={cn(
                'font-medium',
                result.afip.estadoClave === 'ACTIVO' ? 'text-emerald-400' : 'text-amber-400',
              )}>
                {result.afip.estadoClave}
              </span>
            </div>
          )}
          {result.afip?.domicilio?.direccion && (
            <p className="text-zinc-600 dark:text-zinc-400">
              <span className="text-zinc-900 dark:text-zinc-500">Domicilio fiscal:</span>{' '}
              {[
                result.afip.domicilio.direccion,
                result.afip.domicilio.localidad,
                result.afip.domicilio.provincia,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {result.afip?.actividades && result.afip.actividades.length > 0 && (
            <p className="text-zinc-600 dark:text-zinc-400 truncate">
              <span className="text-zinc-900 dark:text-zinc-500">Actividad:</span>{' '}
              {result.afip.actividades[0]}
            </p>
          )}
          {showConstancia && (
            <button
              type="button"
              onClick={handleOpenConstancia}
              className="mt-1 flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
              {copied ? 'CUIL copiado — pegalo en AFIP' : 'Constancia oficial AFIP'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
