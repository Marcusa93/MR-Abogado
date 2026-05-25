import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Search, ArrowRight, AlertCircle, Loader2, CheckCircle2, FileText, X,
} from 'lucide-react'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useClientesPlaceholderPendientes,
  useBuscarClientesAutocomplete,
  useMergeClientes,
  type ClientePlaceholderPendiente,
  type ClienteAutocompleteRow,
} from '@/hooks/use-clientes'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

export default function ResolverClientesPage() {
  const { profile } = useAuth()
  const isDirector = profile?.rol === 'DIRECTOR'
  const { data: placeholders = [], isLoading } = useClientesPlaceholderPendientes()
  const [selected, setSelected] = useState<ClientePlaceholderPendiente | null>(null)

  if (!isDirector) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Resolver duplicados' },
        ]} />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Solo el director puede consolidar clientes.</span>
          </div>
          <p className="text-sm text-zinc-500 mt-2">
            Pedile al titular del estudio que entre acá para mergear los duplicados.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Clientes', href: '/clientes' },
        { label: 'Resolver duplicados' },
      ]} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resolver clientes duplicados</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Cuando se importan expedientes desde SAE sin asociar a un cliente, el sistema crea un
            cliente <strong>placeholder</strong>. Acá los identificás y los consolidás en el cliente real
            — un único click y todos los expedientes pasan al cliente correcto.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : placeholders.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-8">
          <EmptyState
            icon={CheckCircle2}
            title="No hay placeholders pendientes"
            description="Todos los clientes importados desde SAE están consolidados con clientes reales. Si importás más expedientes y aparecen acá, los resolvés desde esta misma pantalla."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de placeholders */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 overflow-hidden">
            <div className="border-b border-zinc-200 dark:border-white/5 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Placeholders SAE pendientes
                <span className="ml-2 text-xs font-normal text-zinc-500">({placeholders.length})</span>
              </h2>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-white/5 max-h-[600px] overflow-y-auto">
              {placeholders.map(p => (
                <li
                  key={p.id}
                  className={cn(
                    'p-4 cursor-pointer transition-colors',
                    selected?.id === p.id
                      ? 'bg-violet-500/5 border-l-2 border-violet-500'
                      : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02] border-l-2 border-transparent',
                  )}
                  onClick={() => setSelected(p)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {p.nombre}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">DNI placeholder: {p.dni}</p>
                      {p.caratulas && p.caratulas.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {p.caratulas.slice(0, 3).map((c, i) => (
                            <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                              <FileText className="h-3 w-3 mt-0.5 flex-shrink-0 text-zinc-400" />
                              <span className="line-clamp-2">{c}</span>
                            </li>
                          ))}
                          {p.caratulas.length > 3 && (
                            <li className="text-xs text-zinc-500 italic ml-4">
                              + {p.caratulas.length - 3} más
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-400">
                        {p.expedientes_count} exp.
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Panel de merge */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 overflow-hidden">
            <div className="border-b border-zinc-200 dark:border-white/5 px-4 py-3">
              <h2 className="text-sm font-semibold">Mergear con cliente real</h2>
            </div>
            {selected ? (
              <MergePanel placeholder={selected} onDone={() => setSelected(null)} />
            ) : (
              <div className="p-8 text-center">
                <Users className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">Seleccioná un placeholder de la izquierda</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Panel de merge ─────────────────────────────────────────────────────

function MergePanel({
  placeholder, onDone,
}: {
  placeholder: ClientePlaceholderPendiente
  onDone: () => void
}) {
  const [termino, setTermino] = useState('')
  const [destino, setDestino] = useState<ClienteAutocompleteRow | null>(null)
  const { data: candidatos = [], isFetching } = useBuscarClientesAutocomplete(termino, 15)
  const merge = useMergeClientes()

  // Si el usuario cambia de placeholder, resetear destino
  useEffect(() => {
    setDestino(null); setTermino('')
  }, [placeholder.id])

  const candidatosFiltrados = useMemo(() => {
    return candidatos.filter(c => c.id !== placeholder.id && !c.es_placeholder)
  }, [candidatos, placeholder.id])

  async function handleMerge() {
    if (!destino) return
    try {
      const res = await merge.mutateAsync({
        from_cliente_id: placeholder.id,
        to_cliente_id: destino.id,
      })
      toast.success(
        `Consolidado: ${res.expedientes_movidos} expediente(s) movido(s) a ${destino.apellido}, ${destino.nombre}`,
      )
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Error consolidando')
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Origen */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Placeholder a consolidar</p>
        <p className="text-sm font-medium">{placeholder.nombre}</p>
        <p className="text-xs text-zinc-500">{placeholder.expedientes_count} expediente(s) — DNI {placeholder.dni}</p>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="h-5 w-5 text-zinc-400" />
      </div>

      {/* Destino */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
          Buscar cliente destino (apellido, DNI o CUIL)
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={termino}
            onChange={e => { setTermino(e.target.value); setDestino(null) }}
            placeholder="Ej: Rossi, 24567890..."
            className="w-full text-sm bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-md pl-9 pr-3 py-2 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        {destino ? (
          <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-3 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">{destino.apellido}, {destino.nombre}</p>
              <p className="text-xs text-zinc-500">
                DNI {destino.dni}{destino.cuil ? ` · CUIL ${destino.cuil}` : ''} ·{' '}
                {destino.expedientes_count} expediente(s) actuales
              </p>
            </div>
            <button onClick={() => setDestino(null)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800">
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        ) : termino.trim().length > 0 && (
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-white/5">
            {isFetching && (
              <li className="px-3 py-2 text-xs text-zinc-500 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> buscando...
              </li>
            )}
            {!isFetching && candidatosFiltrados.length === 0 && (
              <li className="px-3 py-3 text-xs text-zinc-500 italic">
                Ningún cliente real coincide. Si el cliente no existe,{' '}
                <Link to="/clientes/nuevo" className="text-violet-500 hover:underline">creálo primero</Link>{' '}
                y volvé acá.
              </li>
            )}
            {candidatosFiltrados.map(c => (
              <li
                key={c.id}
                onClick={() => setDestino(c)}
                className="px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{c.apellido}, {c.nombre}</p>
                    <p className="text-xs text-zinc-500">DNI {c.dni}</p>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {c.expedientes_count} exp.
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resumen + acción */}
      {destino && (
        <div className="space-y-3">
          <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/50 p-3 text-xs text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">Esto va a pasar:</p>
            <ul className="space-y-1">
              <li>• Los {placeholder.expedientes_count} expediente(s) pasan al cliente destino</li>
              <li>• Los adjuntos y contactos asociados al placeholder se mueven</li>
              <li>• El placeholder queda como "borrado" (soft delete) — no se pierde nada, queda histórico</li>
              <li>• Si el destino era placeholder también, hereda los datos del origen</li>
            </ul>
          </div>

          <button
            onClick={handleMerge}
            disabled={merge.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-violet-500 text-white hover:bg-violet-600 text-sm font-medium disabled:opacity-50"
          >
            {merge.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar consolidación
          </button>
        </div>
      )}
    </div>
  )
}
