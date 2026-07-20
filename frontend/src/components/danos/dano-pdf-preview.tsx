import { forwardRef } from 'react'
import type { ResultadoDanos, CalculoDanosInput, Escenario } from '@/lib/danos/types'
import { PRESETS_FORMULA } from '@/lib/danos/constantes'

interface Comparable { caratula: string; montoHoy: number; normalizado: boolean }

interface Props {
  titulo: string
  input: CalculoDanosInput
  resultado: ResultadoDanos
  narrativa?: string
  comparables?: Comparable[]
  abogado?: string
}

function pesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.round(n))
}

const ESC_LABEL: Record<Escenario, string> = { conservador: 'Conservador', razonable: 'Razonable', expansivo: 'Expansivo' }

// Descripción del criterio por rubro, leyendo el detalle del cálculo.
function metodologia(r: { key: string; detalle?: unknown }): string | null {
  const d = r.detalle as any
  if (!d) return null
  if (r.key === 'incapacidad' && d.preset) {
    const p = PRESETS_FORMULA[d.preset as keyof typeof PRESETS_FORMULA]
    return `Art. 1746 CCyC — ${p?.label ?? d.preset}. Renta capitalizada: n=${d.n} años, tasa ${(d.tasa * 100).toFixed(0)}%, ingreso base ${pesos(d.ingresoMensual)}/mes, incapacidad ${d.porcentaje}%.`
  }
  if (r.key === 'no_patrimonial' && d.nivel) {
    return `Art. 1741 CCyC — nivel de gravedad "${d.nivel}" (${d.multiplicadorMin}–${d.multiplicadorMax}× la base comparable de ${pesos(d.baseComparable)}).`
  }
  if (r.key === 'punitivo' && d.cuantificacion) {
    const c = d.cuantificacion
    return `Art. 52 bis LDC — método ${c.metodo}${c.canastas ? `, ~${c.canastas.toFixed(1)} CBT` : ''}. Procedencia: ${d.procedencia?.procede ? 'habilitada' : 'no habilitada'}.`
  }
  return null
}

export const DanoPdfPreview = forwardRef<HTMLDivElement, Props>(
  ({ titulo, input, resultado, narrativa, comparables, abogado }, ref) => {
    const razonable = resultado.escenarios.razonable
    const aud = resultado.auditoria
    const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

    return (
      <div ref={ref} style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', color: '#000', width: '18cm', margin: '0 auto', lineHeight: 1.5 }}>
        <div style={{ textAlign: 'center', marginBottom: '0.6cm' }}>
          <div style={{ fontSize: '10pt', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#334155' }}>
            Estudio Jurídico Dr. Marco Rossi · Tucumán
          </div>
          <h1 style={{ fontSize: '15pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.4cm 0 0.1cm' }}>
            Estimación de Daños
          </h1>
          <div style={{ fontSize: '10.5pt', color: '#334155' }}>{titulo} · {hoy}</div>
          <div style={{ borderBottom: '2px solid #0f172a', marginTop: '0.4cm' }} />
        </div>

        {/* Escenarios */}
        <Section title="I. Estimación por escenarios">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
            <tbody>
              {(['conservador', 'razonable', 'expansivo'] as Escenario[]).map(e => (
                <tr key={e} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 0' }}>{ESC_LABEL[e]}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: e === 'razonable' ? 700 : 400 }}>
                    {pesos(resultado.escenarios[e].total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Desglose razonable */}
        <Section title="II. Composición (escenario razonable)">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt' }}>
            <tbody>
              {razonable.rubros.map(r => (
                <tr key={r.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 0', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    {metodologia(r) && <div style={{ fontSize: '9pt', color: '#475569' }}>{metodologia(r)}</div>}
                  </td>
                  <td style={{ padding: '5px 0', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{pesos(r.monto)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #0f172a' }}>
                <td style={{ padding: '6px 0', fontWeight: 700 }}>Total razonable</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>{pesos(razonable.total)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Fundamentación */}
        {narrativa && (
          <Section title="III. Fundamentación">
            <p style={{ margin: 0, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{narrativa}</p>
          </Section>
        )}

        {/* Precedentes */}
        {comparables && comparables.length > 0 && (
          <Section title={narrativa ? 'IV. Precedentes considerados' : 'III. Precedentes considerados'}>
            <ul style={{ margin: 0, paddingLeft: '1.2cm', fontSize: '10pt' }}>
              {comparables.map((c, i) => (
                <li key={i} style={{ marginBottom: '3px' }}>
                  {c.caratula} — {pesos(c.montoHoy)}{!c.normalizado && ' (nominal)'}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Auditoría */}
        <Section title="Auditoría del cálculo">
          <div style={{ fontSize: '9.5pt', color: '#334155' }}>
            <div>Nivel de confianza: <b>{aud.nivelConfianza}</b></div>
            {aud.variablesEstimadas.length > 0 && <div>Variables estimadas: {aud.variablesEstimadas.join('; ')}</div>}
            <div>
              Valores de referencia: CBT Hogar 3 {pesos(aud.valoresReferencia.cbtHogar3)}
              {aud.valoresReferencia.smvm ? ` · SMVM ${pesos(aud.valoresReferencia.smvm)}` : ''}
              {aud.valoresReferencia.vigenciaDesde ? ` (vigencia ${aud.valoresReferencia.vigenciaDesde})` : ''}
            </div>
            <div>Relación de consumo: {input.relacionConsumo ? 'sí' : 'no'} · Fecha de valuación: {input.fechaValuacion}</div>
          </div>
        </Section>

        <p style={{ fontSize: '9pt', color: '#64748b', marginTop: '0.5cm', textAlign: 'justify' }}>
          Estimación técnica de carácter orientativo, no un dictamen definitivo. Las fórmulas (art. 1746, canastas,
          Irigoyen Testa) constituyen una base objetiva controlable; la cuantificación final corresponde al criterio
          judicial. Las consecuencias no patrimoniales y la procedencia del daño punitivo requieren revisión humana.
        </p>

        <div style={{ marginTop: '1.6cm', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #374151', width: '7cm', margin: '0 auto 5px' }} />
          <div style={{ fontWeight: 700, fontSize: '10.5pt' }}>{abogado ?? 'Dr. Marco Rossi'}</div>
          <div style={{ fontSize: '9pt', color: '#374151' }}>Abogado · Tucumán</div>
        </div>
      </div>
    )
  },
)
DanoPdfPreview.displayName = 'DanoPdfPreview'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.55cm' }}>
      <h2 style={{ fontSize: '11pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #cbd5e1', paddingBottom: '2px', marginBottom: '0.25cm' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}
