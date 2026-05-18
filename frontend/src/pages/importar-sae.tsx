import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { toast } from '@/stores/toast-store'
import {
  useSaeListProceedings,
  useSaeImport,
  type SaeCaseItem,
  type SaeImportCase,
} from '@/hooks/use-sae'
import {
  Loader2,
  ArrowLeft,
  Database,
  CheckSquare,
  Download,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Search,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaseRow extends SaeCaseItem {
  selected: boolean
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'new' | 'imported' | 'error'

export default function ImportarSaePage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<CaseRow[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const listMutation = useSaeListProceedings()
  const importMutation = useSaeImport()

  // ── Derived state ──────────────────────────────────────────────────────────

  const selectableRows = rows.filter(r => !r.ya_importado)
  const selectedRows = selectableRows.filter(r => r.selected)
  const someSelected = selectedRows.length > 0
  const alreadyImportedCount = rows.filter(r => r.ya_importado).length
  const newCount = selectableRows.length
  const errorCount = importMutation.data?.results.filter(r => !r.success).length ?? 0

  // Note: visibleRows is computed below; visibleNewSelected/visibleNewCount
  // are derived after it so the toggleAll button reflects the active filter.

  const visibleRows = (() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (q) {
        const inNumero = r.numero_sae.toLowerCase().includes(q)
        const inCaratula = r.caratula.toLowerCase().includes(q)
        if (!inNumero && !inCaratula) return false
      }
      if (statusFilter === 'new' && r.ya_importado) return false
      if (statusFilter === 'imported' && !r.ya_importado) return false
      if (statusFilter === 'error') {
        const result = importMutation.data?.results.find(res => res.numero_sae === r.numero_sae)
        if (!result || result.success) return false
      }
      return true
    })
  })()
  const filtersActive = search.trim() !== '' || statusFilter !== 'all'
  const visibleNewRows = visibleRows.filter(r => !r.ya_importado)
  const visibleAllSelected = visibleNewRows.length > 0 && visibleNewRows.every(r => r.selected)

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleLoad() {
    listMutation.mutate(undefined, {
      onSuccess: (data) => {
        const loaded = (data.cases ?? []).map(c => ({
          ...c,
          selected: !c.ya_importado,
        }))
        setRows(loaded)
        setHasLoaded(true)
      },
      onError: (err) => {
        toast.error('Error al conectar con SAE', err.message)
        setHasLoaded(false)
      },
    })
  }

  function toggleAll() {
    // Operate only on currently-visible new rows (respects search + status filter)
    const targetProcids = new Set(
      visibleRows.filter(r => !r.ya_importado).map(r => r.procid)
    )
    if (targetProcids.size === 0) return
    const allTargetsSelected = visibleRows
      .filter(r => !r.ya_importado)
      .every(r => r.selected)
    setRows(prev => prev.map(r => {
      if (!targetProcids.has(r.procid) || r.ya_importado) return r
      return { ...r, selected: !allTargetsSelected }
    }))
  }

  function toggleRow(procid: string) {
    setRows(prev =>
      prev.map(r => r.procid === procid && !r.ya_importado ? { ...r, selected: !r.selected } : r)
    )
  }

  function handleImport() {
    const cases: SaeImportCase[] = selectedRows.map(r => ({
      procid: r.procid,
      jurisdictionId: r.jurisdictionId,
      numero_sae: r.numero_sae,
      caratula: r.caratula,
    }))

    importMutation.mutate(cases, {
      onSuccess: (result) => {
        const { exitosos, errores } = result

        // Mark successfully imported cases as ya_importado
        const importedNros = new Set(
          result.results
            .filter(r => r.success)
            .map(r => r.numero_sae)
        )

        setRows(prev =>
          prev.map(r =>
            importedNros.has(r.numero_sae)
              ? { ...r, ya_importado: true, selected: false, expediente_id: result.results.find(res => res.numero_sae === r.numero_sae)?.expediente_id }
              : r
          )
        )

        if (errores === 0) {
          toast.success(
            `${exitosos} expediente${exitosos !== 1 ? 's' : ''} importado${exitosos !== 1 ? 's' : ''}`,
            'La importación se completó exitosamente.'
          )
        } else {
          toast.error(
            `${exitosos} importado${exitosos !== 1 ? 's' : ''}, ${errores} con error`,
            `Revisá los expedientes marcados con error para más detalles.`
          )
        }
      },
      onError: (err) => {
        toast.error('Error en la importación', err.message)
      },
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoading = listMutation.isPending
  const isImporting = importMutation.isPending
  const loadError = listMutation.error

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* ── Breadcrumb ── */}
      <Breadcrumb
        items={[
          { label: 'Expedientes', href: '/expedientes' },
          { label: 'Importar desde SAE' },
        ]}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/expedientes')}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
            title="Volver a expedientes"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/20">
              <Database className="h-4.5 w-4.5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Importar desde SAE</h1>
              <p className="text-xs text-zinc-500">Sistema de Actuación Electrónica — Tucumán</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasLoaded && !isLoading && (
            <button
              onClick={handleLoad}
              disabled={isLoading || isImporting}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          )}
          <button
            onClick={handleLoad}
            disabled={isLoading || isImporting}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-4 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {isLoading ? 'Conectando...' : 'Cargar expedientes SAE'}
          </button>
        </div>
      </div>

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/20">
            <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="font-medium text-zinc-200">Conectando con SAE...</p>
            <p className="mt-1 text-sm text-zinc-500">
              Esto puede tardar unos segundos mientras consultamos todas las jurisdicciones.
            </p>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {!isLoading && loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-red-300">Error al conectar con SAE</p>
              <p className="mt-1 text-sm text-red-400/80 break-words">{loadError.message}</p>
              {loadError.message.includes('credenciales') && (
                <button
                  onClick={() => navigate('/configuracion')}
                  className="mt-3 flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir a Configuración para ingresar credenciales SAE
                </button>
              )}
            </div>
            <button
              onClick={handleLoad}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* ── Empty / prompt state ── */}
      {!isLoading && !loadError && !hasLoaded && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/15">
            <Database className="h-7 w-7 text-cyan-400/60" />
          </div>
          <div>
            <p className="font-medium text-zinc-300">Consultá tus expedientes en SAE</p>
            <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">
              Hacé clic en "Cargar expedientes SAE" para consultar todos tus expedientes en el sistema judicial de Tucumán.
            </p>
          </div>
          <button
            onClick={handleLoad}
            className="flex items-center gap-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-5 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 transition-colors"
          >
            <Database className="h-4 w-4" />
            Cargar expedientes SAE
          </button>
        </div>
      )}

      {/* ── Results table ── */}
      {!isLoading && hasLoaded && !loadError && rows.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                disabled={visibleNewRows.length === 0 || isImporting}
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckSquare className={cn('h-4 w-4', visibleAllSelected ? 'text-cyan-400' : 'text-zinc-500')} />
                {visibleAllSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                {filtersActive && visibleNewRows.length > 0 && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">({visibleNewRows.length})</span>
                )}
              </button>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">·</span>
              <span className="text-sm text-zinc-400">
                <span className="font-medium text-zinc-200">{rows.length}</span> encontrados
                {alreadyImportedCount > 0 && (
                  <span className="text-zinc-500"> ({alreadyImportedCount} ya importados)</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {importMutation.isSuccess && (
                <button
                  onClick={() => navigate('/expedientes')}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver expedientes
                </button>
              )}
              <button
                onClick={handleImport}
                disabled={!someSelected || isImporting}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-4 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isImporting
                  ? 'Importando...'
                  : someSelected
                  ? `Importar ${selectedRows.length} seleccionado${selectedRows.length !== 1 ? 's' : ''}`
                  : 'Importar seleccionados'}
              </button>
            </div>
          </div>

          {/* Search + status filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por número o carátula..."
                className="w-full h-9 rounded-lg border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-zinc-500 hover:text-zinc-300"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                ['all', 'Todos', rows.length],
                ['new', 'Nuevos', newCount],
                ['imported', 'Ya importados', alreadyImportedCount],
                ...(errorCount > 0 ? [['error', 'Con error', errorCount] as [StatusFilter, string, number]] : []),
              ] as [StatusFilter, string, number][]).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    statusFilter === key
                      ? key === 'error'
                        ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  )}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="w-10 px-4 py-3">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Número SAE
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Carátula
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <Search className="h-7 w-7 text-zinc-600 dark:text-zinc-400" />
                          <p className="text-sm text-zinc-400">Ningún expediente coincide con el filtro.</p>
                          {filtersActive && (
                            <button
                              onClick={() => { setSearch(''); setStatusFilter('all') }}
                              className="text-xs text-cyan-400 hover:text-cyan-300"
                            >
                              Limpiar filtros
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map(row => {
                      const importResult = importMutation.data?.results.find(r => r.numero_sae === row.numero_sae)
                      const hasImportError = importResult && !importResult.success

                      return (
                        <tr
                          key={row.procid}
                          onClick={() => !row.ya_importado && !isImporting && toggleRow(row.procid)}
                          className={cn(
                            'transition-colors',
                            row.ya_importado
                              ? 'cursor-default'
                              : isImporting
                              ? 'cursor-default'
                              : 'cursor-pointer hover:bg-white/[0.03]',
                            row.selected && !row.ya_importado && 'bg-cyan-500/[0.04]'
                          )}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={row.ya_importado || isImporting}
                              onChange={() => toggleRow(row.procid)}
                              onClick={e => e.stopPropagation()}
                              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-cyan-500 cursor-pointer disabled:cursor-default"
                            />
                          </td>

                          {/* Número SAE */}
                          <td className={cn('px-4 py-3 font-mono text-xs whitespace-nowrap', row.ya_importado ? 'text-zinc-500' : 'text-zinc-300')}>
                            {row.numero_sae || <span className="text-zinc-600 dark:text-zinc-400 italic">—</span>}
                          </td>

                          {/* Carátula */}
                          <td className={cn('px-4 py-3 max-w-xs', row.ya_importado ? 'text-zinc-500' : 'text-zinc-300')}>
                            <span className="line-clamp-2 leading-snug">
                              {row.caratula || <span className="text-zinc-600 dark:text-zinc-400 italic">Sin carátula</span>}
                            </span>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            {hasImportError ? (
                              <div className="flex flex-col gap-1 max-w-xs">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-medium text-red-400 self-start">
                                  <AlertCircle className="h-3 w-3" />
                                  Error
                                </span>
                                {importResult?.error && (
                                  <span className="text-[11px] text-red-400/80 break-words leading-snug">
                                    {importResult.error}
                                  </span>
                                )}
                              </div>
                            ) : row.ya_importado && row.expediente_id ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/expedientes/${row.expediente_id}`) }}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 transition-colors"
                                title="Ir al expediente importado"
                              >
                                Ver expediente
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : row.ya_importado ? (
                              <span className="inline-flex items-center rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
                                Ya importado
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-medium text-cyan-400">
                                Nuevo
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer hint */}
          {newCount === 0 && !filtersActive && (
            <p className="text-center text-sm text-zinc-500">
              Todos tus expedientes SAE ya están importados.
            </p>
          )}
        </div>
      )}

      {/* ── No results after load ── */}
      {!isLoading && hasLoaded && !loadError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] py-14 text-center">
          <Database className="h-8 w-8 text-zinc-600 dark:text-zinc-400" />
          <div>
            <p className="font-medium text-zinc-400">No se encontraron expedientes en SAE</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              No hay expedientes asociados a tu cuenta en ninguna jurisdicción.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
