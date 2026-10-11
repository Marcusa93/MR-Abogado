import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Visor de markdown liviano (títulos, párrafos, listas, negrita, cursiva,
// citas). Resalta las marcas [VERIFICAR: …] para la revisión editorial.
// Arma elementos de React: nunca inyecta HTML.

function inline(texto: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\[VERIFICAR:[^\]]*\]|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index))
    const t = m[0]
    const k = `${keyBase}-${i++}`
    if (t.startsWith('[VERIFICAR')) {
      out.push(<mark key={k} className="rounded bg-amber-300/40 px-0.5 text-amber-900 dark:bg-amber-400/25 dark:text-amber-200" title="Afirmación a verificar antes de aprobar">{t}</mark>)
    } else if (t.startsWith('**')) {
      out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    } else {
      out.push(<em key={k}>{t.slice(1, -1)}</em>)
    }
    ultimo = m.index + t.length
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo))
  return out
}

export function MarkdownView({ texto, className }: { texto: string; className?: string }) {
  const lineas = (texto ?? '').replace(/\r\n/g, '\n').split('\n')
  const bloques: ReactNode[] = []
  let parrafo: string[] = []
  let lista: { ordenada: boolean; items: string[] } | null = null

  const cerrarParrafo = () => {
    if (parrafo.length) {
      const k = `p${bloques.length}`
      bloques.push(<p key={k} className="leading-relaxed">{inline(parrafo.join(' '), k)}</p>)
      parrafo = []
    }
  }
  const cerrarLista = () => {
    if (lista) {
      const k = `l${bloques.length}`
      const items = lista.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>)
      bloques.push(lista.ordenada
        ? <ol key={k} className="ml-5 list-decimal space-y-1">{items}</ol>
        : <ul key={k} className="ml-5 list-disc space-y-1">{items}</ul>)
      lista = null
    }
  }

  for (const linea of lineas) {
    const l = linea.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l)
    if (!l.trim()) { cerrarParrafo(); cerrarLista(); continue }
    if (h) {
      cerrarParrafo(); cerrarLista()
      const nivel = h[1].length
      const k = `h${bloques.length}`
      bloques.push(
        <p key={k} className={cn('font-semibold text-zinc-900 dark:text-zinc-50', nivel === 1 ? 'text-xl' : nivel === 2 ? 'text-lg' : 'text-base')}>
          {inline(h[2], k)}
        </p>,
      )
    } else if (ul || ol) {
      cerrarParrafo()
      const ordenada = !!ol
      if (!lista || lista.ordenada !== ordenada) { cerrarLista(); lista = { ordenada, items: [] } }
      lista.items.push((ul ?? ol)![1])
    } else if (l.startsWith('>')) {
      cerrarParrafo(); cerrarLista()
      const k = `q${bloques.length}`
      bloques.push(<blockquote key={k} className="border-l-2 border-zinc-300 pl-3 italic text-zinc-600 dark:border-white/20 dark:text-zinc-300">{inline(l.replace(/^>\s?/, ''), k)}</blockquote>)
    } else {
      cerrarLista()
      parrafo.push(l.trim())
    }
  }
  cerrarParrafo(); cerrarLista()

  return <div className={cn('space-y-3 text-[15px] text-zinc-800 dark:text-zinc-200', className)}>{bloques.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
