import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import type { Consulta, Presupuesto, DiagnosticoIA, DiagnosticoModulo } from '@/hooks/use-consultas'
import {
  TIPO_ACTUACION_LABEL, agruparPorArea, calcularFinanciacion, calcularTotales, describirHonorario,
  describirPlan, etiquetaArea, formatPesos, porcentajeResultado,
  type Cotizacion,
} from '@/lib/consultas/cotizacion'

// Documento para el cliente: tapa con la identidad del estudio (navy, monograma,
// Montserrat, como el sitio) y cuerpo con el formato de los escritos: Times
// New Roman 12, interlineado 1,5, márgenes de 2,5 cm, sangría de 5 cm,
// justificado, títulos centrados en negrita y subrayados, logo arriba y firma.
// Se imprime con lib/consultas/imprimir-documento.ts.

export type ModoDocumento = 'diagnostico' | 'presupuesto' | 'completo'

interface Props {
  consulta: Consulta
  presupuestos: Presupuesto[]
  cotizacion: Cotizacion | null
  mode: ModoDocumento
  /** Alcance: una sola área (clave de tipo_asunto) o null para todo */
  area?: string | null
  abogadoNombre?: string
  notasAbogado?: string | null
}

const SERIF = '"Times New Roman", Times, serif'
const SANS = "'Montserrat Variable', 'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
const NAVY = '#0a1929'
const ACENTO = '#66ACCC'
const GRIS = '#4b5563'
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

const P: CSSProperties = { margin: '0 0 0.35cm', textIndent: '5cm' }
const ROTULO: CSSProperties = { fontFamily: SANS, fontSize: '7.5pt', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }

const TITULOS: Record<ModoDocumento, { tapa: [string, string]; cuerpo: string }> = {
  diagnostico: { tapa: ['Diagnóstico', 'jurídico'], cuerpo: 'Diagnóstico jurídico preliminar' },
  presupuesto: { tapa: ['Propuesta de', 'honorarios'], cuerpo: 'Propuesta de honorarios profesionales' },
  completo: { tapa: ['Diagnóstico y', 'propuesta'], cuerpo: 'Diagnóstico jurídico preliminar y propuesta de honorarios' },
}

const CHANCES: Record<string, { label: string; color: string }> = {
  alta: { label: 'alta', color: '#15803d' },
  media: { label: 'media', color: '#b45309' },
  baja: { label: 'baja', color: '#b91c1c' },
  sin_datos: { label: 'sin datos suficientes', color: '#6b7280' },
}

/** Módulos del diagnóstico que van al documento (multi-área o el formato anterior). */
function modulosDe(diag: DiagnosticoIA | null): DiagnosticoModulo[] {
  if (!diag) return []
  if (diag.modulos?.length) return diag.modulos.filter((m) => m.incluir !== false)
  if (!diag.fuero && !diag.observaciones) return []
  return [{
    area: '', fuero: diag.fuero ?? '', pretension: diag.pretension ?? '', chances_estimadas: diag.chances_estimadas ?? 'sin_datos',
    acciones_recomendadas: diag.acciones_recomendadas ?? [], riesgos: diag.riesgos ?? [], observaciones: diag.observaciones ?? '',
    checklist_cliente: diag.checklist_cliente, tipo_honorario_sugerido: diag.tipo_honorario_sugerido ?? 'honorario_fijo',
    descripcion_honorarios: diag.descripcion_honorarios ?? '',
  }]
}

