import { CheckCircle2, CircleHelp, ExternalLink, Loader2, SearchCheck, XCircle } from 'lucide-react'
import type { CitaVerificada } from '@/hooks/use-editorial'
import { cn } from '@/lib/utils'

// Resultado de cruzar las citas del artículo con la base de normativa y
// jurisprudencia del estudio. "No encontrada" no significa que esté mal:
// significa que no está cargada en la base y hay que verificarla a mano.

const ESTADO = {
  encontrada: { icon: CheckCircle2, label: 'En la base', cls: 'text-emerald-600 dark:text-emerald-400' },
  no_encontrada: { icon: XCircle, label: 'No está en la base', cls: 'text-rose-600 dark:text-rose-400' },
  manual: { icon: CircleHelp, label: 'Verificar a mano', cls: 'text-amber-600 dark:text-amber-400' },
} as const

export function VerificacionCitas({ citas, verificadoAt, desactualizada, pidiendo, onVerificar }: {
  citas: CitaVerificada[]
  verificadoAt: string | null
  desactualizada: boolean
  pidiendo: boolean
  onVerificar: () => void
}) {
  const n = (e: CitaVerificada['estado']) => citas.filter((c) => c.estado === e).length
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Citas contra tu base</p>
        <button type="button" onClick={onVerificar} disabled={pidiendo}
          className="flex items-center gap-1 text-xs text-[var(--brand-accent)] hover:underline disabled:opacity-50 dark:text-[var(--brand-ice)]">
          {pidiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <SearchCheck className="h-3 w-3" />}
          {verificadoAt ? 'Volver a verificar' : 'Verificar'}
        </button>
      </div>
      {!verificadoAt ? (
        <p className="text-xs text-zinc-500">Cruza cada norma y fallo citado con tu base de normativa y jurisprudencia.</p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            {n('encontrada')} en la base · {n('no_encontrada')} no encontradas · {n('manual')} a mano
            {desactualizada && <span className="text-amber-600 dark:text-amber-400"> · el texto cambió después de verificar</span>}
          </p>
          <ul className="space-y-1.5">
            {citas.map((c, i) => {
              const e = ESTADO[c.estado] ?? ESTADO.manual
              return (
                <li key={i} className="flex gap-1.5 text-xs">
                  <e.icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', e.cls)} />
                  <div className="min-w-0">
                    <p className="text-zinc-700 dark:text-zinc-300">{c.entrada}</p>
                    {c.documento && (
                      <p className="text-zinc-500">
                        → {c.documento.titulo}
                        {c.documento.url && <a href={c.documento.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center"><ExternalLink className="h-3 w-3" /></a>}
                      </p>
                    )}
                    {c.nota && <p className={cn(e.cls)}>{c.nota}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
