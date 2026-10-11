import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, CheckCircle2, FileUp, Loader2, Lock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Página pública (sin usuario) para que el cliente suba la documentación que le
// pidió el estudio. Funciona con el enlace /subir/<token>. Las fotos se
// convierten a PDF en el celular (varias fotos = un PDF de varias páginas).

interface Item {
  id: string
  nombre: string
  descripcion: string | null
  obligatorio: boolean
  estado: 'pendiente' | 'recibido'
}

interface Info { cliente: string; vence: string; items: Item[] }

const MAX_LADO = 2000

async function imagenesAPdf(imagenes: File[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  let pdf: InstanceType<typeof jsPDF> | null = null
  for (const img of imagenes) {
    const bitmap = await createImageBitmap(img)
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    const orientacion = w > h ? 'landscape' : 'portrait'
    if (!pdf) pdf = new jsPDF({ orientation: orientacion, unit: 'px', format: [w, h] })
    else pdf.addPage([w, h], orientacion)
    pdf.addImage(dataUrl, 'JPEG', 0, 0, w, h)
  }
  return pdf!.output('blob')
}

async function llamar(body: Record<string, unknown>) {
  const { data, error } = await createClient().functions.invoke('documentacion-publica', { body })
  if (error) {
    // supabase-js envuelve el cuerpo del error; se intenta leer el mensaje
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null
    throw new Error(msg ?? 'No se pudo conectar. Probá de nuevo.')
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data
}

function ItemDoc({ item, token, onSubido }: { item: Item; token: string; onSubido: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<'idle' | 'subiendo' | 'ok' | 'error'>(item.estado === 'recibido' ? 'ok' : 'idle')
  const [error, setError] = useState('')

  const subir = async (files: FileList | null) => {
    if (!files?.length) return
    setEstado('subiendo')
    setError('')
    try {
      const lista = Array.from(files)
      const imagenes = lista.filter((f) => f.type.startsWith('image/'))
      const pdfs = lista.filter((f) => f.type === 'application/pdf')
      if (imagenes.length + pdfs.length === 0) throw new Error('Subí fotos o archivos PDF.')

      const archivos: { blob: Blob; nombre: string }[] = []
      if (imagenes.length) archivos.push({ blob: await imagenesAPdf(imagenes), nombre: imagenes.map((f) => f.name).join(', ') })
      for (const p of pdfs) archivos.push({ blob: p, nombre: p.name })

      for (const a of archivos) {
        if (a.blob.size > 25 * 1024 * 1024) throw new Error('El archivo supera los 25 MB. Probá con menos fotos por vez.')
        const { path, upload_token } = await llamar({ accion: 'subir_url', token, item_id: item.id }) as { path: string; upload_token: string }
        const { error: upErr } = await createClient().storage.from('adjuntos')
          .uploadToSignedUrl(path, upload_token, a.blob, { contentType: 'application/pdf' })
        if (upErr) throw new Error('No se pudo subir el archivo. Revisá la conexión y probá de nuevo.')
        await llamar({ accion: 'confirmar', token, item_id: item.id, path, nombre_original: a.nombre })
      }
      setEstado('ok')
      onSubido()
    } catch (e) {
      setEstado('error')
      setError(e instanceof Error ? e.message : 'Algo falló. Probá de nuevo.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {estado === 'ok'
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          : <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-zinc-900">
            {item.nombre}
            {!item.obligatorio && <span className="ml-1 text-xs font-normal text-zinc-500">(si lo tenés)</span>}
          </p>
          {item.descripcion && <p className="mt-0.5 text-sm text-zinc-500">{item.descripcion}</p>}
          {estado === 'ok' && <p className="mt-1 text-sm text-emerald-700">Recibido. ¡Gracias!</p>}
          {estado === 'error' && <p className="mt-1 text-sm text-rose-600">{error}</p>}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => subir(e.target.files)}
      />
      <button
        type="button"
        disabled={estado === 'subiendo'}
        onClick={() => input.current?.click()}
        className={
          estado === 'ok'
            ? 'mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-700 active:bg-zinc-100'
            : 'mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f3a4d] px-3 py-3 text-sm font-semibold text-white active:opacity-90 disabled:opacity-60'
        }
      >
        {estado === 'subiendo'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
          : estado === 'ok' ? 'Subir otro archivo para este documento'
          : <><Camera className="h-4 w-4" /> Sacar foto o elegir archivo</>}
      </button>
    </li>
  )
}

export default function SubirDocumentacionPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  // Documentos recibidos (los que ya estaban + los que se suben ahora)
  const [recibidosIds, setRecibidosIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    document.title = 'Documentación — Estudio Jurídico Dr. Marco Rossi'
    llamar({ accion: 'info', token })
      .then((d) => {
        const i = d as Info
        setInfo(i)
        setRecibidosIds(new Set(i.items.filter((x) => x.estado === 'recibido').map((x) => x.id)))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'El enlace no es válido.'))
      .finally(() => setCargando(false))
  }, [token])

  const total = info?.items.length ?? 0
  const recibidos = recibidosIds.size
  const completo = total > 0 && recibidos >= total

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900" style={{ colorScheme: 'light' }}>
      <header className="bg-[#1f3a4d] px-5 py-5 text-white">
        <p className="text-xs uppercase tracking-widest text-white/70">Estudio Jurídico</p>
        <h1 className="text-lg font-semibold">Dr. Marco Rossi</h1>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5">
        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
        ) : error || !info ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" />
            <p className="mt-2 text-sm text-amber-900">{error || 'El enlace no es válido.'}</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Hola{info.cliente ? `, ${info.cliente}` : ''}</h2>
            <p className="mt-1 text-[15px] text-zinc-600">
              Para avanzar con tu caso necesitamos esta documentación. Podés sacarle una foto con el celular
              (si son varias hojas, elegí todas las fotos juntas) o subir un PDF.
            </p>

            {total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-zinc-600">
                  <span>{completo ? '¡Listo! Recibimos todo.' : `Recibimos ${recibidos} de ${total}`}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? (recibidos / total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {total === 0 ? (
              <p className="mt-6 text-center text-sm text-zinc-500">No hay documentación pendiente. Gracias.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {info.items.map((item) => (
                  <ItemDoc key={item.id} item={item} token={token}
                    onSubido={() => setRecibidosIds((prev) => new Set(prev).add(item.id))} />
                ))}
              </ul>
            )}

            <p className="mt-6 flex items-start gap-2 text-xs text-zinc-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Tus archivos se guardan de forma privada y solo los ve el estudio. Este enlace vence el{' '}
              {new Date(info.vence).toLocaleDateString('es-AR')}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
