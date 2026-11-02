import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { recordarVolverA } from '@/lib/utils/volver-login'

// Pantalla de permiso del conector de Claude: el usuario decide, con su sesión de la app.

export default function McpAutorizarPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) return setEmail(session.user.email ?? '')
      recordarVolverA(`/mcp/autorizar?${params.toString()}`)
      navigate('/login', { replace: true })
    })
  }, [navigate, params])

  const responder = async (permitir: boolean) => {
    setEnviando(true); setError(null)
    const { data, error: e } = await createClient().functions.invoke('mcp/oauth/autorizar', {
      body: { ...Object.fromEntries(params.entries()), permitir },
    })
    const destino = (data as { redirect?: string } | null)?.redirect
    if (destino) { window.location.href = destino; return }
    const ctx = (e as { context?: unknown } | null)?.context
    const msg = ctx instanceof Response ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null
    setError(msg ?? 'No se pudo completar. Volvé a intentar desde Claude.')
    setEnviando(false)
  }

  if (email === null) return <div className="flex min-h-screen items-center justify-center bg-zinc-950"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-200">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 shrink-0 text-amber-400" />
          <h1 className="text-lg font-semibold text-zinc-50">Conectar Claude con el estudio</h1>
        </div>
        <p className="text-sm text-zinc-400">Claude va a actuar a nombre de <b className="text-zinc-200">{email}</b>.</p>
        <div className="text-sm">
          <p className="font-medium text-zinc-100">Va a poder ver</p>
          <p className="mt-0.5 text-zinc-400">Expedientes, actuaciones del SAE, audiencias, tareas, escritos, clientes, caja si tenés acceso, y la base de normativa y jurisprudencia.</p>
        </div>
        <div className="text-sm">
          <p className="font-medium text-zinc-100">Va a poder crear</p>
          <p className="mt-0.5 text-zinc-400">Borradores de escritos, tareas, audiencias y temas para Editorial.</p>
        </div>
        <div className="text-sm">
          <p className="font-medium text-zinc-100">No va a poder</p>
          <p className="mt-0.5 text-zinc-400">Firmar ni presentar escritos, borrar datos, ver tu clave del SAE ni los documentos que suben los clientes.</p>
        </div>
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-xs text-amber-200">
          Lo que Claude lea pasa a tu cuenta de Claude: son datos de clientes sujetos a secreto profesional. Cada consulta queda en el registro de actividad.
        </p>
        {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { void responder(false) }} disabled={enviando}
            className="min-h-11 flex-1 rounded-xl border border-white/15 text-sm font-medium text-zinc-300 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => { void responder(true) }} disabled={enviando}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Permitir
          </button>
        </div>
      </div>
    </div>
  )
}