export const ConsultaPdfPreview = forwardRef<HTMLDivElement, Props>(
  ({ consulta, presupuestos, cotizacion, mode, area = null, abogadoNombre = 'Dr. Marco Rossi', notasAbogado }, ref) => {
    const fecha = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    const fechaConsulta = new Date(consulta.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    const cliente = [consulta.nombre, consulta.apellido].filter(Boolean).join(' ') || consulta.nombre

    const conDiag = mode !== 'presupuesto'
    const conHonorarios = mode !== 'diagnostico'
    const modulos = modulosDe(consulta.diagnostico_ia).filter((m) => !area || m.area === area)
    const items = presupuestos.filter((p) => p.incluido !== false && (!area || p.area === area))
    // Con un área sola no aplica el precio por paquete: se muestra como por separado
    const cot: Cotizacion | null = cotizacion && (area ? { ...cotizacion, modo: 'separado', precio_conjunto: null } : cotizacion)

    const areasTapa: string[] = []
    for (const a of [...(conDiag ? modulos.map((m) => m.area) : []), ...(conHonorarios ? items.map((i) => i.area ?? '') : [])]) {
      if (a && !areasTapa.includes(a)) areasTapa.push(a)
    }
    if (!areasTapa.length) {
      for (const a of area ? [area] : consulta.areas_derecho?.length ? consulta.areas_derecho : [consulta.tipo_asunto]) {
        if (a && !areasTapa.includes(a)) areasTapa.push(a)
      }
    }

    let n = 0
    const numeral = () => ROMANOS[n++] ?? String(n)

    return (
      <div ref={ref}>
        <div className="doc" style={{ width: '21cm', background: '#fff', color: '#000' }}>
          {/* ── TAPA ─────────────────────────────────────────────────────── */}
          <div className="doc-portada" style={{
            width: '21cm', height: '29.7cm', position: 'relative', overflow: 'hidden', background: NAVY, color: '#fff',
            fontFamily: SANS, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: '2.2cm 2.2cm 1.8cm 2.6cm', boxSizing: 'border-box',
          }}>
            {/* Monograma de fondo y franja de acento */}
            <img src="/logo/mr-monograma-blanco.svg" alt="" style={{ position: 'absolute', right: '-4.5cm', bottom: '-3.5cm', height: '19cm', opacity: 0.045 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '0.45cm', background: ACENTO }} />

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <img src="/logo/mr-logo-blanco.svg" alt="Estudio Jurídico Dr. Marco Rossi" style={{ height: '1.35cm' }} />
              <span style={{ ...ROTULO, color: 'rgba(255,255,255,0.55)' }}>Confidencial</span>
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ ...ROTULO, color: ACENTO, fontSize: '8.5pt' }}>Estudio jurídico · Tucumán</div>
              <h1 style={{ margin: '0.55cm 0 0', fontSize: '44pt', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.015em', fontFamily: SANS }}>
                {TITULOS[mode].tapa[0]}<br />{TITULOS[mode].tapa[1]}
              </h1>
              <div style={{ width: '2.4cm', height: '4px', background: ACENTO, margin: '0.9cm 0 0.8cm' }} />
              <div style={{ ...ROTULO, color: 'rgba(255,255,255,0.55)' }}>Preparado para</div>
              <div style={{ marginTop: '0.2cm', fontSize: '22pt', fontWeight: 600, letterSpacing: '-0.005em' }}>{cliente}</div>
              {areasTapa.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.22cm', marginTop: '0.6cm' }}>
                  {areasTapa.map((a) => (
                    <span key={a} style={{
                      border: '1px solid rgba(102,172,204,0.55)', color: '#d4ebf5', borderRadius: '999px',
                      padding: '0.1cm 0.42cm', fontSize: '9pt', fontWeight: 600, letterSpacing: '0.02em',
                    }}>{etiquetaArea(a)}</span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6cm', borderTop: '1px solid rgba(255,255,255,0.16)', paddingTop: '0.55cm' }}>
                <DatoTapa rotulo="Fecha" valor={fecha} />
                <DatoTapa rotulo="Consulta" valor={fechaConsulta} />
                <DatoTapa rotulo={conHonorarios && cot?.validez_dias ? 'Validez' : 'Responsable'}
                  valor={conHonorarios && cot?.validez_dias ? `${cot.validez_dias} días` : abogadoNombre} />
              </div>
              <div style={{ marginTop: '0.9cm', display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', color: 'rgba(255,255,255,0.5)' }}>
                <span>{abogadoNombre} · Abogado</span>
                <span>marcorossi.com.ar</span>
              </div>
            </div>
          </div>

          {/* ── CUERPO (formato de escritos) ─────────────────────────────── */}
          <div className="doc-contenido" style={{
            width: '21cm', padding: '2.5cm', boxSizing: 'border-box',
            fontFamily: SERIF, fontSize: '12pt', lineHeight: 1.5, textAlign: 'justify', color: '#000',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '1.2cm' }}>
              <img src="/logo/mr-logo-azul.svg" alt="MR Abogado" style={{ height: '70px', display: 'inline-block' }} />
            </div>

            <p className="doc-titulo" style={{ textAlign: 'center', fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', margin: '0 0 0.9cm' }}>
              {TITULOS[mode].cuerpo}
            </p>

            {conDiag && (
              <p style={P}>
                {cliente} consultó al estudio el {fechaConsulta}. A partir de lo relatado y de la documentación aportada hasta el momento, se expone a continuación un análisis preliminar de su situación{conHonorarios ? ', junto con la propuesta de honorarios' : ''}.
              </p>
            )}

            {conDiag && (modulos.length > 0 ? modulos.map((m, i) => (
              <ModuloDoc key={`${m.area}-${i}`} m={m}
                titulo={`${numeral()}. ${m.area ? etiquetaArea(m.area) : 'Análisis del caso'}`} />
            )) : (
              <p style={{ ...P, textIndent: 0, fontStyle: 'italic', color: GRIS }}>El diagnóstico todavía no fue elaborado.</p>
            ))}

            {conDiag && notasAbogado?.trim() && (
              <>
                <Seccion>{numeral()}. Observaciones</Seccion>
                {notasAbogado.trim().split(/\n{2,}/).map((t, i) => <p key={i} style={{ ...P, whiteSpace: 'pre-wrap' }}>{t}</p>)}
              </>
            )}

            {conHonorarios && cot && <HonorariosDoc items={items} cot={cot} numeral={numeral} cliente={conDiag ? undefined : cliente} />}

            {/* Firma */}
            <div className="doc-bloque" style={{ marginTop: '2.2cm', textAlign: 'center', lineHeight: 1.3 }}>
              <div style={{ borderTop: '1px solid #000', width: '7.5cm', margin: '0 auto 0.2cm' }} />
              <div style={{ fontWeight: 'bold' }}>{abogadoNombre}</div>
              <div style={{ fontSize: '11pt' }}>Abogado · San Miguel de Tucumán</div>
            </div>
            <p style={{ marginTop: '1.2cm', fontSize: '9pt', lineHeight: 1.4, color: GRIS, textAlign: 'center' }}>
              Documento confidencial, preparado para uso exclusivo de su destinatario. El análisis es preliminar y puede cambiar con nueva información o documentación.
            </p>
          </div>
        </div>
      </div>
    )
  },
)

ConsultaPdfPreview.displayName = 'ConsultaPdfPreview'

// ── Piezas ──────────────────────────────────────────────────────────────────

function DatoTapa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div style={{ ...ROTULO, color: ACENTO }}>{rotulo}</div>
      <div style={{ marginTop: '0.12cm', fontSize: '10.5pt', fontWeight: 600, color: '#fff' }}>{valor}</div>
    </div>
  )
}

function Seccion({ children }: { children: ReactNode }) {
  return (
    <p className="doc-seccion" style={{ textAlign: 'center', fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', margin: '0.9cm 0 0.4cm', textIndent: 0 }}>
      {children}
    </p>
  )
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <p className="doc-seccion" style={{ fontWeight: 'bold', margin: '0.45cm 0 0.15cm', textIndent: 0 }}>{children}</p>
}

function Lista({ items, ordenada }: { items: string[]; ordenada?: boolean }) {
  const contenido = items.filter(Boolean).map((t, i) => <li key={i} style={{ marginBottom: '0.1cm' }}>{t}</li>)
  const estilo: CSSProperties = { margin: '0 0 0.3cm', paddingLeft: '1.4cm' }
  return ordenada ? <ol style={estilo}>{contenido}</ol> : <ul style={estilo}>{contenido}</ul>
}

function ModuloDoc({ m, titulo }: { m: DiagnosticoModulo; titulo: string }) {
  const ch = CHANCES[m.chances_estimadas] ?? CHANCES.sin_datos!
  return (
    <>
      <Seccion>{titulo}</Seccion>
      <div className="doc-bloque" style={{ margin: '0 0 0.35cm' }}>
        {m.fuero && <div><strong>Fuero:</strong> {m.fuero}</div>}
        {m.pretension && <div><strong>Pretensión:</strong> {m.pretension}</div>}
        <div>
          <strong>Probabilidad estimada:</strong>{' '}
          <span style={{ display: 'inline-block', width: '0.22cm', height: '0.22cm', borderRadius: '50%', background: ch.color, margin: '0 0.12cm 0.03cm 0.05cm', verticalAlign: 'middle' }} />
          {ch.label}
        </div>
      </div>
      {m.observaciones?.split(/\n{2,}/).filter(Boolean).map((t, i) => <p key={i} style={{ ...P, whiteSpace: 'pre-wrap' }}>{t}</p>)}
      {(m.acciones_recomendadas?.filter(Boolean).length ?? 0) > 0 && (<><Subtitulo>Acciones recomendadas</Subtitulo><Lista items={m.acciones_recomendadas} ordenada /></>)}
      {(m.riesgos?.filter(Boolean).length ?? 0) > 0 && (<><Subtitulo>Advertencias y riesgos</Subtitulo><Lista items={m.riesgos} /></>)}
      {(m.checklist_cliente?.filter(Boolean).length ?? 0) > 0 && (<><Subtitulo>Documentación a reunir</Subtitulo><Lista items={m.checklist_cliente ?? []} /></>)}
    </>
  )
}

const CELDA: CSSProperties = { padding: '0.22cm 0.1cm', verticalAlign: 'top', borderBottom: '1px solid #d1d5db', textAlign: 'left' }
const CELDA_DER: CSSProperties = { ...CELDA, textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: '0.5cm' }
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const pctTexto = (n: number) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)}\u00a0%`

function FilaProceso({ p, conMonto }: { p: Presupuesto; conMonto: boolean }) {
  const porc = porcentajeResultado(p)
  const sub = [TIPO_ACTUACION_LABEL[p.tipo_actuacion], p.detalle].filter(Boolean).join(' · ')
  return (
    <tr>
      <td style={CELDA}>
        <div style={{ fontWeight: 'bold' }}>{p.proceso || 'Honorarios'}</div>
        {sub && <div style={{ fontSize: '10.5pt', lineHeight: 1.35, color: GRIS, fontStyle: 'italic' }}>{sub}</div>}
      </td>
      <td style={CELDA_DER}>
        {conMonto ? describirHonorario(p) : porc !== null ? `incluido + ${pctTexto(porc)} del resultado` : 'incluido'}
      </td>
    </tr>
  )
}

function TablaHonorarios({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12pt', lineHeight: 1.4, margin: '0.2cm 0 0.4cm', borderTop: `2px solid ${NAVY}` }}>
      <thead>
        <tr>
          <th style={{ ...CELDA, ...ROTULO, fontSize: '7pt', color: GRIS, borderBottom: `1px solid ${NAVY}` }}>Proceso o actuación</th>
          <th style={{ ...CELDA_DER, ...ROTULO, fontSize: '7pt', color: GRIS, borderBottom: `1px solid ${NAVY}` }}>Honorario</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {pie && <tfoot>{pie}</tfoot>}
    </table>
  )
}

function FilaTotal({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <tr>
      <td style={{ ...CELDA, borderBottom: `2px solid ${NAVY}`, fontWeight: 'bold', paddingTop: '0.3cm' }}>
        {etiqueta}
        {nota && <div style={{ fontSize: '10.5pt', fontWeight: 'normal', fontStyle: 'italic', color: GRIS }}>{nota}</div>}
      </td>
      <td style={{ ...CELDA_DER, borderBottom: `2px solid ${NAVY}`, fontWeight: 'bold', fontSize: '13pt', paddingTop: '0.3cm', color: NAVY }}>{valor}</td>
    </tr>
  )
}

function HonorariosDoc({ items, cot, numeral, cliente }: { items: Presupuesto[]; cot: Cotizacion; numeral: () => string; cliente?: string }) {
  if (!items.length) {
    return (
      <>
        <Seccion>{numeral()}. Honorarios profesionales</Seccion>
        <p style={{ ...P, textIndent: 0, fontStyle: 'italic', color: GRIS }}>La propuesta de honorarios todavía no fue confeccionada.</p>
      </>
    )
  }
  const grupos = agruparPorArea(items)
  const totales = calcularTotales(items, cot)
  const variosGrupos = grupos.length > 1
  const notaPorcentaje = totales.hayPorcentaje ? 'más el porcentaje del resultado indicado en cada caso' : undefined
  const opciones = cot.financiacion
    .filter((o) => o.aplica_a === 'total' || items.some((i) => i.id === o.aplica_a))
    .map((o) => ({ o, plan: calcularFinanciacion(o, items, cot) }))
    .filter(({ plan }) => plan.base > 0)

  return (
    <>
      {/* En el documento solo de honorarios el título ya lo dice */}
      {!cliente && <Seccion>{numeral()}. Honorarios profesionales</Seccion>}

      {cot.modo === 'separado' ? (
        <>
          <p style={P}>Se detallan los honorarios propuestos{cliente ? ` a ${cliente}` : ''} para cada proceso o actuación. Cada uno puede contratarse en forma independiente.</p>
          {grupos.map((g) => (
            <div key={g.area ?? 'general'}>
              {variosGrupos && <Subtitulo>{g.label}</Subtitulo>}
              <TablaHonorarios>{g.items.map((p) => <FilaProceso key={p.id} p={p} conMonto />)}</TablaHonorarios>
            </div>
          ))}
          {items.length > 1 && totales.sumaFija > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 0.4cm', fontSize: '12pt' }}>
              <tbody><FilaTotal etiqueta="Si se contratan todas las actuaciones" valor={formatPesos(totales.sumaFija)} nota={notaPorcentaje} /></tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <p style={P}>Se propone{cliente ? ` a ${cliente}` : ''} un honorario único por la totalidad de las actuaciones que se detallan.</p>
          <TablaHonorarios pie={
            <FilaTotal etiqueta="Honorario por la totalidad" valor={formatPesos(totales.totalConjunto)}
              nota={[totales.bonificacionPct > 0 ? `frente a ${formatPesos(totales.sumaFija)} si se contrataran por separado` : '', notaPorcentaje ?? ''].filter(Boolean).join('; ') || undefined} />
          }>
            {grupos.flatMap((g) => [
              ...(variosGrupos ? [<tr key={`g-${g.area ?? 'general'}`}><td colSpan={2} style={{ ...CELDA, ...ROTULO, fontSize: '7pt', color: NAVY, paddingTop: '0.35cm' }}>{g.label}</td></tr>] : []),
              ...g.items.map((p) => <FilaProceso key={p.id} p={p} conMonto={false} />),
            ])}
          </TablaHonorarios>
        </>
      )}

      {totales.hayPorcentaje && (
        <p style={{ ...P, fontSize: '11pt' }}>
          Los porcentajes se calculan sobre lo que efectivamente perciba el cliente, por sentencia o por acuerdo. Si no se obtiene resultado, esa parte del honorario no se cobra.
        </p>
      )}

      {opciones.length > 0 && (
        <div className="doc-bloque">
          <Subtitulo>Formas de pago</Subtitulo>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12pt', lineHeight: 1.4, margin: '0.1cm 0 0.4cm', borderTop: `2px solid ${NAVY}` }}>
            <tbody>
              {opciones.map(({ o, plan }) => {
                const sobre = o.aplica_a === 'total' ? null : items.find((i) => i.id === o.aplica_a)
                return (
                  <tr key={o.id}>
                    <td style={CELDA}>
                      <div style={{ fontWeight: 'bold' }}>{o.titulo || 'Opción de pago'}</div>
                      <div style={{ fontSize: '11pt' }}>
                        {describirPlan(plan)}{sobre ? `, por ${sobre.proceso || 'esa actuación'}` : ''}.
                        {o.recargo_pct > 0 && plan.cuotas > 0 ? ` Incluye un recargo del ${pctTexto(o.recargo_pct)} sobre el saldo.` : ''}
                        {o.nota?.trim() ? ` ${mayuscula(o.nota.trim()).replace(/\.?$/, '.')}` : ''}
                      </div>
                    </td>
                    <td style={CELDA_DER}>{formatPesos(plan.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {totales.hayPorcentaje && <p style={{ ...P, fontSize: '11pt' }}>La financiación comprende solo la parte fija de los honorarios.</p>}
        </div>
      )}

      {(cot.condiciones?.trim() || cot.validez_dias) && (
        <>
          <Subtitulo>Condiciones</Subtitulo>
          {cot.condiciones?.trim().split(/\n{2,}/).map((t, i) => <p key={i} style={{ ...P, whiteSpace: 'pre-wrap' }}>{t}</p>)}
          {cot.validez_dias ? <p style={P}>La presente propuesta tiene una validez de {cot.validez_dias} días desde su emisión.</p> : null}
        </>
      )}
    </>
  )
}
