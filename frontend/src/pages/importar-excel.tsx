import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Loader2, X, Users, Briefcase, Calendar } from 'lucide-react'
import { parseExcelFile, type ImportPreview } from '@/lib/utils/excel-import'
import { useImportExcel } from '@/hooks/use-import-excel'
import { PageHeader } from '@/components/shared/page-header'

type Step = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportarExcelPage() {
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const { importData, isImporting, progress, result, reset } = useImportExcel()

  const handleFileSelect = useCallback(async (file: File) => {
    setParseError('')
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const data = parseExcelFile(buffer)
      setPreview(data)
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Error al leer el archivo')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleImport = async () => {
    if (!preview) return
    setStep('importing')
    try {
      await importData(preview)
      setStep('done')
    } catch {
      setStep('preview')
    }
  }

  const handleReset = () => {
    setStep('upload')
    setPreview(null)
    setFileName('')
    setParseError('')
    reset()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Importar desde Excel"
        subtitle="Cargá tu planilla de control para sincronizar clientes y expedientes"
      />

      {/* Progress Steps */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {(['upload', 'preview', 'done'] as const).map((s, i) => {
          const labels = ['Subir archivo', 'Revisar datos', 'Completado']
          const isActive = s === step || (s === 'done' && step === 'importing')
          const isDone = (['upload', 'preview', 'done'] as const).indexOf(s) < (['upload', 'preview', 'done'] as const).indexOf(step === 'importing' ? 'done' : step)
          return (
            <div key={s} className="flex shrink-0 items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isDone || isActive ? 'bg-[var(--brand-accent)]' : 'bg-zinc-200 dark:bg-white/10'}`} />}
              <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${isActive ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white dark:border-white dark:bg-white dark:text-[#1c2633]' : isDone ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400'}`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/20 text-[10px]">{i + 1}</span>}
                {labels[i]}
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className="app-card border-2 border-dashed p-8 text-center transition-colors hover:!border-[var(--brand-accent)] sm:p-12"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className="mx-auto h-16 w-16 text-emerald-500/60" />
          <h3 className="mt-4 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Arrastrá tu archivo Excel aquí
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            o hacé clic para seleccionarlo
          </p>
          <label className="btn btn-primary mt-6 cursor-pointer px-6">
            <Upload className="h-4 w-4" />
            Seleccionar archivo .xlsx
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />
          </label>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Compatible con la Planilla de Control del estudio (.xlsx)
          </p>

          {parseError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* File info */}
          <div className="app-card flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-500" />
              <div>
                <p className="break-all text-sm font-bold text-zinc-900 dark:text-white">{fileName}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Hojas procesadas: {preview.stats.hojasProcesadas.join(', ')}
                </p>
              </div>
            </div>
            <button onClick={handleReset} aria-label="Quitar archivo" className="btn btn-ghost btn-icon shrink-0 border-transparent">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="app-card p-4">
              <div className="flex items-center gap-2 text-[var(--brand-accent)]">
                <Users className="h-5 w-5" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Clientes</span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{preview.stats.totalClientes}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">únicos por DNI</p>
            </div>
            <div className="app-card p-4">
              <div className="flex items-center gap-2 text-[var(--brand-accent)]">
                <Briefcase className="h-5 w-5" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Expedientes</span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{preview.stats.totalExpedientes}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">de todas las hojas</p>
            </div>
            <div className="app-card p-4">
              <div className="flex items-center gap-2 text-[var(--brand-accent)]">
                <Calendar className="h-5 w-5" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">Turnos</span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{preview.stats.totalTurnos}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">históricos</p>
            </div>
          </div>

          {/* Expedientes by estado */}
          <div className="app-card p-4 sm:p-5">
            <h3 className="mb-3 text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Expedientes por estado</h3>
            <div className="space-y-2">
              {Object.entries(
                preview.expedientes.reduce((acc, e) => {
                  acc[e.estado_interno] = (acc[e.estado_interno] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).map(([estado, count]) => {
                const labels: Record<string, string> = {
                  'NUEVA_CONSULTA': 'Nueva consulta',
                  'PARA_INICIAR': 'Para iniciar',
                  'INICIADO': 'Iniciados',
                  'PRUEBA': 'Prueba',
                  'ALEGATOS': 'Alegatos',
                  'SENTENCIA': 'Sentencia',
                  'APELACION': 'Apelación',
                  'CORTE': 'Corte',
                  'FINALIZADO': 'Finalizados',
                  'NO_VIABLE_RECHAZADO': 'No viable / rechazado',
                  'PAUSADO': 'Pausado',
                }
                const colors: Record<string, string> = {
                  'NUEVA_CONSULTA': 'bg-slate-400',
                  'PARA_INICIAR': 'bg-cyan-400',
                  'INICIADO': 'bg-blue-400',
                  'PRUEBA': 'bg-indigo-400',
                  'ALEGATOS': 'bg-violet-400',
                  'SENTENCIA': 'bg-cyan-400',
                  'APELACION': 'bg-orange-400',
                  'CORTE': 'bg-rose-400',
                  'FINALIZADO': 'bg-emerald-400',
                  'NO_VIABLE_RECHAZADO': 'bg-red-400',
                  'PAUSADO': 'bg-zinc-400',
                }
                return (
                  <div key={estado} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${colors[estado] || 'bg-slate-400'}`} />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{labels[estado] || estado}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview table — first 10 clientes */}
          <div className="app-card">
            <div className="border-b border-zinc-100 px-4 py-3.5 dark:border-white/[0.06]">
              <h3 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Vista previa de clientes (primeros 10)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-white/[0.03]">
                  <tr className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-2">Apellido</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">DNI</th>
                    <th className="px-4 py-2">CUIL</th>
                    <th className="px-4 py-2">Teléfono</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                  {preview.clientes.slice(0, 10).map((c, i) => (
                    <tr key={i} className="text-zinc-700 dark:text-zinc-300">
                      <td className="px-4 py-2">{c.apellido}</td>
                      <td className="px-4 py-2">{c.nombre}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{c.dni}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{c.cuil || '-'}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{c.telefono || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Errors */}
          {preview.stats.errores.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                {preview.stats.errores.length} advertencia(s)
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-800/80 dark:text-amber-300/80">
                {preview.stats.errores.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Info box */}
          <div className="dashboard-panel-muted p-4 text-sm text-zinc-700 dark:text-zinc-300">
            <p className="font-bold text-zinc-900 dark:text-white">¿Cómo funciona la importación?</p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <li>• Los clientes existentes (mismo DNI) se actualizan con datos faltantes</li>
              <li>• Los clientes nuevos se crean automáticamente</li>
              <li>• Los expedientes se buscan por cliente + tipo + estado para evitar duplicados</li>
              <li>• Los turnos se vinculan al expediente activo del cliente</li>
              <li>• Los datos existentes NO se borran ni sobreescriben</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={handleReset}
              className="btn btn-ghost border-transparent"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </button>
            <button
              onClick={handleImport}
              className="btn btn-primary whitespace-normal px-5 text-left"
            >
              Importar {preview.stats.totalClientes} clientes, {preview.stats.totalExpedientes} expedientes{preview.stats.totalTurnos > 0 ? ` y ${preview.stats.totalTurnos} turnos` : ''}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="app-card p-8 text-center sm:p-12">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--brand-accent)]" />
          <h3 className="mt-4 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">{progress.step}</h3>
          {progress.total > 0 && (
            <>
              <div className="mx-auto mt-4 h-2 w-64 max-w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-300"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                {progress.current} / {progress.total}
              </p>
            </>
          )}
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            No cierres esta página
          </p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="app-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="mt-4 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Importación completada</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="app-card p-4 text-center">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">{result.clientesCreados}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">clientes creados</p>
            </div>
            <div className="app-card p-4 text-center">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{result.clientesActualizados}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">clientes actualizados</p>
            </div>
            <div className="app-card p-4 text-center">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{result.expedientesCreados}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">expedientes creados</p>
            </div>
            <div className="app-card p-4 text-center">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{result.expedientesActualizados}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">expedientes actualizados</p>
            </div>
            <div className="app-card p-4 text-center">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{result.turnosCreados}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">turnos importados</p>
            </div>
          </div>

          {result.errores.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                {result.errores.length} error(es) durante la importación
              </h3>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-800/80 dark:text-amber-300/80">
                {result.errores.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleReset}
              className="btn btn-ghost"
            >
              Importar otro archivo
            </button>
            <a
              href="/expedientes"
              className="btn btn-primary px-6"
            >
              Ver expedientes
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
