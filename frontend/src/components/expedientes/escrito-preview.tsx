import { forwardRef } from 'react'
import type { EscritoContenido } from '@/hooks/use-escritos'

export interface EscritoEncabezadoAbogado {
  nombreCompleto: string         // "MARCO ROSSI"
  matricula: string | null
  matriculaLibro: string | null
  matriculaFolio: string | null
  domicilioLegal: string | null
  telefono: string | null
  email: string | null
  casilleroNotif: string | null
  cuit: string | null
}

interface Props {
  contenido: EscritoContenido
  abogado: EscritoEncabezadoAbogado
}

function formatCuit(cuit: string | null): string | null {
  if (!cuit) return null
  const clean = cuit.replace(/\D/g, '')
  if (clean.length !== 11) return cuit
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`
}

function buildEncabezadoParrafo(a: EscritoEncabezadoAbogado): string {
  const parts: string[] = []
  parts.push(`${a.nombreCompleto}, abogado`)
  if (a.matricula) {
    let matStr = `de la matrícula ${a.matricula}`
    if (a.matriculaLibro) matStr += ` Libro ${a.matriculaLibro}`
    if (a.matriculaFolio) matStr += ` Folio ${a.matriculaFolio}`
    parts.push(matStr)
  }
  if (a.domicilioLegal) parts.push(`con domicilio en ${a.domicilioLegal}`)
  if (a.telefono) parts.push(`N° de Celular ${a.telefono}`)
  if (a.email) parts.push(`mail: ${a.email}`)
  if (a.casilleroNotif) parts.push(`constituyéndolo a los efectos legales en casillero de notificaciones ${a.casilleroNotif}`)
  const cuitFmt = formatCuit(a.cuit)
  if (cuitFmt) parts.push(`CUIL N° ${cuitFmt}`)
  return parts.join(', ') + '.'
}

/**
 * Renderer pixel-perfect del escrito.
 * - Logo MR centrado
 * - Times New Roman 12pt
 * - Sangría de 5cm en los párrafos
 * - Secciones centradas, en negrita, subrayadas
 * - Justificación
 *
 * Usado para preview en pantalla y para imprimir (window.print + @page CSS).
 */
export const EscritoPreview = forwardRef<HTMLDivElement, Props>(({ contenido, abogado }, ref) => {
  return (
    <div ref={ref} className="escrito-doc bg-white text-black mx-auto" style={{
      fontFamily: '"Times New Roman", Times, serif',
      fontSize: '12pt',
      lineHeight: 1.5,
      textAlign: 'justify',
      width: '21cm',
      minHeight: '29.7cm',
      padding: '2.5cm',
      boxSizing: 'border-box',
      color: '#000',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '1.5cm' }}>
        <img
          src="/logo/mr-logo-azul.svg"
          alt="MR Abogado"
          style={{ height: '70px', display: 'inline-block' }}
        />
      </div>

      {/* Título */}
      <p style={{
        textAlign: 'center',
        fontWeight: 'bold',
        textDecoration: 'underline',
        margin: '0 0 1.2cm 0',
      }}>
        “{contenido.titulo}”
      </p>

      {/* Encabezado Juez / Carátula */}
      <div style={{ marginBottom: '1cm' }}>
        <p style={{ margin: 0, fontWeight: 'bold', textDecoration: 'underline' }}>
          {contenido.encabezado_juez}
        </p>
        <p style={{ margin: 0, fontWeight: 'bold', textDecoration: 'underline' }}>
          JUICIO: “{contenido.caratula}”
        </p>
      </div>

      {/* Encabezado del abogado (autogenerado del perfil) */}
      <p style={{ textIndent: '5cm', margin: '0 0 0.4cm 0' }}>
        <strong>{abogado.nombreCompleto}</strong>
        {buildEncabezadoParrafo(abogado).substring(abogado.nombreCompleto.length)}
      </p>

      {/* Secciones */}
      {contenido.secciones?.map((sec, i) => (
        <div key={i}>
          <p style={{
            textAlign: 'center',
            fontWeight: 'bold',
            textDecoration: 'underline',
            margin: '0.8cm 0 0.4cm 0',
          }}>
            {/* Si la sección viene numerada con punto, mantenerlo */}
            {sec.titulo}
          </p>
          {sec.parrafos?.map((p, j) => (
            <p key={j} style={{ textIndent: '5cm', margin: '0 0 0.4cm 0' }}>
              {p}
            </p>
          ))}
        </div>
      ))}

      {/* Firma */}
      <div style={{ marginTop: '3cm', textAlign: 'center' }}>
        <p style={{ margin: 0 }}>—</p>
        <p style={{ margin: 0, fontWeight: 'bold' }}>{abogado.nombreCompleto}</p>
        {abogado.matricula && (
          <p style={{ margin: 0, fontSize: '10pt' }}>
            Matrícula {abogado.matricula}
            {abogado.matriculaLibro ? ` Libro ${abogado.matriculaLibro}` : ''}
            {abogado.matriculaFolio ? ` Folio ${abogado.matriculaFolio}` : ''}
          </p>
        )}
      </div>
    </div>
  )
})
EscritoPreview.displayName = 'EscritoPreview'
