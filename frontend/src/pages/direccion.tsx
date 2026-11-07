import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { useCambiarEstado } from '@/hooks/use-expedientes'
import {
  useTableroDireccion, tableroDireccionKey,
  type ItemAtencion, type ItemLista, type MiembroEquipo, type TableroDireccion,
} from '@/hooks/use-tablero-direccion'

// Tablero de dirección: qué hay que resolver, cómo está el equipo y cómo está la plata.
// Pensado para mirarlo una vez por semana (el mismo resumen llega los lunes por Telegram).

const pesos = (n: number) => '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))
const dolares = (n: number) => 'US$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))

const card = 'rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900'

export default function DireccionPage() {
  const { data, isLoading, error } = useTableroDireccion()

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
  }
  if (error || !data) {
    return <p className="py-24 text-center text-sm text-zinc-500">No se pudo cargar el tablero. {error instanceof Error ? error.message : ''}</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Dirección</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Cómo está el estudio hoy</p>
      </div>

      <Numeros data={data} />
      <ParaResolver items={data.atencion} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className={cn('min-w-0', data.plata ? 'lg:col-span-3' : 'lg:col-span-5')}><Equipo equipo={data.equipo} /></div>
        {data.plata && <div className="min-w-0 lg:col-span-2"><Plata plata={data.plata} /></div>}
      </div>
      <DatosFaltantes datos={data.datos} />
    </div>
  )
}

// ── Números ──────────────────────────────────────────────────────────────────

function Numeros({ data }: { data: TableroDireccion }) {
  const { numeros, plata } = data
  const tiles = [
    { label: 'Expedientes en trámite', valor: String(numeros.en_tramite), to: '/expedientes', alerta: false },
    { label: 'Tareas vencidas', valor: String(numeros.tareas_vencidas), to: '/tareas', alerta: numeros.tareas_vencidas > 0 },
    { label: 'Audiencias en 15 días', valor: String(numeros.audiencias_15d), to: '/agenda', alerta: false },
    plata
      ? { label: 'Cobros vencidos', valor: pesos(plata.vencido_ars), to: '/caja', alerta: plata.vencido_ars > 0 }
      : { label: 'Consultas abiertas', valor: String(numeros.consultas), to: '/consultas', alerta: false },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.label} to={t.to} className={cn(card, 'px-4 py-3 transition-colors hover:border-zinc-300 dark:hover:border-white/20')}>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.label}</p>
          <p className={cn('mt-1 text-xl font-semibold tabular-nums sm:text-2xl', t.alerta ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50')}>
            {t.valor}
          </p>
        </Link>
      ))}
    </div>
  )
}

// ── Para resolver ────────────────────────────────────────────────────────────

const PUNTO: Record<number, string> = { 1: 'bg-rose-500', 2: 'bg-amber-500', 3: 'bg-zinc-400' }

function ParaResolver({ items }: { items: ItemAtencion[] }) {
  const [verTodo, setVerTodo] = useState(false)
  const LIMITE = 8
  const visibles = verTodo ? items : items.slice(0, LIMITE)

  return (
    <section className={card}>
      <header className="flex items-baseline justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Para resolver</h2>
        {items.length > 0 && <span className="text-xs text-zinc-500">{items.length}</span>}
      </header>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-600 dark:text-zinc-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nada pendiente. El estudio está al día.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/5">
          {visibles.map((it, i) => <FilaAtencion key={`${it.tipo}-${it.expediente_id ?? i}-${i}`} item={it} />)}
        </ul>
      )}
      {items.length > LIMITE && (
        <button type="button" onClick={() => setVerTodo((v) => !v)}
          className="w-full border-t border-zinc-100 px-4 py-2.5 text-sm text-blue-600 hover:bg-zinc-50 dark:border-white/10 dark:text-blue-400 dark:hover:bg-white/5">
          {verTodo ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      )}
    </section>
  )
}

