import type { Consulta, Presupuesto, DiagnosticoIA } from '@/hooks/use-consultas'
import { TIPO_ASUNTO_LABEL, HONORARIO_LABEL, calcularHonorarios } from '@/hooks/use-consultas'
import { forwardRef } from 'react'

interface Props {
  consulta: Consulta
  presupuesto?: Presupuesto | null
  presupuestos?: Presupuesto[]
  abogadoNombre?: string
  mode?: 'diagnostico' | 'presupuesto'
  notasAbogado?: string | null
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

export const ConsultaPdfPreview = forwardRef<HTMLDivElement, Props>(
  ({ consulta, presupuesto, presupuestos, abogadoNombre, mode = 'diagnostico', notasAbogado }, ref) => {
    const diag = consulta.diagnostico_ia
    const fechaConsulta = new Date(consulta.created_at).toLocaleDateString('es-AR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    const nombreCliente = [consulta.apellido, consulta.nombre].filter(Boolean).join(', ')
    const honorariosCalc = presupuesto
      ? calcularHonorarios(presupuesto.tipo_honorario, presupuesto.monto_base ?? 0, presupuesto.multiplicador)
      : null
    const presupuestosEff = presupuestos && presupuestos.length > 0 ? presupuestos : (presupuesto ? [presupuesto] : [])

    const firmaTitulo = mode === 'presupuesto' ? 'Presupuesto de Honorarios' : 'Diagnóstico\nJurídico Preliminar'

    return (
      <div
        ref={ref}
        className="consulta-pdf-doc"
        style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', color: '#000', width: '21cm', minHeight: '29.7cm', margin: '0 auto', background: 'white' }}
      >
        {/* ── TAPA ── */}
        <div
          className="consulta-pdf-cover"
          style={{
            width: '21cm', height: '29.7cm',
            background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
            padding: '2.5cm 2cm', boxSizing: 'border-box', pageBreakAfter: 'always',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img src="/logo/mr-logo-blanco.svg" alt="MR Abogado" style={{ height: '70px', display: 'block', margin: '0 auto' }} />
            <div style={{ color: '#94a3b8', fontSize: '9.5pt', marginTop: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Estudio Jurídico Dr. Marco Rossi · Tucumán, Argentina
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '40px', height: '3px', background: '#3b82f6', margin: '0 auto 24px' }} />
            <div style={{
              color: '#ffffff', fontSize: '22pt', fontWeight: 700, letterSpacing: '0.04em',
              lineHeight: 1.2, textTransform: 'uppercase', fontFamily: '"Times New Roman", Times, serif',
              whiteSpace: 'pre-line',
            }}>
              {firmaTitulo}
            </div>
            <div style={{ width: '40px', height: '3px', background: '#3b82f6', margin: '24px auto 0' }} />
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '12px', padding: '24px 32px', width: '100%', boxSizing: 'border-box', color: '#e2e8f0',
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
          style={{ padding: '2.5cm', boxSizing: 'border-box', lineHeight: 1.5, textAlign: 'justify' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.2cm' }}>
            <img src="/logo/mr-logo-azul.svg" alt="MR Abogado" style={{ height: '55px', display: 'inline-block' }} />
          </div>

          <div style={{ borderBottom: '2px solid #0f172a', marginBottom: '0.8cm' }} />

          {mode === 'diagnostico' ? (
            <DiagnosticoContent
              diag={diag}
              notasAbogado={notasAbogado}
              nombreCliente={nombreCliente || consulta.nombre}
              tipoAsunto={TIPO_ASUNTO_LABEL[consulta.tipo_asunto]}
              fechaConsulta={fechaConsulta}
            />
          ) : (
            <PresupuestoContent
              presupuestos={presupuestosEff}
              honorariosCalc={honorariosCalc}
              diag={diag}
              nombreCliente={nombreCliente || consulta.nombre}
              tipoAsunto={TIPO_ASUNTO_LABEL[consulta.tipo_asunto]}
              fechaConsulta={fechaConsulta}
            />
          )}

          {/* Firma */}
          <div style={{ marginTop: '2.5cm', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #374151', width: '8cm', margin: '0 auto 6px' }} />
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{abogadoNombre ?? 'Dr. Marco Rossi'}</div>
            <div style={{ fontSize: '10pt', color: '#374151' }}>Abogado · Tucumán, Argentina</div>
            <div style={{ fontSize: '9pt', color: '#6b7280', marginTop: '4px' }}>
              Documento de uso interno — confidencial
            </div>
          </div>
        </div>
      </div>
    )
  }
)

ConsultaPdfPreview.displayName = 'ConsultaPdfPreview'

// ── Sección diagnóstico ───────────────────────────────────────────────────────

function DiagnosticoContent({
  diag, notasAbogado, nombreCliente, tipoAsunto, fechaConsulta,
}: {
  diag: DiagnosticoIA | null
  notasAbogado?: string | null
  nombreCliente: string
  tipoAsunto: string
  fechaConsulta: string
}) {
  return (
    <>
      <h1 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3cm' }}>
        Diagnóstico Jurídico Preliminar
      </h1>
      <div style={{ textAlign: 'center', marginBottom: '1cm', fontSize: '10.5pt', color: '#374151' }}>
        {nombreCliente} · {tipoAsunto} · {fechaConsulta}
      </div>

      {diag ? (
        <>
          <Section title="I. Síntesis del caso">
            <Row label="Fuero" value={diag.fuero} />
            <Row label="Pretensión" value={diag.pretension} />
            <div style={{ marginTop: '10px' }}><ChancesBadge v={diag.chances_estimadas} /></div>
          </Section>

          <Section title="II. Análisis jurídico">
            <p style={{ margin: 0, textIndent: '1.2cm' }}>{diag.observaciones}</p>
          </Section>

          <Section title="III. Acciones recomendadas">
            <ol style={{ margin: '0', paddingLeft: '1.8cm' }}>
              {diag.acciones_recomendadas.map((a, i) => <li key={i} style={{ marginBottom: '6px' }}>{a}</li>)}
            </ol>
          </Section>

          {diag.riesgos?.length > 0 && (
            <Section title="IV. Advertencias y riesgos">
              <ul style={{ margin: 0, paddingLeft: '1.5cm' }}>
                {diag.riesgos.map((r, i) => <li key={i} style={{ marginBottom: '6px' }}>{r}</li>)}
              </ul>
            </Section>
          )}

          {notasAbogado && (
            <Section title="V. Observaciones del abogado">
              <p style={{ margin: 0, textIndent: '1.2cm', whiteSpace: 'pre-wrap' }}>{notasAbogado}</p>
            </Section>
          )}
        </>
      ) : (
        <p style={{ color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>Diagnóstico no generado aún.</p>
      )}
    </>
  )
}

// ── Sección presupuesto ───────────────────────────────────────────────────────

function PresupuestoContent({
  presupuestos, honorariosCalc, diag, nombreCliente, tipoAsunto, fechaConsulta,
}: {
  presupuestos: Presupuesto[]
  honorariosCalc: number | null
  diag: DiagnosticoIA | null
  nombreCliente: string
  tipoAsunto: string
  fechaConsulta: string
}) {
  const total = presupuestos.reduce((acc, p) => acc + calcularHonorarios(p.tipo_honorario, p.monto_base ?? 0, p.multiplicador), 0)
  const tieneCuotaLitis = presupuestos.some(p => p.tipo_honorario === 'cuota_litis')

  return (
    <>
      <h1 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3cm' }}>
        Presupuesto de Honorarios Profesionales
      </h1>
      <div style={{ textAlign: 'center', marginBottom: '1cm', fontSize: '10.5pt', color: '#374151' }}>
        {nombreCliente} · {tipoAsunto} · {fechaConsulta}
      </div>

      {presupuestos.length > 0 ? (
        <>
          {diag?.descripcion_honorarios && (
            <Section title="I. Fundamento">
              <p style={{ margin: 0, textIndent: '1.2cm' }}>{diag.descripcion_honorarios}</p>
            </Section>
          )}

          <Section title={diag?.descripcion_honorarios ? 'II. Honorarios' : 'I. Honorarios'}>
            <div style={{ border: '1.5px solid #1e3a5f', borderRadius: '8px', padding: '20px 28px', marginTop: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                <tbody>
                  {presupuestos.map((p, idx) => {
                    const hc = calcularHonorarios(p.tipo_honorario, p.monto_base ?? 0, p.multiplicador)
                    const label = p.notas
                      ? `${HONORARIO_LABEL[p.tipo_honorario]} — ${p.notas}`
                      : HONORARIO_LABEL[p.tipo_honorario]
                    const pct = p.tipo_honorario === 'cuota_litis' ? ` (${p.multiplicador}%)` : ''
                    return (
                      <tr key={p.id} style={{ borderBottom: idx < presupuestos.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                        <td style={{ color: '#374151', paddingBottom: '8px', paddingTop: idx > 0 ? '8px' : '0' }}>
                          {label}{pct}
                          {p.tipo_honorario === 'cuota_litis' && p.monto_base && (
                            <span style={{ display: 'block', fontSize: '9.5pt', color: '#6b7280' }}>
                              Monto reclamado: {formatPesos(p.monto_base)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', paddingBottom: '8px', paddingTop: idx > 0 ? '8px' : '0', fontWeight: presupuestos.length === 1 ? 700 : 400 }}>
                          {formatPesos(hc)}
                        </td>
                      </tr>
                    )
                  })}
                  {presupuestos.length > 1 && (
                    <tr style={{ borderTop: '2px solid #1e3a5f' }}>
                      <td style={{ fontWeight: 700, paddingTop: '10px', fontSize: '13pt' }}>Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '10px', fontSize: '13pt', color: '#1e3a5f' }}>
                        {formatPesos(total)}
                      </td>
                    </tr>
                  )}
                  {presupuestos.length === 1 && (
                    <tr style={{ borderTop: '1px solid #d1d5db' }}>
                      <td style={{ fontWeight: 700, paddingTop: '10px', fontSize: '13pt' }}>Honorarios estimados</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '10px', fontSize: '13pt', color: '#1e3a5f' }}>
                        {honorariosCalc !== null ? formatPesos(honorariosCalc) : formatPesos(total)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {tieneCuotaLitis && (
              <p style={{ fontSize: '9.5pt', color: '#6b7280', marginTop: '10px', textAlign: 'center', fontStyle: 'italic' }}>
                El honorario de cuota litis es sobre lo efectivamente obtenido. Sin resultado, sin cobro.
              </p>
            )}
          </Section>

          {presupuestos.some(p => p.notas && p.tipo_honorario !== 'cuota_litis') && (
            <Section title={diag?.descripcion_honorarios ? 'III. Condiciones y observaciones' : 'II. Condiciones y observaciones'}>
              {presupuestos.filter(p => p.notas).map(p => (
                <p key={p.id} style={{ margin: '0 0 6px', textIndent: '1.2cm', whiteSpace: 'pre-wrap' }}>{p.notas}</p>
              ))}
            </Section>
          )}
        </>
      ) : (
        <p style={{ color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>Presupuesto no confeccionado aún.</p>
      )}
    </>
  )
}

// ── Helpers de layout ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.8cm' }}>
      <h2 style={{
        fontSize: '11pt', fontWeight: 700, textDecoration: 'underline', textAlign: 'center',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35cm', marginTop: '0.6cm',
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
