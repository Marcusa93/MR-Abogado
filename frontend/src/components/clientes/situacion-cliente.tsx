import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FolderOpen, Wallet, CalendarClock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { SaludDot, SaludMotivo } from '@/components/expedientes/salud-indicador'
import { useExpedientesSalud, type SaludExpediente } from '@/hooks/use-expediente-salud'
import { useCuentasSaldos } from '@/hooks/use-cuenta-corriente'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CERRADOS = ['FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO']
const PESO: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, gris: 3 }
const fmt = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const dolares = (n: number) => `US$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

function useFichasResumen(ids: string[]) {
  return useQuery({
    queryKey: ['fichas-resumen', [...ids].sort().join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (createClient() as any).from('expediente_fichas')
        .select('expediente_id, resumen, proximo_paso').in('expediente_id', ids)
      if (error) throw error
      const map = new Map<string, { resumen: string | null; proximo_paso: string | null }>()
      for (const r of (data ?? []) as any[]) map.set(r.expediente_id, r)
      return map
    },
  })
}

function Saldo({ clienteId }: { clienteId: string }) {
  const { data } = useCuentasSaldos()
  const s = data?.find((x) => x.cliente_id === clienteId)
  if (!s || (s.saldo_ars === 0 && s.saldo_usd === 0)) {
    return <Dato icon={Wallet} label="Cuenta corriente" valor="Sin saldo pendiente" />
  }
  const vencido = s.vencido_ars > 0 || s.vencido_usd > 0
  const partes = [s.saldo_ars > 0 && pesos(s.saldo_ars), s.saldo_usd > 0 && dolares(s.saldo_usd)].filter(Boolean).join(' + ')
  const partesVenc = [s.vencido_ars > 0 && pesos(s.vencido_ars), s.vencido_usd > 0 && dolares(s.vencido_usd)].filter(Boolean).join(' + ')
  return (
    <Dato
      icon={Wallet}
      label="Debe"
      valor={partes}
      detalle={vencido ? `${partesVenc} vencido` : s.proximo_vencimiento ? `Próximo vencimiento ${fmt(s.proximo_vencimiento)}` : undefined}
      alerta={vencido}
    />
  )
}

function Dato({ icon: Icon, label, valor, detalle, alerta }: { icon: typeof Wallet; label: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className="app-card flex min-w-0 items-start gap-2 px-3 py-2.5">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', alerta ? 'text-rose-500' : 'text-zinc-500 dark:text-zinc-400')} />
      <div className="min-w-0">
        <p className="dashboard-eyebrow">{label}</p>
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{valor}</p>
        {detalle && <p className={cn('truncate text-xs', alerta ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400')}>{detalle}</p>}
      </div>
    </div>
  )
}

function proximaFecha(s?: SaludExpediente) {
  if (!s) return null
  const f = [s.proxima_audiencia && { f: s.proxima_audiencia, t: 'Audiencia' }, s.proximo_plazo && { f: s.proximo_plazo, t: 'Plazo' }]
    .filter(Boolean) as { f: string; t: string }[]
  return f.sort((a, b) => a.f.localeCompare(b.f))[0] ?? null
}

export function SituacionCliente({ clienteId, expedientes, tieneAccesoCaja }: { clienteId: string; expedientes: any[]; tieneAccesoCaja: boolean }) {
  const navigate = useNavigate()
  const ids = expedientes.map((e) => e.id as string)
  const { data: salud } = useExpedientesSalud(ids)
  const { data: fichas } = useFichasResumen(ids)

  if (expedientes.length === 0) {
    return (
      <div className="app-card p-8">
        <EmptyState icon={FolderOpen} title="Sin expedientes" description="Este cliente no tiene expedientes asociados."
          actionLabel="Crear expediente" onAction={() => navigate('/expedientes/nuevo')} />
      </div>
    )
  }

  const activos = expedientes.filter((e) => !CERRADOS.includes(e.estado_interno))
    .sort((a, b) => (PESO[salud?.get(a.id)?.semaforo ?? 'gris'] ?? 3) - (PESO[salud?.get(b.id)?.semaforo ?? 'gris'] ?? 3))
  const cerrados = expedientes.filter((e) => CERRADOS.includes(e.estado_interno))
  const urgentes = activos.filter((e) => salud?.get(e.id)?.semaforo === 'rojo').length
  const atencion = activos.filter((e) => salud?.get(e.id)?.semaforo === 'amarillo').length
  const proxima = activos.map((e) => ({ e, p: proximaFecha(salud?.get(e.id)) })).filter((x) => x.p)
    .sort((a, b) => a.p!.f.localeCompare(b.p!.f))[0]

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-2', tieneAccesoCaja ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
        <Dato
          icon={AlertTriangle}
          label="Situación"
          valor={`${activos.length} ${activos.length === 1 ? 'activo' : 'activos'}${cerrados.length ? ` · ${cerrados.length} cerrados` : ''}`}
          detalle={urgentes || atencion ? [urgentes && `${urgentes} urgente${urgentes > 1 ? 's' : ''}`, atencion && `${atencion} para atender`].filter(Boolean).join(' · ') : 'Todo en orden'}
          alerta={urgentes > 0}
        />
        <Dato
          icon={CalendarClock}
          label="Lo próximo"
          valor={proxima ? `${proxima.p!.t} · ${fmt(proxima.p!.f)}` : 'Sin fechas próximas'}
          detalle={proxima ? (proxima.e.caratula ?? proxima.e.numero) : undefined}
        />
        {tieneAccesoCaja && <Saldo clienteId={clienteId} />}
      </div>

      {activos.length > 0 && (
        <ul className="space-y-2">
          {activos.map((e) => {
            const s = salud?.get(e.id)
            const f = fichas?.get(e.id)
            const prox = proximaFecha(s)
            return (
              <li key={e.id}>
                <button onClick={() => navigate(`/expedientes/${e.id}`)}
                  className="app-card group w-full px-4 py-3 text-left transition-colors hover:border-zinc-300 dark:hover:border-white/20">
                  <div className="flex items-start gap-3">
                    <SaludDot salud={s} className="mt-1.5" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{e.caratula || e.numero}</p>
                        <EstadoBadge estado={e.estado_interno} compact />
                      </div>
                      <SaludMotivo salud={s} />
                      {f?.resumen && <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{f.resumen}</p>}
                      {f?.proximo_paso && (
                        <p className="line-clamp-2 text-xs text-zinc-800 dark:text-zinc-200"><span className="font-semibold">Próximo paso:</span> {f.proximo_paso}</p>
                      )}
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {prox ? `${prox.t} el ${fmt(prox.f)}` : 'Sin fechas próximas'}
                        {s?.ultimo_movimiento && ` · último movimiento ${fmt(s.ultimo_movimiento)}`}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {cerrados.length > 0 && (
        <div className="app-card overflow-hidden">
          <p className="border-b border-zinc-200 px-4 py-2 dashboard-eyebrow dark:border-white/5">Cerrados o pausados ({cerrados.length})</p>
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {cerrados.map((e) => (
              <li key={e.id}>
                <button onClick={() => navigate(`/expedientes/${e.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                  <p className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{e.caratula || e.numero}</p>
                  <EstadoBadge estado={e.estado_interno} compact />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
