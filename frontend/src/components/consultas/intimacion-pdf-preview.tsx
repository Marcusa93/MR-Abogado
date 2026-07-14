import { forwardRef } from 'react'

export type TipoIntimacion = 'carta_documento' | 'telegrama_ley'

interface Props {
  tipo: TipoIntimacion
  destNombre: string
  destDomicilio: string
  remNombre: string
  remDomicilio: string
  remDni?: string
  cuerpo: string
  abogadoNombre?: string
  ciudad?: string
}

const BASE: React.CSSProperties = {
  fontFamily: '"Times New Roman", Times, serif',
  fontSize: '12pt',
  color: '#000',
  width: '21cm',
  minHeight: '29.7cm',
  background: 'white',
  boxSizing: 'border-box',
}

export const IntimacionPdfPreview = forwardRef<HTMLDivElement, Props>(
  ({
    tipo,
    destNombre,
    destDomicilio,
    remNombre,
    remDomicilio,
    remDni,
    cuerpo,
    abogadoNombre = 'Dr. Marco Rossi',
    ciudad = 'San Miguel de Tucumán',
  }, ref) => {
    const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

    if (tipo === 'carta_documento') {
      return (
        <CartaDocumentoPdf
          ref={ref}
          base={BASE}
          destNombre={destNombre}
          destDomicilio={destDomicilio}
          remNombre={remNombre}
          remDomicilio={remDomicilio}
          remDni={remDni}
          cuerpo={cuerpo}
          abogadoNombre={abogadoNombre}
          ciudad={ciudad}
          fecha={fecha}
        />
      )
    }

    return (
      <TelegramaPdf
        ref={ref}
        base={BASE}
        destNombre={destNombre}
        destDomicilio={destDomicilio}
        remNombre={remNombre}
        remDomicilio={remDomicilio}
        remDni={remDni}
        cuerpo={cuerpo}
        abogadoNombre={abogadoNombre}
        ciudad={ciudad}
        fecha={fecha}
      />
    )
  }
)

IntimacionPdfPreview.displayName = 'IntimacionPdfPreview'

// ── Carta Documento ───────────────────────────────────────────────────────────

interface PdfProps {
  base: React.CSSProperties
  destNombre: string
  destDomicilio: string
  remNombre: string
  remDomicilio: string
  remDni?: string
  cuerpo: string
  abogadoNombre: string
  ciudad: string
  fecha: string
}

