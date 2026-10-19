import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Selectores con búsqueda en la base para los formularios de caja.
// Buscan mientras se escribe (sin el tope de "los primeros N" de un <select>).

export interface ExpedienteOpcion {
  id: string
  label: string
  cliente_id: string | null
  cliente_label: string | null
}

export interface ClienteOpcion { id: string; label: string }

const inputCls =
  'w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none'

function useDebounced(valor: string, ms = 250) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor.trim()), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

const limpiar = (q: string) => q.replace(/[,()%*]/g, ' ').trim()

function Combo<T extends { id: string; label: string }>({
  placeholder, seleccionado, opciones, buscando, query, setQuery, onElegir, onQuitar, detalle,
}: {
  placeholder: string
  seleccionado: T | null
  opciones: T[]
  buscando: boolean
  query: string
  setQuery: (q: string) => void
  onElegir: (o: T) => void
  onQuitar: () => void
  detalle?: (o: T) => string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{seleccionado.label}</span>
        <button type="button" onClick={onQuitar} className="shrink-0 text-zinc-400 hover:text-zinc-200" title="Quitar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-white/10 bg-zinc-900 shadow-xl">
          {opciones.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">{buscando ? 'Buscando…' : 'Sin resultados'}</p>
          ) : opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onElegir(o); setQuery(''); setAbierto(false) }}
              className="block w-full truncate px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10"
            >
              {o.label}
              {detalle?.(o) && <span className="ml-1 text-zinc-500">· {detalle(o)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Expediente por carátula o número. Si se pasa clienteId, solo los de ese cliente. */
export function SelectorExpediente({ value, onChange, clienteId, placeholder }: {
  value: ExpedienteOpcion | null
  onChange: (e: ExpedienteOpcion | null) => void
  clienteId?: string | null
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const q = useDebounced(query)
  const supabase = createClient()
  const { data = [], isFetching } = useQuery({
    queryKey: ['selector-expediente', q, clienteId ?? null],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let consulta = supabase.from('expedientes')
        .select('id, caratula, numero, numero_sae, cliente_id, clientes(nombre, apellido)')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(40)
      if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
      const t = limpiar(q)
      if (t) consulta = consulta.or(`caratula.ilike.%${t}%,numero.ilike.%${t}%,numero_sae.ilike.%${t}%`)
      const { data, error } = await consulta
      if (error) throw error
      return (data ?? []).map((e): ExpedienteOpcion => {
        const c = e.clientes as unknown as { nombre: string | null; apellido: string | null } | null
        return {
          id: e.id,
          label: e.caratula ? `${e.caratula}${e.numero_sae ? ` (${e.numero_sae})` : ''}` : (e.numero ?? 'Expediente'),
          cliente_id: e.cliente_id ?? null,
          cliente_label: c ? `${c.apellido ?? ''} ${c.nombre ?? ''}`.trim() : null,
        }
      })
    },
  })
  return (
    <Combo
      placeholder={placeholder ?? 'Buscar expediente por carátula o número…'}
      seleccionado={value}
      opciones={data}
      buscando={isFetching}
      query={query}
      setQuery={setQuery}
      onElegir={onChange}
      onQuitar={() => onChange(null)}
    />
  )
}

/** Cliente por apellido o nombre. */
export function SelectorCliente({ value, onChange, placeholder }: {
  value: ClienteOpcion | null
  onChange: (c: ClienteOpcion | null) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const q = useDebounced(query)
  const supabase = createClient()
  const { data = [], isFetching } = useQuery({
    queryKey: ['selector-cliente', q],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      let consulta = supabase.from('clientes')
        .select('id, nombre, apellido')
        .is('deleted_at', null)
        .order('apellido', { ascending: true })
        .limit(40)
      const t = limpiar(q)
      if (t) consulta = consulta.or(`apellido.ilike.%${t}%,nombre.ilike.%${t}%`)
      const { data, error } = await consulta
      if (error) throw error
      return (data ?? []).map((c): ClienteOpcion => ({
        id: c.id,
        label: c.apellido ? `${c.apellido}, ${c.nombre ?? ''}`.trim() : (c.nombre ?? 'Cliente'),
      }))
    },
  })
  return (
    <Combo
      placeholder={placeholder ?? 'Buscar cliente por apellido o nombre…'}
      seleccionado={value}
      opciones={data}
      buscando={isFetching}
      query={query}
      setQuery={setQuery}
      onElegir={onChange}
      onQuitar={() => onChange(null)}
    />
  )
}

/** Carga la opción inicial (al editar) a partir del id guardado. */
export function useExpedienteOpcion(id: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['expediente-opcion', id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExpedienteOpcion | null> => {
      const { data } = await supabase.from('expedientes')
        .select('id, caratula, numero, numero_sae, cliente_id, clientes(nombre, apellido)')
        .eq('id', id!).maybeSingle()
      if (!data) return null
      const c = data.clientes as unknown as { nombre: string | null; apellido: string | null } | null
      return {
        id: data.id,
        label: data.caratula ? `${data.caratula}${data.numero_sae ? ` (${data.numero_sae})` : ''}` : (data.numero ?? 'Expediente'),
        cliente_id: data.cliente_id ?? null,
        cliente_label: c ? `${c.apellido ?? ''} ${c.nombre ?? ''}`.trim() : null,
      }
    },
  })
}

export function useClienteOpcion(id: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['cliente-opcion', id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ClienteOpcion | null> => {
      const { data } = await supabase.from('clientes').select('id, nombre, apellido').eq('id', id!).maybeSingle()
      if (!data) return null
      return { id: data.id, label: data.apellido ? `${data.apellido}, ${data.nombre ?? ''}`.trim() : (data.nombre ?? 'Cliente') }
    },
  })
}
