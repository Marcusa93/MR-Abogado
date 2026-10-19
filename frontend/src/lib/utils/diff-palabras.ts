// Diff por palabras (LCS) para comparar versiones de un artículo.
// Para textos muy largos compara por párrafos y solo baja a palabras dentro
// de los párrafos que cambiaron, así el costo queda acotado.

export type Tramo = { tipo: 'igual' | 'agregado' | 'quitado'; texto: string }

function lcs(a: string[], b: string[]): Tramo[] {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    const fila = dp[i]!, sig = dp[i + 1]!
    for (let j = m - 1; j >= 0; j--) fila[j] = a[i] === b[j] ? sig[j + 1]! + 1 : Math.max(sig[j]!, fila[j + 1]!)
  }
  const out: Tramo[] = []
  const push = (tipo: Tramo['tipo'], texto: string) => {
    const ult = out[out.length - 1]
    if (ult && ult.tipo === tipo) ult.texto += texto
    else out.push({ tipo, texto })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('igual', a[i]!); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { push('quitado', a[i]!); i++ }
    else { push('agregado', b[j]!); j++ }
  }
  while (i < n) push('quitado', a[i++]!)
  while (j < m) push('agregado', b[j++]!)
  return out
}

const tokens = (t: string) => t.match(/\s+|[^\s]+/g) ?? []

export function diffPalabras(antes: string, despues: string): Tramo[] {
  const pa = antes.split(/(\n+)/), pd = despues.split(/(\n+)/)
  // Primero por párrafos; los pares quitado→agregado consecutivos se refinan por palabras
  const gruesos = lcs(pa, pd)
  if (pa.length * pd.length > 4_000_000) return gruesos
  const out: Tramo[] = []
  for (let k = 0; k < gruesos.length; k++) {
    const g = gruesos[k]!
    const sig = gruesos[k + 1]
    if (g.tipo === 'quitado' && sig?.tipo === 'agregado') {
      const ta = tokens(g.texto), td = tokens(sig.texto)
      if (ta.length * td.length <= 2_000_000) { out.push(...lcs(ta, td)); k++; continue }
    }
    out.push(g)
  }
  return out
}
