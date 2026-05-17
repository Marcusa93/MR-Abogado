// Lista completa de fueros del portal del SAE Tucumán con su slug y nombre legible.
// Sufijos: -cjc Concepción, -cjm Monteros, -cje Este, -brs Banda Río Salí.

export interface FueroDef {
  slug: string
  label: string
}

export const FUEROS_SAE: FueroDef[] = [
  { slug: 'apremios',           label: 'Apremios' },
  { slug: 'apremios-cjc',       label: 'Apremios (Concepción)' },
  { slug: 'civil',              label: 'Civil y Comercial Común' },
  { slug: 'civil-cjc',          label: 'Civil y Comercial Común (Concepción)' },
  { slug: 'civil-cjm',          label: 'Civil y Comercial Común (Monteros)' },
  { slug: 'conclusional',       label: 'Conclusional' },
  { slug: 'conclusional-cjm',   label: 'Conclusional (Monteros)' },
  { slug: 'contencioso',        label: 'Contencioso Administrativo' },
  { slug: 'documentos',         label: 'Documentos y Locaciones' },
  { slug: 'documentos-cjc',     label: 'Documentos y Locaciones (Concepción)' },
  { slug: 'documentos-cjm',     label: 'Documentos y Locaciones (Monteros)' },
  { slug: 'familia',            label: 'Familia y Sucesiones' },
  { slug: 'familia-cjc',        label: 'Familia (Concepción)' },
  { slug: 'familia-cje',        label: 'Familia (C. J. Este)' },
  { slug: 'familia-cjm',        label: 'Familia (Monteros)' },
  { slug: 'generico',           label: 'Genérico' },
  { slug: 'justicia-paz',       label: 'Justicia de Paz' },
  { slug: 'mediacion',          label: 'Mediación' },
  { slug: 'mediacion-brs',      label: 'Mediación (Banda Río Salí)' },
  { slug: 'mediacion-cjc',      label: 'Mediación (Concepción)' },
  { slug: 'mediacion-cjm',      label: 'Mediación (Monteros)' },
  { slug: 'oga',                label: 'Oficina de Gestión Asociada' },
  { slug: 'oga-cjc',            label: 'OGA (Concepción)' },
  { slug: 'oga-cjm',            label: 'OGA (Monteros)' },
  { slug: 'originarios',        label: 'Originarios' },
  { slug: 'superintendencia',   label: 'Superintendencia' },
  { slug: 'trabajo',            label: 'Trabajo' },
  { slug: 'trabajo-cjc',        label: 'Trabajo (Concepción)' },
  { slug: 'trabajo-cjm',        label: 'Trabajo (Monteros)' },
]

export const FUEROS_BY_SLUG: Map<string, string> =
  new Map(FUEROS_SAE.map(f => [f.slug, f.label]))
