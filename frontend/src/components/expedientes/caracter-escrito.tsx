import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// Carácter en que se presenta el escrito:
//  - apoderado de una parte (fórmula clásica),
//  - por derecho propio (incidentes de honorarios, etc.),
//  - patrocinante: habla la parte, "con el patrocinio letrado de…", y firman los dos.

export type ModoCaracter = 'apoderado' | 'derecho_propio' | 'patrocinante'

export interface CaracterEscrito {
  modo: ModoCaracter
  /** Parte representada o patrocinada */
  parte: 'actora' | 'demandada' | 'otra'
  /** Texto libre cuando parte = 'otra' (p. ej. "del tercero citado", "de la sucesión de…") */
  parte_texto?: string
  /** Datos de quien habla con patrocinio */
  patrocinado?: { nombre: string; dni: string; domicilio: string }
}

export const CARACTER_POR_DEFECTO: CaracterEscrito = { modo: 'apoderado', parte: 'actora' }

const PARTE: Record<CaracterEscrito['parte'], string> = { actora: 'la parte actora', demandada: 'la parte demandada', otra: '' }

export function textoParte(c: CaracterEscrito): string {
  return c.parte === 'otra' ? (c.parte_texto?.trim() || 'la parte') : PARTE[c.parte]
}

/** Fórmula de apertura según el carácter. */
export function formulaPresentacion(c: CaracterEscrito): string {
  if (c.modo === 'derecho_propio') return 'Por mi propio derecho, a V.S. respetuosamente digo:'
  if (c.modo === 'patrocinante') return 'A V.S. respetuosamente digo:'
  return `En mi carácter de apoderado de ${textoParte(c)}, a V.S. respetuosamente digo:`
}

/** Sugerencia según lo que se va a presentar: honorarios → por derecho propio. */
export function inferirCaracter(texto: string, actual: CaracterEscrito): CaracterEscrito {
  if (/honorari|regulaci[oó]n de honorarios|ejecuci[oó]n de honorarios|aportes|ius/i.test(texto) && actual.modo === 'apoderado') {
    return { ...actual, modo: 'derecho_propio' }
  }
  return actual
}

export const ETIQUETA_MODO: Record<ModoCaracter, string> = {
  apoderado: 'Apoderado',
  derecho_propio: 'Por derecho propio',
  patrocinante: 'Patrocinante (habla la parte)',
}

/** Cliente del expediente, para precargar los datos del patrocinado. */
function useClienteExpediente(expedienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['escritos', 'cliente-patrocinado', expedienteId],
    enabled: !!expedienteId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (createClient() as any).from('expedientes')
        .select('cliente:clientes(nombre, apellido, dni, domicilio, localidad, provincia, razon_social, tipo_persona)')
        .eq('id', expedienteId).maybeSingle()
      const c = (data as { cliente: Record<string, string | null> | null } | null)?.cliente
      if (!c) return null
      const nombre = c.tipo_persona === 'juridica' && c.razon_social ? c.razon_social : [c.nombre, c.apellido].filter(Boolean).join(' ')
      const domicilio = [c.domicilio, c.localidad, c.provincia].filter(Boolean).join(', ')
      return { nombre: (nombre ?? '').toUpperCase(), dni: c.dni ?? '', domicilio }
    },
  })
}

const campo = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm text-zinc-900 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-zinc-100'

export function CaracterSelector({ value, onChange, expedienteId, compacto = false }: {
  value: CaracterEscrito
  onChange: (c: CaracterEscrito) => void
  expedienteId?: string | null
  compacto?: boolean
}) {
  const { data: cliente } = useClienteExpediente(expedienteId)

  // Al elegir patrocinio, se precargan los datos del cliente del expediente
  useEffect(() => {
    if (value.modo === 'patrocinante' && !value.patrocinado && cliente) onChange({ ...value, patrocinado: cliente })
  }, [value.modo, cliente]) // eslint-disable-line react-hooks/exhaustive-deps

  const p = value.patrocinado ?? { nombre: '', dni: '', domicilio: '' }
  return (
    <div className="space-y-2">
      <div className={cn('grid gap-1 rounded-xl bg-zinc-500/10 p-1', compacto ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
        {(['apoderado', 'derecho_propio', 'patrocinante'] as const).map((m) => (
          <button key={m} type="button" onClick={() => onChange({ ...value, modo: m })}
            className={cn('min-h-9 rounded-lg px-2 text-xs font-medium',
              value.modo === m ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300')}>
            {compacto && m === 'patrocinante' ? 'Patrocinante' : ETIQUETA_MODO[m]}
          </button>
        ))}
      </div>

      {value.modo !== 'derecho_propio' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {value.modo === 'apoderado' ? 'Apoderado de' : 'Parte patrocinada:'}
          <select value={value.parte} onChange={(e) => onChange({ ...value, parte: e.target.value as CaracterEscrito['parte'] })}
            className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 text-base sm:text-xs text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
            <option value="actora">la parte actora</option>
            <option value="demandada">la parte demandada</option>
            <option value="otra">otra…</option>
          </select>
          {value.parte === 'otra' && (
            <input value={value.parte_texto ?? ''} onChange={(e) => onChange({ ...value, parte_texto: e.target.value })}
              placeholder="p. ej. del tercero citado en garantía" className={cn(campo, 'min-h-9 flex-1 py-1')} />
          )}
        </div>
      )}

      {value.modo === 'patrocinante' && (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 p-2.5 dark:border-white/10 sm:grid-cols-3">
          <p className="text-[11px] text-zinc-500 sm:col-span-3">Quién se presenta con tu patrocinio (precargado del cliente del expediente):</p>
          <input value={p.nombre} onChange={(e) => onChange({ ...value, patrocinado: { ...p, nombre: e.target.value } })} placeholder="Nombre y apellido" className={campo} />
          <input value={p.dni} onChange={(e) => onChange({ ...value, patrocinado: { ...p, dni: e.target.value } })} placeholder="DNI" className={campo} />
          <input value={p.domicilio} onChange={(e) => onChange({ ...value, patrocinado: { ...p, domicilio: e.target.value } })} placeholder="Domicilio real" className={campo} />
        </div>
      )}
    </div>
  )
}