function FilaAtencion({ item }: { item: ItemAtencion }) {
  const [abierto, setAbierto] = useState(false)
  const lista = Array.isArray(item.lista) ? item.lista : null

  const cuerpo = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.titulo}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.detalle}</p>
      {item.caratula && <p className="truncate text-xs text-zinc-500">{item.caratula}</p>}
    </div>
  )
  const punto = <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PUNTO[item.prioridad])} />

  if (lista) {
    return (
      <li>
        <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}
          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5">
          {punto}{cuerpo}
          {abierto ? <ChevronDown className="mt-0.5 h-4 w-4 text-zinc-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-zinc-400" />}
        </button>
        {abierto && <ListaExpedientes tipo={item.tipo} lista={lista} />}
      </li>
    )
  }

  const destino = item.tipo === 'tareas_atrasadas' ? '/tareas' : item.expediente_id ? `/expedientes/${item.expediente_id}` : null
  return (
    <li>
      {destino ? (
        <Link to={destino} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/5">
          {punto}{cuerpo}<ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{punto}{cuerpo}</div>
      )}
    </li>
  )
}

function ListaExpedientes({ tipo, lista }: { tipo: ItemAtencion['tipo']; lista: ItemLista[] }) {
  const qc = useQueryClient()
  const cambiar = useCambiarEstado()
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const pasarATramite = async (id: string) => {
    try {
      await cambiar.mutateAsync({ expediente_id: id, nuevo_estado: 'INICIADO', motivo: 'Tiene movimientos en el SAE' })
      setHechos((s) => new Set(s).add(id))
      qc.invalidateQueries({ queryKey: tableroDireccionKey })
    } catch (e) {
      toast.error('No se pudo cambiar el estado', e instanceof Error ? e.message : undefined)
    }
  }

  const pendientes = lista.filter((x) => !hechos.has(x.id))
  const pasarTodos = async () => {
    if (!window.confirm(`¿Pasar los ${pendientes.length} expedientes a "en trámite"?`)) return
    for (const x of pendientes) await pasarATramite(x.id)
  }

  return (
    <ul className="mb-2 ml-9 mr-4 space-y-0.5 border-l border-zinc-200 pl-3 dark:border-white/10">
      {tipo === 'estado_desactualizado' && pendientes.length > 1 && (
        <li className="py-1">
          <button type="button" onClick={pasarTodos} disabled={cambiar.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
            {cambiar.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Pasar todos a en trámite
          </button>
        </li>
      )}
      {lista.map((x) => (
        <li key={x.id} className="flex items-center gap-2 py-1">
          <Link to={tipo === 'consultas_dormidas' ? `/consultas/${x.id}` : `/expedientes/${x.id}`} className="min-w-0 flex-1 truncate text-sm text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400">
            {x.caratula}
          </Link>
          {x.detalle && <span className="shrink-0 text-xs text-zinc-500">{x.detalle}</span>}
          {x.n != null && <span className="shrink-0 text-xs text-zinc-500">{x.n}</span>}
          {tipo === 'estado_desactualizado' && (
            hechos.has(x.id)
              ? <span className="shrink-0 text-xs text-emerald-600">En trámite</span>
              : <button type="button" onClick={() => pasarATramite(x.id)} disabled={cambiar.isPending}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
                  Pasar a en trámite
                </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Equipo ───────────────────────────────────────────────────────────────────

function Equipo({ equipo }: { equipo: MiembroEquipo[] }) {
  const cols: { key: keyof MiembroEquipo; label: string; corto: string; movil?: false }[] = [
    { key: 'expedientes', label: 'Expedientes a cargo', corto: 'Exp.' },
    { key: 'tareas_abiertas', label: 'Tareas abiertas', corto: 'Abiertas' },
    { key: 'tareas_vencidas', label: 'Tareas vencidas', corto: 'Vencidas' },
    { key: 'completadas_7d', label: 'Tareas hechas en 7 días', corto: 'Hechas 7d', movil: false },
    { key: 'audiencias_15d', label: 'Audiencias en 15 días', corto: 'Aud.', movil: false },
  ]
  return (
    <section className={card}>
      <header className="border-b border-zinc-100 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Equipo</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="px-4 py-2 font-normal">Persona</th>
              {cols.map((c) => <th key={c.key} title={c.label} className={cn('px-2 py-2 text-right font-normal', c.movil === false && 'hidden sm:table-cell')}>{c.corto}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {equipo.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">
                  <span className="capitalize text-zinc-900 dark:text-zinc-100">{p.nombre.toLowerCase()}</span>
                  <span className="ml-1.5 hidden text-xs text-zinc-400 sm:inline">{p.rol.charAt(0) + p.rol.slice(1).toLowerCase()}</span>
                </td>
                {cols.map((c) => {
                  const v = p[c.key] as number
                  const rojo = c.key === 'tareas_vencidas' && v > 0
                  return (
                    <td key={c.key} className={cn('px-2 py-2.5 text-right tabular-nums', c.movil === false && 'hidden sm:table-cell',
                      rojo ? 'font-semibold text-rose-600 dark:text-rose-400' : v === 0 ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300')}>
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Plata ────────────────────────────────────────────────────────────────────

function Plata({ plata }: { plata: NonNullable<TableroDireccion['plata']> }) {
  const dif = plata.ingresos_mes_ars - plata.ingresos_mes_anterior_ars
  return (
    <section className={card}>
      <header className="flex items-baseline justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Plata</h2>
        <Link to="/caja" className="text-xs text-blue-600 hover:underline dark:text-blue-400">Abrir caja</Link>
      </header>
      <dl className="space-y-2.5 px-4 py-3 text-sm">
        <div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-600 dark:text-zinc-400">Cobrado este mes</dt>
            <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">
              {pesos(plata.ingresos_mes_ars)}{plata.ingresos_mes_usd > 0 && ` + ${dolares(plata.ingresos_mes_usd)}`}
            </dd>
          </div>
          <p className="text-xs text-zinc-500">
            {dif === 0 ? 'Igual que' : dif > 0 ? `${pesos(dif)} más que` : `${pesos(-dif)} menos que`} a esta altura del mes pasado
          </p>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-600 dark:text-zinc-400">Por cobrar</dt>
          <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
            {pesos(plata.por_cobrar_ars)}{plata.por_cobrar_usd > 0 && ` + ${dolares(plata.por_cobrar_usd)}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-600 dark:text-zinc-400">De eso, vencido</dt>
          <dd className={cn('tabular-nums', plata.vencido_ars > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100')}>
            {pesos(plata.vencido_ars)}{plata.vencido_usd > 0 && ` + ${dolares(plata.vencido_usd)}`}
          </dd>
        </div>
      </dl>
      {plata.deudores.length > 0 && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-white/10">
          <p className="mb-1.5 text-xs text-zinc-500">Deben</p>
          <ul className="space-y-1">
            {plata.deudores.map((d) => (
              <li key={d.cliente_id} className="flex justify-between gap-3 text-sm">
                <Link to={`/clientes/${d.cliente_id}`} className="min-w-0 truncate text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400">{d.nombre}</Link>
                <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300">
                  {d.vencido_ars > 0 ? pesos(d.vencido_ars) : dolares(d.vencido_usd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Datos que faltan ─────────────────────────────────────────────────────────

function DatosFaltantes({ datos }: { datos: TableroDireccion['datos'] }) {
  const partes = [
    datos.sin_responsable > 0 && `${datos.sin_responsable} sin responsable`,
    datos.sin_caratula > 0 && `${datos.sin_caratula} sin carátula`,
    datos.sin_sae > 0 && `${datos.sin_sae} sin vincular al SAE`,
  ].filter(Boolean)
  return (
    <p className="flex flex-wrap items-center justify-between gap-2 px-1 pb-4 text-xs text-zinc-500">
      <span>{partes.length > 0 ? <>Expedientes en trámite con datos incompletos: {partes.join(' · ')}.</> : 'Los expedientes en trámite tienen los datos completos.'}</span>
      <Link to="/dashboard" className="text-blue-600 hover:underline dark:text-blue-400">Ver indicadores por fuero y etapa</Link>
    </p>
  )
}
