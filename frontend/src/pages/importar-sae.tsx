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
  const existingStudyCount = rows.filter(r => !r.ya_importado && r.ya_existe_en_estudio).length
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
              ? { ...r, ya_importado: true, vinculado_a_mi: true, selected: false, expediente_id: result.results.find(res => res.numero_sae === r.numero_sae)?.expediente_id }
              : r
          )
        )

        if (errores === 0) {
          toast.success(
            `${exitosos} expediente${exitosos !== 1 ? 's' : ''} importado${exitosos !== 1 ? 's' : ''}/vinculado${exitosos !== 1 ? 's' : ''}`,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/expedientes')}
            className="btn btn-ghost btn-icon shrink-0"
            title="Volver a expedientes"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="page-title">Importar desde SAE</h1>
            <p className="page-subtitle">Sistema de Actuación Electrónica — Tucumán</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasLoaded && !isLoading && (
            <button
              onClick={handleLoad}
              disabled={isLoading || isImporting}
              className="btn btn-ghost"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          )}
          <button
            onClick={handleLoad}
            disabled={isLoading || isImporting}
            className="btn btn-primary"
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
        <div className="app-card flex flex-col items-center justify-center gap-4 px-4 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-700 dark:text-cyan-300" />
          </div>
          <div className="text-center">
            <p className="font-bold text-zinc-900 dark:text-white">Conectando con SAE...</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Esto puede tardar unos segundos mientras consultamos todas las jurisdicciones.
            </p>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {!isLoading && loadError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-700 dark:text-red-300">Error al conectar con SAE</p>
              <p className="mt-1 break-words text-sm text-red-700/80 dark:text-red-400/80">{loadError.message}</p>
              {loadError.message.includes('credenciales') && (
                <button
                  onClick={() => navigate('/configuracion')}
                  className="dashboard-link mt-3 flex items-center gap-1.5 text-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir a Configuración para ingresar credenciales SAE
                </button>
              )}
            </div>
            <button
              onClick={handleLoad}
              className="btn btn-sm shrink-0 border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* ── Empty / prompt state ── */}
      {!isLoading && !loadError && !hasLoaded && (
        <div className="app-card flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
            <Database className="h-7 w-7 text-cyan-700 dark:text-cyan-300" />
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Consultá tus expedientes en SAE</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              Hacé clic en "Cargar expedientes SAE" para consultar todos tus expedientes en el sistema judicial de Tucumán.
            </p>
          </div>
          <button
            onClick={handleLoad}
            className="btn btn-primary px-5"
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={toggleAll}
                disabled={visibleNewRows.length === 0 || isImporting}
                className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white"
              >
                <CheckSquare className={cn('h-4 w-4', visibleAllSelected ? 'text-[var(--brand-accent)]' : 'text-zinc-500 dark:text-zinc-400')} />
                {visibleAllSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                {filtersActive && visibleNewRows.length > 0 && (
                  <span className="text-xs tabular-nums text-zinc-500">({visibleNewRows.length})</span>
                )}
              </button>
              <span className="text-xs text-zinc-400 dark:text-zinc-600" aria-hidden>·</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{rows.length}</span> encontrados
                {alreadyImportedCount > 0 && (
                  <span className="text-zinc-500 dark:text-zinc-400"> ({alreadyImportedCount} ya importados)</span>
                )}
                {existingStudyCount > 0 && (
                  <span className="text-zinc-500 dark:text-zinc-400"> · {existingStudyCount} ya existen en el estudio</span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {importMutation.isSuccess && (
                <button
                  onClick={() => navigate('/expedientes')}
                  className="btn btn-ghost"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver expedientes
                </button>
              )}
              <button
                onClick={handleImport}
                disabled={!someSelected || isImporting}
                className="btn btn-primary"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isImporting
                  ? 'Importando...'
                  : someSelected
                  ? `Importar/vincular ${selectedRows.length} seleccionado${selectedRows.length !== 1 ? 's' : ''}`
                  : 'Importar/vincular seleccionados'}
              </button>
            </div>
          </div>

          {/* Search + status filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por número o carátula..."
                className="field h-11 pl-10 pr-10"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                ['all', 'Todos', rows.length],
                ['new', 'Nuevos / por vincular', newCount],
                ['imported', 'Ya importados', alreadyImportedCount],
                ...(errorCount > 0 ? [['error', 'Con error', errorCount] as [StatusFilter, string, number]] : []),
              ] as [StatusFilter, string, number][]).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  aria-pressed={statusFilter === key}
                  className="chip"
                >
                  {key === 'error' && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  {label} <span className="chip-count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="app-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <th className="w-10 px-4 py-3">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Número SAE
                    </th>
                    <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Carátula
                    </th>
                    <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <Search className="h-7 w-7 text-zinc-400 dark:text-zinc-600" />
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">Ningún expediente coincide con el filtro.</p>
                          {filtersActive && (
                            <button
                              onClick={() => { setSearch(''); setStatusFilter('all') }}
                              className="dashboard-link text-xs"
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
                              : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]',
                            row.selected && !row.ya_importado && 'bg-cyan-500/[0.06]'
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
                              className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-[var(--brand-accent)] disabled:cursor-default dark:border-white/20"
                            />
                          </td>

                          {/* Número SAE */}
                          <td className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold tabular-nums', row.ya_importado ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-200')}>
                            {row.numero_sae || <span className="italic text-zinc-400 dark:text-zinc-500">—</span>}
                          </td>

                          {/* Carátula */}
                          <td className={cn('max-w-xs px-4 py-3', row.ya_importado ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-200')}>
                            <span className="line-clamp-2 leading-snug">
                              {row.caratula || <span className="italic text-zinc-400 dark:text-zinc-500">Sin carátula</span>}
                            </span>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            {hasImportError ? (
                              <div className="flex flex-col gap-1 max-w-xs">
                                <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold gap-1 self-start border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">
                                  <AlertCircle className="h-3 w-3" />
                                  Error
                                </span>
                                {importResult?.error && (
                                  <span className="break-words text-[11px] leading-snug text-red-700/80 dark:text-red-400/80">
                                    {importResult.error}
                                  </span>
                                )}
                              </div>
                            ) : row.ya_importado && row.expediente_id ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/expedientes/${row.expediente_id}`) }}
                                className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                                title="Ir al expediente importado"
                              >
                                Ver expediente
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : row.ya_importado ? (
                              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                                Ya importado
                              </span>
                            ) : row.ya_existe_en_estudio ? (
                              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                Existe en estudio · vincular
                              </span>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
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
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Todos tus expedientes SAE ya están importados.
            </p>
          )}
        </div>
      )}

      {/* ── No results after load ── */}
      {!isLoading && hasLoaded && !loadError && rows.length === 0 && (
        <div className="app-card flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
          <Database className="h-8 w-8 text-zinc-400 dark:text-zinc-600" />
          <div>
            <p className="font-bold text-zinc-900 dark:text-white">No se encontraron expedientes en SAE</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              No hay expedientes asociados a tu cuenta en ninguna jurisdicción.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
