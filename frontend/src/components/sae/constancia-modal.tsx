import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, FileCheck2, Loader2 } from 'lucide-react'
import { useSaeNotifConstancia } from '@/hooks/use-sae-notificaciones'
import { useAuthStore } from '@/stores/auth-store'

function fmtDateLong(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

export function ConstanciaModal({
  notifId,
  onClose,
}: {
  notifId: string
  onClose: () => void
}) {
  const { data, isLoading } = useSaeNotifConstancia(notifId)
  const profile = useAuthStore((s) => s.profile)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const handlePrint = () => {
    window.print()
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm print:bg-white print:p-0 print:items-start">
      <div className="relative w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 print:bg-white print:text-black print:border-0 print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
        {/* Header (oculto al imprimir) */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/95 backdrop-blur px-3 sm:px-5 py-2.5 sm:py-3 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">Constancia de visualización</h2>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handlePrint}
              disabled={!data || isLoading}
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg bg-emerald-500/15 px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="h-3 w-3" />
              <span className="hidden sm:inline">Imprimir / PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 print:px-12 print:py-10 text-sm text-zinc-200 print:text-zinc-900 leading-relaxed">
          <header className="mb-6 pb-4 border-b border-white/10 print:border-zinc-300">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 print:text-zinc-600">MR Abogado System</p>
            <h1 className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-100 print:text-zinc-900">
              Constancia de toma de conocimiento de notificación digital
            </h1>
            <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
              Portal SAE — Poder Judicial de Tucumán
            </p>
          </header>

          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando constancia…
            </div>
          ) : !data ? (
            <p className="text-zinc-500">
              No hay constancia registrada para esta notificación. Marcala como leída
              para generar el respaldo procesal.
            </p>
          ) : (
            <>
              <section className="mb-6">
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-2">
                  Profesional usuario
                </h2>
                <p className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">
                  {profile ? `${profile.nombre} ${profile.apellido}` : '—'}
                </p>
                {profile?.email && (
                  <p className="text-xs text-zinc-500 print:text-zinc-600">{profile.email}</p>
                )}
              </section>

              <section className="mb-6">
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-2">
                  Fecha y hora de visualización
                </h2>
                <p className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900 font-medium">
                  {fmtDateLong(data.viewed_at)}
                </p>
                {data.timezone && (
                  <p className="text-xs text-zinc-500 print:text-zinc-600">
                    Zona horaria del dispositivo: {data.timezone}
                  </p>
                )}
              </section>

              <section className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 print:grid-cols-2">
                <div>
                  <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-1">
                    IP de origen
                  </h2>
                  <p className="font-mono text-xs text-zinc-900 dark:text-zinc-100 print:text-zinc-900 break-all">
                    {data.ip ?? '—'}
                  </p>
                </div>
                <div>
                  <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-1">
                    Visualizaciones registradas
                  </h2>
                  <p className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">{data.total_views}</p>
                </div>
              </section>

              {data.user_agent && (
                <section className="mb-6">
                  <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-1">
                    Dispositivo / navegador
                  </h2>
                  <p className="text-xs font-mono text-zinc-300 print:text-zinc-700 break-all">
                    {data.user_agent}
                  </p>
                </section>
              )}

              <section className="mb-6">
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 print:text-zinc-700 mb-2">
                  Contenido de la notificación al momento de la visualización
                </h2>
                <div className="rounded-lg border border-white/10 print:border-zinc-300 px-4 py-3 bg-white/[0.02] print:bg-zinc-50">
                  {(() => {
                    const snap = data.notif_snapshot as Record<string, string | null>
                    return (
                      <dl className="space-y-1.5 text-xs">
                        {snap.tipo && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Tipo:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900 font-medium">{snap.tipo}</dd>
                          </div>
                        )}
                        {snap.numero_expediente && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Expediente:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900 font-mono">{snap.numero_expediente}</dd>
                          </div>
                        )}
                        {snap.caratula && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Carátula:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">{snap.caratula}</dd>
                          </div>
                        )}
                        {snap.titulo && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Asunto:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">{snap.titulo}</dd>
                          </div>
                        )}
                        {snap.oficina && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Oficina:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">{snap.oficina}</dd>
                          </div>
                        )}
                        {snap.fecha_emision && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Fecha emisión:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">
                              {new Date(snap.fecha_emision).toLocaleString('es-AR')}
                            </dd>
                          </div>
                        )}
                        {snap.fecha_captura && (
                          <div className="flex gap-2">
                            <dt className="text-zinc-500 print:text-zinc-600 w-24 sm:w-32 shrink-0">Captura del portal:</dt>
                            <dd className="text-zinc-900 dark:text-zinc-100 print:text-zinc-900">
                              {new Date(snap.fecha_captura).toLocaleString('es-AR')}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )
                  })()}
                </div>
              </section>

              <footer className="mt-8 pt-4 border-t border-white/10 print:border-zinc-300 text-[10px] text-zinc-500 print:text-zinc-600 leading-relaxed">
                <p>
                  Este registro fue generado de forma automática por el sistema de gestión
                  MR Abogado al momento en que el profesional usuario marcó la notificación
                  como leída. La marca temporal y datos técnicos asociados se almacenan en
                  formato append-only y no pueden ser modificados con posterioridad. Identificador
                  interno de la constancia: <span className="font-mono break-all">{data.view_id}</span>.
                </p>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
