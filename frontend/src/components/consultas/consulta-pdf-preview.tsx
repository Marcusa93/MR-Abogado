import type { Consulta, Presupuesto, DiagnosticoIA } from '@/hooks/use-consultas'
import { TIPO_ASUNTO_LABEL, HONORARIO_LABEL, calcularHonorarios } from '@/hooks/use-consultas'
import { forwardRef } from 'react'

interface Props {
  consulta: Consulta
  presupuesto?: Presupuesto | null
  abogadoNombre?: string
}

function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function ChancesBadge({ v }: { v: DiagnosticoIA['chances_estimadas'] }) {
  const map = {
    alta: { label: 'Probabilidad alta', color: '#16a34a' },
    media: { label: 'Probabilidad media', color: '#ca8a04' },
    baja: { label: 'Probabilidad baja', color: '#dc2626' },
    sin_datos: { label: 'Sin datos suficientes', color: '#6b7280' },
  }
  const { label, color } = map[v] ?? map.sin_datos
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '999px',
      border: `1.5px solid ${color}`,
      color,
      fontSize: '10pt',
      fontWeight: 600,
    }}>
      {label}
    </span>
  )
}

export const ConsultaPdfPreview = forwardRef<HTMLDivElement, Props>(({ consulta, presupuesto, abogadoNombre }, ref) => {
  const diag = consulta.diagnostico_ia
  const fechaConsulta = new Date(consulta.created_at).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const nombreCliente = [consulta.apellido, consulta.nombre].filter(Boolean).join(', ')

  const honorariosCalc = presupuesto
    ? calcularHonorarios(presupuesto.tipo_honorario, presupuesto.monto_base ?? 0, presupuesto.multiplicador)
    : null

  return (
    <div
      ref={ref}
      className="consulta-pdf-doc"
      style={{
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '12pt',
        color: '#000',
        width: '21cm',
        minHeight: '29.7cm',
        margin: '0 auto',
        background: 'white',
      }}
    >
      {/* ── TAPA ── */}
      <div
        className="consulta-pdf-cover"
        style={{
          width: '21cm',
          height: '29.7cm',
          background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2.5cm 2cm',
          boxSizing: 'border-box',
          pageBreakAfter: 'always',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <img
            src="/logo/mr-logo-blanco.svg"
            alt="MR Abogado"
            style={{ height: '70px', display: 'block', margin: '0 auto' }}
          />
          <div style={{ color: '#94a3b8', fontSize: '9.5pt', marginTop: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Estudio Jurídico Dr. Marco Rossi · Tucumán, Argentina
          </div>
        </div>

        {/* Título central */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '3px',
            background: '#3b82f6',
            margin: '0 auto 24px',
          }} />
          <div style={{
            color: '#ffffff',
            fontSize: '22pt',
            fontWeight: 700,
            letterSpacing: '0.04em',
            lineHeight: 1.2,
            textTransform: 'uppercase',
            fontFamily: '"Times New Roman", Times, serif',
          }}>
            Diagnóstico<br />Jurídico Preliminar
          </div>
          <div style={{
            width: '40px',
            height: '3px',
            background: '#3b82f6',
            margin: '24px auto 0',
          }} />
        </div>

        {/* Datos del caso */}
        <div style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '12px',
          padding: '24px 32px',
          width: '100%',
          boxSizing: 'border-box',
          color: '#e2e8f0',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt' }}>
            <tbody>
              <tr>
                <td style={{ color: '#94a3b8', paddingBottom: '8px', width: '35%' }}>Cliente</td>
                <td style={{ fontWeight: 600, paddingBottom: '8px' }}>{nombreCliente || consulta.nombre}</td>
              </tr>
              {consulta.telefono && (
                <tr>
                  <td style={{ color: '#94a3b8', paddingBottom: '8px' }}>Teléfono</td>
                  <td style={{ paddingBottom: '8px' }}>{consulta.telefono}</td>
                </tr>
              )}
              <tr>
                <td style={{ color: '#94a3b8', paddingBottom: '8px' }}>Materia</td>
                <td style={{ paddingBottom: '8px' }}>{TIPO_ASUNTO_LABEL[consulta.tipo_asunto]}</td>
              </tr>
              <tr>
                <td style={{ color: '#94a3b8' }}>Fecha de consulta</td>
                <td>{fechaConsulta}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div
        className="consulta-pdf-content"
        style={{
          padding: '2.5cm',
          boxSizing: 'border-box',
          lineHeight: 1.5,
          textAlign: 'justify',
        }}
      >
        {/* Logo en páginas de contenido */}
        <div style={{ textAlign: 'center', marginBottom: '1.2cm' }}>
          <img
            src="/logo/mr-logo-azul.svg"
            alt="MR Abogado"
            style={{ height: '55px', display: 'inline-block' }}
          />
        </div>

        <div style={{ borderBottom: '2px solid #0f172a', marginBottom: '0.8cm' }} />

        <h1 style={{
          textAlign: 'center',
          fontSize: '14pt',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '0.3cm',
        }}>
          Diagnóstico Jurídico Preliminar
        </h1>

        <div style={{ textAlign: 'center', marginBottom: '1cm', fontSize: '10.5pt', color: '#374151' }}>
          {nombreCliente || consulta.nombre} · {TIPO_ASUNTO_LABEL[consulta.tipo_asunto]} · {fechaConsulta}
        </div>

        {diag ? (
          <>
            {/* Pretensión y fuero */}
            <Section title="I. Síntesis del caso">
              <Row label="Fuero" value={diag.fuero} />
              <Row label="Pretensión" value={diag.pretension} />
              <div style={{ marginTop: '10px' }}>
                <ChancesBadge v={diag.chances_estimadas} />
              </div>
            </Section>

            {/* Observaciones */}
            <Section title="II. Análisis jurídico">
              <p style={{ margin: 0, textIndent: '1.2cm' }}>{diag.observaciones}</p>
            </Section>

            {/* Acciones recomendadas */}
            <Section title="III. Acciones recomendadas">
              <ol style={{ margin: '0', paddingLeft: '1.8cm' }}>
                {diag.acciones_recomendadas.map((a, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{a}</li>
                ))}
              </ol>
            </Section>

            {/* Riesgos */}
            {diag.riesgos?.length > 0 && (
              <Section title="IV. Advertencias y riesgos">
                <ul style={{ margin: 0, paddingLeft: '1.5cm' }}>
                  {diag.riesgos.map((r, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{r}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Presupuesto */}
            {presupuesto && honorariosCalc !== null && (
              <Section title="V. Honorarios profesionales">
                <p style={{ margin: '0 0 12px', textIndent: '1.2cm' }}>
                  {presupuesto.descripcion_ia || diag.descripcion_honorarios}
                </p>
                <div style={{
                  border: '1.5px solid #1e3a5f',
                  borderRadius: '8px',
                  padding: '16px 24px',
                  marginTop: '12px',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#374151', paddingBottom: '6px' }}>Modalidad</td>
                        <td style={{ textAlign: 'right', paddingBottom: '6px' }}>{HONORARIO_LABEL[presupuesto.tipo_honorario]}</td>
                      </tr>
                      {presupuesto.monto_base && presupuesto.tipo_honorario !== 'honorario_fijo' && presupuesto.tipo_honorario !== 'cuota_litis' && (
                        <tr>
                          <td style={{ color: '#374151', paddingBottom: '6px' }}>Multiplicador</td>
                          <td style={{ textAlign: 'right', paddingBottom: '6px' }}>{presupuesto.multiplicador}×</td>
                        </tr>
                      )}
                      {presupuesto.tipo_honorario === 'cuota_litis' && presupuesto.monto_base && (
                        <tr>
                          <td style={{ color: '#374151', paddingBottom: '6px' }}>Monto reclamado estimado</td>
                          <td style={{ textAlign: 'right', paddingBottom: '6px' }}>{formatPesos(presupuesto.monto_base)}</td>
                        </tr>
                      )}
                      <tr style={{ borderTop: '1px solid #d1d5db' }}>
                        <td style={{ fontWeight: 700, paddingTop: '8px', fontSize: '12.5pt' }}>Honorarios estimados</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '8px', fontSize: '12.5pt', color: '#1e3a5f' }}>
                          {formatPesos(honorariosCalc)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {presupuesto.tipo_honorario === 'cuota_litis' && (
                  <p style={{ fontSize: '9.5pt', color: '#6b7280', marginTop: '8px', textAlign: 'center', fontStyle: 'italic' }}>
                    El honorario es sobre lo efectivamente obtenido. Sin resultado, sin cobro.
                  </p>
                )}
              </Section>
            )}
          </>
        ) : (
          <p style={{ color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>
            Diagnóstico no generado aún.
          </p>
        )}

        {/* Firma */}
        <div style={{ marginTop: '2.5cm', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #374151', width: '8cm', margin: '0 auto 6px' }} />
          <div style={{ fontWeight: 700, fontSize: '11pt' }}>
            {abogadoNombre ?? 'Dr. Marco Rossi'}
          </div>
          <div style={{ fontSize: '10pt', color: '#374151' }}>Abogado · Tucumán, Argentina</div>
          <div style={{ fontSize: '9pt', color: '#6b7280', marginTop: '4px' }}>
            Documento de uso interno — confidencial
          </div>
        </div>
      </div>
    </div>
  )
})

ConsultaPdfPreview.displayName = 'ConsultaPdfPreview'

// ── Helpers de layout ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.8cm' }}>
      <h2 style={{
        fontSize: '11pt',
        fontWeight: 700,
        textDecoration: 'underline',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: '0.35cm',
        marginTop: '0.6cm',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '1cm', marginBottom: '6px' }}>
      <span style={{ fontWeight: 600, minWidth: '3.5cm', color: '#374151' }}>{label}:</span>
      <span style={{ flex: 1 }}>{value}</span>
    </div>
  )
}
