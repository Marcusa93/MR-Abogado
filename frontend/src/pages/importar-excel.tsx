import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Loader2, X, Users, Briefcase, Calendar } from 'lucide-react'
import { parseExcelFile, type ImportPreview } from '@/lib/utils/excel-import'
import { useImportExcel } from '@/hooks/use-import-excel'

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
      <div>
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-400">
          Importar desde Excel
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Cargá tu planilla de control para sincronizar clientes y expedientes
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {(['upload', 'preview', 'done'] as const).map((s, i) => {
          const labels = ['Subir archivo', 'Revisar datos', 'Completado']
          const isActive = s === step || (s === 'done' && step === 'importing')
          const isDone = (['upload', 'preview', 'done'] as const).indexOf(s) < (['upload', 'preview', 'done'] as const).indexOf(step === 'importing' ? 'done' : step)
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isDone || isActive ? 'bg-amber-500' : 'bg-white/10'}`} />}
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-amber-500/20 text-amber-400' : isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-zinc-700 dark:text-zinc-300'}`}>
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
          className="glass-card rounded-xl border-2 border-dashed border-white/10 p-12 text-center transition-colors hover:border-amber-500/30"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className="mx-auto h-16 w-16 text-emerald-400/50" />
          <h3 className="mt-4 text-lg font-medium text-zinc-800 dark:text-zinc-200">
            Arrastrá tu archivo Excel aquí
          </h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            o hacé clic para seleccionarlo
          </p>
          <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-amber-500/20 px-6 py-3 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/30">
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
          <p className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
            Compatible con la Planilla de Control del estudio (.xlsx)
          </p>

          {parseError && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
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
          <div className="glass-card rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{fileName}</p>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                  Hojas procesadas: {preview.stats.hojasProcesadas.join(', ')}
                </p>
              </div>
            </div>
            <button onClick={handleReset} className="rounded-lg p-2 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 text-violet-400">
                <Users className="h-5 w-5" />
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Clientes</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{preview.stats.totalClientes}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">únicos por DNI</p>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Briefcase className="h-5 w-5" />
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Expedientes</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{preview.stats.totalExpedientes}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">de todas las hojas</p>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Calendar className="h-5 w-5" />
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Turnos</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{preview.stats.totalTurnos}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">históricos</p>
            </div>
          </div>

          {/* Expedientes by estado */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Expedientes por estado</h3>
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
                  'PARA_INICIAR': 'bg-amber-400',
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
                    <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview table — first 10 clientes */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Vista previa de clientes (primeros 10)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5">
                  <tr className="text-xs text-zinc-700 dark:text-zinc-300 uppercase">
                    <th className="px-4 py-2">Apellido</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">DNI</th>
                    <th className="px-4 py-2">CUIL</th>
                    <th className="px-4 py-2">Teléfono</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {preview.clientes.slice(0, 10).map((c, i) => (
                    <tr key={i} className="text-zinc-700 dark:text-zinc-300">
                      <td className="px-4 py-2">{c.apellido}</td>
                      <td className="px-4 py-2">{c.nombre}</td>
                      <td className="px-4 py-2 font-mono text-xs">{c.dni}</td>
                      <td className="px-4 py-2 font-mono text-xs">{c.cuil || '-'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{c.telefono || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Errors */}
          {preview.stats.errores.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {preview.stats.errores.length} advertencia(s)
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-300/80">
                {preview.stats.errores.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Info box */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-300">
            <p className="font-medium">¿Cómo funciona la importación?</p>
            <ul className="mt-2 space-y-1 text-xs text-amber-300/70">
              <li>• Los clientes existentes (mismo DNI) se actualizan con datos faltantes</li>
              <li>• Los clientes nuevos se crean automáticamente</li>
              <li>• Los expedientes se buscan por cliente + tipo + estado para evitar duplicados</li>
              <li>• Los turnos se vinculan al expediente activo del cliente</li>
              <li>• Los datos existentes NO se borran ni sobreescriben</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/15 transition-all hover:shadow-amber-500/30"
            >
              Importar {preview.stats.totalClientes} clientes, {preview.stats.totalExpedientes} expedientes{preview.stats.totalTurnos > 0 ? ` y ${preview.stats.totalTurnos} turnos` : ''}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-amber-400" />
          <h3 className="mt-4 text-lg font-medium text-zinc-800 dark:text-zinc-200">{progress.step}</h3>
          {progress.total > 0 && (
            <>
              <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {progress.current} / {progress.total}
              </p>
            </>
          )}
          <p className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
            No cierres esta página
          </p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" />
            <h3 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">Importación completada</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{result.clientesCreados}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">clientes creados</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{result.clientesActualizados}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">clientes actualizados</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-violet-400">{result.expedientesCreados}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">expedientes creados</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{result.expedientesActualizados}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">expedientes actualizados</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-rose-400">{result.turnosCreados}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">turnos importados</p>
            </div>
          </div>

          {result.errores.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {result.errores.length} error(es) durante la importación
              </h3>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-amber-300/80">
                {result.errores.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-white/5"
            >
              Importar otro archivo
            </button>
            <a
              href="/expedientes"
              className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-6 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/30"
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
