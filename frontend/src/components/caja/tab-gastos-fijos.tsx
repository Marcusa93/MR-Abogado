import { useState } from 'react'
import { TrendingDown, Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  useGastosFijos, useToggleGastoFijo, useDeleteGastoFijo, useCreateGasto,
  GASTO_CATEGORIAS,
  type GastoFijo, type GastoFijoPendiente,
} from '@/hooks/use-caja'
import { useAuth } from '@/hooks/use-auth'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import { fmt } from './caja-dialogs'

const CATEGORIA_GASTO_LABEL: Record<string, string> = Object.fromEntries(GASTO_CATEGORIAS.map(c => [c.value, c.label]))

// ─── GastosFijosCard ──────────────────────────────────────────────────────────

export function GastosFijosCard({ gastosFijos }: { gastosFijos: GastoFijoPendiente[] }) {
  const pendientes = gastosFijos.filter(g => g.estado === 'pendiente')
  const registrados = gastosFijos.filter(g => g.estado === 'registrado')

  return (
    <div className={cn(
      'rounded-xl border p-4',
      pendientes.length > 0
        ? 'border-orange-500/30 bg-orange-500/[0.04]'
        : 'border-emerald-500/30 bg-emerald-500/[0.04]'
    )}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {pendientes.length > 0
            ? <TrendingDown className="h-4 w-4 text-orange-400" />
            : <TrendingDown className="h-4 w-4 text-emerald-400" />
          }
          <h3 className="text-sm font-semibold text-zinc-100">Gastos fijos del mes</h3>
          <span className="text-[10px] text-zinc-500">
            {registrados.length} de {gastosFijos.length} registrados
          </span>
        </div>
        {pendientes.length > 0 && (
          <span className="text-[11px] font-medium text-orange-300">
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {gastosFijos.map((g) => (
          <GastoFijoPendienteRow key={g.gasto_fijo_id} gasto={g} />
        ))}
      </div>
    </div>
  )
}

// ─── GastoFijoPendienteRow ────────────────────────────────────────────────────

export function GastoFijoPendienteRow({ gasto }: { gasto: GastoFijoPendiente }) {
  const { user } = useAuth()
  const createGasto = useCreateGasto()

  const handleRegistrar = async () => {
    if (!user?.id) return
    try {
      await createGasto.mutateAsync({
        fecha: new Date().toISOString().slice(0, 10),
        monto: gasto.monto,
        moneda: gasto.moneda,
        categoria: gasto.categoria,
        expediente_id: null,
        gasto_fijo_id: gasto.gasto_fijo_id,
        descripcion: gasto.descripcion,
        comprobante_path: null,
        recuperable: false,
        cargado_por: user.id,
      })
      toast.success(`Registrado: ${gasto.descripcion}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar')
    }
  }

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md border border-white/5 px-3 py-2',
      gasto.estado === 'registrado' ? 'opacity-60' : 'bg-white/[0.02]'
    )}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 truncate">{gasto.descripcion}</p>
        <p className="text-[11px] text-zinc-500">{CATEGORIA_GASTO_LABEL[gasto.categoria] ?? gasto.categoria}</p>
      </div>
      <span className="text-sm font-semibold text-zinc-100 tabular-nums shrink-0">
        {fmt(Number(gasto.monto), gasto.moneda)}
      </span>
      {gasto.estado === 'registrado' ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 shrink-0">
          ✓ Registrado
        </span>
      ) : (
        <button
          onClick={handleRegistrar}
          disabled={createGasto.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-2 py-1 text-[11px] font-medium text-orange-300 hover:bg-orange-500/25 transition-colors disabled:opacity-50 shrink-0"
        >
          {createGasto.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Registrar
        </button>
      )}
    </div>
  )
}

// ─── TabGastosFijos ───────────────────────────────────────────────────────────

export function TabGastosFijos({ onEdit }: { onEdit: (gf: GastoFijo) => void }) {
  const { data: gastosFijos = [], isLoading } = useGastosFijos()
  const toggle = useToggleGastoFijo()
  const deleteGastoFijo = useDeleteGastoFijo()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )

  if (gastosFijos.length === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="Sin gastos fijos"
        description="Cargá los gastos recurrentes del estudio (alquiler, sueldos, servicios) y el sistema te va a recordar registrarlos cada mes."
      />
    )
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {gastosFijos.map((gf) => (
          <div key={gf.id} className={cn('rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5', !gf.activo && 'opacity-50')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 truncate">{gf.descripcion}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {CATEGORIA_GASTO_LABEL[gf.categoria] ?? gf.categoria}
                  {' · '}desde {formatDate(gf.fecha_inicio)}
                  {gf.fecha_fin && <> · hasta {formatDate(gf.fecha_fin)}</>}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-sm font-semibold text-zinc-100 tabular-nums">{fmt(Number(gf.monto), gf.moneda )}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle.mutate({ id: gf.id, activo: !gf.activo })}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      gf.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                    )}
                  >
                    {gf.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => onEdit(gf)} className="rounded p-1 text-zinc-500 hover:text-cyan-400">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(gf.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2">Descripción</th>
              <th className="text-left px-3 py-2">Categoría</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Vigencia</th>
              <th className="text-center px-3 py-2">Estado</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {gastosFijos.map((gf) => (
              <tr key={gf.id} className={cn('hover:bg-white/[0.02]', !gf.activo && 'opacity-50')}>
                <td className="px-3 py-2 font-medium text-zinc-100">{gf.descripcion}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                    {CATEGORIA_GASTO_LABEL[gf.categoria] ?? gf.categoria}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-zinc-100 tabular-nums">{fmt(Number(gf.monto), gf.moneda )}</td>
                <td className="px-3 py-2 text-zinc-400 text-[11px]">
                  Desde {formatDate(gf.fecha_inicio)}
                  {gf.fecha_fin && <> · hasta {formatDate(gf.fecha_fin)}</>}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggle.mutate({ id: gf.id, activo: !gf.activo })}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      gf.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'
                    )}
                  >
                    {gf.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEdit(gf)} className="rounded p-1 text-zinc-500 hover:text-cyan-400" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(gf.id)} className="rounded p-1 text-zinc-500 hover:text-rose-400" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          try { await deleteGastoFijo.mutateAsync(confirmDelete); toast.success('Gasto fijo eliminado') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
          setConfirmDelete(null)
        }}
        title="Eliminar gasto fijo"
        description="¿Seguro que querés eliminar este gasto fijo? Los gastos ya registrados no se modifican."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </>
  )
}