const CartaDocumentoPdf = forwardRef<HTMLDivElement, PdfProps>(
  ({ base, destNombre, destDomicilio, remNombre, remDomicilio, remDni, cuerpo, abogadoNombre, ciudad, fecha }, ref) => (
    <div ref={ref} style={{ ...base, padding: '2.5cm' }}>

      {/* Membrete del letrado */}
      <div style={{ textAlign: 'center', marginBottom: '0.6cm' }}>
        <div style={{ fontWeight: 700, fontSize: '12pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {abogadoNombre}
        </div>
        <div style={{ fontSize: '10pt', color: '#374151' }}>Abogado — Tucumán, Argentina</div>
        <div style={{ borderBottom: '1.5px solid #000', marginTop: '0.35cm' }} />
      </div>

      {/* Lugar y fecha */}
      <div style={{ textAlign: 'right', marginBottom: '0.7cm', fontSize: '11pt' }}>
        {ciudad}, {fecha}
      </div>

      {/* Título */}
      <div style={{ textAlign: 'center', marginBottom: '0.7cm' }}>
        <span style={{
          fontWeight: 700, fontSize: '15pt', textTransform: 'uppercase',
          letterSpacing: '0.1em', textDecoration: 'underline',
        }}>
          CARTA DOCUMENTO
        </span>
      </div>

      {/* Destinatario */}
      <div style={{ marginBottom: '0.8cm', fontSize: '11.5pt' }}>
        <div>
          <strong>SR./SRA./SR. RESPONSABLE DE&nbsp;</strong>
          <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{destNombre}</span>
        </div>
        <div>{destDomicilio}</div>
        <div style={{ marginTop: '4px' }}>
          <strong>S/D</strong>
        </div>
      </div>

      {/* Separador */}
      <div style={{ borderBottom: '1px solid #d1d5db', marginBottom: '0.7cm' }} />

      {/* Cuerpo */}
      <div style={{
        textAlign: 'justify', fontSize: '11.5pt', lineHeight: 1.85,
        whiteSpace: 'pre-wrap', marginBottom: '1cm',
      }}>
        {cuerpo}
      </div>

      {/* Separador */}
      <div style={{ borderBottom: '1px solid #d1d5db', marginBottom: '0.7cm' }} />

      {/* Cierre formal */}
      <div style={{ fontSize: '11.5pt', marginBottom: '1.8cm' }}>
        Sin otro particular, saludo a Ud. atte.
      </div>

      {/* Firma */}
      <div>
        <div style={{ borderTop: '1px solid #000', width: '7cm', marginBottom: '0.3cm' }} />
        <div style={{ fontWeight: 700, fontSize: '11.5pt', textTransform: 'uppercase' }}>{remNombre}</div>
        {remDni && (
          <div style={{ fontSize: '11pt' }}>D.N.I. N° {remDni}</div>
        )}
        <div style={{ fontSize: '11pt' }}>Domicilio: {remDomicilio}</div>
      </div>

      {/* Nota al pie */}
      <div style={{
        marginTop: '1.5cm',
        borderTop: '1px solid #e5e7eb',
        paddingTop: '0.3cm',
        fontSize: '8.5pt',
        color: '#6b7280',
        textAlign: 'center',
      }}>
        Presentar en Correo Argentino en dos ejemplares — conservar duplicado con sello de recepción
        &nbsp;·&nbsp; Redactado por {abogadoNombre} — Uso interno / Confidencial
      </div>
    </div>
  )
)
CartaDocumentoPdf.displayName = 'CartaDocumentoPdf'

// ── Telegrama Ley ─────────────────────────────────────────────────────────────

const TelegramaPdf = forwardRef<HTMLDivElement, PdfProps>(
  ({ base, destNombre, destDomicilio, remNombre, remDomicilio, remDni, cuerpo, abogadoNombre, ciudad, fecha }, ref) => {
    const palabras = cuerpo.trim().split(/\s+/).filter(Boolean).length

    return (
      <div ref={ref} style={{ ...base, padding: '2cm' }}>

        {/* Encabezado oficial */}
        <div style={{
          border: '2.5px solid #000',
          padding: '0.4cm 0.8cm',
          textAlign: 'center',
          marginBottom: '0.7cm',
        }}>
          <div style={{ fontWeight: 700, fontSize: '15pt', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            TELEGRAMA — USO POSTAL
          </div>
          <div style={{ fontSize: '9pt', marginTop: '4px', color: '#374151' }}>
            Ley 23.789 · Decreto N° 326/56 · Art. 243 Ley de Contrato de Trabajo 20.744
          </div>
        </div>

        {/* Tabla destinatario */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5cm', fontSize: '11pt' }}>
          <tbody>
            <RowTabla label="DESTINATARIO:" value={destNombre} upper />
            <RowTabla label="DOMICILIO:" value={destDomicilio} />
            <RowTabla label="LUGAR Y FECHA:" value={`${ciudad}, ${fecha}`} />
          </tbody>
        </table>

        {/* Cuerpo del telegrama */}
        <div style={{ border: '1.5px solid #000', padding: '0.5cm 0.7cm', marginBottom: '0.5cm', minHeight: '7cm' }}>
          <div style={{
            fontSize: '8.5pt', color: '#6b7280', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '0.35cm', fontWeight: 600,
          }}>
            TEXTO DEL TELEGRAMA:
          </div>
          <div style={{ fontSize: '11.5pt', lineHeight: 1.85, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>
            {cuerpo}
          </div>
        </div>

        {/* Conteo de palabras (referencia) */}
        <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#6b7280', marginBottom: '0.5cm' }}>
          {palabras} {palabras === 1 ? 'palabra' : 'palabras'} — tarifa según Correo Argentino
        </div>

        {/* Tabla remitente */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.7cm', fontSize: '11pt' }}>
          <tbody>
            <RowTabla label="REMITENTE:" value={remNombre} upper />
            {remDni && <RowTabla label="D.N.I. N°:" value={remDni} />}
            <RowTabla label="DOMICILIO:" value={remDomicilio} />
          </tbody>
        </table>

        {/* Firma */}
        <div style={{ marginTop: '0.8cm' }}>
          <div style={{ borderTop: '1px solid #000', width: '6cm', marginBottom: '0.3cm' }} />
          <div style={{ fontWeight: 700, fontSize: '11pt', textTransform: 'uppercase' }}>{remNombre}</div>
          {remDni && <div style={{ fontSize: '10.5pt' }}>D.N.I. N° {remDni}</div>}
        </div>

        {/* Nota legal */}
        <div style={{
          marginTop: '0.8cm',
          border: '1px solid #d1d5db',
          padding: '0.35cm 0.5cm',
          fontSize: '8.5pt',
          color: '#374151',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          <strong>NOTA PARA EL REMITENTE:</strong> Presentar ante Correo Argentino con D.N.I. original.
          Solicitar acuse de recibo. Conservar talón con sello de presentación y número de pieza.
          El presente documento reviste carácter fehaciente.
        </div>

        {/* Para el abogado */}
        <div style={{ marginTop: '0.5cm', fontSize: '8.5pt', color: '#9ca3af', textAlign: 'right' }}>
          Redactado por {abogadoNombre} — Uso interno / Confidencial
        </div>
      </div>
    )
  }
)
TelegramaPdf.displayName = 'TelegramaPdf'

function RowTabla({ label, value, upper }: { label: string; value: string; upper?: boolean }) {
  return (
    <tr>
      <td style={{
        border: '1px solid #000', padding: '6px 12px',
        width: '32%', fontWeight: 700, verticalAlign: 'top',
      }}>
        {label}
      </td>
      <td style={{
        border: '1px solid #000', padding: '6px 12px',
        fontWeight: upper ? 700 : 400,
        textTransform: upper ? 'uppercase' : 'none',
        verticalAlign: 'top',
      }}>
        {value}
      </td>
    </tr>
  )
}
